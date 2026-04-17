import os
import pickle
import time
import argparse
from datetime import datetime
from typing import Optional

import cv2
import numpy as np


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.getenv("FACE_DB_FILE", os.path.join(SCRIPT_DIR, "face_db.pkl"))
MODEL_NAME = "Facenet"
VERIFY_THRESHOLD = 0.6
REGISTER_TIMEOUT_SECONDS = float(os.getenv("REGISTER_TIMEOUT_SECONDS", "180"))
SAMPLE_INTERVAL_SECONDS = 0.25
MIN_REGISTER_SAMPLES = 5
STAGE_HOLD_SECONDS = 0.8
REGISTER_STAGES = ["CENTER", "LEFT", "RIGHT"]
LOW_LIGHT_MEAN_THRESHOLD = 55.0
BLUR_VARIANCE_THRESHOLD = 45.0
QUALITY_ABORT_SECONDS = float(os.getenv("QUALITY_ABORT_SECONDS", "25"))
STAGE_NO_PROGRESS_TIMEOUT_SECONDS = float(os.getenv("STAGE_NO_PROGRESS_TIMEOUT_SECONDS", "40"))
STAGE_REMINDER_INTERVAL_SECONDS = float(os.getenv("STAGE_REMINDER_INTERVAL_SECONDS", "2"))
MIN_PRIMARY_FACE_AREA_RATIO = 0.08
CENTER_TOLERANCE_X_RATIO = 0.28
SUCCESS_APPROVAL_STREAK = 8
DEEPFACE = None
DEEPFACE_IMPORT_ERROR = None
FRONTAL_CASCADE = None
PROFILE_CASCADE = None


def _largest_box(boxes) -> Optional[tuple[int, int, int, int]]:
    """Return largest rectangle by area from OpenCV detections."""
    if boxes is None or len(boxes) == 0:
        return None
    return max((tuple(map(int, b)) for b in boxes), key=lambda b: b[2] * b[3])


def draw_overlay(frame: np.ndarray, lines: list[str], color: tuple[int, int, int]) -> None:
    """Draw helper text lines at the top-left corner of a frame."""
    y = 30
    for line in lines:
        cv2.putText(
            frame,
            line,
            (10, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.75,
            color,
            2,
            cv2.LINE_AA,
        )
        y += 30


def assess_frame_quality(frame: np.ndarray) -> tuple[bool, list[str]]:
    """Return frame usability and issue labels for low-light/blur/no-face conditions."""
    issues: list[str] = []
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    brightness = float(np.mean(gray))
    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    if brightness < LOW_LIGHT_MEAN_THRESHOLD:
        issues.append("LOW LIGHT")
    if blur_score < BLUR_VARIANCE_THRESHOLD:
        issues.append("BLURRY FRAME")
    face_box = detect_primary_face_box(frame)
    primary_ok, primary_issues = is_primary_face_valid(frame, face_box)
    if not primary_ok:
        for item in primary_issues:
            if item not in issues:
                issues.append(item)

    return len(issues) == 0, issues


def load_deepface():
    """Load DeepFace lazily and cache import errors."""
    global DEEPFACE, DEEPFACE_IMPORT_ERROR

    if DEEPFACE is not None:
        return DEEPFACE
    if DEEPFACE_IMPORT_ERROR is not None:
        return None

    try:
        from deepface import DeepFace as _DeepFace

        DEEPFACE = _DeepFace
        return DEEPFACE
    except Exception as exc:
        DEEPFACE_IMPORT_ERROR = exc
        print(
            "[ERROR] DeepFace could not be imported. "
            "Install dependencies (deepface, opencv-python, numpy) and if needed tf-keras."
        )
        print(f"[ERROR] Import detail: {exc}")
        return None


def load_haar_cascades():
    """Load OpenCV Haar cascades used for rough head-pose stage detection."""
    global FRONTAL_CASCADE, PROFILE_CASCADE

    if FRONTAL_CASCADE is not None and PROFILE_CASCADE is not None:
        return FRONTAL_CASCADE, PROFILE_CASCADE

    frontal_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    profile_path = cv2.data.haarcascades + "haarcascade_profileface.xml"

    frontal = cv2.CascadeClassifier(frontal_path)
    profile = cv2.CascadeClassifier(profile_path)

    if frontal.empty() or profile.empty():
        print("[ERROR] Could not load OpenCV Haar cascades for pose guidance.")
        return None, None

    FRONTAL_CASCADE = frontal
    PROFILE_CASCADE = profile
    return FRONTAL_CASCADE, PROFILE_CASCADE


def detect_head_pose(frame: np.ndarray) -> str:
    """Estimate coarse pose bucket: LEFT, CENTER, RIGHT, or UNKNOWN."""
    frontal, profile = load_haar_cascades()
    if frontal is None or profile is None:
        return "UNKNOWN"

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    frontal_faces = frontal.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
    right_profiles = profile.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))

    flipped = cv2.flip(gray, 1)
    left_profiles = profile.detectMultiScale(flipped, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))

    has_front = len(frontal_faces) > 0
    has_left = len(left_profiles) > 0
    has_right = len(right_profiles) > 0

    if has_left and not has_right:
        return "LEFT"
    if has_right and not has_left:
        return "RIGHT"
    if has_front:
        return "CENTER"
    if has_left and has_right:
        return "CENTER"
    return "UNKNOWN"


def detect_primary_face_box(frame: np.ndarray) -> Optional[tuple[int, int, int, int]]:
    """Detect a primary face bounding box (frontal or profile) for annotation."""
    frontal, profile = load_haar_cascades()
    if frontal is None or profile is None:
        return None

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]

    frontal_faces = frontal.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
    frontal_box = _largest_box(frontal_faces)
    if frontal_box is not None:
        return frontal_box

    right_profiles = profile.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
    right_box = _largest_box(right_profiles)
    if right_box is not None:
        return right_box

    # Detect left profile by running profile detector on flipped frame, then unflip box.
    flipped = cv2.flip(gray, 1)
    left_profiles_flipped = profile.detectMultiScale(flipped, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
    left_box_flipped = _largest_box(left_profiles_flipped)
    if left_box_flipped is None:
        return None

    x_f, y_f, bw, bh = left_box_flipped
    x = w - (x_f + bw)
    x = max(0, min(x, w - 1))
    y = max(0, min(y_f, h - 1))
    return (x, y, bw, bh)


def detect_frontal_faces(frame: np.ndarray):
    """Return frontal face detections for crowd/background filtering."""
    frontal, _ = load_haar_cascades()
    if frontal is None:
        return []

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return frontal.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))


def is_primary_face_valid(frame: np.ndarray, face_box: Optional[tuple[int, int, int, int]]) -> tuple[bool, list[str]]:
    """Validate that the foreground face is dominant and centered."""
    if face_box is None:
        return False, ["NO FACE DETECTED"]

    h, w = frame.shape[:2]
    x, _, bw, bh = face_box

    frame_area = float(max(1, w * h))
    face_area_ratio = float((bw * bh) / frame_area)
    if face_area_ratio < MIN_PRIMARY_FACE_AREA_RATIO:
        return False, ["FACE TOO FAR"]

    face_cx = x + (bw / 2.0)
    frame_cx = w / 2.0
    if abs(face_cx - frame_cx) > (CENTER_TOLERANCE_X_RATIO * w):
        return False, ["MOVE TO CENTER"]

    frontal_faces = detect_frontal_faces(frame)
    if len(frontal_faces) >= 2:
        return False, ["MULTIPLE PEOPLE DETECTED"]

    return True, []


def draw_face_annotation(
    frame: np.ndarray,
    face_box: Optional[tuple[int, int, int, int]],
    label: str,
    color: tuple[int, int, int],
) -> None:
    """Draw rectangle and a label near detected face."""
    if face_box is None:
        return

    x, y, w, h = face_box
    cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)

    text_y = y - 10 if y - 10 > 20 else y + h + 25
    cv2.putText(
        frame,
        label,
        (x, text_y),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        color,
        2,
        cv2.LINE_AA,
    )


def get_embedding(frame: np.ndarray) -> Optional[np.ndarray]:
    """Extract a Facenet embedding from a webcam frame using DeepFace.represent()."""
    deepface = load_deepface()
    if deepface is None:
        return None

    face_box = detect_primary_face_box(frame)
    is_valid, _ = is_primary_face_valid(frame, face_box)
    if (not is_valid) or face_box is None:
        return None

    x, y, w, h = face_box
    x1 = max(0, x)
    y1 = max(0, y)
    x2 = min(frame.shape[1], x + w)
    y2 = min(frame.shape[0], y + h)
    if x2 <= x1 or y2 <= y1:
        return None

    face_crop = frame[y1:y2, x1:x2]

    try:
        result = deepface.represent(
            img_path=face_crop,
            model_name=MODEL_NAME,
            detector_backend="opencv",
            enforce_detection=True,
        )

        if not result:
            return None

        # DeepFace may return a list of face representations.
        embedding = result[0].get("embedding")
        if embedding is None:
            return None

        return np.asarray(embedding, dtype=np.float32)

    except ValueError:
        # Common case: no face detected.
        return None
    except Exception as exc:
        # Keep app running on transient or detector/model issues.
        print(f"[WARN] Embedding extraction failed: {exc}")
        return None


def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    denom = (np.linalg.norm(vec_a) * np.linalg.norm(vec_b)) + 1e-10
    if denom == 0:
        return 0.0
    return float(np.dot(vec_a, vec_b) / denom)


def similarity_to_percent(similarity: float) -> float:
    """Convert cosine similarity to a user-friendly percentage."""
    return max(0.0, min(100.0, similarity * 100.0))


def show_done_prompt(title: str, subtitle: str, color: tuple[int, int, int], wait_ms: int = 1400) -> None:
    """Show a short completion prompt in an OpenCV window."""
    canvas = np.zeros((260, 860, 3), dtype=np.uint8)
    cv2.putText(canvas, title, (40, 120), cv2.FONT_HERSHEY_SIMPLEX, 1.3, color, 3, cv2.LINE_AA)
    cv2.putText(canvas, subtitle, (40, 190), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (220, 220, 220), 2, cv2.LINE_AA)
    cv2.imshow("Face Auth", canvas)
    cv2.waitKey(wait_ms)


def load_database() -> dict:
    """Load multi-user face database, with backward compatibility for old format."""
    if not os.path.exists(DB_FILE):
        return {"model": MODEL_NAME, "users": {}}

    try:
        with open(DB_FILE, "rb") as f:
            payload = pickle.load(f)

        # New format
        if isinstance(payload, dict) and "users" in payload:
            users = payload.get("users", {})
            if isinstance(users, dict):
                return payload

        # Backward compatibility for old single-user format
        if isinstance(payload, dict) and "embedding" in payload:
            migrated = {
                "model": payload.get("model", MODEL_NAME),
                "users": {
                    "default_user": {
                        "embedding": np.asarray(payload["embedding"], dtype=np.float32),
                        "created_at": payload.get("created_at", datetime.now().isoformat(timespec="seconds")),
                        "sample_count": payload.get("sample_count", 0),
                    }
                },
            }
            return migrated

    except Exception as exc:
        print(f"[ERROR] Failed to load face database: {exc}")

    return {"model": MODEL_NAME, "users": {}}


def save_database(payload: dict) -> bool:
    """Persist database to disk."""
    try:
        with open(DB_FILE, "wb") as f:
            pickle.dump(payload, f)
        return True
    except Exception as exc:
        print(f"[ERROR] Failed to save database file: {exc}")
        return False


def registration_instruction(stage: str) -> str:
    """Instruction text for the current registration stage."""
    if stage == "LEFT":
        return "Please tilt/turn LEFT and hold for a moment"
    if stage == "CENTER":
        return "Please look CENTER directly at camera"
    if stage == "RIGHT":
        return "Please tilt/turn RIGHT and hold for a moment"
    return "Keep face visible"


def list_registered_users() -> None:
    db = load_database()
    users = db.get("users", {})
    if not users:
        print("No registered users yet.")
        return

    print("\nRegistered users:")
    for name, info in users.items():
        samples = info.get("sample_count", "?")
        print(f"- {name} (samples: {samples})")


def register_user(username: Optional[str] = None, force_overwrite: bool = False) -> None:
    """Capture multiple embeddings while the user rotates their head, then save average."""
    if username is None:
        username = input("Enter username/credential to register: ").strip()
    else:
        username = username.strip()

    if not username:
        print("[ERROR] Username cannot be empty.")
        return

    db = load_database()
    users = db.setdefault("users", {})

    if username in users and not force_overwrite:
        overwrite = input(f"User '{username}' exists. Overwrite? (y/n): ").strip().lower()
        if overwrite != "y":
            print("[INFO] Registration skipped.")
            return

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[ERROR] Could not open webcam.")
        return

    print("\nRegistration started.")
    print(f"Credential: {username}")
    print("Follow live on-screen prompts only (no console steps needed).")
    print("Goal: show CENTER, LEFT side, and RIGHT side for 180-degree coverage.")
    print("Press 'q' to cancel.\n")

    embeddings: list[np.ndarray] = []
    stage_embeddings: dict[str, int] = {stage: 0 for stage in REGISTER_STAGES}
    current_stage_index = 0
    stage_hold_elapsed = 0.0
    prev_time = time.time()
    start_time = time.time()
    next_sample_time = start_time
    stage_start_time = start_time
    last_stage_reminder_time = start_time
    last_stuck_warning_time = start_time
    last_face_box: Optional[tuple[int, int, int, int]] = None
    poor_quality_start: Optional[float] = None
    stage_last_progress_time = start_time
    registration_abort_reason: Optional[str] = None

    while True:
        ok, frame = cap.read()
        if not ok:
            print("[ERROR] Failed to read frame from webcam.")
            break

        now = time.time()
        elapsed = now - start_time
        dt = max(0.0, now - prev_time)
        prev_time = now
        remaining = max(0.0, REGISTER_TIMEOUT_SECONDS - elapsed)

        detected_pose = detect_head_pose(frame)
        face_box = detect_primary_face_box(frame)
        if face_box is not None:
            last_face_box = face_box

        quality_ok, quality_issues = assess_frame_quality(frame)
        if quality_ok:
            poor_quality_start = None
        else:
            if poor_quality_start is None:
                poor_quality_start = now
            elif now - poor_quality_start >= QUALITY_ABORT_SECONDS:
                registration_abort_reason = " / ".join(quality_issues)
                print(
                    "[ERROR] Registration aborted due to persistent capture issues: "
                    f"{registration_abort_reason}. Improve lighting, hold steady, and keep your face in frame."
                )
                break

        target_stage = REGISTER_STAGES[current_stage_index]

        if detected_pose == target_stage:
            stage_hold_elapsed += dt
        else:
            stage_hold_elapsed = 0.0

        if quality_ok and now >= next_sample_time and elapsed <= REGISTER_TIMEOUT_SECONDS:
            emb = get_embedding(frame)
            if emb is not None:
                embeddings.append(emb)
                if detected_pose in stage_embeddings:
                    stage_embeddings[detected_pose] += 1
            next_sample_time = now + SAMPLE_INTERVAL_SECONDS

        if stage_hold_elapsed >= STAGE_HOLD_SECONDS:
            current_stage_index += 1
            stage_hold_elapsed = 0.0
            stage_last_progress_time = now
            stage_start_time = now
            last_stage_reminder_time = now
            last_stuck_warning_time = now
            if current_stage_index >= len(REGISTER_STAGES):
                break

        if now - stage_last_progress_time >= STAGE_NO_PROGRESS_TIMEOUT_SECONDS:
            if now - last_stuck_warning_time >= STAGE_REMINDER_INTERVAL_SECONDS:
                expected_stage = REGISTER_STAGES[current_stage_index]
                print(
                    "[INFO] Still waiting for next pose. "
                    f"Expected: {expected_stage}, Detected: {detected_pose}. "
                    "Please follow on-screen instruction."
                )
                last_stuck_warning_time = now

        if current_stage_index < len(REGISTER_STAGES):
            current_instruction = registration_instruction(REGISTER_STAGES[current_stage_index])
            stage_wait = now - stage_start_time
            if now - last_stage_reminder_time >= STAGE_REMINDER_INTERVAL_SECONDS:
                print(f"[INFO] Waiting for pose: {REGISTER_STAGES[current_stage_index]}. {current_instruction}")
                last_stage_reminder_time = now
        else:
            current_instruction = "All stages complete"
            stage_wait = 0.0

        progress_chunks = []
        for idx, stage in enumerate(REGISTER_STAGES):
            done = idx < current_stage_index
            marker = "[x]" if done else "[ ]"
            progress_chunks.append(f"{marker} {stage}")
        stage_progress_text = " | ".join(progress_chunks)

        status_lines = [
            "Mode: REGISTER",
            f"User: {username}",
            current_instruction,
            f"Expected pose: {REGISTER_STAGES[current_stage_index] if current_stage_index < len(REGISTER_STAGES) else 'DONE'}",
            f"Detected pose: {detected_pose}",
            f"Progress: {stage_progress_text}",
            f"Waiting on current stage: {stage_wait:.1f}s",
            f"Time left: {remaining:.1f}s",
            f"Captured face samples: {len(embeddings)}",
            "Press q to quit",
        ]
        if not quality_ok:
            status_lines.append(f"Warning: {' | '.join(quality_issues)}")
        draw_face_annotation(frame, last_face_box, f"TRACK: {detected_pose}", (255, 255, 0))
        draw_overlay(frame, status_lines, (0, 255, 255))
        cv2.imshow("Face Auth", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            print("[INFO] Registration cancelled by user.")
            break

        if elapsed >= REGISTER_TIMEOUT_SECONDS:
            if current_stage_index < len(REGISTER_STAGES):
                expected_stage = REGISTER_STAGES[current_stage_index]
                registration_abort_reason = (
                    "Registration timeout while waiting for pose "
                    f"{expected_stage}. Last detected pose was {detected_pose}."
                )
            print("[ERROR] Registration timeout. Could not complete CENTER-LEFT-RIGHT sequence.")
            break

    cap.release()
    cv2.destroyAllWindows()

    if current_stage_index < len(REGISTER_STAGES):
        if registration_abort_reason is not None:
            print(f"[ERROR] Root cause: {registration_abort_reason}")
        missing = " -> ".join(REGISTER_STAGES[current_stage_index:])
        print(f"[ERROR] Registration incomplete. Remaining stages: {missing}.")
        print("[INFO] Keep your face centered and follow camera prompts exactly for each stage.")
        return

    if len(embeddings) < MIN_REGISTER_SAMPLES:
        print(
            "[ERROR] Not enough face samples captured "
            f"({len(embeddings)}/{MIN_REGISTER_SAMPLES}). Try again with better lighting and slower head turn."
        )
        return

    for stage in REGISTER_STAGES:
        if stage_embeddings[stage] == 0:
            print(f"[ERROR] Missing captured samples for stage: {stage}. Please re-register.")
            return

    avg_embedding = np.mean(np.vstack(embeddings), axis=0)

    users[username] = {
        "embedding": avg_embedding,
        "model": MODEL_NAME,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "sample_count": len(embeddings),
    }
    db["model"] = MODEL_NAME
    db["updated_at"] = datetime.now().isoformat(timespec="seconds")

    if save_database(db):
        print(
            f"[OK] Registration complete for '{username}'. "
            f"Saved {len(embeddings)} samples to '{DB_FILE}'."
        )
        show_done_prompt("REGISTRATION DONE", f"User: {username}", (0, 255, 0), wait_ms=1500)
        cv2.destroyAllWindows()


def verify_user() -> None:
    """Identify user from live face against all registered credentials and show status."""
    db = load_database()
    users = db.get("users", {})
    if not users:
        print(f"[ERROR] No registered users in '{DB_FILE}'. Register first.")
        return

    embeddings_by_user: dict[str, np.ndarray] = {}
    for name, info in users.items():
        emb = info.get("embedding")
        if emb is None:
            continue
        embeddings_by_user[name] = np.asarray(emb, dtype=np.float32)

    if not embeddings_by_user:
        print("[ERROR] No valid stored embeddings found in database.")
        return

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[ERROR] Could not open webcam.")
        return

    print("\nVerification started. Press 'q' to stop.\n")

    last_similarity = 0.0
    last_accuracy_percent = 0.0
    last_status = "NO FACE"
    last_identity = "UNKNOWN"
    last_face_box: Optional[tuple[int, int, int, int]] = None
    last_quality_warning_time = 0.0
    approved_streak = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            print("[ERROR] Failed to read frame from webcam.")
            break

        current_embedding = get_embedding(frame)
        face_box = detect_primary_face_box(frame)
        if face_box is not None:
            last_face_box = face_box

        quality_ok, quality_issues = assess_frame_quality(frame)
        if (not quality_ok) and (time.time() - last_quality_warning_time >= 2.5):
            print(f"[WARN] Verification quality issue: {' / '.join(quality_issues)}")
            last_quality_warning_time = time.time()

        if (not quality_ok) or current_embedding is None:
            status = "NO FACE"
            color = (0, 165, 255)
            approved_streak = 0
            last_accuracy_percent = 0.0
        else:
            best_user = "UNKNOWN"
            sim = -1.0
            for user_name, stored_emb in embeddings_by_user.items():
                score = cosine_similarity(current_embedding, stored_emb)
                if score > sim:
                    sim = score
                    best_user = user_name

            last_similarity = sim
            last_accuracy_percent = similarity_to_percent(sim)
            last_identity = best_user
            if sim > VERIFY_THRESHOLD:
                status = "APPROVED"
                color = (0, 255, 0)
                approved_streak += 1
            else:
                status = "NOT APPROVED"
                color = (0, 0, 255)
                approved_streak = 0

        last_status = status
        status_lines = [
            "Mode: VERIFY",
            f"Identity: {last_identity}",
            f"Verification: {last_status}",
            f"Similarity: {last_similarity:.3f}",
            f"Accuracy: {last_accuracy_percent:.1f}%",
            f"Threshold: {VERIFY_THRESHOLD:.2f}",
            f"Approval streak: {approved_streak}/{SUCCESS_APPROVAL_STREAK}",
            "Press q to quit",
        ]
        if last_status == "APPROVED":
            status_lines.append("VERIFICATION DONE")
        if not quality_ok:
            status_lines.append(f"Warning: {' | '.join(quality_issues)}")
        if last_status == "APPROVED":
            face_label = f"{last_identity} | APPROVED | {last_accuracy_percent:.1f}%"
        elif last_status == "NO FACE":
            face_label = "NO FACE"
        else:
            face_label = f"{last_identity} | NOT APPROVED | {last_accuracy_percent:.1f}%"

        draw_face_annotation(frame, last_face_box, face_label, color)
        draw_overlay(frame, status_lines, color)

        if approved_streak >= SUCCESS_APPROVAL_STREAK:
            cv2.putText(
                frame,
                "VERIFICATION DONE",
                (30, frame.shape[0] - 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.1,
                (0, 255, 0),
                3,
                cv2.LINE_AA,
            )

        cv2.imshow("Face Auth", frame)

        if approved_streak >= SUCCESS_APPROVAL_STREAK:
            print(f"[OK] Verification approved for '{last_identity}'. Auto-closing camera.")
            cv2.waitKey(1400)
            break

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


def main() -> None:
    """Simple terminal menu to run registration/verification."""
    while True:
        print("\n=== Face Recognition Menu ===")
        print("1. Register User")
        print("2. Verify / Identify User")
        print("3. List Registered Users")
        print("4. Exit")

        raw_choice = input("Select an option: ").strip().lower()
        choice = raw_choice
        if choice.startswith("1"):
            choice = "1"
        elif choice.startswith("2"):
            choice = "2"
        elif choice.startswith("3") or "list" in choice:
            choice = "3"
        elif choice.startswith("4") or choice in {"exit", "quit", "q"}:
            choice = "4"

        if choice == "1":
            register_user()
        elif choice == "2":
            verify_user()
        elif choice == "3":
            list_registered_users()
        elif choice == "4":
            print("Exiting.")
            break
        else:
            print("Invalid choice. Please select 1, 2, 3, or 4.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SafeRide face registration and verification")
    parser.add_argument(
        "--mode",
        choices=["menu", "register", "verify", "list"],
        default="menu",
        help="Run mode: interactive menu, register, verify, or list users",
    )
    parser.add_argument(
        "--user",
        default=None,
        help="Driver username/credential for registration mode",
    )
    parser.add_argument(
        "--force-overwrite",
        action="store_true",
        help="Overwrite existing user without prompt in register mode",
    )
    return parser.parse_args()


def run_cli() -> None:
    args = parse_args()

    if args.mode == "menu":
        main()
        return
    if args.mode == "register":
        register_user(username=args.user, force_overwrite=args.force_overwrite)
        return
    if args.mode == "verify":
        verify_user()
        return
    if args.mode == "list":
        list_registered_users()
        return


if __name__ == "__main__":
    try:
        run_cli()
    except KeyboardInterrupt:
        print("\nInterrupted by user. Exiting.")
        cv2.destroyAllWindows()

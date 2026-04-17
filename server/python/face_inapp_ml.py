import argparse
import base64
import io
import json
import os
import pickle
import sys
from typing import Any, Dict, List

import numpy as np
from PIL import Image


DB_FILE = os.getenv("FACE_DB_FILE", "face_db.pkl")
MODEL_NAME = os.getenv("FACE_MODEL_NAME", "SafeRideLiteFaceV1")
VERIFY_THRESHOLD = float(os.getenv("FACE_VERIFY_THRESHOLD", "0.72"))


def load_db() -> Dict[str, Any]:
    if not os.path.exists(DB_FILE):
        return {"model": MODEL_NAME, "users": {}}
    with open(DB_FILE, "rb") as f:
        data = pickle.load(f)
    if not isinstance(data, dict) or "users" not in data:
        return {"model": MODEL_NAME, "users": {}}
    return data


def save_db(db: Dict[str, Any]) -> None:
    with open(DB_FILE, "wb") as f:
        pickle.dump(db, f)


def parse_data_url_image(data_url: str) -> np.ndarray:
    if not isinstance(data_url, str) or "," not in data_url:
        raise ValueError("Invalid image payload")
    _, encoded = data_url.split(",", 1)
    raw = base64.b64decode(encoded)
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    return np.array(image, dtype=np.uint8)


def _normalize(vec: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vec))
    if norm == 0.0:
        return vec
    return vec / norm


def _quick_quality_checks(rgb: np.ndarray) -> None:
    gray = np.dot(rgb[..., :3], [0.299, 0.587, 0.114]).astype(np.float32) / 255.0
    mean_val = float(np.mean(gray))
    std_val = float(np.std(gray))
    if std_val < 0.06:
        raise ValueError("Image quality too low. Keep face clear and well-lit.")
    if mean_val < 0.12 or mean_val > 0.92:
        raise ValueError("Lighting is not suitable. Avoid very dark or overexposed frames.")


def get_embedding(image_rgb: np.ndarray) -> np.ndarray:
    _quick_quality_checks(image_rgb)

    image = Image.fromarray(image_rgb).convert("L").resize((96, 96), Image.BILINEAR)
    gray = np.array(image, dtype=np.float32) / 255.0

    # Low-frequency shape information.
    coarse = gray[::3, ::3].flatten()

    # Gradient information helps differentiate contours.
    gx = np.diff(gray, axis=1, prepend=gray[:, :1])
    gy = np.diff(gray, axis=0, prepend=gray[:1, :])
    grad_mag = np.sqrt(gx * gx + gy * gy)
    grad_hist, _ = np.histogram(grad_mag, bins=32, range=(0.0, 1.0), density=True)

    # Intensity distribution signature.
    intensity_hist, _ = np.histogram(gray, bins=32, range=(0.0, 1.0), density=True)

    signature = np.concatenate(
        [
            coarse.astype(np.float32),
            grad_hist.astype(np.float32),
            intensity_hist.astype(np.float32),
        ]
    )
    return _normalize(signature.astype(np.float32))


def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    denom = float(np.linalg.norm(vec_a) * np.linalg.norm(vec_b))
    if denom == 0:
        return 0.0
    return float(np.dot(vec_a, vec_b) / denom)


def minimum_pairwise_similarity(embeddings: List[np.ndarray]) -> float:
    if len(embeddings) < 2:
        return 0.0
    min_sim = 1.0
    for i in range(len(embeddings)):
        for j in range(i + 1, len(embeddings)):
            sim = cosine_similarity(embeddings[i], embeddings[j])
            min_sim = min(min_sim, sim)
    return float(min_sim)


def handle_register(credential: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    images: List[str] = payload.get("images") or []
    if len(images) < 3:
        return {"success": False, "message": "At least 3 images are required"}

    embeddings: List[np.ndarray] = []
    for data_url in images:
        try:
            img = parse_data_url_image(data_url)
            emb = get_embedding(img)
            embeddings.append(emb)
        except Exception:
            continue

    if len(embeddings) < 3:
        return {
            "success": False,
            "message": "Could not extract reliable face signature from all required images",
            "samples": len(embeddings),
        }

    min_pair = minimum_pairwise_similarity(embeddings)
    if min_pair < 0.45:
        return {
            "success": False,
            "message": "Captured angles are inconsistent. Keep only one face centered and retry.",
            "samples": len(embeddings),
            "pairwise_similarity": min_pair,
        }

    avg_embedding = np.mean(np.stack(embeddings), axis=0)

    db = load_db()
    db["model"] = MODEL_NAME
    db.setdefault("users", {})
    db["users"][credential] = {
        "embedding": avg_embedding,
        "samples": len(embeddings),
        "threshold": VERIFY_THRESHOLD,
    }
    save_db(db)

    return {
        "success": True,
        "message": "Profile face signature registered",
        "samples": len(embeddings),
        "pairwise_similarity": min_pair,
    }


def handle_verify(credential: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    image = payload.get("image")
    if not image:
        return {"success": False, "approved": False, "message": "image is required"}

    db = load_db()
    users = db.get("users", {})
    record = users.get(credential)
    if not record:
        return {"success": False, "approved": False, "message": "No face profile found"}

    stored = np.array(record["embedding"], dtype=np.float32)
    threshold = float(record.get("threshold", VERIFY_THRESHOLD))

    try:
        img = parse_data_url_image(image)
        probe = get_embedding(img)
    except Exception as ex:
        return {
            "success": False,
            "approved": False,
            "message": str(ex) or "Unable to extract face signature for verification",
        }

    similarity = cosine_similarity(stored, probe)
    approved = similarity >= threshold

    return {
        "success": True,
        "approved": approved,
        "similarity": similarity,
        "accuracy": max(0.0, min(1.0, (similarity + 1.0) / 2.0)),
        "message": "Verification approved" if approved else "Face does not match registered profile",
    }


def main() -> int:
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument("--mode", choices=["register", "verify"], required=True)
        parser.add_argument("--credential", required=True)
        parser.add_argument("--input", required=True)
        args = parser.parse_args()

        credential = (args.credential or "").strip()
        if not credential:
            print(json.dumps({"success": False, "message": "credential is required"}))
            return 2

        with open(args.input, "r", encoding="utf-8-sig") as f:
            payload = json.load(f)

        if args.mode == "register":
            result = handle_register(credential, payload)
        else:
            result = handle_verify(credential, payload)

        print(json.dumps(result))
        return 0 if result.get("success") else 1
    except Exception as ex:
        print(json.dumps({"success": False, "message": str(ex) or "In-app ML runtime error"}))
        return 1


if __name__ == "__main__":
    sys.exit(main())

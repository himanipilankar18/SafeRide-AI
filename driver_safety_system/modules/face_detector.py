from dataclasses import dataclass
from typing import Dict, Optional, Tuple
import os
import time
import urllib.request

import cv2
import mediapipe as mp


@dataclass
class FaceLandmarks:
    points: Dict[int, Tuple[int, int]]
    image_width: int
    image_height: int
    timestamp: float


@dataclass
class DetectionResult:
    face_detected: bool
    landmarks: Optional[FaceLandmarks]


class FaceLandmarkDetector:
    def __init__(self, min_detection_confidence: float = 0.5, min_tracking_confidence: float = 0.5):
        self._backend = 'none'
        self._mesh = None
        self._landmarker = None
        self._last_timestamp_ms = 0

        try:
            # Preferred legacy API when available.
            from mediapipe import solutions as mp_solutions

            self._mp_face_mesh = mp_solutions.face_mesh
            self._mesh = self._mp_face_mesh.FaceMesh(
                static_image_mode=False,
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=min_detection_confidence,
                min_tracking_confidence=min_tracking_confidence,
            )
            self._backend = 'solutions'
            return
        except Exception:
            pass

        # Fallback for MediaPipe builds that only expose Tasks API.
        vision = mp.tasks.vision
        BaseOptions = mp.tasks.BaseOptions
        model_path = self._ensure_tasks_model()
        options = vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=model_path),
            running_mode=vision.RunningMode.VIDEO,
            num_faces=1,
            min_face_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
        )
        self._landmarker = vision.FaceLandmarker.create_from_options(options)
        self._backend = 'tasks'

    def _ensure_tasks_model(self) -> str:
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        model_dir = os.path.join(project_root, 'models')
        model_path = os.path.join(model_dir, 'face_landmarker.task')
        if os.path.isfile(model_path):
            return model_path

        os.makedirs(model_dir, exist_ok=True)
        model_url = (
            'https://storage.googleapis.com/mediapipe-models/'
            'face_landmarker/face_landmarker/float16/latest/face_landmarker.task'
        )
        try:
            urllib.request.urlretrieve(model_url, model_path)
            return model_path
        except Exception as exc:
            raise RuntimeError(
                'Unable to initialize MediaPipe Face Landmarker. Model download failed. '
                'Please check internet access and retry.'
            ) from exc

    def process(self, frame) -> DetectionResult:
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        height, width = frame.shape[:2]
        points: Dict[int, Tuple[int, int]] = {}

        if self._backend == 'solutions':
            result = self._mesh.process(rgb_frame)
            if not result.multi_face_landmarks:
                return DetectionResult(False, None)
            landmarks_data = result.multi_face_landmarks[0].landmark
        else:
            timestamp_ms = int(time.time() * 1000)
            if timestamp_ms <= self._last_timestamp_ms:
                timestamp_ms = self._last_timestamp_ms + 1
            self._last_timestamp_ms = timestamp_ms

            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            result = self._landmarker.detect_for_video(mp_image, timestamp_ms)
            if not result.face_landmarks:
                return DetectionResult(False, None)
            landmarks_data = result.face_landmarks[0]

        for index, landmark in enumerate(landmarks_data):
            x_coord = min(max(int(landmark.x * width), 0), width - 1)
            y_coord = min(max(int(landmark.y * height), 0), height - 1)
            points[index] = (x_coord, y_coord)

        return DetectionResult(
            True,
            FaceLandmarks(
                points=points,
                image_width=width,
                image_height=height,
                timestamp=time.time(),
            ),
        )

    def close(self) -> None:
        if self._mesh is not None:
            self._mesh.close()
        if self._landmarker is not None:
            self._landmarker.close()
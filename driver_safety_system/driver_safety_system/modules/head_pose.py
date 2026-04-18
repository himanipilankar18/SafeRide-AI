from dataclasses import dataclass

import cv2
import numpy as np

from utils.math_utils import rotation_matrix_to_euler_angles


MODEL_POINTS = np.array(
    [
        (0.0, 0.0, 0.0),
        (0.0, -330.0, -65.0),
        (-225.0, 170.0, -135.0),
        (225.0, 170.0, -135.0),
        (-150.0, -150.0, -125.0),
        (150.0, -150.0, -125.0),
    ],
    dtype='double',
)

LANDMARK_IDS = [1, 152, 33, 263, 61, 291]


def _normalize_angle(angle_degrees: float) -> float:
    angle_degrees = ((angle_degrees + 180.0) % 360.0) - 180.0
    if angle_degrees > 90.0:
        angle_degrees = 180.0 - angle_degrees
    elif angle_degrees < -90.0:
        angle_degrees = -180.0 - angle_degrees
    return angle_degrees


@dataclass
class HeadPoseResult:
    yaw: float
    pitch: float
    roll: float
    valid: bool


class HeadPoseEstimator:
    def estimate(self, landmarks) -> HeadPoseResult:
        image_points = []
        for index in LANDMARK_IDS:
            if index not in landmarks.points:
                return HeadPoseResult(0.0, 0.0, 0.0, False)
            image_points.append(landmarks.points[index])

        image_points_np = np.array(image_points, dtype='double')
        focal_length = landmarks.image_width
        center = (landmarks.image_width / 2.0, landmarks.image_height / 2.0)
        camera_matrix = np.array(
            [[focal_length, 0, center[0]], [0, focal_length, center[1]], [0, 0, 1]],
            dtype='double',
        )
        dist_coeffs = np.zeros((4, 1))

        success, rotation_vector, translation_vector = cv2.solvePnP(
            MODEL_POINTS,
            image_points_np,
            camera_matrix,
            dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE,
        )

        if not success:
            return HeadPoseResult(0.0, 0.0, 0.0, False)

        rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
        pitch, yaw, roll = rotation_matrix_to_euler_angles(rotation_matrix)

        return HeadPoseResult(
            yaw=float(_normalize_angle(np.degrees(yaw))),
            pitch=float(_normalize_angle(np.degrees(pitch))),
            roll=float(_normalize_angle(np.degrees(roll))),
            valid=True,
        )
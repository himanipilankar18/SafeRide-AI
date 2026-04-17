from math import atan2, sqrt
from typing import Iterable, Sequence, Tuple

import numpy as np


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(value, maximum))


def euclidean_distance(point_a: Sequence[float], point_b: Sequence[float]) -> float:
    return sqrt((point_a[0] - point_b[0]) ** 2 + (point_a[1] - point_b[1]) ** 2)


def eye_aspect_ratio(eye_points: Iterable[Tuple[int, int]]) -> float:
    points = list(eye_points)
    if len(points) != 6:
        return 0.0
    a = euclidean_distance(points[1], points[5])
    b = euclidean_distance(points[2], points[4])
    c = euclidean_distance(points[0], points[3])
    if c == 0:
        return 0.0
    return (a + b) / (2.0 * c)


def mouth_aspect_ratio(mouth_points: Iterable[Tuple[int, int]]) -> float:
    points = list(mouth_points)
    if len(points) != 4:
        return 0.0
    left = points[0]
    upper = points[1]
    lower = points[2]
    right = points[3]
    horizontal = euclidean_distance(left, right)
    vertical = euclidean_distance(upper, lower)
    if horizontal == 0:
        return 0.0
    return vertical / horizontal


def rotation_matrix_to_euler_angles(rotation_matrix: np.ndarray):
    sy = sqrt(rotation_matrix[0, 0] * rotation_matrix[0, 0] + rotation_matrix[1, 0] * rotation_matrix[1, 0])
    singular = sy < 1e-6

    if not singular:
        x_angle = atan2(rotation_matrix[2, 1], rotation_matrix[2, 2])
        y_angle = atan2(-rotation_matrix[2, 0], sy)
        z_angle = atan2(rotation_matrix[1, 0], rotation_matrix[0, 0])
    else:
        x_angle = atan2(-rotation_matrix[1, 2], rotation_matrix[1, 1])
        y_angle = atan2(-rotation_matrix[2, 0], sy)
        z_angle = 0.0

    return np.array([x_angle, y_angle, z_angle])
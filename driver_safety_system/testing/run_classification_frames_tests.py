import argparse
import csv
import json
import re
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import cv2

from modules.distraction import DistractionMonitor
from modules.eye_analysis import EyeAnalyzer
from modules.face_detector import FaceLandmarkDetector
from modules.fatigue import FatigueMonitor
from modules.fusion import FusionEngine
from modules.head_pose import HeadPoseEstimator


FRAME_INDEX_PATTERN = re.compile(r'frame(\d+)\.jpg$', re.IGNORECASE)


@dataclass
class FrameRecord:
    frame_path: str
    clip_id: str
    frame_index: int
    ground_truth: str


def normalize_label(label: str) -> str:
    label = str(label).strip().lower()
    if label in {'alert', 'normal', 'awake'}:
        return 'alert'
    if label in {'microsleep', 'drowsy', 'yawning', 'sleepy', 'asleep', 'fatigue'}:
        return 'microsleep'
    return label


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Evaluate driver safety pipeline on classification_frames annotations.')
    parser.add_argument('--dataset-dir', type=str, default='classification_frames')
    parser.add_argument('--split', type=str, default='test', choices=['train', 'val', 'test', 'holdout', 'all'])
    parser.add_argument('--fps', type=float, default=30.0)
    parser.add_argument('--max-frames-per-clip', type=int, default=0)
    parser.add_argument('--detection-confidence', type=float, default=0.5)
    parser.add_argument('--tracking-confidence', type=float, default=0.5)
    parser.add_argument('--display', action='store_true')
    return parser.parse_args()


def split_files(dataset_dir: Path, split: str) -> List[Path]:
    if split == 'all':
        names = [
            'annotations_train.json',
            'annotations_val.json',
            'annotations_test.json',
            'annotations_holdout.json',
        ]
    else:
        names = [f'annotations_{split}.json']
    files = [dataset_dir / name for name in names]
    missing = [str(path) for path in files if not path.exists()]
    if missing:
        raise FileNotFoundError(f'Annotation file(s) missing: {missing}')
    return files


def parse_frame_record(raw_key: str, item: Dict, project_root: Path) -> FrameRecord:
    normalized = raw_key.replace('\\', '/').lstrip('./')
    parts = normalized.split('/')
    if len(parts) < 3:
        raise ValueError(f'Unexpected annotation key format: {raw_key}')
    clip_id = parts[-2]
    filename = parts[-1]
    match = FRAME_INDEX_PATTERN.search(filename)
    frame_index = int(match.group(1)) if match else -1

    frame_abs = (project_root / normalized).resolve()
    ground_truth = normalize_label(item.get('driver_state', 'unknown'))

    return FrameRecord(
        frame_path=str(frame_abs),
        clip_id=clip_id,
        frame_index=frame_index,
        ground_truth=ground_truth,
    )


def load_annotations(files: Iterable[Path], project_root: Path) -> List[FrameRecord]:
    records: List[FrameRecord] = []
    for annotation_file in files:
        with annotation_file.open('r', encoding='utf-8') as handle:
            data = json.load(handle)
        for frame_key, item in data.items():
            records.append(parse_frame_record(frame_key, item, project_root))
    records.sort(key=lambda x: (x.clip_id, x.frame_index, x.frame_path))
    return records


def map_state_to_binary(decision_state: str) -> str:
    if decision_state == 'NORMAL':
        return 'alert'
    return 'microsleep'


def compute_metrics(overall_confusion: Counter, overall_state_counts: Counter, total_scored_frames: int) -> Dict:
    tp = overall_confusion.get('gt:microsleep|pred:microsleep', 0)
    tn = overall_confusion.get('gt:alert|pred:alert', 0)
    fp = overall_confusion.get('gt:alert|pred:microsleep', 0)
    fn = overall_confusion.get('gt:microsleep|pred:alert', 0)

    def safe_div(numerator: float, denominator: float) -> float:
        return round((numerator / denominator) if denominator else 0.0, 4)

    alert_precision = safe_div(tn, tn + fn)
    alert_recall = safe_div(tn, tn + fp)
    alert_f1 = safe_div(2 * alert_precision * alert_recall, alert_precision + alert_recall)

    microsleep_precision = safe_div(tp, tp + fp)
    microsleep_recall = safe_div(tp, tp + fn)
    microsleep_f1 = safe_div(2 * microsleep_precision * microsleep_recall, microsleep_precision + microsleep_recall)

    accuracy = safe_div(tp + tn, total_scored_frames)
    balanced_accuracy = round((alert_recall + microsleep_recall) / 2.0, 4) if total_scored_frames else 0.0
    macro_f1 = round((alert_f1 + microsleep_f1) / 2.0, 4)

    return {
        'accuracy': accuracy,
        'balanced_accuracy': balanced_accuracy,
        'macro_f1': macro_f1,
        'confusion_matrix': {
            'tn_alert_as_alert': tn,
            'fp_alert_as_microsleep': fp,
            'fn_microsleep_as_alert': fn,
            'tp_microsleep_as_microsleep': tp,
        },
        'per_class': {
            'alert': {
                'precision': alert_precision,
                'recall': alert_recall,
                'f1': alert_f1,
                'support': tn + fp,
            },
            'microsleep': {
                'precision': microsleep_precision,
                'recall': microsleep_recall,
                'f1': microsleep_f1,
                'support': tp + fn,
            },
        },
        'state_counts': dict(overall_state_counts),
    }


def evaluate(args: argparse.Namespace) -> Tuple[List[Dict], List[Dict], Dict]:
    project_root = Path(__file__).resolve().parents[1]
    dataset_dir = (project_root / args.dataset_dir).resolve()
    annotation_paths = split_files(dataset_dir, args.split)
    records = load_annotations(annotation_paths, project_root)

    detector = FaceLandmarkDetector(
        min_detection_confidence=args.detection_confidence,
        min_tracking_confidence=args.tracking_confidence,
    )
    head_pose_estimator = HeadPoseEstimator()

    frame_rows: List[Dict] = []
    clip_rows: List[Dict] = []

    overall_confusion = Counter()
    overall_state_counts = Counter()

    grouped: Dict[str, List[FrameRecord]] = defaultdict(list)
    for record in records:
        grouped[record.clip_id].append(record)

    try:
        for clip_id, clip_records in grouped.items():
            eye_analyzer = EyeAnalyzer()
            distraction_monitor = DistractionMonitor()
            fatigue_monitor = FatigueMonitor()
            fusion_engine = FusionEngine()

            local_state_counts = Counter()
            local_confusion = Counter()
            processed = 0
            detected_faces = 0
            risk_values: List[float] = []

            for index, record in enumerate(clip_records):
                if args.max_frames_per_clip > 0 and index >= args.max_frames_per_clip:
                    break

                frame = cv2.imread(record.frame_path)
                if frame is None:
                    continue

                synthetic_ts = time.time() + (index / max(args.fps, 1.0))
                detection = detector.process(frame)
                processed += 1

                if detection.face_detected and detection.landmarks is not None:
                    detected_faces += 1
                    eye_metrics = eye_analyzer.update(detection.landmarks, synthetic_ts)
                    head_pose = head_pose_estimator.estimate(detection.landmarks)
                    distraction = distraction_monitor.update(head_pose, synthetic_ts)
                    fatigue = fatigue_monitor.update(detection.landmarks, eye_metrics, head_pose, synthetic_ts)
                    decision = fusion_engine.combine(fatigue, distraction, synthetic_ts)

                    predicted_binary = map_state_to_binary(decision.state)
                    confusion_key = f"gt:{record.ground_truth}|pred:{predicted_binary}"
                    local_confusion[confusion_key] += 1
                    overall_confusion[confusion_key] += 1

                    local_state_counts[decision.state] += 1
                    overall_state_counts[decision.state] += 1
                    risk_values.append(decision.risk_score)

                    frame_rows.append(
                        {
                            'clip_id': clip_id,
                            'frame_index': record.frame_index,
                            'frame_path': record.frame_path,
                            'ground_truth': record.ground_truth,
                            'predicted_binary': predicted_binary,
                            'predicted_state': decision.state,
                            'risk_score': round(decision.risk_score, 3),
                            'fatigue_score': round(decision.fatigue_score, 3),
                            'distraction_score': round(decision.distraction_score, 3),
                        }
                    )

                    if args.display:
                        preview = frame.copy()
                        cv2.putText(preview, f'{clip_id} frame={record.frame_index}', (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (50, 255, 50), 2)
                        cv2.putText(preview, f'GT={record.ground_truth} Pred={decision.state} Risk={decision.risk_score:.1f}', (10, 65), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 220, 255), 2)
                        cv2.imshow('classification_frames test preview', preview)
                        key = cv2.waitKey(1) & 0xFF
                        if key in (27, ord('q')):
                            args.display = False
                            cv2.destroyAllWindows()
                else:
                    overall_state_counts['NO_FACE'] += 1
                    local_state_counts['NO_FACE'] += 1

            dominant_state = 'NO_FACE'
            if local_state_counts:
                dominant_state = local_state_counts.most_common(1)[0][0]

            clip_rows.append(
                {
                    'clip_id': clip_id,
                    'frames_processed': processed,
                    'face_detected_frames': detected_faces,
                    'face_detection_rate': round((detected_faces / processed) if processed else 0.0, 4),
                    'avg_risk': round((sum(risk_values) / len(risk_values)) if risk_values else 0.0, 3),
                    'max_risk': round(max(risk_values) if risk_values else 0.0, 3),
                    'normal_frames': local_state_counts.get('NORMAL', 0),
                    'warning_frames': local_state_counts.get('WARNING', 0),
                    'critical_frames': local_state_counts.get('CRITICAL', 0),
                    'no_face_frames': local_state_counts.get('NO_FACE', 0),
                    'dominant_state': dominant_state,
                }
            )
    finally:
        detector.close()
        if args.display:
            cv2.destroyAllWindows()

    total = sum(overall_confusion.values())
    metrics = compute_metrics(overall_confusion, overall_state_counts, total)
    summary = {
        'dataset_dir': str(dataset_dir),
        'split': args.split,
        'total_scored_frames': total,
        'metrics': metrics,
        'confusion': dict(overall_confusion),
        'state_counts': dict(overall_state_counts),
        'clips_processed': len(clip_rows),
    }

    return frame_rows, clip_rows, summary


def write_csv(rows: List[Dict], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        with output_path.open('w', newline='', encoding='utf-8') as handle:
            handle.write('')
        return

    with output_path.open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def write_json(data: Dict, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open('w', encoding='utf-8') as handle:
        json.dump(data, handle, indent=2)


def main() -> None:
    args = parse_args()
    project_root = Path(__file__).resolve().parents[1]
    results_dir = project_root / 'testing' / 'results'

    frame_rows, clip_rows, summary = evaluate(args)

    frame_csv = results_dir / f'model_output_{args.split}.csv'
    clip_csv = results_dir / f'clip_summary_{args.split}.csv'
    summary_json = results_dir / f'overall_summary_{args.split}.json'

    write_csv(frame_rows, frame_csv)
    write_csv(clip_rows, clip_csv)
    write_json(summary, summary_json)

    print(f'Model output:  {frame_csv}')
    print(f'Clip summary:  {clip_csv}')
    print(f'Overall summary: {summary_json}')
    print(f"Total scored frames: {summary['total_scored_frames']}")
    print(f"Accuracy: {summary['metrics']['accuracy']}")
    print(f"Balanced accuracy: {summary['metrics']['balanced_accuracy']}")
    print(f"Macro F1: {summary['metrics']['macro_f1']}")


if __name__ == '__main__':
    main()
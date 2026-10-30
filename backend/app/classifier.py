from __future__ import annotations

from dataclasses import dataclass
import csv
import io
import logging
import os
import urllib.request

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class InferenceResult:
    crying: bool
    confidence: float
    label: str
    consecutive_windows: int


def confirms_cry(scores: list[float], threshold: float, required: int = 2) -> bool:
    """Confirm only after `required` adjacent model frames pass the threshold."""
    streak = 0
    for score in scores:
        streak = streak + 1 if score >= threshold else 0
        if streak >= required:
            return True
    return False


def longest_positive_streak(scores: list[float], threshold: float) -> int:
    longest = current = 0
    for score in scores:
        current = current + 1 if score >= threshold else 0
        longest = max(longest, current)
    return longest


class InferenceUnavailable(RuntimeError):
    pass


class YamnetClassifier:
    """Lazy YAMNet adapter; raw PCM is converted in memory and never persisted."""

    def __init__(self, threshold: float, model_handle: str, class_map_url: str):
        self.threshold = threshold
        self.model_handle = model_handle
        self.class_map_url = class_map_url
        self._model = None
        self._class_index: int | None = None

    def _load(self) -> None:
        if self._model is not None:
            return
        try:
            import numpy as np
            import tensorflow_hub as hub
        except ImportError as error:
            raise InferenceUnavailable(
                "YAMNet dependencies are missing; install backend/requirements-ml.txt"
            ) from error

        try:
            request = urllib.request.Request(
                self.class_map_url, headers={"User-Agent": "smart-baby-monitor/1.0"}
            )
            with urllib.request.urlopen(request, timeout=15) as response:
                class_map = response.read().decode("utf-8")
            reader = csv.DictReader(io.StringIO(class_map))
            target = "baby cry, infant cry"
            self._class_index = next(
                int(row["index"])
                for row in reader
                if row.get("display_name", "").strip().lower() == target
            )
            self._model = hub.load(self.model_handle)
        except Exception as error:  # Model download, map, or load failure must be explicit.
            self._model = None
            self._class_index = None
            raise InferenceUnavailable(f"Unable to load YAMNet model assets: {error}") from error

    def predict_pcm16(self, pcm_bytes: bytes, sample_rate_hz: int) -> InferenceResult:
        if sample_rate_hz != 16_000 or len(pcm_bytes) != 64_000:
            raise ValueError("audio window must be 2 seconds of 16 kHz mono PCM16")
        self._load()
        assert self._model is not None and self._class_index is not None

        import numpy as np

        waveform = np.frombuffer(pcm_bytes, dtype="<i2").astype(np.float32) / 32768.0
        try:
            output = self._model(waveform)
            score_tensor = output[0] if isinstance(output, (tuple, list)) else output["scores"]
            frame_scores = np.asarray(score_tensor)[:, self._class_index].astype(float).tolist()
        except Exception as error:
            raise InferenceUnavailable(f"YAMNet inference failed: {error}") from error

        streak = longest_positive_streak(frame_scores, self.threshold)
        confirmed = confirms_cry(frame_scores, self.threshold, required=2)
        confidence = max(frame_scores, default=0.0)
        return InferenceResult(
            crying=confirmed,
            confidence=confidence,
            label="baby_crying" if confirmed else "background",
            consecutive_windows=streak,
        )


def classifier_from_environment(threshold: float, model_handle: str, class_map_url: str):
    """A default classifier can be constructed without importing TensorFlow at app startup."""
    if os.getenv("MONITOR_DISABLE_INFERENCE", "").lower() in {"1", "true", "yes"}:
        return None
    return YamnetClassifier(threshold, model_handle, class_map_url)

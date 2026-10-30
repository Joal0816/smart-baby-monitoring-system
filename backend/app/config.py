from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path


def _float_env(name: str, default: float) -> float:
    value = os.getenv(name)
    return default if value is None or value == "" else float(value)


@dataclass(frozen=True)
class Settings:
    database_path: str
    app_token: str
    device_tokens: dict[str, str]
    allowed_origins: tuple[str, ...]
    temperature_min_c: float
    temperature_max_c: float
    humidity_min_pct: float
    humidity_max_pct: float
    cry_score_threshold: float
    yamnet_model_handle: str
    yamnet_class_map_url: str
    firebase_project_id: str

    @classmethod
    def from_environment(cls) -> "Settings":
        raw_devices = os.getenv("MONITOR_DEVICE_TOKENS", "{}")
        try:
            device_tokens = json.loads(raw_devices)
        except json.JSONDecodeError as error:
            raise ValueError("MONITOR_DEVICE_TOKENS must be a JSON object") from error
        if not isinstance(device_tokens, dict) or not all(
            isinstance(key, str) and isinstance(value, str)
            for key, value in device_tokens.items()
        ):
            raise ValueError("MONITOR_DEVICE_TOKENS must map device IDs to token strings")

        origins = tuple(
            origin.strip()
            for origin in os.getenv(
                "MONITOR_ALLOWED_ORIGINS", "http://localhost:4174,http://127.0.0.1:4174"
            ).split(",")
            if origin.strip()
        )
        database_path = os.getenv("MONITOR_DB_PATH", "./data/monitor.sqlite3")
        if database_path != ":memory:":
            Path(database_path).parent.mkdir(parents=True, exist_ok=True)

        return cls(
            database_path=database_path,
            app_token=os.getenv("MONITOR_APP_TOKEN", ""),
            device_tokens=device_tokens,
            allowed_origins=origins,
            temperature_min_c=_float_env("MONITOR_TEMPERATURE_MIN_C", 18),
            temperature_max_c=_float_env("MONITOR_TEMPERATURE_MAX_C", 30),
            humidity_min_pct=_float_env("MONITOR_HUMIDITY_MIN_PCT", 30),
            humidity_max_pct=_float_env("MONITOR_HUMIDITY_MAX_PCT", 70),
            cry_score_threshold=_float_env("MONITOR_CRY_SCORE_THRESHOLD", 0.35),
            yamnet_model_handle=os.getenv(
                "MONITOR_YAMNET_MODEL_HANDLE", "https://tfhub.dev/google/yamnet/1"
            ),
            yamnet_class_map_url=os.getenv(
                "MONITOR_YAMNET_CLASS_MAP_URL",
                "https://storage.googleapis.com/audioset/yamnet/yamnet_class_map.csv",
            ),
            firebase_project_id=os.getenv("FIREBASE_PROJECT_ID", ""),
        )

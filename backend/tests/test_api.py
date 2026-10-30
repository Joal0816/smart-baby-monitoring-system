from datetime import datetime, timezone
import json

from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.db import Database
from backend.app.main import create_app
from backend.app.classifier import confirms_cry, longest_positive_streak


def make_settings(path=":memory:"):
    return Settings(
        database_path=path,
        app_token="test-app-token",
        device_tokens={"rt-spark-01": "test-device-token"},
        allowed_origins=("http://localhost:4174",),
        temperature_min_c=18,
        temperature_max_c=30,
        humidity_min_pct=30,
        humidity_max_pct=70,
        cry_score_threshold=0.4,
        yamnet_model_handle="unused",
        yamnet_class_map_url="unused",
        firebase_project_id="",
    )


class ConfirmingClassifier:
    def predict_pcm16(self, pcm_bytes, sample_rate_hz):
        assert len(pcm_bytes) == 64_000
        assert sample_rate_hz == 16_000
        return type("Result", (), {
            "crying": True,
            "confidence": 0.81,
            "label": "baby_crying",
            "consecutive_windows": 2,
        })()


def test_health_and_authentication():
    client = TestClient(create_app(make_settings(), Database(":memory:"), classifier=None))
    assert client.get("/health").json()["status"] == "ok"
    response = client.get("/api/v1/events", headers={"Authorization": "Bearer wrong"})
    assert response.status_code == 401


def test_telemetry_stores_and_environment_alerts_are_debounced():
    app = create_app(make_settings(), Database(":memory:"), classifier=None,
                     push_sender=lambda *_: 0)
    client = TestClient(app)
    headers = {"Authorization": "Bearer test-device-token"}
    for sequence in range(3):
        response = client.post("/api/v1/devices/rt-spark-01/telemetry", headers=headers, json={
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "sequence": sequence,
            "temperature_c": 32,
            "humidity_pct": 55,
            "light_lux": 45,
            "proximity_state": "clear",
            "tilt_deg": 1.5,
        })
        assert response.status_code == 200
    events = client.get("/api/v1/events?device_id=rt-spark-01",
                        headers={"Authorization": "Bearer test-app-token"}).json()["items"]
    temperature_events = [event for event in events if event["kind"] == "environment"]
    assert len(temperature_events) == 1
    assert json.loads(temperature_events[0]["details_json"])["field"] == "temperature_c"


def test_audio_window_is_bounded_authenticated_and_evented():
    app = create_app(make_settings(), Database(":memory:"), classifier=ConfirmingClassifier(),
                     push_sender=lambda *_: 0)
    client = TestClient(app)
    headers = {
        "Authorization": "Bearer test-device-token",
        "X-Captured-At": datetime.now(timezone.utc).isoformat(),
        "X-Sequence": "5",
        "X-Sample-Rate-Hz": "16000",
        "Content-Type": "application/octet-stream",
    }
    result = client.post("/api/v1/devices/rt-spark-01/audio-windows", headers=headers,
                         content=b"\x00" * 64_000)
    assert result.status_code == 200
    assert result.json()["confirmed"] is True
    assert result.json()["event"]["kind"] == "cry"
    assert client.post("/api/v1/devices/rt-spark-01/audio-windows", headers=headers,
                       content=b"\x00" * 12).status_code == 422


def test_acknowledgement_and_app_history():
    database = Database(":memory:")
    database.ensure_device("rt-spark-01")
    event, _ = database.create_event("rt-spark-01", "cry", "Test cry", datetime.now(timezone.utc).isoformat())
    client = TestClient(create_app(make_settings(), database, classifier=None))
    auth = {"Authorization": "Bearer test-app-token"}
    response = client.post(f"/api/v1/events/{event['event_id']}/acknowledgement", headers=auth, json={})
    assert response.status_code == 200
    assert response.json()["event"]["acknowledged_at"] is not None
    assert len(client.get("/api/v1/events", headers=auth).json()["items"]) == 1


def test_event_idempotency_prevents_duplicate_rows():
    database = Database(":memory:")
    event_one, created_one = database.create_event(
        "rt-spark-01", "cry", "Cry", datetime.now(timezone.utc).isoformat(),
        idempotency_key="rt-spark-01:audio:7",
    )
    event_two, created_two = database.create_event(
        "rt-spark-01", "cry", "Cry retry", datetime.now(timezone.utc).isoformat(),
        idempotency_key="rt-spark-01:audio:7",
    )
    assert created_one is True
    assert created_two is False
    assert event_one["event_id"] == event_two["event_id"]


def test_consecutive_window_confirmation():
    assert confirms_cry([0.7, 0.75, 0.1], 0.4, required=2)
    assert not confirms_cry([0.7, 0.1, 0.8], 0.4, required=2)
    assert longest_positive_streak([0.7, 0.75, 0.1], 0.4) == 2

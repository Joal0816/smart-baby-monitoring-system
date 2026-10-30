from __future__ import annotations

import asyncio
import hmac
import json
import logging
from datetime import datetime, timezone
from typing import Annotated, Callable
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from .classifier import InferenceUnavailable, classifier_from_environment
from .config import Settings
from .db import Database, utc_now
from .push import send_event_notifications

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TelemetryPayload(BaseModel):
    captured_at: datetime
    sequence: int | None = Field(default=None, ge=0)
    temperature_c: float | None = Field(default=None, ge=-20, le=80)
    humidity_pct: float | None = Field(default=None, ge=0, le=100)
    light_lux: float | None = Field(default=None, ge=0, le=200_000)
    proximity_state: str | None = Field(default=None, pattern="^(clear|obstructed|unavailable)$")
    tilt_deg: float | None = Field(default=None, ge=-180, le=180)
    wifi_rssi_dbm: int | None = Field(default=None, ge=-127, le=0)
    firmware_version: str | None = Field(default=None, max_length=40)
    sensor_faults: list[str] = Field(default_factory=list, max_length=12)

    @field_validator("captured_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("captured_at must include a timezone")
        return value.astimezone(timezone.utc)


class InstallationPayload(BaseModel):
    installation_id: str = Field(min_length=8, max_length=100)
    device_id: str = Field(min_length=1, max_length=80)
    fcm_token: str = Field(min_length=20, max_length=4096)


class AckPayload(BaseModel):
    acknowledged_by: str = Field(default="caregiver", max_length=80)


def row_to_dict(row):
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def create_app(
    settings: Settings | None = None,
    database: Database | None = None,
    classifier=None,
    push_sender: Callable | None = None,
) -> FastAPI:
    settings = settings or Settings.from_environment()
    database = database or Database(settings.database_path)
    classifier = classifier if classifier is not None else classifier_from_environment(
        settings.cry_score_threshold,
        settings.yamnet_model_handle,
        settings.yamnet_class_map_url,
    )
    push_sender = push_sender or send_event_notifications

    app = FastAPI(
        title="Smart Baby Monitoring API",
        version="1.0.0",
        description="Classroom prototype API. Not a medical or safety service.",
    )
    app.state.settings = settings
    app.state.database = database
    app.state.classifier = classifier
    app.state.push_sender = push_sender
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Captured-At", "X-Sequence", "X-Sample-Rate-Hz"],
    )

    def authenticate_device(device_id: str, authorization: str | None) -> None:
        expected = settings.device_tokens.get(device_id, "")
        supplied = authorization.removeprefix("Bearer ") if authorization else ""
        if not expected or not hmac.compare_digest(expected, supplied):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid device credentials")

    def authenticate_app(authorization: str | None) -> None:
        supplied = authorization.removeprefix("Bearer ") if authorization else ""
        if not settings.app_token or not hmac.compare_digest(settings.app_token, supplied):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid app credentials")

    def notify(event) -> None:
        try:
            sent = app.state.push_sender(database, event, settings.firebase_project_id)
            with database.connection() as connection:
                connection.execute(
                    "UPDATE events SET push_sent=? WHERE event_id=?",
                    (1 if sent else 0, event["event_id"]),
                )
                connection.commit()
        except Exception:
            logger.exception("Notification hook failed for event %s", event["event_id"])

    def create_event(device_id: str, kind: str, summary: str, captured_at: str,
                     details: dict | None = None, confidence: float | None = None,
                     idempotency_key: str | None = None):
        event, created = database.create_event(
            device_id=device_id,
            kind=kind,
            summary=summary,
            captured_at=captured_at,
            confidence=confidence,
            details_json=json.dumps(details or {}, separators=(",", ":")),
            idempotency_key=idempotency_key,
        )
        if created:
            notify(event)
        return event

    def check_environment(device_id: str, field: str, value: float | None,
                          lower: float, upper: float, captured_at: str) -> None:
        if value is None:
            return
        samples = database.readings_since(device_id, field, limit=3)
        if len(samples) < 3 or any(sample is None for sample in samples):
            return
        below = all(sample < lower for sample in samples)
        above = all(sample > upper for sample in samples)
        active = database.active_environment_event(device_id, field)
        if below or above:
            if active is None:
                direction = "below" if below else "above"
                create_event(
                    device_id,
                    "environment",
                    f"{field.replace('_', ' ').title()} outside demo range",
                    captured_at,
                    {"field": field, "value": value, "direction": direction,
                     "range": [lower, upper], "source": "project-configured threshold"},
                )
        elif all(lower <= sample <= upper for sample in samples):
            database.resolve_environment_events(device_id, field)

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "smart-baby-monitor-api", "time": utc_now()}

    @app.post("/api/v1/devices/{device_id}/telemetry")
    def post_telemetry(
        device_id: str,
        payload: TelemetryPayload,
        authorization: Annotated[str | None, Header()] = None,
    ):
        authenticate_device(device_id, authorization)
        database.ensure_device(device_id, payload.firmware_version)
        data = payload.model_dump(mode="json")
        captured_at = payload.captured_at.isoformat()
        database.insert_reading({
            **data,
            "device_id": device_id,
            "captured_at": captured_at,
            "sensor_faults_json": json.dumps(payload.sensor_faults),
        })

        if payload.temperature_c is not None:
            check_environment(device_id, "temperature_c", payload.temperature_c,
                              settings.temperature_min_c, settings.temperature_max_c, captured_at)
        if payload.humidity_pct is not None:
            check_environment(device_id, "humidity_pct", payload.humidity_pct,
                              settings.humidity_min_pct, settings.humidity_max_pct, captured_at)
        if payload.sensor_faults:
            existing = [event for event in database.events(device_id, limit=20)
                        if event["kind"] == "device_fault" and event["resolved_at"] is None]
            if not existing:
                create_event(device_id, "device_fault", "A device sensor needs attention",
                             captured_at, {"faults": payload.sensor_faults})
            with database.connection() as connection:
                connection.execute("UPDATE devices SET last_faults_json=? WHERE device_id=?",
                                   (json.dumps(payload.sensor_faults), device_id))
                connection.commit()
        else:
            database.resolve_device_fault_events(device_id)
            with database.connection() as connection:
                connection.execute("UPDATE devices SET last_faults_json='[]' WHERE device_id=?", (device_id,))
                connection.commit()
        return {"accepted": True, "device_id": device_id, "captured_at": captured_at,
                "pending_acknowledgements": []}

    @app.post("/api/v1/devices/{device_id}/audio-windows")
    async def post_audio_window(
        device_id: str,
        request: Request,
        authorization: Annotated[str | None, Header()] = None,
        captured_at: Annotated[str | None, Header(alias="X-Captured-At")] = None,
        sequence: Annotated[int | None, Header(alias="X-Sequence")] = None,
        sample_rate_hz: Annotated[int | None, Header(alias="X-Sample-Rate-Hz")] = None,
    ):
        authenticate_device(device_id, authorization)
        if captured_at is None or sequence is None or sample_rate_hz is None:
            raise HTTPException(422, "X-Captured-At, X-Sequence, and X-Sample-Rate-Hz are required")
        try:
            parsed_time = datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
            if parsed_time.tzinfo is None:
                raise ValueError("timezone required")
            parsed_time = parsed_time.astimezone(timezone.utc)
        except ValueError as error:
            raise HTTPException(422, "X-Captured-At must be ISO 8601 with a timezone") from error
        chunks = []
        body_size = 0
        async for chunk in request.stream():
            body_size += len(chunk)
            if body_size > 64_000:
                raise HTTPException(413, "Audio window exceeds the two-second upload limit")
            chunks.append(chunk)
        body = b"".join(chunks)
        if len(body) != 64_000 or sample_rate_hz != 16_000:
            raise HTTPException(422, "Expected 2 seconds of 16 kHz mono PCM16 audio")
        if app.state.classifier is None:
            raise HTTPException(503, "Audio inference is not configured")
        try:
            result = await asyncio.to_thread(app.state.classifier.predict_pcm16, body, sample_rate_hz)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        except InferenceUnavailable as error:
            logger.warning("Inference unavailable for device %s: %s", device_id, error)
            raise HTTPException(503, "Audio inference is temporarily unavailable") from error

        event = None
        if result.crying:
            row = create_event(
                device_id,
                "cry",
                "Likely baby cry detected",
                parsed_time.isoformat(),
                {"label": result.label, "sequence": sequence,
                 "consecutive_windows": result.consecutive_windows},
                confidence=result.confidence,
                idempotency_key=f"{device_id}:audio:{sequence}",
            )
            event = row_to_dict(row)
        # `body` is local request memory only. It is never logged or written to the database.
        del body
        return {"accepted": True, "device_id": device_id, "sequence": sequence,
                "label": result.label, "confidence": round(float(result.confidence), 5),
                "confirmed": result.crying, "event": event}

    @app.get("/api/v1/devices/{device_id}/latest")
    def get_latest(
        device_id: str,
        authorization: Annotated[str | None, Header()] = None,
    ):
        authenticate_app(authorization)
        device = None
        with database.connection() as connection:
            device = connection.execute("SELECT * FROM devices WHERE device_id=?", (device_id,)).fetchone()
        reading = database.latest_reading(device_id)
        return {"device": row_to_dict(device), "reading": row_to_dict(reading),
                "received_at": reading["received_at"] if reading else None}

    @app.get("/api/v1/readings")
    def get_readings(
        device_id: str = Query(min_length=1, max_length=80),
        limit: int = Query(default=100, ge=1, le=500),
        authorization: Annotated[str | None, Header()] = None,
    ):
        authenticate_app(authorization)
        return {"items": [row_to_dict(row) for row in database.recent_readings(device_id, limit)]}

    @app.get("/api/v1/events")
    def get_events(
        device_id: str | None = Query(default=None, max_length=80),
        limit: int = Query(default=100, ge=1, le=500),
        authorization: Annotated[str | None, Header()] = None,
    ):
        authenticate_app(authorization)
        return {"items": [row_to_dict(row) for row in database.events(device_id, limit)]}

    @app.post("/api/v1/events/{event_id}/acknowledgement")
    def acknowledge_event(
        event_id: str,
        payload: AckPayload,
        authorization: Annotated[str | None, Header()] = None,
    ):
        authenticate_app(authorization)
        event = database.acknowledge(event_id)
        if event is None:
            raise HTTPException(404, "Event not found")
        return {"acknowledged": True, "event": row_to_dict(event),
                "acknowledged_by": payload.acknowledged_by}

    @app.post("/api/v1/app/installations", status_code=201)
    def register_installation(
        payload: InstallationPayload,
        authorization: Annotated[str | None, Header()] = None,
    ):
        authenticate_app(authorization)
        database.ensure_device(payload.device_id)
        database.upsert_installation(payload.installation_id, payload.device_id, payload.fcm_token)
        return {"registered": True, "installation_id": payload.installation_id}

    return app


app = create_app()

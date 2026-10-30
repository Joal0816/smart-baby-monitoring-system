from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import sqlite3
from typing import Iterator


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    last_seen_at TEXT NOT NULL,
    network_status TEXT NOT NULL DEFAULT 'online',
    firmware_version TEXT,
    last_faults_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL REFERENCES devices(device_id),
    sequence INTEGER,
    captured_at TEXT NOT NULL,
    received_at TEXT NOT NULL,
    temperature_c REAL,
    humidity_pct REAL,
    light_lux REAL,
    proximity_state TEXT,
    tilt_deg REAL,
    wifi_rssi_dbm INTEGER,
    sensor_faults_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS readings_device_time ON readings(device_id, captured_at DESC);
CREATE TABLE IF NOT EXISTS events (
    event_id TEXT PRIMARY KEY,
    idempotency_key TEXT UNIQUE,
    device_id TEXT NOT NULL REFERENCES devices(device_id),
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    confidence REAL,
    details_json TEXT NOT NULL DEFAULT '{}',
    acknowledged_at TEXT,
    resolved_at TEXT,
    push_sent INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS events_device_time ON events(device_id, captured_at DESC);
CREATE TABLE IF NOT EXISTS app_installations (
    installation_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(device_id),
    fcm_token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


class Database:
    def __init__(self, path: str):
        self.path = path
        self._memory_connection: sqlite3.Connection | None = None
        if path == ":memory:":
            self._memory_connection = sqlite3.connect(":memory:", check_same_thread=False)
            self._memory_connection.row_factory = sqlite3.Row
            self._memory_connection.executescript(SCHEMA)
            self._memory_connection.commit()
        else:
            with self.connection() as connection:
                connection.executescript(SCHEMA)
                connection.commit()

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        connection = self._memory_connection or sqlite3.connect(
            self.path, timeout=10, check_same_thread=False
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        if self.path != ":memory:":
            connection.execute("PRAGMA journal_mode = WAL")
        try:
            yield connection
        finally:
            if self._memory_connection is None:
                connection.close()

    def ensure_device(self, device_id: str, firmware_version: str | None = None) -> None:
        now = utc_now()
        with self.connection() as connection:
            connection.execute(
                """INSERT INTO devices(device_id, last_seen_at, firmware_version)
                   VALUES(?, ?, ?)
                   ON CONFLICT(device_id) DO UPDATE SET
                     last_seen_at=excluded.last_seen_at,
                     network_status='online',
                     firmware_version=COALESCE(excluded.firmware_version, devices.firmware_version)""",
                (device_id, now, firmware_version),
            )
            connection.commit()

    def insert_reading(self, values: dict) -> None:
        with self.connection() as connection:
            connection.execute(
                """INSERT INTO readings(
                     device_id, sequence, captured_at, received_at, temperature_c,
                     humidity_pct, light_lux, proximity_state, tilt_deg, wifi_rssi_dbm,
                     sensor_faults_json
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    values["device_id"], values.get("sequence"), values["captured_at"],
                    utc_now(), values.get("temperature_c"), values.get("humidity_pct"),
                    values.get("light_lux"), values.get("proximity_state"),
                    values.get("tilt_deg"), values.get("wifi_rssi_dbm"),
                    values.get("sensor_faults_json", "[]"),
                ),
            )
            connection.commit()

    def latest_reading(self, device_id: str) -> sqlite3.Row | None:
        with self.connection() as connection:
            return connection.execute(
                "SELECT * FROM readings WHERE device_id=? ORDER BY captured_at DESC, id DESC LIMIT 1",
                (device_id,),
            ).fetchone()

    def recent_readings(self, device_id: str, limit: int = 100) -> list[sqlite3.Row]:
        with self.connection() as connection:
            return list(connection.execute(
                "SELECT * FROM readings WHERE device_id=? ORDER BY captured_at DESC, id DESC LIMIT ?",
                (device_id, limit),
            ).fetchall())

    def readings_since(self, device_id: str, field: str, limit: int = 3) -> list[float | None]:
        allowed = {"temperature_c", "humidity_pct"}
        if field not in allowed:
            raise ValueError("unsupported reading field")
        with self.connection() as connection:
            rows = connection.execute(
                f"SELECT {field} FROM readings WHERE device_id=? ORDER BY captured_at DESC, id DESC LIMIT ?",
                (device_id, limit),
            ).fetchall()
        return [row[field] for row in rows]

    def create_event(
        self, device_id: str, kind: str, summary: str, captured_at: str,
        confidence: float | None = None, details_json: str = "{}",
        idempotency_key: str | None = None,
    ) -> tuple[sqlite3.Row, bool]:
        import uuid

        event_id = str(uuid.uuid4())
        now = utc_now()
        with self.connection() as connection:
            connection.execute(
                "INSERT OR IGNORE INTO devices(device_id, last_seen_at) VALUES(?, ?)",
                (device_id, now),
            )
            insert_cursor = connection.execute(
                """INSERT OR IGNORE INTO events(event_id, idempotency_key, device_id, kind, summary,
                     captured_at, created_at, confidence, details_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (event_id, idempotency_key, device_id, kind, summary, captured_at, now,
                 confidence, details_json),
            )
            created = insert_cursor.rowcount == 1
            if idempotency_key:
                row = connection.execute(
                    "SELECT * FROM events WHERE idempotency_key=?", (idempotency_key,)
                ).fetchone()
            else:
                row = connection.execute("SELECT * FROM events WHERE event_id=?", (event_id,)).fetchone()
            connection.commit()
        return row, created

    def active_environment_event(self, device_id: str, field: str) -> sqlite3.Row | None:
        with self.connection() as connection:
            return connection.execute(
                """SELECT * FROM events WHERE device_id=? AND kind='environment' AND resolved_at IS NULL
                   AND json_extract(details_json, '$.field')=? ORDER BY created_at DESC LIMIT 1""",
                (device_id, field),
            ).fetchone()

    def resolve_environment_events(self, device_id: str, field: str) -> None:
        with self.connection() as connection:
            connection.execute(
                """UPDATE events SET resolved_at=? WHERE device_id=? AND kind='environment'
                   AND resolved_at IS NULL AND json_extract(details_json, '$.field')=?""",
                (utc_now(), device_id, field),
            )
            connection.commit()

    def resolve_device_fault_events(self, device_id: str) -> None:
        with self.connection() as connection:
            connection.execute(
                "UPDATE events SET resolved_at=? WHERE device_id=? AND kind='device_fault' AND resolved_at IS NULL",
                (utc_now(), device_id),
            )
            connection.commit()

    def events(self, device_id: str | None = None, limit: int = 100) -> list[sqlite3.Row]:
        with self.connection() as connection:
            if device_id:
                rows = connection.execute(
                    "SELECT * FROM events WHERE device_id=? ORDER BY captured_at DESC LIMIT ?",
                    (device_id, limit),
                ).fetchall()
            else:
                rows = connection.execute(
                    "SELECT * FROM events ORDER BY captured_at DESC LIMIT ?", (limit,)
                ).fetchall()
        return list(rows)

    def event(self, event_id: str) -> sqlite3.Row | None:
        with self.connection() as connection:
            return connection.execute("SELECT * FROM events WHERE event_id=?", (event_id,)).fetchone()

    def acknowledge(self, event_id: str) -> sqlite3.Row | None:
        with self.connection() as connection:
            connection.execute(
                "UPDATE events SET acknowledged_at=COALESCE(acknowledged_at, ?) WHERE event_id=?",
                (utc_now(), event_id),
            )
            row = connection.execute("SELECT * FROM events WHERE event_id=?", (event_id,)).fetchone()
            connection.commit()
        return row

    def installations_for_device(self, device_id: str) -> list[str]:
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT fcm_token FROM app_installations WHERE device_id=?", (device_id,)
            ).fetchall()
        return [row["fcm_token"] for row in rows]

    def upsert_installation(self, installation_id: str, device_id: str, fcm_token: str) -> None:
        now = utc_now()
        with self.connection() as connection:
            connection.execute(
                """INSERT INTO app_installations(installation_id, device_id, fcm_token, created_at, updated_at)
                   VALUES(?, ?, ?, ?, ?)
                   ON CONFLICT(installation_id) DO UPDATE SET device_id=excluded.device_id,
                     fcm_token=excluded.fcm_token, updated_at=excluded.updated_at""",
                (installation_id, device_id, fcm_token, now, now),
            )
            connection.commit()

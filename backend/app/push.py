from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


def send_event_notifications(db, event, project_id: str) -> int:
    """Send FCM notifications when server credentials are configured; never log tokens."""
    credential_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if not credential_path or not project_id:
        logger.info("FCM skipped: service account or FIREBASE_PROJECT_ID is not configured")
        return 0

    try:
        import firebase_admin
        from firebase_admin import credentials, messaging

        app_name = "smart-baby-monitor"
        try:
            firebase_app = firebase_admin.get_app(app_name)
        except ValueError:
            firebase_app = firebase_admin.initialize_app(
                credentials.Certificate(credential_path),
                {"projectId": project_id},
                name=app_name,
            )
        sent = 0
        for token in db.installations_for_device(event["device_id"]):
            message = messaging.Message(
                notification=messaging.Notification(
                    title=event["summary"],
                    body="Open Little Monitor to review the latest event.",
                ),
                data={"eventId": event["event_id"], "kind": event["kind"]},
                token=token,
            )
            try:
                messaging.send(message, app=firebase_app)
                sent += 1
            except Exception:
                logger.exception("FCM delivery failed for event %s", event["event_id"])
        return sent
    except ImportError:
        logger.error("firebase-admin is not installed; FCM delivery is unavailable")
        return 0
    except Exception:
        logger.exception("FCM initialization failed")
        return 0

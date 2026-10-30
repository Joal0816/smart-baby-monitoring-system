"""Development entrypoint. Use HTTPS cert arguments for device LAN access."""

import os
import uvicorn


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=os.getenv("MONITOR_HOST", "127.0.0.1"),
        port=int(os.getenv("MONITOR_PORT", "8000")),
        reload=os.getenv("MONITOR_RELOAD", "true").lower() in {"1", "true", "yes"},
        ssl_keyfile=os.getenv("MONITOR_TLS_KEYFILE") or None,
        ssl_certfile=os.getenv("MONITOR_TLS_CERTFILE") or None,
    )

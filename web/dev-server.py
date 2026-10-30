#!/usr/bin/env python3
"""Small local preview server with automatic reload polling for VS Code."""

from hashlib import sha256
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json


WEB_DIR = Path(__file__).resolve().parent
PORT = 4174


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def do_GET(self):
        if self.path == "/_live":
            digest = sha256()
            for file_path in sorted(WEB_DIR.glob("*")):
                if file_path.is_file() and file_path.name != "dev-server.py":
                    digest.update(file_path.name.encode())
                    digest.update(file_path.read_bytes())
            payload = json.dumps({"version": digest.hexdigest()}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def log_message(self, format_string, *args):
        print(f"[preview] {self.address_string()} {format_string % args}")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), PreviewHandler)
    print(f"VS Code preview: http://localhost:{PORT}", flush=True)
    server.serve_forever()

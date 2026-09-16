#!/usr/bin/env python3
"""Aggregates What's Up Docker's per-container data into per-Compose-project
(WUD calls it "stack") counts, for Homepage's customapi widget.

Talks only to WUD's REST API (GET /api/containers) — confirmed against WUD's
own OpenAPI spec (app/api/openapi.yaml in fmartinou/whats-up-docker), which
already resolves each container's Docker Compose project as the `stack`
field, so this needs no separate Docker socket/proxy access of its own.

Endpoints:
  GET /stacks            -> {"<project>": {"containers": N, "updates_available": N}, ...}
  GET /stacks/<project>  -> {"containers": N, "updates_available": N} (zeros if unknown)
"""
import base64
import json
import os
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock, Thread

WUD_URL = os.environ.get("WUD_URL", "http://127.0.0.1:3000").rstrip("/")
WUD_USER = os.environ.get("WUD_USER", "")
WUD_PASS = os.environ.get("WUD_PASS", "")
POLL_SECONDS = int(os.environ.get("STACKS_POLL_SECONDS", "60"))

lock = Lock()
state = {"generated_at": None, "available": False, "stacks": {}}


def fetch_containers():
    headers = {"User-Agent": "stacks-collector/1.0", "Accept": "application/json"}
    if WUD_USER:
        token = base64.b64encode(f"{WUD_USER}:{WUD_PASS}".encode()).decode()
        headers["Authorization"] = f"Basic {token}"
    request = urllib.request.Request(f"{WUD_URL}/api/containers", headers=headers)
    with urllib.request.urlopen(request, timeout=6) as response:
        return json.loads(response.read().decode())


def poll():
    global state
    while True:
        try:
            containers = fetch_containers()
            grouped = {}
            for container in containers:
                if not isinstance(container, dict):
                    continue
                project = container.get("stack") or "(no compose project)"
                entry = grouped.setdefault(project, {"containers": 0, "updates_available": 0})
                entry["containers"] += 1
                if container.get("updateAvailable"):
                    entry["updates_available"] += 1
            with lock:
                state = {"generated_at": int(time.time()), "available": True, "stacks": grouped}
        except Exception:
            with lock:
                state = {"generated_at": int(time.time()), "available": False, "stacks": state.get("stacks", {})}
        time.sleep(POLL_SECONDS)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        with lock:
            stacks = state["stacks"]
            if path in ("", "/stacks"):
                payload = json.dumps(state).encode()
            elif path.startswith("/stacks/"):
                name = path[len("/stacks/"):]
                payload = json.dumps(stacks.get(name, {"containers": 0, "updates_available": 0})).encode()
            else:
                payload = json.dumps({"status": "ok", "service": "stacks-collector"}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args):
        return


def main():
    Thread(target=poll, daemon=True).start()
    bind = os.environ.get("STACKS_BIND", "127.0.0.1")
    port = int(os.environ.get("STACKS_PORT", "9100"))
    ThreadingHTTPServer((bind, port), Handler).serve_forever()


if __name__ == "__main__":
    main()

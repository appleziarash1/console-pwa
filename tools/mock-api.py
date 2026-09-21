#!/usr/bin/env python3
"""A tiny stand-in for the OpenHands Cloud V1 API.

Useful for developing the UI without a key, demoing offline, and for the
screenshot/pixel checks. Serves the endpoints src/js/api.js calls, backed by
tests/fixtures/events.json plus a couple of synthetic conversations so the
rail, filters, and status colours all have something to show.

  python3 tools/mock-api.py 12001
  # then set Console's "API base URL" to http://localhost:12001
"""

import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / "tests" / "fixtures" / "events.json"

NOW = datetime.now(timezone.utc)


def iso(minutes_ago: float) -> str:
    return (NOW - timedelta(minutes=minutes_ago)).isoformat().replace("+00:00", "Z")


CONVERSATIONS = [
    {
        "id": "aaaa1111bbbb2222cccc3333dddd4444",
        "title": "Build an installable PWA for the console",
        "selected_repository": "openhands/console",
        "selected_branch": "main",
        "git_provider": "github",
        "llm_model": "openhands/deepseek-v4.1-flash",
        "execution_status": "running",
        "sandbox_status": "RUNNING",
        "created_at": iso(48),
        "updated_at": iso(0.4),
        "pr_number": [],
    },
    {
        "id": "eeee5555ffff6666aaaa7777bbbb8888",
        "title": "Investigate flaky tests in tests/test_api.py",
        "selected_repository": "openhands/sandbox-server",
        "selected_branch": "fix/flaky",
        "llm_model": "anthropic/claude-sonnet-4",
        "execution_status": "finished",
        "sandbox_status": "RUNNING",
        "created_at": iso(320),
        "updated_at": iso(180),
        "pr_number": [482],
    },
    {
        "id": "9999aaaa8888bbbb7777cccc6666dddd",
        "title": "Summarise the incident retro and draft follow-ups",
        "selected_repository": None,
        "selected_branch": None,
        "llm_model": "openai/gpt-5",
        "execution_status": "error",
        "sandbox_status": "PAUSED",
        "created_at": iso(2600),
        "updated_at": iso(2450),
        "pr_number": [],
    },
    {
        "id": "1111eeee2222ffff3333aaaa4444bbbb",
        "title": "Add dark mode to the settings screen",
        "selected_repository": "openhands/console",
        "selected_branch": "feat/dark-mode",
        "llm_model": "openhands/deepseek-v4.1-flash",
        "execution_status": "finished",
        "sandbox_status": "PAUSED",
        "created_at": iso(7000),
        "updated_at": iso(6900),
        "pr_number": [471, 473],
    },
]


def load_events() -> list:
    if FIXTURE.exists():
        return json.loads(FIXTURE.read_text())["items"]
    return []


def summarise(events: list) -> list:
    """A second, shorter transcript so different conversations look different."""
    out = []
    for e in events:
        if e.get("kind") in ("MessageEvent", "ActionEvent", "ObservationEvent", "SystemPromptEvent"):
            out.append(e)
    return out


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization, content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization, content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        q = parse_qs(url.query)
        path = url.path

        if not self.headers.get("Authorization", "").startswith("Bearer "):
            return self._send({"detail": "Not authenticated"}, 401)

        if path == "/api/v1/users/me":
            return self._send(
                {
                    "id": "00000000-0000-0000-0000-000000000001",
                    "email": "you@example.com",
                    "org_id": "00000000-0000-0000-0000-000000000002",
                    "org_name": "example",
                    "llm_model": "openhands/deepseek-v4.1-flash",
                    "v1_enabled": True,
                }
            )

        if path == "/api/v1/app-conversations/search":
            limit = int(q.get("limit", ["30"])[0])
            return self._send({"items": CONVERSATIONS[:limit], "next_page_id": None})

        if path == "/api/v1/app-conversations":
            ids = (q.get("ids", [""])[0] or "").split(",")
            found = [c for c in CONVERSATIONS if c["id"] in ids]
            return self._send(found or [None])

        if path == "/api/v1/app-conversations/start-tasks":
            return self._send(
                [
                    {
                        "id": "task-1",
                        "status": "READY",
                        "app_conversation_id": CONVERSATIONS[0]["id"],
                        "agent_server_url": "http://localhost:12001",
                        "request": {},
                        "created_by_user_id": "mock",
                    }
                ]
            )

        m = re.match(r"^/api/v1/conversation/([^/]+)/events/search$", path)
        if m:
            events = load_events()
            if m.group(1).endswith("bbbb8888") or m.group(1).endswith("cccc6666dddd"):
                events = summarise(events)
            return self._send({"items": events, "next_page_id": None})

        return self._send({"detail": "Not Found"}, 404)

    def do_POST(self):
        url = urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            return self._send({"detail": "Invalid JSON"}, 400)

        if url.path == "/api/v1/app-conversations":
            return self._send(
                {
                    "id": "task-1",
                    "status": "READY",
                    "app_conversation_id": CONVERSATIONS[0]["id"],
                    "agent_server_url": "http://localhost:12001",
                    "request": payload,
                    "created_by_user_id": "mock",
                }
            )

        if url.path.endswith("/send-message"):
            return self._send({"success": True, "message": payload})

        if "/conversations/" in url.path and url.path.endswith("/stop"):
            return self._send({"success": True, "stopped": True})

        return self._send({"detail": "Not Found"}, 404)

    def do_PATCH(self):
        length = int(self.headers.get("Content-Length") or 0)
        self.rfile.read(length)
        return self._send({"success": True})

    def do_DELETE(self):
        return self._send({"success": True})

    def log_message(self, fmt, *args):
        sys.stderr.write(f"  mock  {fmt % args}\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("port", nargs="?", type=int, default=12001)
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()

    with ThreadingHTTPServer((args.host, args.port), Handler) as httpd:
        print(f"\n  Mock OpenHands API  →  http://localhost:{args.port}")
        print("  Point Console's API base URL here.\n  Ctrl+C to stop\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

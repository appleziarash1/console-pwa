#!/usr/bin/env python3
"""Static server for Console with the headers a PWA needs.

  python3 tools/serve.py [port]        # default 12000

Serves src/ with:
  * correct MIME types (incl. .webmanifest, .woff2)
  * no-store for sw.js + manifest so updates are picked up immediately
  * long cache for fonts/icons, since they are content-addressed by name
  * HTTPS is not required: localhost is a secure context, and the PWA
    installs from the work-* host over the runtime's TLS terminator.
"""

import argparse
import http.server
import mimetypes
import os
import socketserver
import sys
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "src"

mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/png", ".png")
mimetypes.add_type("image/svg+xml", ".svg")

CACHE_ONE_YEAR = "public, max-age=31536000, immutable"
NO_STORE = "no-store, no-cache, must-revalidate, max-age=0"


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        path = self.path.split("?", 1)[0]
        if path in ("/sw.js", "/manifest.webmanifest"):
            self.send_header("Cache-Control", NO_STORE)
            self.send_header("Service-Worker-Allowed", "/")
        elif any(path.startswith(p) for p in ("/fonts/", "/icons/")) or path == "/fonts.css":
            self.send_header("Cache-Control", CACHE_ONE_YEAR)
        else:
            self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def send_head(self):
        if self.path.split("?", 1)[0] in ("/", ""):
            self.path = "/index.html"
        return super().send_head()

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write(f"  {self.address_string()}  {fmt % args}\n")


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("port", nargs="?", type=int,
                        default=int(os.environ.get("PORT", "12000")))
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()

    handler = partial(Handler, directory=str(ROOT))
    with Server((args.host, args.port), handler) as httpd:
        print(f"\n  Console is running →  http://localhost:{args.port}")
        print(f"  serving {ROOT}\n  Ctrl+C to stop\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

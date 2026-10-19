"""Static file server for development that disables caching.

`python -m http.server` sends no Cache-Control, so Chrome decides on its own whether to
revalidate, and edited .js / .css files often load stale with no visible sign: changes
simply seem not to take effect. That kept happening during development and
verification, hence this server.

It once also sent `Clear-Site-Data: "cache"` to purge stale caches the browser had
stored before this server existed (from the `python -m http.server` days), which
no-store cannot reach. That purpose was served, but the header told the browser to wipe
the whole origin's cache on **every response**: measured, it alone pushed the workspace
page's DOMContentLoaded from 169 ms to 3696 ms (each module's download phase went from
1 ms to ~270 ms regardless of size). It has been removed; no-store already prevents
responses from being stored at all.

If changes ever seem not to take effect on another machine, check whether that browser
still holds a cache from before this server, and clear it once with a hard reload
(Ctrl+Shift+R); there is no need to bring Clear-Site-Data back.

Development only. Production deployment is a static internal web server that does not
use this file.

    python tools/devserver.py [port]
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    # Python's BaseHTTPRequestHandler defaults to HTTP/1.0 and closes the connection after
    # every file, so each of this project's 30-odd ES modules needs a new TCP handshake.
    # Measured on Windows against localhost: ~300 ms of TCP setup per file, and with the
    # browser's limit of 6 connections per host most requests sat queued for a connection
    # slot (2.2-2.8 s stalled per file), so the workspace page took 6.4 s to reach
    # DOMContentLoaded, even though the server spent only 1-2 ms on each request; all the
    # time went to connection setup and queueing.
    #
    # HTTP/1.1 enables keep-alive, so one connection can fetch many files in a row.
    # SimpleHTTPRequestHandler already sends a correct Content-Length for static files,
    # which is what HTTP/1.1 keep-alive requires, so nothing else is needed.
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        # no-store rather than no-cache: no-cache still makes conditional requests that can
        # return 304, leaving stale modules in the module graph. no-store means "never store it".
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass          # silenced: one log line per module would flood the console on startup


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(NoCacheHandler, directory=str(PROJECT_ROOT))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"XMNT dev server (no-store) on http://127.0.0.1:{port}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()

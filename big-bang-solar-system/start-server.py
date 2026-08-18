#!/usr/bin/env python3
"""
start-server.py
------------------------------------------------------------------
Double-click-friendly local server for "From Big Bang to Solar System".

WHY THIS EXISTS
Opening index.html directly (double-clicking it, or dragging it into a
browser tab) loads it over the file:// protocol. Browsers deliberately
block ES module scripts — the `<script type="module">` / `import`
statements this project's JavaScript relies on throughout — from
loading over file://. When that happens, main.js never runs, so
nothing in js/ ever executes: no Three.js, no renderer, no animation
loop. Depending on the browser, the page can end up looking mostly
blank, frozen, or (in some browsers) fully white, because the CSS/HTML
shell loads but the application that would fill it in never starts.

Serving the same folder over plain HTTP — which is all this script
does — removes that restriction completely. This does not change
anything about the project itself; it only changes how the browser is
told to fetch it.

USAGE
    python3 start-server.py
Then open the URL it prints (it also tries to open your browser for
you automatically). Leave the terminal window open while you use the
app; press Ctrl+C in it when you're done.

This script only uses the Python standard library — nothing to
install.
"""
import http.server
import os
import socketserver
import sys
import webbrowser

PREFERRED_PORTS = [8000, 8080, 8888, 5500]


class NoCacheRequestHandler(http.server.SimpleHTTPRequestHandler):
    """
    Identical to the standard static file handler, except every response
    tells the browser never to cache it.

    Why: this project gets updated in place (you re-extract a new zip
    over the same folder, then re-run this same script). Browsers
    aggressively cache CSS/JS by URL, so without this, re-running the
    server after an update can silently serve a MIX of new and cached-
    old files — e.g. new HTML referencing new CSS classes, paired with
    yesterday's cached stylesheet that doesn't define them yet. That
    looks like broken styling, but it isn't a bug in the project; it's
    the browser reusing a file it shouldn't. Disabling caching entirely
    for this dev server removes the whole failure mode.
    """

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class ReusableTCPServer(socketserver.TCPServer):
    """
    Identical to TCPServer, except it can immediately rebind to a port
    a just-stopped server was using.

    Why: without this, restarting the server soon after stopping it can
    hit "Address already in use" even though nothing else is actually
    listening — the OS holds the port briefly (TIME_WAIT) after a
    server closes it. This is the standard, well-known fix.
    """

    allow_reuse_address = True


def start_server():
    project_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_dir)

    handler = NoCacheRequestHandler
    httpd = None
    chosen_port = None

    for port in PREFERRED_PORTS:
        try:
            httpd = ReusableTCPServer(("127.0.0.1", port), handler)
            chosen_port = port
            break
        except OSError:
            continue

    if httpd is None:
        # Every preferred port was busy — ask the OS for any free one.
        # This basically never fails (there are thousands of ports),
        # but if it somehow does, fail with a clear message rather than
        # a raw traceback.
        try:
            httpd = ReusableTCPServer(("127.0.0.1", 0), handler)
            chosen_port = httpd.server_address[1]
        except OSError as exc:
            print(f"Could not open any local port to serve on: {exc}")
            print("Close other running copies of this server (or other local")
            print("servers/apps using ports 8000/8080/8888/5500) and try again.")
            if sys.platform.startswith("win") or "com.termux" in os.environ.get("PREFIX", ""):
                input("\nPress Enter to close this window...")
            sys.exit(1)

    url = f"http://localhost:{chosen_port}/index.html"
    banner = "=" * 64
    print(banner)
    print("  From Big Bang to Solar System — local server running")
    print(banner)
    print(f"\n  Open this address in your browser if it doesn't open automatically:\n")
    print(f"      {url}\n")
    print("  Leave THIS window open while you use the app.")
    print("  Close this window, or press Ctrl+C here, to stop the server.")
    print(banner)

    try:
        webbrowser.open(url)
    except Exception:
        pass  # opening a browser automatically is a convenience, not a requirement

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    try:
        start_server()
    except Exception as exc:  # pragma: no cover - top-level safety net for a double-clicked script
        print(f"\nSomething went wrong starting the server: {exc}")
        print("If you're on a system without Python 3, see README.md for other options.")
        if sys.platform.startswith("win"):
            input("\nPress Enter to close this window...")

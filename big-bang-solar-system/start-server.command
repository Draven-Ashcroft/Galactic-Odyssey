#!/bin/bash
# Double-click this file in Finder to start the local server (macOS).
# It just runs start-server.py from this same folder — see that file,
# or README.md, for why a local server is needed at all.
cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
  python3 start-server.py
elif command -v python >/dev/null 2>&1; then
  python start-server.py
else
  echo "Python was not found on this Mac."
  echo "Install it from https://python.org, then double-click this file again."
  echo "(See README.md for other ways to run this project.)"
  read -p "Press Enter to close this window..."
fi

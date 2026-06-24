import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api_dispatch import handle_api


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        handle_api(self)

    def log_message(self, fmt, *args):
        return
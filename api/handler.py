from http.server import BaseHTTPRequestHandler

# Load project .env.local via server before any route handlers (single-app env).
import server  # noqa: F401,E402
from api_dispatch import handle_api


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        handle_api(self)
        return

    def do_POST(self):
        handle_api(self)
        return

    def log_message(self, fmt, *args):
        return
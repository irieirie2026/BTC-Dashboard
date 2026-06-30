from http.server import BaseHTTPRequestHandler

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
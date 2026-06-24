from http.server import BaseHTTPRequestHandler

from api_dispatch import handle_api


class BTCAPIHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        handle_api(self)

    def log_message(self, fmt, *args):
        return
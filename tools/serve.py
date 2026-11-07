"""خادم محلي للموقع يمنع المتصفح من عرض نسخة قديمة بعد أي تعديل.

الاستخدام: py tools/serve.py [port]
"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


handler = functools.partial(Handler, directory=ROOT)
http.server.ThreadingHTTPServer(('', PORT), handler).serve_forever()

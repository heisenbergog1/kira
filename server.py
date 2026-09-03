import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import os
import sys

PORT = int(os.environ.get('PORT', 3000))
WORKSPACE = os.path.dirname(os.path.abspath(__file__))

class CineStreamHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # 1. API: Stream source resolver
        if parsed.path == '/api/source':
            qs = urllib.parse.parse_qs(parsed.query)
            mal_id = qs.get('id', [''])[0]
            ep = qs.get('ep', ['1'])[0]
            audio_type = qs.get('type', ['sub'])[0].lower()
            
            if not mal_id:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Missing MAL ID (id)'}).encode('utf-8'))
                return

            api_url = f"https://megavid.buzz/mal/{mal_id}/{ep}/{audio_type}/source"
            referer = f"https://megavid.buzz/mal/{mal_id}/{ep}/{audio_type}"
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
                'Referer': referer,
                'Accept': '*/*'
            }
            
            try:
                req = urllib.request.Request(api_url, headers=headers)
                with urllib.request.urlopen(req, timeout=12) as response:
                    data_str = response.read().decode('utf-8')
                    data = json.loads(data_str)
                    
                    if 'source' in data and data['source']:
                        source_url = data['source']
                        if 'master.m3u8' in source_url:
                            stream_url = source_url.replace('master.m3u8', 'index-f1-v1-a1.m3u8')
                        else:
                            stream_url = source_url
                            
                        result = {
                            'status': 'ok',
                            'malId': mal_id,
                            'episode': ep,
                            'type': audio_type,
                            'streamUrl': stream_url,
                            'rawSource': source_url,
                            'tracks': data.get('tracks', []),
                            'mega': data.get('mega', False)
                        }
                    else:
                        result = data

                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps(result).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            return

        # 2. API: Jikan MAL Proxy
        if parsed.path.startswith('/api/jikan/'):
            sub_path = parsed.path.replace('/api/jikan/', '')
            q = '?' + parsed.query if parsed.query else ''
            jikan_url = f"https://api.jikan.moe/v4/{sub_path}{q}"
            try:
                req = urllib.request.Request(jikan_url, headers={'User-Agent': 'CineStream/1.0'})
                with urllib.request.urlopen(req, timeout=12) as response:
                    body = response.read()
                    self.send_response(response.status)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(body)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            return

        # 3. Static Files & SPA fallback
        target_path = os.path.join(WORKSPACE, parsed.path.lstrip('/'))
        if not os.path.exists(target_path) or os.path.isdir(target_path):
            self.path = '/index.html'
            
        return super().do_GET()

if __name__ == '__main__':
    os.chdir(WORKSPACE)
    with socketserver.TCPServer(("", PORT), CineStreamHandler) as httpd:
        print(f"CineStream Server running on http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass

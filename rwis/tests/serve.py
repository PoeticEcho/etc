#!/usr/bin/env python3
"""대시보드 테스트용 로컬 서버.

정적 파일(worker.js, index.html …)을 그대로 서빙하고, 대시보드가 Worker에 붙는 상황을
재현하기 위해 /api/status · /api/stream 을 실제 데이터(RWIS live + 로드플러스 live)로 응답한다.

    python3 tests/serve.py [port]
"""
from __future__ import annotations

import json
import pathlib
import sys
import threading
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = {"User-Agent": "Mozilla/5.0 (gdc-test)"}

# 기상청 호출이 반복되는 테스트에서 과도한 트래픽을 만들지 않도록 60초만 재사용합니다.
_RWIS_CACHE: dict = {"at": 0.0, "payload": None}
RWIS_TTL = 60.0


def http_get_json(url: str, timeout: int = 40):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


def http_post_json(url: str, params: dict, timeout: int = 40):
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(url, data=data, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):  # 조용히
        pass

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/status":
            return self._status(parsed.query)
        if parsed.path == "/api/stream":
            return self._stream(parsed.query)
        if parsed.path.startswith("/badworker"):
            # Worker 주소를 잘못 넣었을 때(JSON이 아닌 응답)를 재현합니다.
            body = b"<!DOCTYPE html><title>not a worker</title><p>ok</p>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def _json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _status(self, query):
        import time

        sys.path.insert(0, str(ROOT / "tools"))
        from rwis_export import build_payload  # 지연 임포트 (서버 기동 시간 단축)

        master = json.loads((ROOT / "data" / "cctv_master.json").read_text(encoding="utf-8"))
        now = time.time()
        if _RWIS_CACHE["payload"] is None or now - _RWIS_CACHE["at"] > RWIS_TTL:
            _RWIS_CACHE["payload"] = build_payload(master)
            _RWIS_CACHE["at"] = now
        rwis = json.loads(json.dumps(_RWIS_CACHE["payload"], ensure_ascii=False))
        points = [
            dict(p, its=[], itsMode="none")
            for p in master["points"]
        ]
        cctv = {
            "ok": True,
            "kind": "cctv",
            "sample_its": True,
            "source": "테스트 서버(ITS 미연결)",
            "fetchedAt": None,
            "count": 0,
            "cctvs": [],
            "route": {"name": master["route"], "no": master["routeNo"], "range": master["range"]},
            "points": points,
            "stats": {
                "itsCctvCount": 0,
                "masterPoints": len(points),
                "masterCameras": sum(len(p["cams"]) for p in points),
                "matchedPoints": 0,
                "matchedCctvItems": 0,
                "pointsWithoutIts": [p["name"] for p in points],
                "itsUnmatchedNames": [],
            },
            "cache": "MISS",
        }
        self._json({"ok": True, "version": "test", "fetchedAt": None, "master": {}, "cctv": cctv, "rwis": rwis, "errors": {}})

    def _stream(self, query):
        params = urllib.parse.parse_qs(query)
        cctv_id = (params.get("cctvId") or [""])[0]
        try:
            data = http_get_json(
                f"https://www.roadplus.co.kr/api/main/selectCctvInfoAjax?cctvId={urllib.parse.quote(cctv_id)}"
            )
            info = (data.get("cctvInfo") or [{}])[0]
            self._json({
                "ok": True,
                "kind": "stream",
                "cctvId": cctv_id,
                "name": info.get("CCTV_NM"),
                "streamUrl": info.get("CCTVURL"),
                "snapshotUrl": info.get("NOWCCTVIMG"),
                "prev": {"cctvId": info.get("PREV_CCTV_ID"), "name": info.get("PREVCCTVNM")},
                "next": {"cctvId": info.get("NEXT_CCTV_ID"), "name": info.get("NEXTCCTVNM")},
                "cache": "MISS",
            })
        except Exception as exc:  # noqa: BLE001
            self._json({"ok": False, "error": "STREAM_FETCH_FAILED", "message": str(exc)}, 502)


def serve(port: int = 0):
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, httpd.server_address[1]


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    print(f"serving {ROOT} on http://127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()

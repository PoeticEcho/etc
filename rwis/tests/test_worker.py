#!/usr/bin/env python3
"""worker.js 검증 스크립트.

1) 모킹 테스트 — ITS·RWIS·로드플러스 응답을 브라우저 안에서 모킹해 로직·에러처리·CORS·캐시를 확인
2) 실호출 테스트 — rwis.kma.go.kr 에 실제로 붙어 16개 구간 실응답 파싱을 확인
   (구간조회 POST 는 rwis가 CORS 헤더를 주지 않아 python 프록시로 전달하고,
    기준시각·위험표 GET 은 브라우저에서 직접 호출한다. Worker(서버)에는 CORS 제약이 없다.)
3) 로드플러스 실호출로 /api/stream 파싱 확인

    python3 tests/test_worker.py
"""
from __future__ import annotations

import json
import pathlib
import sys
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tests"))

from playwright.sync_api import sync_playwright  # noqa: E402

import serve  # noqa: E402

UA = {"User-Agent": "Mozilla/5.0 (gdc-test)"}
RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append((name, bool(ok), detail))
    print(("  ✔ " if ok else "  ✘ ") + name + (f"  — {detail}" if detail else ""))


# ── 모킹 데이터 ──────────────────────────────────────────────

TARGET_SUFFIXES = ["150", "160", "170", "180", "190", "200", "210", "220", "230"]


def make_fixtures() -> dict:
    conzones = {"E": [], "S": []}
    links_by_zone = {}
    for code in ("E", "S"):
        for idx, suffix in enumerate(TARGET_SUFFIXES):
            cid = f"0120CZ{code}{suffix}"
            links = [f"{code}{suffix}{i:02d}" for i in range(3)]
            links_by_zone[cid] = links
            conzones[code].append({
                "conzoneId": cid,
                "conzoneNm": f"테스트구간{suffix}",
                "conzoneLen": 1000 + idx,
                "linkIdArrStr": ",".join(links),
            })
        # 대상이 아닌 구간도 섞어 필터링을 확인
        conzones[code].append({
            "conzoneId": f"0120CZ{code}010",
            "conzoneNm": "무안공항IC-북무안IC",
            "conzoneLen": 3280,
            "linkIdArrStr": f"{code}01000,{code}01001",
        })

    fr_items = []
    vr_items = []
    for cid, links in links_by_zone.items():
        suffix = cid[-3:]
        for i, link in enumerate(links):
            if suffix == "200" and i < 2:
                continue  # 결측·범위 밖 값만 넣어 제외 규칙을 확인
            fsm = 3.0 if suffix == "170" and i == 0 else (2.0 if suffix == "180" else (1.0 if suffix == "160" else 0.0))
            vir = 2.0 if suffix == "190" and i == 1 else 0.0
            fr_items.append({"LINK_ID": link, "FSM": fsm, "FRR": 0.0})
            vr_items.append({"LINK_ID": link, "VIR": vir, "VSR": 4.0})
    # 결측·범위 밖 값은 등급 계산에서 빠져야 한다
    fr_items.append({"LINK_ID": links_by_zone["0120CZE200"][0], "FSM": None})
    fr_items.append({"LINK_ID": links_by_zone["0120CZE200"][1], "FSM": 9.0})
    # 대상 구간이 아닌 링크는 무시되어야 한다
    fr_items.append({"LINK_ID": "E01000", "FSM": 3.0})
    vr_items.append({"LINK_ID": "S01000", "VIR": 3.0})

    its = {
        "response": {
            "header": {"resultCode": "00", "resultMsg": "NORMAL"},
            "body": {"items": {"item": [
                {"cctvname": "함양", "cctvurl": "https://example.hscdn.com/a/playlist.m3u8", "cctvformat": "HLS", "coordx": "127.7", "coordy": "35.5"},
                {"cctvname": "거창", "cctvurl": "https://example.hscdn.com/b/playlist.m3u8", "cctvformat": "HLS", "coordx": "127.9", "coordy": "35.6"},
                {"cctvname": "논공교2", "cctvurl": "https://example.hscdn.com/c/playlist.m3u8", "cctvformat": "HLS", "coordx": "128.4", "coordy": "35.7"},
                {"cctvname": "관측소아님", "cctvurl": "https://example.hscdn.com/d/playlist.m3u8", "cctvformat": "HLS", "coordx": "127.4", "coordy": "35.4"},
            ]}},
        }
    }

    return {
        "conzones": conzones,
        "frTm": "202611210020",
        "vrTm": "202611210005",
        "fr": {"header": {"resultCode": 0}, "body": {"items": fr_items}},
        "vr": {"header": {"resultCode": 0}, "body": {"items": vr_items}},
        "its": its,
        "roadplus": {"cctvInfo": [{
            "CCTV_NM": "함양",
            "CCTVURL": "https://live10.exmobile.hscdn.com/livehttp/abc/playlist.m3u8",
            "NOWCCTVIMG": "https://example.hscdn.com/snap.jpg",
            "CCTV_ID": "cctv00005751",
            "PREV_CCTV_ID": "cctv00005750", "PREVCCTVNM": "교산",
            "NEXT_CCTV_ID": "cctv00005752", "NEXTCCTVNM": "지곡",
            "CAMRID": 5751,
        }]},
    }


MOCK_JS = r"""
async (fixtures) => {
  window.__calls = [];
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    window.__calls.push({ url, method: (init && init.method) || 'GET' });
    const json = (obj, status) => new Response(JSON.stringify(obj), {
      status: status || 200, headers: { 'Content-Type': 'application/json' },
    });

    if (url.includes('openapi.its.go.kr')) {
      if (window.__itsMode === 'error') return json({ response: { header: { resultCode: '30', resultMsg: 'KEY ERROR' } } });
      return json(fixtures.its);
    }
    if (url.includes('getConZoneByRoadNo.do')) {
      const params = new URLSearchParams(String((init && init.body) || ''));
      // 파라미터 이름이 틀리면 실제 서버처럼 빈 data를 돌려줘 회귀를 잡는다.
      if (params.get('roadNo') !== '012' || params.get('roadNoN1') !== '12' || params.get('roadNoN2') !== '0120') {
        return json({ status: 200, data: [] });
      }
      const dir = params.get('cdpntTmnlDirDvCd') || 'E';
      return json({ status: 'OK', data: fixtures.conzones[dir] });
    }
    if (url.includes('getNrmRoadRiskTimeSet')) {
      const risk = new URL(url).searchParams.get('riskCd');
      if (window.__tmMode === 'empty') return json({ header: {}, body: { items: [] } });
      return json({ header: { resultCode: 0 }, body: { items: [{ nrmMaxTm: risk === 'FR' ? fixtures.frTm : fixtures.vrTm }] } });
    }
    if (url.includes('getNrmRiskRoadTableAll')) {
      const q = new URL(url).searchParams;
      const risk = q.get('riskCd');
      const tm = q.get('tm');
      const latest = risk === 'FR' ? fixtures.frTm : fixtures.vrTm;
      const mode = window.__tableMode || 'normal';
      // 기상청처럼 HTTP 200 + resultCode 03 + 빈 items 로 답한다.
      if (mode === 'nodata_all' || (mode === 'nodata_latest' && tm === latest)) {
        return json({ header: { resultCode: '03', resultMsg: 'NODATA_ERROR', resultDetail: '조회된 데이터가 없습니다.' },
                      body: { itemType: 'list', totalCount: 0, items: [] } });
      }
      return json(risk === 'FR' ? fixtures.fr : fixtures.vr);
    }
    if (url.includes('selectCctvInfoAjax')) {
      return json(fixtures.roadplus);
    }
    return json({ error: 'UNMOCKED', url }, 500);
  };
}
"""


def test_export_fallback() -> None:
    """tools/rwis_export.py: 최신 5분 슬롯이 NODATA_ERROR 면 직전 슬롯으로 후퇴하는지."""
    print("\n[0] rwis_export.py 5분 폴백 단위 테스트")
    sys.path.insert(0, str(ROOT / "tools"))
    import rwis_export as exporter

    master = json.loads((ROOT / "data" / "cctv_master.json").read_text(encoding="utf-8"))
    real_get, real_conzones, real_tm = exporter._get, exporter.fetch_conzones, exporter.fetch_tm
    LATEST = "202611230935"

    def fake_conzones() -> dict:
        out = {}
        for zone in master["zones"]:
            for code in ("E", "S"):
                cid = f"0120CZ{code}{zone['suffix']}"
                out[cid] = {"id": cid, "dir": code, "name": f"구간{zone['suffix']}", "len": 1000,
                            "links": [f"{code}{zone['suffix']}00"]}
        return out

    def fake_get(url: str) -> dict:
        params = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
        risk, tm = params.get("riskCd", [""])[0], params.get("tm", [""])[0]
        # FR 은 최신·미래 슬롯이 아직 안 올라온 상황, VR 은 정상
        if risk == "FR" and tm >= LATEST:
            return {"header": {"resultCode": "03", "resultMsg": "NODATA_ERROR",
                               "resultDetail": "조회된 데이터가 없습니다."},
                    "body": {"itemType": "list", "totalCount": 0, "items": []}}
        items = [{"LINK_ID": f"{d}{s}00", "FSM": 2.0, "VIR": 1.0}
                 for d in ("E", "S") for s in ("160", "170")]
        return {"header": {"resultCode": "00", "resultMsg": "NORMAL_SERVICE"},
                "body": {"itemType": "list", "totalCount": len(items), "items": items}}

    try:
        exporter._get = fake_get
        levels, used_tm, steps = exporter.fetch_levels("FR", "FSM", LATEST, {"E17000"})
        check("NODATA_ERROR → 5분 전 슬롯 표 사용",
              used_tm == "202611230930" and steps == 1 and levels == {"E17000": 2},
              f"used={used_tm}, steps={steps}, levels={levels}")

        check("관측시각 5분 이동 (자정 넘김 포함)",
              exporter.shift_tm("202611230000", -5) == "202611222355"
              and exporter.shift_tm(LATEST, -5 * 4) == "202611230915",
              f"{exporter.shift_tm('202611230000', -5)} / {exporter.shift_tm(LATEST, -20)}")

        exporter.fetch_conzones = fake_conzones
        exporter.fetch_tm = lambda risk: LATEST
        payload = exporter.build_payload(master)
        zone170 = next(z for z in payload["zones"] if z["id"] == "0120CZE170")
        check("메타데이터: 실제 관측시각 tm / 최신 tmLatest / 후퇴 단계",
              payload["tm"]["FR"] == "202611230930" and payload["tmLabel"]["FR"] == "2026-11-23 09:30"
              and payload["tmLatest"]["FR"] == LATEST and payload["tmFallbackSteps"]["FR"] == 1,
              f"tm={payload['tm']}, latest={payload['tmLatest']}, steps={payload['tmFallbackSteps']}")
        check("정상인 VR 은 후퇴하지 않음",
              payload["tm"]["VR"] == LATEST and payload["tmFallbackSteps"]["VR"] == 0
              and payload["tmFallback"]["VR"] is False)
        check("폴백 후에도 구간 등급 계산", zone170["fsm"]["level"] == 2 and payload["summary"]["fsmMax"] == 2,
              json.dumps(zone170["fsm"], ensure_ascii=False))

        exporter._get = lambda url: {"header": {"resultCode": "03", "resultMsg": "NODATA_ERROR"},
                                     "body": {"itemType": "list", "totalCount": 0, "items": []}}
        error = ""
        try:
            exporter.fetch_levels("FR", "FSM", LATEST, {"E17000"})
        except RuntimeError as exc:
            error = str(exc)
        check("5개 슬롯(20분) 모두 비면 명확한 에러",
              "5개 슬롯" in error and "20분" in error and "202611230915" in error,
              error[:120])
    finally:
        exporter._get, exporter.fetch_conzones, exporter.fetch_tm = real_get, real_conzones, real_tm


def main() -> int:
    test_export_fallback()
    fixtures = make_fixtures()
    httpd, port = serve.serve(0)
    base = f"http://127.0.0.1:{port}"
    print(f"테스트 서버: {base}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        console_errors: list[str] = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))

        page.goto(f"{base}/tests/harness.html", wait_until="load")
        page.evaluate("async () => { window.__worker = (await import('/worker.js')).default; return true; }")

        print("\n[1] 모킹 단위 테스트")
        page.evaluate(MOCK_JS, fixtures)

        # ── 기본 라우팅 ──
        result = page.evaluate("""async () => {
          const w = window.__worker;
          const idx = await w.fetch(new Request('http://localhost/'), {});
          const body = await idx.json();
          const opt = await w.fetch(new Request('http://localhost/api/rwis', { method: 'OPTIONS' }), {});
          const post = await w.fetch(new Request('http://localhost/api/rwis', { method: 'POST' }), {});
          const nf = await w.fetch(new Request('http://localhost/api/unknown'), {});
          return {
            idxStatus: idx.status, idxBody: body,
            optStatus: opt.status, optCors: opt.headers.get('Access-Control-Allow-Origin'),
            postStatus: post.status, postBody: await post.json(),
            nfStatus: nf.status, nfBody: await nf.json(),
          };
        }""")
        check("/ 안내 응답", result["idxStatus"] == 200 and "endpoints" in result["idxBody"],
              f"status={result['idxStatus']}, version={result['idxBody'].get('version')}")
        check("OPTIONS preflight 204 + CORS *", result["optStatus"] == 204 and result["optCors"] == "*",
              f"status={result['optStatus']}, cors={result['optCors']}")
        check("POST 405 METHOD_NOT_ALLOWED", result["postStatus"] == 405 and result["postBody"]["error"] == "METHOD_NOT_ALLOWED")
        check("미지 경로 404 NOT_FOUND", result["nfStatus"] == 404 and result["nfBody"]["error"] == "NOT_FOUND")

        # ── /api/rwis 정상 ──
        rwis = page.evaluate("""async () => {
          const res = await window.__worker.fetch(new Request('http://localhost/api/rwis?refresh=1'), {});
          return { status: res.status, cors: res.headers.get('Access-Control-Allow-Origin'), body: await res.json() };
        }""")
        body = rwis["body"]
        zones = body.get("zones", [])
        by_id = {z["id"]: z for z in zones}
        check("/api/rwis 200 + CORS", rwis["status"] == 200 and rwis["cors"] == "*", f"status={rwis['status']}")
        check("RWIS 16개 구간", len(zones) == 16, f"{len(zones)}개: {sorted(by_id)[:3]}…")
        check("RWIS 방향 라벨 (E=대구, S=광주)",
              by_id["0120CZE170"]["dirLabel"] == "대구방향" and by_id["0120CZS170"]["dirLabel"] == "광주방향")
        check("FSM 최고등급 = 3 (구간 내 링크 max)",
              by_id["0120CZE170"]["fsm"]["level"] == 3, json.dumps(by_id["0120CZE170"]["fsm"], ensure_ascii=False))
        check("FSM 2단계 구간 인식", by_id["0120CZS180"]["fsm"]["level"] == 2)
        check("VIR 2단계 구간 인식", by_id["0120CZE190"]["vir"]["level"] == 2)
        check("결측(null)·범위 밖(9.0) 값 제외",
              by_id["0120CZE200"]["fsm"]["knownLinks"] == 1 and by_id["0120CZE200"]["fsm"]["counts"] == [1, 0, 0, 0],
              json.dumps(by_id["0120CZE200"]["fsm"], ensure_ascii=False))
        check("구간 링크 수·등급 카운트", by_id["0120CZE170"]["linkCount"] == 3 and sum(by_id["0120CZE170"]["fsm"]["counts"] or []) == 3)
        check("관측시각 tm/ tmLabel", body["tm"]["FR"] == "202611210020" and body["tmLabel"]["FR"] == "2026-11-21 00:20",
              f"{body['tm']} / {body['tmLabel']}")
        check("summary 최고등급", body["summary"]["fsmMax"] == 3 and body["summary"]["virMax"] == 2)
        check("alerts 2단계 이상만", all(a["fsm"] >= 2 or a["vir"] >= 2 for a in body["alerts"]) and len(body["alerts"]) >= 3,
              f"{len(body['alerts'])}건")
        check("대상 아닌 구간(010) 제외", not any(z["suffix"] == "010" for z in zones))

        # ── 캐시 동작 ──
        cache_test = page.evaluate("""async () => {
          await window.__worker.fetch(new Request('http://localhost/api/rwis?refresh=1'), {});
          window.__calls = [];
          const second = await (await window.__worker.fetch(new Request('http://localhost/api/rwis'), {})).json();
          const callsAfterHit = window.__calls.length;
          const third = await (await window.__worker.fetch(new Request('http://localhost/api/rwis?refresh=1'), {})).json();
          const callsAfterRefresh = window.__calls.length;
          return { second: second.cache, callsAfterHit, third: third.cache, callsAfterRefresh };
        }""")
        check("두 번째 호출 캐시 HIT (업스트림 재호출 없음)",
              cache_test["second"] == "HIT" and cache_test["callsAfterHit"] == 0,
              f"cache={cache_test['second']}, upstream calls={cache_test['callsAfterHit']}")
        check("?refresh=1 캐시 우회", cache_test["third"] == "REFRESH" and cache_test["callsAfterRefresh"] > 0,
              f"cache={cache_test['third']}, upstream calls={cache_test['callsAfterRefresh']}")

        # ── /api/cctv ──
        no_key = page.evaluate("""async () => {
          const res = await window.__worker.fetch(new Request('http://localhost/api/cctv'), {});
          return { status: res.status, body: await res.json() };
        }""")
        check("ITS 키 없음 → 500 ITS_API_KEY_MISSING",
              no_key["status"] == 500 and no_key["body"]["error"] == "ITS_API_KEY_MISSING")

        cctv = page.evaluate("""async () => {
          const res = await window.__worker.fetch(new Request('http://localhost/api/cctv?refresh=1'), { ITS_API_KEY: 'test-key' });
          return { status: res.status, body: await res.json() };
        }""")
        cbody = cctv["body"]
        fen = {p["name"]: p for p in cbody.get("points", [])}
        check("/api/cctv 200 + ITS 4건", cctv["status"] == 200 and cbody.get("count") == 4, f"count={cbody.get('count')}")
        check("마스터 62지점/123대 유지",
              len(cbody.get("points", [])) == 62 and cbody["stats"]["masterCameras"] == 123,
              f"{len(cbody.get('points', []))}지점 / {cbody['stats']['masterCameras']}대")
        check("이름 매칭 (함양·거창·논공교2)", fen["함양"]["its"][0]["name"] == "함양" and fen["거창"]["its"][0]["url"].endswith(".m3u8"),
              f"함양 its={fen['함양']['its']}")
        check("매칭 안 된 ITS 이름 보고", cbody["stats"]["itsUnmatchedNames"] == ["관측소아님"],
              str(cbody["stats"]["itsUnmatchedNames"]))
        check("ITS 없는 지점 목록", len(cbody["stats"]["pointsWithoutIts"]) == 59,
              f"{len(cbody['stats']['pointsWithoutIts'])}지점 / 매칭: " +
              ", ".join(p["name"] for p in cbody["points"] if p.get("its")))

        its_error = page.evaluate("""async () => {
          window.__itsMode = 'error';
          const res = await window.__worker.fetch(new Request('http://localhost/api/cctv?refresh=1'), { ITS_API_KEY: 'k' });
          const body = await res.json();
          window.__itsMode = 'normal';
          return { status: res.status, body };
        }""")
        check("ITS 오류 코드 → 502 ITS_API_ERROR",
              its_error["status"] == 502 and its_error["body"]["error"] == "ITS_API_ERROR",
              its_error["body"].get("message", ""))

        # ── /api/status ──
        status = page.evaluate("""async () => {
          const res = await window.__worker.fetch(new Request('http://localhost/api/status?refresh=1'), { ITS_API_KEY: 'k' });
          return { status: res.status, body: await res.json() };
        }""")
        sbody = status["body"]
        check("/api/status 200 + CCTV·RWIS 동시", status["status"] == 200 and sbody["cctv"] and sbody["rwis"],
              f"cctv={bool(sbody['cctv'])}, rwis={bool(sbody['rwis'])}, errors={list(sbody['errors'])}")

        partial = page.evaluate("""async () => {
          const res = await window.__worker.fetch(new Request('http://localhost/api/status?refresh=1'), {});
          return { status: res.status, body: await res.json() };
        }""")
        check("CCTV 실패해도 RWIS는 살아남음 (부분 성공)",
              partial["status"] == 200 and partial["body"]["rwis"] is not None and partial["body"]["errors"]["cctv"]["error"] == "ITS_API_KEY_MISSING",
              f"status={partial['status']}, errors={list(partial['body']['errors'])}")

        # ── /api/stream ──
        bad = page.evaluate("""async () => {
          const res = await window.__worker.fetch(new Request('http://localhost/api/stream?cctvId=abc'), {});
          return { status: res.status, body: await res.json() };
        }""")
        check("잘못된 cctvId → 400", bad["status"] == 400 and bad["body"]["error"] == "INVALID_CCTV_ID")
        stream = page.evaluate("""async () => {
          const res = await window.__worker.fetch(new Request('http://localhost/api/stream?cctvId=cctv00005751&refresh=1'), {});
          return { status: res.status, body: await res.json() };
        }""")
        check("/api/stream HLS 주소 파싱",
              stream["status"] == 200 and stream["body"]["streamUrl"].endswith("playlist.m3u8") and stream["body"]["prev"]["cctvId"] == "cctv00005750",
              stream["body"].get("streamUrl", ""))

        # ── RWIS 실패 처리 ──
        tm_empty = page.evaluate("""async () => {
          window.__tmMode = 'empty';
          const res = await window.__worker.fetch(new Request('http://localhost/api/rwis?refresh=1'), {});
          const body = await res.json();
          window.__tmMode = 'normal';
          return { status: res.status, body };
        }""")
        check("기준시각 없음 → 502 RWIS_NO_TM",
              tm_empty["status"] == 502 and tm_empty["body"]["error"] == "RWIS_NO_TM",
              tm_empty["body"].get("message", ""))

        # ── 5분 슬롯 폴백 (NODATA_ERROR) ──
        fallback_rwis = page.evaluate("""async () => {
          window.__tableMode = 'nodata_latest';
          window.__calls = [];
          const res = await window.__worker.fetch(new Request('http://localhost/api/rwis?refresh=1'), {});
          const body = await res.json();
          const tried = window.__calls
            .filter((c) => c.url.includes('getNrmRiskRoadTableAll'))
            .map((c) => new URL(c.url).searchParams.get('riskCd') + '@' + new URL(c.url).searchParams.get('tm'));
          window.__tableMode = 'normal';
          return { status: res.status, body, tried };
        }""")
        fb = fallback_rwis["body"]
        fb_zones = {z["id"]: z for z in fb.get("zones", [])}
        check("최신 슬롯 NODATA_ERROR → 5분 전 슬롯으로 폴백 (200)",
              fallback_rwis["status"] == 200 and fb.get("tm", {}).get("FR") == "202611210015"
              and fb.get("tmFallbackSteps", {}).get("FR") == 1,
              f"status={fallback_rwis['status']}, tm={fb.get('tm')}, steps={fb.get('tmFallbackSteps')}")
        fr_tried = [t for t in fallback_rwis["tried"] if t.startswith("FR@")]
        check("폴백 후보를 최신 → 직전 순서로 조회",
              fr_tried[:2] == ["FR@202611210020", "FR@202611210015"],
              str(fallback_rwis["tried"][:4]))
        check("폴백 시 메타데이터에 실제 관측시각·최신 시각 분리 기록",
              fb.get("tmLatest") == {"FR": "202611210020", "VR": "202611210005"}
              and fb.get("tmLabel", {}).get("FR") == "2026-11-21 00:15"
              and fb.get("tmLabel", {}).get("VR") == "2026-11-21 00:00"
              and fb.get("tmFallbackSteps") == {"FR": 1, "VR": 1}
              and fb.get("tmFallback", {}).get("FR") is True
              and bool(fb.get("tmFallback", {}).get("note")),
              f"latest={fb.get('tmLatest')}, label={fb.get('tmLabel')}, steps={fb.get('tmFallbackSteps')}")
        check("폴백 표로도 등급 계산 유지",
              fb_zones["0120CZE170"]["fsm"]["level"] == 3 and fb.get("summary", {}).get("fsmMax") == 3,
              json.dumps(fb_zones["0120CZE170"]["fsm"], ensure_ascii=False))

        all_empty = page.evaluate("""async () => {
          window.__tableMode = 'nodata_all';
          window.__calls = [];
          const res = await window.__worker.fetch(new Request('http://localhost/api/rwis?refresh=1'), {});
          const body = await res.json();
          const tried = window.__calls.filter((c) => c.url.includes('getNrmRiskRoadTableAll')).length;
          window.__tableMode = 'normal';
          return { status: res.status, body, tried };
        }""")
        check("5개 슬롯 모두 비면 502 RWIS_EMPTY_TABLE (5회 조회)",
              all_empty["status"] == 502 and all_empty["body"].get("error") == "RWIS_EMPTY_TABLE"
              and all_empty["tried"] == 10,
              f"status={all_empty['status']}, 시도={all_empty['tried']}회(FR·VR 각 5), msg={all_empty['body'].get('message')}")

        # ── RWIS_SOURCE_URL (사전 계산 JSON) 경로 ──
        source_mode = page.evaluate("""async () => {
          const payload = {
            ok: true, kind: 'rwis', generatedAt: '2026-11-21T00:30:00+09:00',
            source: 'rwis.kma.go.kr 도로기상정보시스템',
            tm: { FR: '202611210030', VR: '202611210015' },
            tmLabel: { FR: '2026-11-21 00:30', VR: '2026-11-21 00:15' },
            summary: { fsmMax: 2, virMax: 0, fsmZoneCounts: [2, 0, 2, 0], virZoneCounts: [4, 0, 0, 0] },
            alerts: [],
            zones: Array.from({ length: 16 }, (_, i) => ({ id: 'Z' + i, fsm: { level: i % 2 ? 2 : 0 }, vir: { level: 0 } })),
          };
          window.fetch = async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
          globalThis.__GDC_MEMO.clear();
          const res = await window.__worker.fetch(new Request('http://localhost/api/rwis?refresh=1'), { RWIS_SOURCE_URL: 'https://example.test/rwis.json' });
          const body = await res.json();

          window.fetch = async () => new Response('{"hello":1}', { status: 200 });
          globalThis.__GDC_MEMO.clear();
          const bad = await window.__worker.fetch(new Request('http://localhost/api/rwis?refresh=1'), { RWIS_SOURCE_URL: 'https://example.test/broken.json' });
          const badBody = await bad.json();
          window.fetch = window.__realFetch;
          return { status: res.status, body, badStatus: bad.status, badBody };
        }""")
        check("RWIS_SOURCE_URL 모드 200 + via=source-url",
              source_mode["status"] == 200 and source_mode["body"].get("via") == "source-url",
              f"status={source_mode['status']}, via={source_mode['body'].get('via')}")
        check("RWIS_SOURCE_URL 형식 오류 → 502",
              source_mode["badBody"].get("error") == "RWIS_SOURCE_BAD_SHAPE",
              str(source_mode["badBody"].get("error")))

        # ── 실호출: conzone POST는 CORS 헤더가 없어 python 프록시로 전달 ──
        print("\n[2] rwis.kma.go.kr 실호출 테스트")

        def conzone_route(route):
            req = route.request
            data = (req.post_data or "").encode()
            try:
                with urllib.request.urlopen(
                    urllib.request.Request(req.url, data=data, headers=UA), timeout=40
                ) as res:
                    payload = res.read()
                route.fulfill(status=200, headers={
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                }, body=payload)
            except Exception as exc:  # noqa: BLE001
                route.fulfill(status=502, body=json.dumps({"error": str(exc)}))

        page.route("**/comis5/uis/gis/api/getConZoneByRoadNo.do", conzone_route)
        page.evaluate("() => { window.fetch = window.__realFetch; globalThis.__GDC_MEMO.clear(); }")
        # 모킹 단계에서 6시간 캐시된 구간 목록을 버리고 실제 구간 목록을 다시 받습니다.
        page.evaluate("""async () => {
          await window.__worker.fetch(new Request('http://localhost/api/rwis?refresh=1'), {});
          return true;
        }""")

        live = page.evaluate("""async () => {
          const t0 = Date.now();
          const res = await window.__worker.fetch(new Request('http://localhost/api/rwis?refresh=1'), {});
          const body = await res.json();
          return { status: res.status, ms: Date.now() - t0, body };
        }""")
        lbody = live["body"]
        lzones = lbody.get("zones", [])
        print(f"    실호출 {live['ms']}ms, HTTP {live['status']}")
        if live["status"] == 200:
            for z in sorted(lzones, key=lambda z: (z["suffix"], z["dir"])):
                print(f"    {z['id']} {z['name']:<18} {z['dirLabel']}  FSM={z['fsm']['level']} "
                      f"({z['fsm']['knownLinks']}/{z['fsm']['totalLinks']}링크)  VIR={z['vir']['level']}")
        check("실데이터 /api/rwis 200", live["status"] == 200,
              f"status={live['status']}, {live['ms']}ms, error={lbody.get('error')}, msg={lbody.get('message')}")
        check("실데이터 16개 구간", len(lzones) == 16, f"{len(lzones)}개")
        check("실데이터 구간 ID 일치",
              {z["id"] for z in lzones} == {f"0120CZ{d}{s}" for d in "ES" for s in
                                            ["160", "170", "180", "190", "200", "210", "220", "230"]})
        check("실데이터 관측시각(12자리)", all(len(lbody.get("tm", {}).get(k, "")) == 12 for k in ("FR", "VR")),
              str(lbody.get("tm")))
        numeric = [z for z in lzones if z["fsm"]["level"] is not None]
        check("실데이터 FSM 등급 파싱", len(numeric) == len(lzones),
              "등급 없음: " + str([z["id"] for z in lzones if z["fsm"]["level"] is None]))
        check("실데이터 링크 매칭", all(z["fsm"]["knownLinks"] == z["fsm"]["totalLinks"] for z in lzones),
              "미매칭: " + str([z["id"] for z in lzones if z["fsm"]["knownLinks"] != z["fsm"]["totalLinks"]]))
        check("실데이터 등급 합계 = 링크 합계",
              all(sum(z["fsm"]["counts"] or []) == z["linkCount"] for z in lzones))

        print("\n[3] 로드플러스 실호출 테스트")

        def roadplus_route(route):
            req = route.request
            try:
                with urllib.request.urlopen(urllib.request.Request(req.url, headers=UA), timeout=30) as res:
                    payload = res.read()
                route.fulfill(status=200, headers={
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                }, body=payload)
            except Exception as exc:  # noqa: BLE001
                route.fulfill(status=502, body=json.dumps({"error": str(exc)}))

        page.route("**/selectCctvInfoAjax*", roadplus_route)
        live_stream = page.evaluate("""async () => {
          // 외부 API가 간헐적으로 연결을 거부하므로 최대 3회까지 시도하고 횟수를 남긴다.
          let res, body, tries = 0;
          for (let i = 0; i < 3; i += 1) {
            tries += 1;
            res = await window.__worker.fetch(new Request('http://localhost/api/stream?cctvId=cctv00005751&refresh=1'), {});
            body = await res.json();
            if (res.status === 200) break;
            await new Promise((r) => setTimeout(r, 800));
          }
          return { status: res.status, body, tries };
        }""")
        ls = live_stream["body"]
        check("실데이터 /api/stream 200", live_stream["status"] == 200,
              f"status={live_stream['status']}, 시도={live_stream.get('tries')}회, err={ls.get('error')}")
        check("실데이터 HLS 주소", str(ls.get("streamUrl", "")).startswith("https://") and ls.get("streamUrl", "").endswith(".m3u8"),
              str(ls.get("streamUrl")))
        check("실데이터 CCTV 이름·prev/next", ls.get("name") == "함양" and bool(ls.get("prev", {}).get("cctvId")),
              f"name={ls.get('name')}, next={ls.get('next')}")

        check("테스트 중 브라우저 콘솔 에러 0건", not console_errors, "; ".join(console_errors[:3]))
        browser.close()

    httpd.shutdown()

    passed = sum(1 for _, ok, _ in RESULTS if ok)
    print(f"\n결과: {passed}/{len(RESULTS)} 통과")
    failed = [name for name, ok, _ in RESULTS if not ok]
    if failed:
        print("실패: " + ", ".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""index.html 대시보드 검증 (headless Chromium).

샘플 모드(Worker 미연결) → 실시간 모드(로컬 테스트 서버가 Worker 역할, RWIS는 실호출)
→ 검색/시설필터/방향탭/정렬/모달 재생/모바일 레이아웃/오류 폴백을 차례로 확인한다.

    python3 tests/test_dashboard.py
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tests"))

from playwright.sync_api import sync_playwright  # noqa: E402

import serve  # noqa: E402

RESULTS: list[tuple[str, bool, str]] = []


def connect(page, base: str) -> None:
    """Worker 주소를 넣고 연결한다 (설정 팝오버가 닫혀 있으면 먼저 연다)."""
    if page.evaluate("() => document.getElementById('settingsPanel').hidden"):
        page.click("#btnSettings")
    page.fill("#workerUrl", base)
    page.click("#btnConnect")


def check(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append((name, bool(ok), detail))
    print(("  ✔ " if ok else "  ✘ ") + name + (f"  — {detail}" if detail else ""))


def main() -> int:
    httpd, port = serve.serve(0)
    base = f"http://127.0.0.1:{port}"
    print(f"테스트 서버: {base}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()

        console_errors: list[str] = []
        page_errors: list[str] = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: page_errors.append(str(e)))

        print("\n[1] 정적 스냅샷 모드 (Worker 미연결)")
        page.goto(f"{base}/index.html", wait_until="load")
        page.wait_for_timeout(400)

        sample = page.evaluate("""() => {
          const zones = [...document.querySelectorAll('#zoneGrid .zone')];
          const info = zones.map(z => ({
            lv: ['lvEFsm', 'lvEVir', 'lvSFsm', 'lvSVir'].map(k => z.dataset[k]),
            safe: !!z.querySelector('.zsafe'),
            badges: z.querySelectorAll('.badge').length,
            worst: z.dataset.worst,
            title: z.querySelector('.zh strong').textContent,
            meta: z.querySelector('.zmeta').textContent.replace(/\\s+/g, ' ').trim(),
            cctvBtn: !!z.querySelector('.zcctv'),
          }));
          const elevated = info.filter(z => z.worst !== 'none' && Number(z.worst) >= 1).length;
          const safeZones = info.filter(z => z.worst === '0').length;
          return {
            points: document.querySelectorAll('#pointList .point').length,
            cams: document.querySelectorAll('#pointList .cam').length,
            zones: zones.length,
            allLevels: info.every(z => z.lv.every(v => v !== '' && v !== undefined && !Number.isNaN(Number(v)))),
            hierarchy: info.every(z => (z.worst !== 'none' && Number(z.worst) >= 1 ? z.badges >= 1 : z.safe)),
            safeZones, elevated, badges: document.querySelectorAll('#zoneGrid .badge').length,
            titles: info.map(z => z.title),
            cctvBtns: info.filter(z => z.cctvBtn).length,
            metaHasCounts: info.some(z => /\d+지점|\d+대/.test(z.meta)),
            listCount: document.getElementById('listCount').textContent,
            mode: document.getElementById('modeText').textContent,
            pill: document.getElementById('modePill').dataset.state,
            tm: document.getElementById('rwisTm').textContent,
            firstKm: document.querySelector('#pointList .point .km')?.textContent,
            groups: document.querySelectorAll('#pointList .pgroup').length,
            footer: !!document.querySelector('footer'),
          };
        }""")
        check("정적 스냅샷 62지점 렌더", sample["points"] == 62, f"{sample['points']}지점")
        check("정적 스냅샷 123대 CCTV 버튼", sample["cams"] == 123, f"{sample['cams']}대")
        check("RWIS 8개 구간 × 방향·지표 4값", sample["zones"] == 8 and sample["allLevels"],
              f"{sample['zones']}구간 · 등급 {'있음' if sample['allLevels'] else '결측'}")
        check("평시 안전 구간은 1줄로 축약 (안전 배지 남발 없음)",
              sample["hierarchy"] and sample["badges"] <= sample["elevated"] * 2,
              f"안전 {sample['safeZones']}구간 · 상향 {sample['elevated']}구간 · 배지 {sample['badges']}개")
        check("v7 구간 타이틀은 '↔' 로 읽기 좋게",
              all("↔" in t for t in sample["titles"]) and "함양JC ↔ 거창IC" in sample["titles"],
              str(sample["titles"][:3]))
        check("v7 카드에서 CCTV 대수 숫자 제거 + 인근 CCTV 동선",
              not sample["metaHasCounts"] and sample["cctvBtns"] >= 7,
              f"대수표기={sample['metaHasCounts']} · 인근CCTV={sample['cctvBtns']}개")
        check("v7 지점 목록은 구간 묶음 머리글", sample["groups"] >= 6,
              f"묶음 {sample['groups']}개 / 62지점")
        check("정적 JSON은 '스냅샷'으로 표시 (실시간이라 부르지 않음)",
              sample["pill"] == "snapshot" and "스냅샷" in sample["mode"] and "스냅샷" in sample["tm"],
              f"{sample['pill']} · {sample['mode']} · {sample['tm']}")
        check("스냅샷 경과 시간 표시",
              any(unit in sample["mode"] for unit in ("분", "시간", "일")), sample["mode"])
        check("스냅샷 등급은 실제 값으로 렌더", sample["allLevels"],
              f"배지 {sample['badges']}개 · 상향 {sample['elevated']}구간")
        check("이정 오름차순 첫 지점 95.0", sample["firstKm"] == "95.0k", str(sample["firstKm"]))

        sample_route = page.evaluate("""() => ({
          svg: !!document.querySelector('#routeMap'),
          segs: [...document.querySelectorAll('#routeMap path.seg[data-seg]')].map(s => ({ lv: s.dataset.lv, dash: s.getAttribute('stroke-dasharray'), stroke: s.getAttribute('stroke') })),
          nodes: document.querySelectorAll('#routeMap .node').length,
          title: [...document.querySelectorAll('#routeMap text')].map(t => t.textContent).find(t => t.includes('현황')),
          eyebrow: [...document.querySelectorAll('#routeMap text')].map(t => t.textContent).find(t => t.includes('기상청 RWIS')),
          unknown: [...document.querySelectorAll('#routeMap text')].some(t => t.textContent.includes('등급 없음')),
          meta: document.getElementById('routeMeta').textContent,
        })""")
        check("스냅샷 모드에서도 노선도 렌더", sample_route["svg"] and len(sample_route["segs"]) == 16 and sample_route["nodes"] == 13,
              f"구간 {len(sample_route['segs'])} · 노드 {sample_route['nodes']}")
        check("스냅샷 등급은 노선도에 그리되 출처를 밝힘",
              "스냅샷" in (sample_route["eyebrow"] or "") and any(s["lv"] != "null" for s in sample_route["segs"]),
              f"{sample_route['eyebrow']} · 등급 {sorted({s['lv'] for s in sample_route['segs']})}")
        check("노선 요약에도 스냅샷·경과 시간", "스냅샷" in sample_route["meta"], sample_route["meta"][:70])

        print("\n[1b] 스냅샷이 없을 때 — 샘플 자리표시자")
        page.goto(f"{base}/index.html?snapshot=off", wait_until="load")
        page.wait_for_timeout(300)
        fallback = page.evaluate("""() => ({
          pill: document.getElementById('modePill').dataset.state,
          mode: document.getElementById('modeText').textContent,
          tm: document.getElementById('rwisTm').textContent,
          levels: [...document.querySelectorAll('#zoneGrid .zone')].map(z => z.dataset.lvEFsm),
          badges: document.querySelectorAll('#zoneGrid .badge').length,
          safeLines: document.querySelectorAll('#zoneGrid .zsafe').length,
          segs: [...document.querySelectorAll('#routeMap path.seg[data-seg]')].map(s => ({ lv: s.dataset.lv, dash: s.getAttribute('stroke-dasharray') })),
          eyebrow: [...document.querySelectorAll('#routeMap text')].map(t => t.textContent).find(t => t.includes('기상청 RWIS')),
          unknown: [...document.querySelectorAll('#routeMap text')].some(t => t.textContent.includes('등급 없음')),
          points: document.querySelectorAll('#pointList .point').length,
        })""")
        check("샘플 모드 표시", fallback["pill"] == "sample" and "샘플" in fallback["mode"] and "샘플" in fallback["tm"],
              f"{fallback['pill']} · {fallback['mode']} / {fallback['tm']}")
        check("샘플은 등급을 지어내지 않음 (모두 결측)", all(v == "" for v in fallback["levels"]) and fallback["badges"] == 0
              and fallback["safeLines"] == 8,
              f"등급 {sorted(set(fallback['levels']))} · 배지 {fallback['badges']} · 안전줄 {fallback['safeLines']}")
        check("샘플은 등급을 지어내지 않음 (회색 점선)", all(s["lv"] == "null" and s["dash"] for s in fallback["segs"]),
              str(fallback["segs"][:2]))
        check("샘플 노선도 문구", "샘플" in (fallback["eyebrow"] or "") and fallback["unknown"],
              f"{fallback['eyebrow']}")
        check("샘플에서도 62지점 구조 유지", fallback["points"] == 62, f"{fallback['points']}지점")

        page.goto(f"{base}/index.html", wait_until="load")
        page.wait_for_timeout(400)

        print("\n[2] 실시간 연결")
        connect(page, base)
        page.wait_for_function("() => document.getElementById('modePill').dataset.state === 'live' || document.getElementById('modePill').dataset.state === 'error'", timeout=90000)
        page.wait_for_timeout(400)

        live = page.evaluate("""() => {
          const levels = [...document.querySelectorAll('#zoneGrid .zone')]
            .flatMap(z => ['lvEFsm', 'lvEVir', 'lvSFsm', 'lvSVir'].map(k => z.dataset[k]));
          return {
            mode: document.getElementById('modePill').dataset.state,
            modeText: document.getElementById('modeText').textContent,
            tm: document.getElementById('rwisTm').textContent,
            status: document.getElementById('statusLine').textContent,
            levels,
            summary: document.querySelectorAll('#rwisSummary .sum-box').length,
            points: document.querySelectorAll('#pointList .point').length,
            alertText: document.querySelector('#rwisFilter [data-f=alert]').textContent,
            dangerWord: [...document.querySelectorAll('#routeMap text')].some(t => t.textContent.includes('3단계는 위험')),
            noGyeonggye: !document.getElementById('zoneGrid').textContent.includes('경계'),
          };
        }""")
        check("실시간 모드 진입", live["mode"] == "live", f"{live['mode']} · {live['modeText']}")
        check("관측시각 표시", "관측 20" in live["tm"], live["tm"])
        check("요약 3개 박스", live["summary"] == 3, str(live["summary"]))
        check("실등급 값 32개(8구간×4)", len(live["levels"]) == 32, f"{len(live['levels'])}개")
        check("실등급 값이 숫자로 렌더", all(v != "" and v is not None for v in live["levels"]),
              "결측: " + str([i for i, v in enumerate(live["levels"]) if v == ""][:6]))
        check("기상청 RWIS 공식 3단계는 '위험' 표기", live["dangerWord"] and live["noGyeonggye"],
              f"3단계 위험={live['dangerWord']} · 경계 잔존={not live['noGyeonggye']}")
        check("살얼음 주의 이상 필터에 건수 표시", "살얼음 주의 이상" in live["alertText"], live["alertText"])
        check("연결 상태 문구", "RWIS 실시간" in live["status"] and "관측 20" in live["status"], live["status"][:90])
        print(f"    상태줄: {live['status']}")
        print(f"    등급序列: {live['levels']}")

        # 지점 카드에도 구간 등급이 붙었는지
        point_risk = page.evaluate("""() => {
          const card = [...document.querySelectorAll('#pointList .point')].find(p => p.querySelector('h3').textContent.trim() === '거창');
          const risk = card.querySelector('.pt-risk');
          return {
            fsm: risk.dataset.lvFsm, vir: risk.dataset.lvVir,
            text: risk.textContent.trim(),
            dots: risk.querySelectorAll('.pr-dot').length,
            safe: !!risk.querySelector('.pt-safe'),
            cams: [...card.querySelectorAll('.cam')].map(c => c.textContent.trim()),
          };
        }""")
        check("지점 카드에 살얼음·가시거리 등급",
              point_risk["fsm"] != "" and point_risk["vir"] != ""
              and (point_risk["dots"] > 0 or point_risk["safe"]),
              json.dumps(point_risk, ensure_ascii=False))
        check("거창 지점 양방향 재생 버튼", len(point_risk["cams"]) == 2, str(point_risk["cams"]))

        print("\n[3] 검색 · 필터 · 정렬")
        page.fill("#search", "거창")
        page.wait_for_timeout(260)
        search = page.evaluate("""() => ({
          names: [...document.querySelectorAll('#pointList .point h3')].map(h => h.textContent.trim()),
          texts: [...document.querySelectorAll('#pointList .point')].map(p => p.textContent),
          count: document.getElementById('listCount').textContent,
        })""")
        check("검색 '거창' 결과 축소", 0 < len(search["names"]) < 62, f"{len(search['names'])}지점 ({search['count']})")
        check("검색 결과 모두 거창 포함(이름 또는 주소)", all("거창" in t for t in search["texts"]),
              str([n for n, t in zip(search["names"], search["texts"]) if "거창" not in t]))

        page.fill("#search", "경남 거창군")
        page.wait_for_timeout(260)
        addr = page.evaluate("() => [...document.querySelectorAll('#pointList .point h3')].map(h => h.textContent.trim())")
        check("주소 검색 동작", len(addr) > 0, f"{len(addr)}건")

        page.fill("#search", "cctv00005769")
        page.wait_for_timeout(260)
        by_id = page.evaluate("() => [...document.querySelectorAll('#pointList .point h3')].map(h => h.textContent.trim())")
        check("CCTV ID 검색 동작", by_id == ["거창"], str(by_id))

        page.fill("#search", "없는이름xyz")
        page.wait_for_timeout(260)
        empty = page.evaluate("""() => ({
          visible: !document.getElementById('emptyMsg').classList.contains('hidden'),
          count: document.getElementById('listCount').textContent,
        })""")
        check("결과 없음 안내", empty["visible"] and empty["count"].startswith("0지점"), empty["count"])

        page.fill("#search", "")
        page.wait_for_timeout(260)
        page.click('#facilityChips .chip[data-fac="tunnel"]')
        page.wait_for_timeout(150)
        tunnel = page.evaluate("""() => ({
          facs: [...document.querySelectorAll('#pointList .point .fac')].map(f => f.textContent.trim()),
          count: document.getElementById('listCount').textContent,
        })""")
        check("시설유형 '터널·교량' 필터", set(tunnel["facs"]) <= {"터널", "교량"} and len(tunnel["facs"]) == 40,
              f"{len(tunnel['facs'])}지점, {tunnel['count']}")

        page.click('#facilityChips .chip[data-fac="ic"]')
        page.wait_for_timeout(150)
        ic = page.evaluate("() => [...document.querySelectorAll('#pointList .point .fac')].map(f => f.textContent.trim())")
        check("시설유형 'IC·JC' 필터", set(ic) <= {"IC", "JC"} and len(ic) == 8, f"{len(ic)}지점: {sorted(set(ic))}")

        page.click('#facilityChips .chip[data-fac="rest"]')
        page.wait_for_timeout(150)
        rest = page.evaluate("() => [...document.querySelectorAll('#pointList .point h3')].map(h => h.textContent.trim())")
        check("시설유형 '휴게소·졸음' 필터", len(rest) == 4, str(rest))

        page.click('#facilityChips .chip[data-fac="etc"]')
        page.wait_for_timeout(150)
        etc = page.evaluate("() => document.querySelectorAll('#pointList .point').length")
        check("시설유형 '일반(마을)' 필터", etc == 10, f"{etc}지점")

        page.click('#facilityChips .chip[data-fac="all"]')
        page.wait_for_timeout(150)

        page.click('#dirTabs button[data-dir="G"]')
        page.wait_for_timeout(150)
        gwangju = page.evaluate("""() => ({
          cams: document.querySelectorAll('#pointList .cam').length,
          camsAllG: [...document.querySelectorAll('#pointList .cam')].every(c => c.dataset.dir === 'G'),
          count: document.getElementById('listCount').textContent,
        })""")
        check("방향 탭 '광주방향' → 62대만", gwangju["cams"] == 62 and gwangju["camsAllG"], gwangju["count"])
        page.click('#dirTabs button[data-dir="D"]')
        page.wait_for_timeout(150)
        daegu = page.evaluate("""() => ({
          cams: document.querySelectorAll('#pointList .cam').length,
          camsAllD: [...document.querySelectorAll('#pointList .cam')].every(c => c.dataset.dir === 'D'),
          count: document.getElementById('listCount').textContent,
        })""")
        check("방향 탭 '대구방향' → 61대만", daegu["cams"] == 61 and daegu["camsAllD"], daegu["count"])
        page.click('#dirTabs button[data-dir="all"]')
        page.wait_for_timeout(150)

        page.click("#btnSort")
        page.wait_for_timeout(150)
        desc = page.evaluate("() => document.querySelector('#pointList .point .km').textContent")
        check("이정 정렬 전환 (내림차순)", desc == "176.0k", str(desc))
        page.click("#btnSort")
        page.wait_for_timeout(150)

        page.click('#rwisFilter [data-f="alert"]')
        page.wait_for_timeout(150)
        alert_view = page.evaluate("""() => ({
          zones: document.querySelectorAll('#zoneGrid .zone').length,
          hot: document.querySelectorAll('#zoneGrid .zone.hot').length,
          emptyShown: !document.getElementById('zonesEmpty').classList.contains('hidden'),
        })""")
        check("'살얼음 주의 이상' 필터", alert_view["zones"] == alert_view["hot"] and (alert_view["zones"] > 0 or alert_view["emptyShown"]),
              f"{alert_view['zones']}구간(전부 hot)")
        page.click('#rwisFilter [data-f="all"]')
        page.wait_for_timeout(150)

        print("\n[4] CCTV 모달 재생")
        # 일부 카메라 스트림은 CDN에서 수시로 내려간다 — 지금 실제로 살아 있는 카메라로 재생을 확인한다
        cam_list = page.evaluate("""() => [...document.querySelectorAll('#pointList .cam[data-cctv]')]
          .map(b => ({ id: b.dataset.cctv, name: b.dataset.name, dir: b.dataset.dir, zone: b.dataset.zone }))""")
        live_cam = None
        for item in cam_list:
            try:
                with urllib.request.urlopen(f"{base}/api/stream?cctvId={item['id']}", timeout=30) as res:
                    info = json.loads(res.read().decode("utf-8"))
                url = (info or {}).get("streamUrl") or ""
                if not url:
                    continue
                with urllib.request.urlopen(url, timeout=20) as res:
                    if res.status == 200 and b"#EXTM3U" in res.read(64):
                        live_cam = item
                        break
            except Exception:  # noqa: BLE001
                continue
        check("실시간 재생 가능한 카메라 확보", live_cam is not None,
              f"{(live_cam or {}).get('name')} {live_cam and live_cam['id']} · 시도 {min(len(cam_list), 12)}대")
        if live_cam is None:
            live_cam = cam_list[0]
        page.click(f'#pointList .cam[data-cctv="{live_cam["id"]}"]')
        page.wait_for_timeout(600)
        modal = page.evaluate("""() => ({
          open: !document.getElementById('modal').hidden,
          title: document.getElementById('modalTitle').textContent,
          eyebrow: document.getElementById('modalEyebrow').textContent,
          meta: document.getElementById('modalMeta').textContent,
          overlay: !document.getElementById('stageOverlay').hidden,
          stageTitle: document.getElementById('stageTitle').textContent,
          stageDesc: document.getElementById('stageDesc').textContent,
          prevDisabled: document.getElementById('btnPrev').disabled,
          nextDisabled: document.getElementById('btnNext').disabled,
          bodyLock: document.body.classList.contains('modal-open'),
        })""")
        check("모달 열림 + 제목/메타", modal["open"] and modal["title"] == live_cam["name"] and "CCTV" in modal["eyebrow"],
              f"{modal['title']} / {modal['eyebrow']}")
        check("모달 열면 배경 스크롤 잠금", modal["bodyLock"])

        # 스트림 주소·매니페스트가 올 때까지 (로드플러스 CDN이 느릴 때가 있어 최대 50초)
        try:
            page.wait_for_function(
                "() => document.getElementById('stageOverlay').hidden || !document.getElementById('btnRetry').classList.contains('hidden')",
                timeout=50000,
            )
        except Exception:  # noqa: BLE001 — 실패하면 아래 check 에서 사실대로 잡힌다
            pass
        try:
            page.wait_for_function("() => document.getElementById('player').readyState >= 2", timeout=20000)
        except Exception:  # noqa: BLE001
            pass
        page.wait_for_timeout(1200)

        def read_play():
            return page.evaluate("""() => ({
              meta: document.getElementById('modalMeta').textContent,
              overlay: !document.getElementById('stageOverlay').hidden,
              stageTitle: document.getElementById('stageTitle').textContent,
              videoHidden: document.getElementById('player').classList.contains('is-hidden'),
              readyState: document.getElementById('player').readyState,
              currentTime: document.getElementById('player').currentTime,
              buffered: document.getElementById('player').buffered.length ? document.getElementById('player').buffered.end(0) : 0,
              src: (document.getElementById('player').src || '').slice(0, 60),
              hls: !!window.Hls,
              hlsSupported: !!(window.Hls && window.Hls.isSupported()),
              prevDisabled: document.getElementById('btnPrev').disabled,
              nextDisabled: document.getElementById('btnNext').disabled,
            })""")

        play = read_play()
        print(f"    모달 상태: {json.dumps(play, ensure_ascii=False)}")
        check("스트림 주소 수신 후 메타 갱신", "cctv" in play["meta"], play["meta"])
        check("hls.js 로드됨", play["hls"], f"isSupported={play['hlsSupported']}")
        check("이전/다음 CCTV 활성", play["prevDisabled"] is False and play["nextDisabled"] is False)
        check("HLS 매니페스트 파싱 → 영상 레이어 표시", (not play["overlay"]) and (not play["videoHidden"]),
              play["stageTitle"])
        check("영상 버퍼 수신", play["buffered"] > 0 or play["readyState"] >= 2,
              f"buffered={play['buffered']:.1f}s, readyState={play['readyState']}")

        page.click("#modalClose")
        page.wait_for_timeout(200)
        closed = page.evaluate("() => ({ closed: document.getElementById('modal').hidden, lock: document.body.classList.contains('modal-open') })")
        check("모달 닫기", closed["closed"] and not closed["lock"])

        page.click('#pointList .cam[data-name="거창"]')
        page.wait_for_timeout(400)
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)
        check("Esc로 모달 닫기", page.evaluate("() => document.getElementById('modal').hidden"))

        print("\n[5] 모바일 뷰포트")
        mobile = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
        mpage = mobile.new_page()
        m_errors: list[str] = []
        mpage.on("console", lambda m: m_errors.append(m.text) if m.type == "error" else None)
        mpage.goto(f"{base}/index.html", wait_until="load")
        mpage.wait_for_timeout(400)
        page.screenshot(path=str(ROOT / "tests" / "shots" / "desktop.png"), full_page=False)
        mpage.screenshot(path=str(ROOT / "tests" / "shots" / "mobile-sample.png"), full_page=False)
        m = mpage.evaluate("""() => {
          const doc = document.documentElement;
          const card = document.querySelector('#pointList .point');
          const grid = getComputedStyle(document.getElementById('pointList'));
          return {
            scrollW: doc.scrollWidth, innerW: window.innerWidth,
            points: document.querySelectorAll('#pointList .point').length,
            cols: grid.gridTemplateColumns.split(' ').length,
            cardW: card ? Math.round(card.getBoundingClientRect().width) : 0,
            searchVisible: document.getElementById('search').getBoundingClientRect().width > 100,
            zoneW: Math.round(document.querySelector('#zoneGrid .zone').getBoundingClientRect().width),
          };
        }""")
        check("모바일 가로 스크롤 없음", m["scrollW"] <= m["innerW"] + 1, f"scrollW={m['scrollW']}, innerW={m['innerW']}")

        mroute = mpage.evaluate("""() => {
          const svg = document.querySelector('#routeMap');
          const wrap = document.querySelector('#routeWrap');
          const s = svg.getBoundingClientRect();
          const w = wrap.getBoundingClientRect();
          const vb = svg.getAttribute('viewBox').split(' ').map(Number);
          const node = (km) => {
            const t = document.querySelector(`#routeMap .node[data-km="${km}"] .lbl`);
            const b = t.getBBox(); return { x: Math.round(b.x), y: Math.round(b.y) };
          };
          const tiles = [...document.querySelectorAll('#zoneGrid .zone')].map(z => ({
            seg: z.dataset.segment,
            w: Math.round(z.getBoundingClientRect().width),
            h: Math.round(z.getBoundingClientRect().height),
            meta: z.querySelector('.zmeta') ? z.querySelector('.zmeta').textContent.trim() : null,
          }));
          return {
            scene: svg.dataset.scene,
            viewBox: svg.getAttribute('viewBox'),
            aspect: Math.round((vb[2] / vb[3]) * 100) / 100,
            mapW: Math.round(s.width), wrapW: Math.round(w.width),
            mapH: Math.round(s.height), wrapH: Math.round(w.height),
            clipped: s.left < w.left - 1 || s.right > w.right + 1 || s.top < w.top - 1 || s.bottom > w.bottom + 1,
            wrapScrollW: wrap.scrollWidth, wrapClientW: wrap.clientWidth,
            labels: [...document.querySelectorAll('#routeMap .lbl')].length,
            pageW: document.documentElement.scrollWidth,
            innerW: window.innerWidth,
            pageH: document.documentElement.scrollHeight,
            innerH: window.innerHeight,
            west: node(95), east: node(176),
            tiles,
            cols: getComputedStyle(document.getElementById('zoneGrid')).gridTemplateColumns.split(' ').length,
            bandTop: Math.round(document.getElementById('zoneGrid').getBoundingClientRect().top),
            bandBottom: Math.round(document.getElementById('zoneGrid').getBoundingClientRect().bottom),
            settingsHidden: document.getElementById('settingsPanel').hidden,
          };
        }""")
        check("모바일은 세로 화면 전용 캔버스", mroute["scene"] == "portrait", f"scene={mroute['scene']} {mroute['viewBox']}")
        check("모바일 세로에서도 노선도는 서→동 가로", mroute["aspect"] > 1.4
              and mroute["west"]["x"] < mroute["east"]["x"]
              and abs(mroute["east"]["y"] - mroute["west"]["y"]) < (mroute["east"]["x"] - mroute["west"]["x"]) * 0.6,
              f"viewBox {mroute['viewBox']} (비율 {mroute['aspect']}) · 함양IC x={mroute['west']['x']} → 옥포JC x={mroute['east']['x']}")
        check("모바일 노선도가 카드 안에 잘리지 않고 들어옴",
              (not mroute["clipped"]) and mroute["wrapScrollW"] <= mroute["wrapClientW"] + 1,
              f"map {mroute['mapW']}×{mroute['mapH']} · wrap {mroute['wrapW']}×{mroute['wrapH']} · scrollW {mroute['wrapScrollW']}")
        check("모바일에서도 페이지 가로 넘침 없음", mroute["pageW"] <= mroute["innerW"] + 1,
              f"page {mroute['pageW']} / inner {mroute['innerW']}")
        check("모바일 페이지 세로 스크롤 없음(100dvh)", mroute["pageH"] <= mroute["innerH"] + 1,
              f"pageH {mroute['pageH']} / innerH {mroute['innerH']}")
        check("모바일 라벨 13곳 유지", mroute["labels"] == 13, str(mroute["labels"]))
        check("세로 화면 아래에 8구간 타일 2×4", len(mroute["tiles"]) == 8 and mroute["cols"] == 2,
              f"타일 {len(mroute['tiles'])}개 · 열 {mroute['cols']}")
        check("구간 타일이 화면 안에 다 들어옴(상하)",
              mroute["bandBottom"] <= mroute["innerH"] - 50,
              f"band {mroute['bandTop']}–{mroute['bandBottom']} / inner {mroute['innerH']}")
        check("구간 타일에 인근 CCTV 동선 (CCTV 대수 숫자 없음)",
              all(t["meta"] and ("인근 CCTV" in t["meta"] or "CCTV 없음" in t["meta"]) for t in mroute["tiles"])
              and all("지점" not in t["meta"] and "대 CCTV" not in t["meta"] for t in mroute["tiles"])
              and any(t["seg"] == "190" and "인근 CCTV" in t["meta"] for t in mroute["tiles"]),
              f"{mroute['tiles'][3]}")
        check("첫 실행에 Worker 설정 팝오버가 자동으로 뜨지 않음", mroute["settingsHidden"], "")
        (ROOT.parent / "downloads").mkdir(parents=True, exist_ok=True)
        mpage.screenshot(path=str(ROOT.parent / "downloads" / "gwangju_daegu_route_mobile.png"), full_page=False)
        mpage.click('#dockBar button[data-view="list"]')
        mpage.wait_for_timeout(300)
        mlist = mpage.evaluate("""() => {
          const card = document.querySelector('#pointList .point');
          const grid = getComputedStyle(document.getElementById('pointList'));
          return {
            cols: grid.gridTemplateColumns.split(' ').length,
            cardW: card ? Math.round(card.getBoundingClientRect().width) : 0,
            searchW: Math.round(document.getElementById('search').getBoundingClientRect().width),
            innerW: window.innerWidth,
          };
        }""")
        mpage.click('#dockBar button[data-view="route"]')
        mpage.wait_for_timeout(250)
        check("모바일 1열 카드", mlist["cols"] == 1 and mlist["cardW"] <= mlist["innerW"], f"cols={mlist['cols']}, cardW={mlist['cardW']}")
        check("모바일에서도 62지점", m["points"] == 62)
        check("모바일 검색창 폭 확보", mlist["searchW"] > 100, f"{mlist['searchW']}px")

        connect(mpage, base)
        mpage.wait_for_function("() => document.getElementById('modePill').dataset.state === 'live'", timeout=90000)
        mpage.wait_for_timeout(500)
        mpage.screenshot(path=str(ROOT / "tests" / "shots" / "mobile-live.png"), full_page=False)
        ml = mpage.evaluate("""() => ({
          scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
          levels: [...document.querySelectorAll('#zoneGrid .zone')].flatMap(z => ['lvEFsm', 'lvEVir', 'lvSFsm', 'lvSVir'].map(k => z.dataset[k])),
          safe: document.querySelectorAll('#zoneGrid .zsafe').length,
        })""")
        check("모바일 실시간 모드 레이아웃 유지",
              ml["scrollW"] <= ml["innerW"] + 1 and len(ml["levels"]) == 32
              and all(v != "" for v in ml["levels"]),
              f"scrollW={ml['scrollW']}/{ml['innerW']}, 등급={len(ml['levels'])}개, 안전줄={ml['safe']}")
        mpage.wait_for_timeout(200)
        mpage.screenshot(path=str(ROOT.parent / "downloads" / "gwangju_daegu_route_mobile_live.png"), full_page=False)
        check("모바일 콘솔 에러 0건", not m_errors, "; ".join(m_errors[:3]))

        print("\n[6] 원스크린 레이아웃 · 모바일 동선")
        desk = page.evaluate("""() => {
          const doc = document.documentElement;
          const wrap = document.getElementById('routeWrap');
          const svg = document.getElementById('routeMap');
          const w = wrap.getBoundingClientRect();
          const b = svg.getBoundingClientRect();
          const list = document.getElementById('listScroll');
          return {
            pageH: doc.scrollHeight, innerH: window.innerHeight,
            pageW: doc.scrollWidth, innerW: window.innerWidth,
            viewBox: svg.getAttribute('viewBox'),
            clipped: b.top < w.top - 1 || b.bottom > w.bottom + 1 || b.left < w.left - 1 || b.right > w.right + 1,
            listScrolls: list.scrollHeight > list.clientHeight + 1,
            listWithin: list.getBoundingClientRect().bottom <= window.innerHeight + 1,
            cols: getComputedStyle(document.querySelector('.board')).gridTemplateColumns.split(' ').length,
            typo: doc.innerHTML.includes('캔처'),
          };
        }""")
        check("데스크톱 세로 스크롤 없음(100dvh 한 화면)", desk["pageH"] <= desk["innerH"] + 1,
              f"pageH {desk['pageH']} / innerH {desk['innerH']}")
        check("데스크톱 가로 넘침 없음", desk["pageW"] <= desk["innerW"] + 1, f"{desk['pageW']}/{desk['innerW']}")
        check("데스크톱 좌우 2단 스플릿", desk["cols"] == 2, str(desk["cols"]))
        check("데스크톱 노선도가 카드에 잘리지 않고 들어옴", not desk["clipped"], f"{desk['viewBox']}")
        check("데스크톱 62지점 목록은 패널 안에서만 스크롤", desk["listScrolls"] and desk["listWithin"], "")
        check("'캔처 모드' 오타 제거", not desk["typo"], "캔처 잔존" if desk["typo"] else "캡처 모드")

        mswitch = mpage.evaluate("""() => ({
          dockBottom: Math.round(document.getElementById('dock').getBoundingClientRect().bottom),
          innerH: window.innerHeight,
          view: document.body.dataset.view,
          settingsHidden: document.getElementById('settingsPanel').hidden,
        })""")
        check("모바일 하단 엄지 존이 화면 안에 있음", mswitch["dockBottom"] <= mswitch["innerH"] + 1,
              f"dock {mswitch['dockBottom']} / {mswitch['innerH']}")
        check("연결 후 설정 패널 자동 닫힘", mswitch["settingsHidden"])

        mpage.click('#dockBar button[data-view="list"]')
        mpage.wait_for_timeout(300)
        vlist = mpage.evaluate("""() => ({
          view: document.body.dataset.view,
          route: getComputedStyle(document.getElementById('routeSection')).display,
          list: getComputedStyle(document.getElementById('listSection')).display,
          scrollH: document.documentElement.scrollHeight, innerH: window.innerHeight,
          rows: document.querySelectorAll('#pointList .point').length,
          listScrolls: (() => { const l = document.getElementById('listScroll'); return l.scrollHeight > l.clientHeight + 1; })(),
        })""")
        check("모바일 하단 탭 → CCTV 목록 뷰", vlist["view"] == "list" and vlist["route"] == "none" and vlist["list"] != "none",
              f"{vlist['view']} route={vlist['route']} list={vlist['list']}")
        check("모바일 목록 뷰도 한 화면(스크롤 없음)", vlist["scrollH"] <= vlist["innerH"] + 1 and vlist["listScrolls"],
              f"{vlist['scrollH']}/{vlist['innerH']} · 내부스크롤={vlist['listScrolls']}")
        mpage.screenshot(path=str(ROOT.parent / "downloads" / "gwangju_daegu_v2_mobile_list.png"))

        mpage.click('#dockBar button[data-view="route"]')
        mpage.wait_for_timeout(350)
        mpage.click('#zoneGrid .zone[data-segment="190"]')
        mpage.wait_for_timeout(350)
        sheet = mpage.evaluate("""() => ({
          open: !document.getElementById('zoneSheet').hidden,
          title: document.getElementById('sheetTitle').textContent,
          body: document.getElementById('sheetBody').textContent,
        })""")
        check("세로 화면 구간 타일 탭 → 구간 바텀시트", sheet["open"] and "가조IC" in sheet["title"],
              f"{sheet['title']} · {sheet['body'][:40]}")
        mpage.screenshot(path=str(ROOT.parent / "downloads" / "gwangju_daegu_v2_mobile_sheet.png"))
        mpage.click("#sheetList")
        mpage.wait_for_timeout(500)
        sheet2 = mpage.evaluate("""() => ({
          view: document.body.dataset.view,
          rows: document.querySelectorAll('#pointList .point').length,
          zones: [...new Set([...document.querySelectorAll('#pointList .point')].map(p => p.dataset.zone))],
          sheetHidden: document.getElementById('zoneSheet').hidden,
        })""")
        check("바텀시트 '이 구간 CCTV 보기' → 목록 필터", sheet2["view"] == "list" and sheet2["zones"] == ["190"] and sheet2["sheetHidden"],
              f"{sheet2['rows']}지점 · {sheet2['zones']}")
        mpage.click("#zoneFocusChip2")
        mpage.wait_for_timeout(250)
        check("모바일 구간 필터 해제", mpage.evaluate("() => document.querySelectorAll('#pointList .point').length") == 62)
        mpage.click('#dockBar button[data-view="route"]')
        mpage.wait_for_timeout(300)

        mpage.evaluate("""() => document.querySelector('#routeMap path.seg-hit[data-seg=\"210\"]')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))""")
        mpage.wait_for_timeout(300)
        map_sheet = mpage.evaluate("""() => ({ open: !document.getElementById('zoneSheet').hidden, title: document.getElementById('sheetTitle').textContent })""")
        check("노선도 위 구간 탭 → 구간 바텀시트", map_sheet["open"] and "고령IC" in map_sheet["title"], str(map_sheet))
        mpage.click("#sheetClose")
        mpage.wait_for_timeout(200)

        print("\n[6] 설정 팝오버 · 가로 회전 몰입형")
        mpage.click("#modePill")
        mpage.wait_for_timeout(250)
        pop = mpage.evaluate("""() => {
          const p = document.getElementById('settingsPanel').getBoundingClientRect();
          return { open: !document.getElementById('settingsPanel').hidden,
            x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.width), h: Math.round(p.height),
            innerW: window.innerWidth, innerH: window.innerHeight };
        }""")
        check("샘플 배지 탭 → 설정 팝오버 열림", pop["open"], str(pop))
        check("세로 화면에서 팝오버가 화면 안에 온전히 들어옴",
              pop["x"] >= 0 and pop["y"] >= 0 and pop["x"] + pop["w"] <= pop["innerW"] + 1 and pop["y"] + pop["h"] <= pop["innerH"] + 1,
              f"{pop['x']},{pop['y']} {pop['w']}×{pop['h']} / {pop['innerW']}×{pop['innerH']}")
        (ROOT.parent / "downloads").mkdir(parents=True, exist_ok=True)
        mpage.screenshot(path=str(ROOT.parent / "downloads" / "gwangju_daegu_v3_mobile_popover.png"), full_page=False)
        mpage.click("#modePill")
        mpage.wait_for_timeout(150)
        check("샘플 배지 다시 탭 → 팝오버 닫힘", mpage.evaluate("() => document.getElementById('settingsPanel').hidden"))
        mpage.screenshot(path=str(ROOT.parent / "downloads" / "gwangju_daegu_v3_mobile_portrait.png"), full_page=False)

        # 가로 회전(844×390) — 헤더·독을 접고 노선도가 화면을 다 쓰는 몰입형
        land = browser.new_context(viewport={"width": 844, "height": 390}, device_scale_factor=3, is_mobile=True, has_touch=True)
        lpage = land.new_page()
        l_errors: list[str] = []
        lpage.on("console", lambda m: l_errors.append(m.text) if m.type == "error" else None)
        lpage.goto(f"{base}/index.html", wait_until="load")
        lpage.wait_for_timeout(400)
        limm = lpage.evaluate("""() => {
          const svg = document.querySelector('#routeMap');
          const wrap = document.getElementById('routeWrap');
          const s = svg.getBoundingClientRect();
          const w = wrap.getBoundingClientRect();
          const vb = svg.getAttribute('viewBox').split(' ').map(Number);
          const doc = document.documentElement;
          return {
            immersive: document.body.classList.contains('immersive'),
            scene: svg.dataset.scene,
            viewBox: svg.getAttribute('viewBox'),
            aspect: Math.round((vb[2] / vb[3]) * 100) / 100,
            mapW: Math.round(s.width), mapH: Math.round(s.height),
            fill: Math.round((s.height / window.innerHeight) * 100),
            widthUse: Math.round((s.width / window.innerWidth) * 100),
            clipped: s.left < w.left - 1 || s.right > w.right + 1 || s.top < w.top - 1 || s.bottom > w.bottom + 1,
            topbar: getComputedStyle(document.querySelector('.tb-main')).display,
            dock: getComputedStyle(document.getElementById('dock')).display,
            rail: getComputedStyle(document.getElementById('rail')).display,
            railButtons: document.querySelectorAll('#rail button').length,
            labels: document.querySelectorAll('#routeMap .lbl').length,
            pageW: doc.scrollWidth, pageH: doc.scrollHeight,
            innerW: window.innerWidth, innerH: window.innerHeight,
            settingsHidden: document.getElementById('settingsPanel').hidden,
          };
        }""")
        check("가로 회전 → 몰입형 전환", limm["immersive"] and limm["scene"] == "landscape", f"{limm['scene']} {limm['viewBox']}")
        check("가로에서 상단 헤더·하단 독 접기", limm["topbar"] == "none" and limm["dock"] == "none",
              f"topbar={limm['topbar']} dock={limm['dock']}")
        check("가로에서 조작 사이드 레일 표시", limm["rail"] == "flex" and limm["railButtons"] >= 8,
              f"{limm['rail']} · 버튼 {limm['railButtons']}개")
        check("가로 노선도가 화면 세로를 거의 다 씀", limm["fill"] >= 90 and limm["mapH"] >= 330,
              f"지도 {limm['mapW']}×{limm['mapH']} · 화면 높이의 {limm['fill']}%")
        check("가로 노선도가 찌그러지지 않고 카드 안에 들어옴", (not limm["clipped"]) and limm["aspect"] > 1.6,
              f"비율 {limm['aspect']} · 가로사용 {limm['widthUse']}%")
        check("가로에서도 페이지 스크롤 없음", limm["pageW"] <= limm["innerW"] + 1 and limm["pageH"] <= limm["innerH"] + 1,
              f"{limm['pageW']}×{limm['pageH']} / {limm['innerW']}×{limm['innerH']}")
        check("가로에서도 라벨 13곳", limm["labels"] == 13, str(limm["labels"]))
        check("가로에서는 설정 팝오버도 자동으로 열지 않음", limm["settingsHidden"])

        lpage.click("#railSettings")
        lpage.wait_for_timeout(250)
        lpop = lpage.evaluate("""() => {
          const p = document.getElementById('settingsPanel').getBoundingClientRect();
          return { open: !document.getElementById('settingsPanel').hidden, x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.width), h: Math.round(p.height), innerW: window.innerWidth, innerH: window.innerHeight };
        }""")
        check("가로 팝오버가 화면 안에 온전히 들어옴",
              lpop["open"] and lpop["x"] >= 0 and lpop["y"] >= 0 and lpop["x"] + lpop["w"] <= lpop["innerW"] + 1 and lpop["y"] + lpop["h"] <= lpop["innerH"] + 1,
              f"{lpop['x']},{lpop['y']} {lpop['w']}×{lpop['h']} / {lpop['innerW']}×{lpop['innerH']}")
        lpage.screenshot(path=str(ROOT.parent / "downloads" / "gwangju_daegu_v3_mobile_popover_landscape.png"), full_page=False)
        lpage.fill("#workerUrl", base)
        lpage.click("#btnConnect")
        lpage.wait_for_function("() => ['live','error'].includes(document.getElementById('modePill').dataset.state)", timeout=90000)
        lpage.wait_for_timeout(600)
        check("가로 실시간 연결", lpage.evaluate("() => document.getElementById('modePill').dataset.state") == "live")
        check("가로 화면에서도 팝오버 닫힘", lpage.evaluate("() => document.getElementById('settingsPanel').hidden"))
        lpage.screenshot(path=str(ROOT.parent / "downloads" / "gwangju_daegu_v3_mobile_landscape.png"), full_page=False)

        lpage.click('#rail [data-rm="vir"]')
        lpage.wait_for_timeout(300)
        lvir = lpage.evaluate("""() => ({
          scene: document.querySelector('#routeMap').dataset.scene,
          segs: [...document.querySelectorAll('#routeMap path.seg[data-seg]')].map(s => s.dataset.lv),
          railOn: document.querySelector('#rail [data-rm="vir"]').classList.contains('on'),
          bodyOn: document.querySelector('#routeMetric [data-rm="vir"]').classList.contains('on'),
        })""")
        check("가로 레일에서 가시거리 전환(본체 버튼과 동기화)",
              lvir["railOn"] and lvir["bodyOn"] and len(lvir["segs"]) == 16 and all(v != "null" for v in lvir["segs"]),
              str(lvir["segs"]))
        lpage.click('#rail [data-rd="both"]')
        lpage.wait_for_timeout(300)
        check("가로 레일 양방향 → 구간당 2선",
              lpage.evaluate("() => document.querySelectorAll('#routeMap path.seg[data-seg]').length") == 16)
        lpage.click('#rail [data-rd="E"]')
        lpage.click('#rail [data-rm="fsm"]')
        lpage.wait_for_timeout(300)

        lpage.click("#railList")
        lpage.wait_for_timeout(400)
        llist = lpage.evaluate("""() => {
          const grid = getComputedStyle(document.getElementById('pointList'));
          const doc = document.documentElement;
          return {
            view: document.body.dataset.view,
            route: getComputedStyle(document.getElementById('routeSection')).display,
            cols: grid.gridTemplateColumns.split(' ').length,
            rows: document.querySelectorAll('#pointList .point').length,
            rail: getComputedStyle(document.getElementById('rail')).display,
            listScrolls: (() => { const l = document.getElementById('listScroll'); return l.scrollHeight > l.clientHeight + 1; })(),
            pageH: doc.scrollHeight, innerH: window.innerHeight,
          };
        }""")
        check("가로 레일 📹 → 2열 컴팩트 CCTV 목록",
              llist["view"] == "list" and llist["route"] == "none" and llist["cols"] == 2 and llist["rows"] == 62,
              f"{llist['cols']}열 {llist['rows']}지점")
        check("가로 목록도 화면 안에서만 스크롤", llist["listScrolls"] and llist["pageH"] <= llist["innerH"] + 1,
              f"목록스크롤={llist['listScrolls']} page {llist['pageH']}/{llist['innerH']}")
        check("가로 목록에서도 레일 유지", llist["rail"] == "flex")
        lpage.screenshot(path=str(ROOT.parent / "downloads" / "gwangju_daegu_v3_mobile_landscape_list.png"), full_page=False)
        lpage.click("#railList")
        lpage.wait_for_timeout(300)
        check("가로 레일 📹 다시 → 노선도 복귀", lpage.evaluate("() => document.body.dataset.view") == "route")
        check("가로 콘솔 에러 0건", not [e for e in l_errors if "Failed to load resource" not in e], "; ".join(l_errors[:2]))
        land.close()

        print("\n[7] Worker 오류 폴백")
        errpage = context.new_page()
        e_errors: list[str] = []
        errpage.on("console", lambda m: e_errors.append(m.text) if m.type == "error" else None)
        errpage.goto(f"{base}/index.html", wait_until="load")
        connect(errpage, f"{base}/badworker")
        errpage.wait_for_timeout(2500)
        fallback = errpage.evaluate("""() => ({
          state: document.getElementById('modePill').dataset.state,
          modeText: document.getElementById('modeText').textContent,
          points: document.querySelectorAll('#pointList .point').length,
          cams: document.querySelectorAll('#pointList .cam').length,
          zones: document.querySelectorAll('#zoneGrid .zone').length,
          status: document.getElementById('statusLine').textContent,
          noFailedFetch: document.getElementById('emptyMsg').classList.contains('hidden'),
        })""")
        check("연결 실패해도 62지점/123대 유지", fallback["points"] == 62 and fallback["cams"] == 123,
              f"{fallback['points']}지점/{fallback['cams']}대")
        check("연결 실패 시 오류 표시 + 샘플 전환",
              fallback["state"] == "error" and "실패" in fallback["modeText"],
              f"{fallback['state']} · {fallback['modeText']}")
        check("폴백 화면 콘솔 에러 0건", not [e for e in e_errors if "Failed to load resource" not in e],
              "; ".join(e_errors[:2]))

        print("\n[8] 서→동 노선도 시각화")
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(150)
        print("    상태:", page.evaluate("""() => ({
          mode: document.getElementById('modePill').dataset.state,
          tm: document.getElementById('rwisTm').textContent,
          badge: document.querySelector('#zoneGrid .badge').dataset.level,
          meta: document.getElementById('routeMeta').textContent,
        })"""))
        route = page.evaluate("""() => {
          const svg = document.querySelector('#routeMap');
          const box = svg ? svg.getBoundingClientRect() : null;
          const segs = [...document.querySelectorAll('#routeMap path.seg[data-seg]')];
          return {
            exists: !!svg,
            viewBox: svg && svg.getAttribute('viewBox'),
            box: box && { w: Math.round(box.width), h: Math.round(box.height) },
            segs: segs.map(s => ({ zone: s.dataset.seg, dir: s.dataset.dir, lv: s.dataset.lv, stroke: s.getAttribute('stroke'), dash: s.getAttribute('stroke-dasharray') })),
            hits: document.querySelectorAll('#routeMap path.seg-hit').length,
            nodes: document.querySelectorAll('#routeMap .node').length,
            nodeNames: [...document.querySelectorAll('#routeMap .node')].map(n => n.dataset.node),
            labels: [...document.querySelectorAll('#routeMap .lbl')].map(t => t.textContent),
            regionNames: [...document.querySelectorAll('#routeMap .region')].map(t => t.textContent),
            provinces: document.querySelectorAll('#routeMap .provinces path').length,
            counties: document.querySelectorAll('#routeMap .counties path').length,
            title: [...document.querySelectorAll('#routeMap text')].map(t => t.textContent).find(t => t.includes('현황')),
            hdr: [...document.querySelectorAll('#routeMap .hdr text')].map(t => t.textContent.trim()),
            legend: [...document.querySelectorAll('#routeMap .legend-item')].map(t => t.textContent.trim()),
            srcLine: [...document.querySelectorAll('#routeMap text')].filter(t => t.textContent.includes('rwis.kma.go.kr')).length,
            chips: [...document.querySelectorAll('#routeMap .chips text')].map(t => t.textContent.trim()),
            chevrons: document.querySelectorAll('#routeMap .chevrons path').length,
          };
        }""")
        check("노선도 SVG 렌더 (1600×900 viewBox)", route["exists"] and route["viewBox"] == "0 0 1600 900",
              f"{route['viewBox']} · 화면 {route['box']}")
        check("v8 기본 방향 '양방향' → 구간당 상·하행 16선", len(route["segs"]) == 16 and {s["dir"] for s in route["segs"]} == {"E", "S"},
              f"{len(route['segs'])}개 · 방향 {sorted({s['dir'] for s in route['segs']})}")
        check("실등급 0~3 색상 매핑", all(s["lv"] in {"0", "1", "2", "3"} for s in route["segs"]),
              str([s["lv"] for s in route["segs"]]))
        check("등급별 색상이 단계 팔레트와 일치", all(
            s["stroke"].lower() == page.evaluate("() => window.__gdc.palette()")[int(s["lv"])] for s in route["segs"]),
            str(sorted({(s['lv'], s['stroke']) for s in route['segs']})))
        check("주요 노드 13곳 라벨", route["nodes"] == 13 and len(route["labels"]) == 13, str(route["labels"]))
        check("노드 이름에 IC·JC·터널 포함", {"함양IC", "함양JC", "거창IC", "살피재TN", "가조TN", "가야1TN", "가야3TN", "해인사IC", "고령IC", "동고령IC", "고령JC", "옥포JC"} <= set(route["labels"]),
              str(route["labels"]))
        check("구간 클릭 영역 8개", route["hits"] == 8, str(route["hits"]))
        check("배경 지도(시도 4 + 시군 13)", route["provinces"] == 4 and route["counties"] >= 10,
              f"시도 {route['provinces']} · 시군 {route['counties']}")
        check("권역 이름 표기", set(route["regionNames"]) >= {"경남", "경북", "전북"}, str(route["regionNames"]))
        check("v8 컴팩트 헤더 — 출처·지표·관측시각·범위", len(route["hdr"]) == 2
              and "기상청 RWIS" in route["hdr"][0] and "도로살얼음(FSM)" in route["hdr"][0]
              and "관측" in route["hdr"][1] and "함양IC" in route["hdr"][1],
              str(route["hdr"]))
        check("v8 지도 안에 중복 큰 제목 없음", all("현황" not in h for h in route["hdr"]), str(route["hdr"]))
        check("4단계 범례 + 출처", len(route["legend"]) == 4 and route["srcLine"] >= 1, str(route["legend"]))
        check("방향 셰브런 표시", route["chevrons"] >= 8, str(route["chevrons"]))

        desk_dir = page.evaluate("""() => {
          const box = (km) => { const t = document.querySelector(`#routeMap .node[data-km="${km}"] .lbl`); const b = t.getBBox(); return { x: Math.round(b.x), y: Math.round(b.y) }; };
          return { west: box(95), east: box(176) };
        }""")
        check("데스크톱 노선도도 함양IC(서) → 옥포JC(동)",
              desk_dir["west"]["x"] < desk_dir["east"]["x"]
              and abs(desk_dir["east"]["y"] - desk_dir["west"]["y"]) < (desk_dir["east"]["x"] - desk_dir["west"]["x"]) * 0.6,
              f"함양IC x={desk_dir['west']['x']} → 옥포JC x={desk_dir['east']['x']}")

        # 라벨 겹침 자동 검사
        overlap = page.evaluate("""() => {
          const items = [...document.querySelectorAll('#routeMap .lbl, #routeMap .lbl-sub')].map(t => ({ text: t.textContent, b: t.getBBox() }));
          const bad = [];
          for (let i = 0; i < items.length; i++) {
            for (let j = i + 1; j < items.length; j++) {
              const a = items[i].b, c = items[j].b;
              const ox = Math.min(a.x + a.width, c.x + c.width) - Math.max(a.x, c.x);
              const oy = Math.min(a.y + a.height, c.y + c.height) - Math.max(a.y, c.y);
              if (ox > 2 && oy > 2) bad.push([items[i].text, items[j].text, Math.round(ox), Math.round(oy)]);
            }
          }
          const m = document.querySelector('#routeMap').dataset.map.split(',').map(Number);
          const outside = items.filter(it => it.b.y < m[1] + 2 || it.b.y + it.b.height > m[1] + m[3] - 2 || it.b.x < m[0] || it.b.x + it.b.width > m[0] + m[2]).map(it => it.text);
          return { bad, outside };
        }""")
        check("노선도 라벨끼리 겹치지 않음", not overlap["bad"], json.dumps(overlap["bad"], ensure_ascii=False))
        check("라벨이 지도 영역 안에 있음", not overlap["outside"], str(overlap["outside"]))

        print("\n[9] 방향·위험종류 전환")
        page.click('#routeDir [data-rd="both"]')
        page.wait_for_timeout(250)
        both = page.evaluate("""() => ({
          segs: [...document.querySelectorAll('#routeMap path.seg[data-seg]')].map(s => [s.dataset.seg, s.dataset.dir]),
          subtitle: [...document.querySelectorAll('#routeMap text')].map(t => t.textContent).find(t => t.includes('양방향')),
          title: document.querySelector('#routeLive').textContent,
        })""")
        check("양방향 → 구간당 상·하행 2선", len(both["segs"]) == 16 and {s[1] for s in both["segs"]} == {"E", "S"},
              f"{len(both['segs'])}선")
        check("양방향 문구 표시", "양방향" in (both["subtitle"] or "") and "양방향" in both["title"],
              f"{both['subtitle']} / {both['title']}")
        page.click('#routeDir [data-rd="S"]')
        page.wait_for_timeout(200)
        sdir = page.evaluate("() => [...document.querySelectorAll('#routeMap path.seg[data-seg]')].map(s => s.dataset.dir)")
        check("광주방향(하행) 전환", len(sdir) == 8 and set(sdir) == {"S"}, str(sdir))
        page.click('#routeDir [data-rd="E"]')
        page.wait_for_timeout(150)

        page.click('#routeMetric [data-rm="vir"]')
        page.wait_for_timeout(250)
        vir = page.evaluate("""() => {
          const map = {};
          document.querySelectorAll('#zoneGrid .zone').forEach(z => {
            map[z.dataset.segment + 'E'] = z.dataset.lvEVir;
            map[z.dataset.segment + 'S'] = z.dataset.lvSVir;
          });
          return {
            lv: Object.fromEntries([...document.querySelectorAll('#routeMap path.seg[data-seg]')].map(s => [s.dataset.seg + s.dataset.dir, s.dataset.lv])),
            zone: map,
            title: [...document.querySelectorAll('#routeMap text')].map(t => t.textContent).find(t => t.includes('현황')),
            hdr: [...document.querySelectorAll('#routeMap .hdr text')].map(t => t.textContent.trim()).join(' '),
            eyebrow: [...document.querySelectorAll('#routeMap text')].map(t => t.textContent).find(t => t.includes('기상청 RWIS')),
          };
        }""")
        check("가시거리 모드 헤더 전환", "도로가시거리" in vir["hdr"] and "VIR" in vir["eyebrow"],
              f"{vir['hdr']} / {vir['eyebrow']}")
        check("가시거리 등급이 구간 카드와 일치",
              all(vir["lv"].get(k) == v for k, v in vir["zone"].items() if k in vir["lv"]),
              f"노선도 {sorted(set(vir['lv'].values()))} / 카드 {sorted(set(vir['zone'].values()))}")
        page.click('#routeMetric [data-rm="fsm"]')
        page.wait_for_timeout(200)

        print("\n[10] 노선도 ↔ 목록·영상 연동")
        page.click('#routeMap path.seg-hit[data-seg="190"]')
        page.wait_for_timeout(700)
        focus = page.evaluate("""() => ({
          zones: [...new Set([...document.querySelectorAll('#pointList .point')].map(p => p.dataset.zone))],
          points: document.querySelectorAll('#pointList .point').length,
          count: document.getElementById('listCount').textContent,
          chip: document.getElementById('zoneFocusText').textContent,
          chipShown: !document.getElementById('zoneFocusChip').classList.contains('hidden'),
        })""")
        check("구간 클릭 → 그 구간 지점만 표시", focus["zones"] == ["190"] and focus["points"] == 11,
              f"zones={focus['zones']} · {focus['count']}")
        check("선택 구간 칩 표시", focus["chipShown"] and "가조IC" in focus["chip"], focus["chip"])
        page.click("#zoneFocusChip")
        page.wait_for_timeout(300)
        cleared = page.evaluate("() => ({count: document.querySelectorAll('#pointList .point').length, chip: document.getElementById('zoneFocusChip').classList.contains('hidden')})")
        check("구간 선택 해제 → 62지점 복귀", cleared["count"] == 62 and cleared["chip"], str(cleared))

        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(120)
        page.click('#routeMap .node[data-node="거창"] .node-hit')
        page.wait_for_timeout(700)
        node_modal = page.evaluate("() => ({open: !document.getElementById('modal').hidden, title: document.getElementById('modalTitle').textContent})")
        check("노드 클릭 → 그 지점 영상 모달", node_modal["open"] and node_modal["title"] == "거창", str(node_modal))
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)

        print("\n[11] 공유 이미지(PNG) · 캡처 모드")
        dl_dir = ROOT.parent / "downloads"
        dl_dir.mkdir(parents=True, exist_ok=True)
        with page.expect_download() as download_info:
            page.click("#btnShot")
            page.wait_for_timeout(200)
        download = download_info.value
        share_path = dl_dir / "gwangju_daegu_route_share.png"
        download.save_as(str(share_path))
        check("PNG 다운로드 파일명", download.suggested_filename.startswith("gwangju-daegu-report-ice-") and download.suggested_filename.endswith(".png"), download.suggested_filename)
        check("PNG 저장됨", share_path.exists() and share_path.stat().st_size > 20000, f"{share_path.name} {share_path.stat().st_size:,}bytes")
        try:
            from PIL import Image
            im = Image.open(share_path).convert("RGB")
            colors = im.getcolors(maxcolors=400000) or []
            check("PNG 3200×4140 리포트 해상도", im.size == (3200, 4140), str(im.size))
            check("PNG 내용이 비어 있지 않음", len(colors) > 50, f"색 {len(colors)}종")
            # 지도 영역에 노선(파랑)이 실제로 그려졌는지 — 흰 배경만 남는 회귀를 막는다
            map_band = im.crop((0, 500, 3200, 2200))
            px = list(map_band.resize((800, 425)).getdata())
            blue = [p for p in px if p[2] > 150 and p[0] < 120 and p[1] < 170]
            table_band = list(im.crop((0, 2500, 3200, 3900)).resize((800, 350)).getdata())
            ink = [p for p in table_band if sum(p) < 480]
            check("리포트 지도에 노선이 그려짐", len(blue) > 40, f"파랑 픽셀 {len(blue)}")
            check("리포트 표가 그려짐", len(ink) > 200, f"진한 픽셀 {len(ink)}")
        except ImportError:
            head = share_path.read_bytes()[:8]
            check("PNG 시그니처", head == b"\x89PNG\r\n\x1a\n", str(head))

        rep = page.evaluate("""() => ({ svg: window.__gdc.reportSvg(), size: window.__gdc.reportSize() }) """)
        check("한 장 리포트 = 요약 + 노선도 + 8구간 표",
              "8개 구간 등급 요약" in rep["svg"]
              and all(name in rep["svg"] for name in ("함양IC ↔ 함양JC", "고령JC ↔ 옥포JC"))
              and "이정 · 대시보드" in rep["svg"] and "양방향" in rep["svg"]
              and rep["size"]["w"] == 1600 and rep["size"]["mapH"] == 900,
              f"SVG {len(rep['svg']):,}자 · {rep['size']}")
        page.screenshot(path=str(dl_dir / "gwangju_daegu_v3_desktop.png"), full_page=False)
        page.screenshot(path=str(dl_dir / "gwangju_daegu_route_preview.png"), full_page=False)
        page.locator("#routeSection").screenshot(path=str(dl_dir / "gwangju_daegu_route_card.png"))

        page.click("#btnCapture")
        page.wait_for_timeout(300)
        cap = page.evaluate("""() => ({
          on: document.body.classList.contains('capture-mode'),
          topbar: getComputedStyle(document.querySelector('.topbar')).display,
          list: getComputedStyle(document.getElementById('listSection')).display,
          bar: getComputedStyle(document.querySelector('.capture-bar')).display,
          mapW: Math.round(document.querySelector('#routeMap').getBoundingClientRect().width),
        })""")
        check("캡처 모드 → 카드만 크게", cap["on"] and cap["topbar"] == "none" and cap["list"] == "none" and cap["bar"] != "none" and cap["mapW"] > 900,
              f"mapW={cap['mapW']}")
        page.click("#btnCaptureExit")
        page.wait_for_timeout(200)
        check("캡처 모드 종료", not page.evaluate("() => document.body.classList.contains('capture-mode')"))

        print("\n[12] v4 — 실시간 배지·지리 위치·레일·밀집 마커·0대 구간·시인성")
        badge_state = page.evaluate("""() => ({
          state: document.getElementById('modePill').dataset.state,
          text: document.getElementById('modeText').textContent,
          label: document.getElementById('modePill').getAttribute('aria-label'),
        })""")
        check("실시간 배지에 관측 경과 시간 표기",
              badge_state["state"] in {"live", "stale"} and any(u in badge_state["text"] for u in ("분", "시간")),
              f"{badge_state['state']} · {badge_state['text']} · {badge_state['label']}")

        order = page.evaluate("""() => {
          const box = (name) => {
            const t = [...document.querySelectorAll('#routeMap .lbl')].find(x => x.textContent === name);
            const b = t.getBBox(); return { x: Math.round(b.x), right: Math.round(b.x + b.width) };
          };
          return { dong: box('동고령IC'), goryeong: box('고령JC') };
        }""")
        check("데스크톱: 동고령IC 라벨이 고령JC 라벨 왼쪽",
              order["dong"]["x"] < order["goryeong"]["x"], json.dumps(order, ensure_ascii=False))

        regions = page.evaluate("""() => {
          const vb = document.querySelector('#routeMap').getAttribute('viewBox').split(' ').map(Number);
          return [...document.querySelectorAll('#routeMap .region')].map(t => {
            const b = t.getBBox();
            return { name: t.textContent, x: b.x, y: b.y, right: b.x + b.width, bottom: b.y + b.height };
          });
        }""")
        outside = [r["name"] for r in regions if r["x"] < 4 or r["right"] > 1596 or r["y"] < 148 or r["bottom"] > 792]
        check("배경 도명이 캔버스 안쪽에 있음 (데스크톱)", not outside, str(outside))

        # ── 가로 엄지 레일 ──
        land4 = browser.new_context(viewport={"width": 844, "height": 390}, device_scale_factor=3, is_mobile=True, has_touch=True)
        lp = land4.new_page()
        l4_errors: list[str] = []
        lp.on("pageerror", lambda e: l4_errors.append(str(e)))
        fetches: list[str] = []
        lp.on("request", lambda r: fetches.append(r.url) if "rwis_latest" in r.url or "/api/status" in r.url else None)
        lp.goto(f"{base}/index.html", wait_until="load")
        lp.wait_for_timeout(500)
        rail = lp.evaluate("""() => {
          const r = document.getElementById('rail');
          const cs = getComputedStyle(r);
          return {
            labels: [...document.querySelectorAll('#rail button .tx')].map(t => t.textContent.trim()),
            icons: document.querySelectorAll('#rail button .ic').length,
            width: Math.round(r.getBoundingClientRect().width),
            scroll: [r.scrollHeight, r.clientHeight],
            padRight: cs.paddingRight,
            padTop: cs.paddingTop,
            badAbbrev: document.body.innerHTML.includes('↕양방'),
            reload: !!document.getElementById('railReload'),
            cardRight: Math.round(document.getElementById('routeSection').getBoundingClientRect().right),
            innerW: window.innerWidth,
          };
        }""")
        check("가로 레일: 아이콘+한글 라벨 (어색한 축약 없음)",
              set(["살얼음", "가시", "대구", "광주", "양방향", "저장", "갱신", "설정"]) <= set(rail["labels"])
              and rail["icons"] == 9 and not rail["badAbbrev"],
              str(rail["labels"]))
        check("가로 레일 폭 64~70px", 64 <= rail["width"] <= 70, f"{rail['width']}px")
        check("가로 레일에 갱신 버튼", rail["reload"] and "갱신" in rail["labels"], "")
        check("가로 레일이 화면 세로에 다 들어옴", rail["scroll"][0] <= rail["scroll"][1] + 1, str(rail["scroll"]))
        before = len(fetches)
        lp.click("#railReload")
        lp.wait_for_timeout(900)
        check("가로 갱신 버튼이 실제로 다시 불러옴", len(fetches) > before, f"{before}→{len(fetches)}")
        css_text = lp.evaluate("""() => [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\\n'); } catch (e) { return ''; } }).join('\\n')""")
        check("가로 노선도·레일에 env(safe-area-inset-*) 반영",
              "env(safe-area-inset-left)" in css_text and "env(safe-area-inset-right)" in css_text
              and "env(safe-area-inset-top)" in css_text and "env(safe-area-inset-bottom)" in css_text,
              "left/right/top/bottom")
        lregions = lp.evaluate("""() => {
          const vb = document.querySelector('#routeMap').getAttribute('viewBox').split(' ').map(Number);
          return [...document.querySelectorAll('#routeMap .region')].map(t => {
            const b = t.getBBox(); return { name: t.textContent, x: b.x, right: b.x + b.width, vbW: vb[2] };
          });
        }""")
        loutside = [r["name"] for r in lregions if r["x"] < 2 or r["right"] > r["vbW"] - 2]
        check("가로에서도 배경 도명이 잘리지 않음", not loutside, f"{loutside} / {lregions}")

        # ── 밀집 마커(가조IC~가야3TN) 터치 ──
        hit_size = lp.evaluate("""() => {
          const r = document.querySelector('#routeMap .node[data-km="137.24"] .node-hit').getBoundingClientRect();
          return [Math.round(r.width), Math.round(r.height)];
        }""")
        check("마커 히트 영역이 손가락 목표(≥40px) 이상", min(hit_size) >= 40, f"{hit_size[0]}×{hit_size[1]}px")
        lp.click('#routeMap .node[data-km="137.24"] .node-hit', force=True)
        lp.wait_for_timeout(350)
        pick = lp.evaluate("""() => ({
          open: !document.getElementById('nodeSheet').hidden,
          title: document.getElementById('nodeSheetTitle').textContent,
          rows: [...document.querySelectorAll('#nodeSheetList .pick-row')].map(r => ({
            text: r.textContent.replace(/\\s+/g, ' ').trim(),
            h: Math.round(r.getBoundingClientRect().height),
          })),
        })""")
        check("밀집 마커 탭 → 인접 지점 선택 시트", pick["open"] and len(pick["rows"]) >= 2,
              f"{pick['title']} · {[r['text'] for r in pick['rows']]}")
        check("선택 항목이 44px 이상 터치 목표", pick["rows"] and min(r["h"] for r in pick["rows"]) >= 44,
              str([r["h"] for r in pick["rows"]]))
        lp.click("#nodeSheetZone")
        lp.wait_for_timeout(350)
        zone_sheet = lp.evaluate("""() => ({ open: !document.getElementById('zoneSheet').hidden, title: document.getElementById('sheetTitle').textContent })""")
        check("시트에서 '이 구간 도로기상' 동작", zone_sheet["open"], str(zone_sheet))
        lp.click("#sheetClose")
        lp.wait_for_timeout(150)
        lp.screenshot(path=str(ROOT.parent / "downloads" / "gwangju_daegu_v4_mobile_landscape.png"), full_page=False)
        land4.close()

        # ── 0대 구간 타일 ──
        port4 = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
        pp = port4.new_page()
        p4_errors: list[str] = []
        pp.on("pageerror", lambda e: p4_errors.append(str(e)))
        pp.goto(f"{base}/index.html", wait_until="load")
        pp.wait_for_timeout(500)
        tile = pp.evaluate("""() => {
          const z = document.querySelector('#zoneGrid .zone[data-segment="220"]');
          const meta = z.querySelector('.zmeta');
          return {
            cams: z.dataset.cams,
            cls: z.className,
            meta: meta.textContent.replace(/\\s+/g, ' ').trim(),
            hasArrow: meta.textContent.includes('›'),
            dashes: getComputedStyle(z).borderTopStyle,
            worst: z.dataset.worst,
          };
        }""")
        check("CCTV 0대 구간은 '영상 없음'으로 구분", tile["cams"] == "0" and "nocam" in tile["cls"]
              and "CCTV 없음" in tile["meta"] and not tile["hasArrow"],
              f"{tile['meta']} · {tile['cls']}")
        check("CCTV 0대 구간은 점선 테두리로 비활성 표시", tile["dashes"] == "dashed", tile["dashes"])
        pp.click('#zoneGrid .zone[data-segment="220"]')
        pp.wait_for_timeout(300)
        zero_sheet = pp.evaluate("""() => ({
          open: !document.getElementById('zoneSheet').hidden,
          body: document.getElementById('sheetBody').textContent.replace(/\\s+/g, ' ').trim(),
          listHidden: document.getElementById('sheetList').classList.contains('hidden'),
        })""")
        check("0대 구간 시트: 빈 CCTV 목록 대신 안내", zero_sheet["open"] and "영상 없음" in zero_sheet["body"] and zero_sheet["listHidden"],
              zero_sheet["body"][-40:])
        pp.click("#sheetClose")
        pp.wait_for_timeout(200)

        safe_style = pp.evaluate("""() => {
          const tile = document.querySelector('#zoneGrid .zone[data-worst="0"]');
          const safe = tile ? tile.querySelector('.zsafe') : null;
          return {
            hasSafe: !!safe,
            safeText: safe ? safe.textContent.trim() : null,
            badges: tile ? tile.querySelectorAll('.badge').length : -1,
            border: tile ? getComputedStyle(tile).borderTopColor : null,
            bg: tile ? getComputedStyle(tile).backgroundColor : null,
          };
        }""")
        check("0단계(안전) 구간은 배지 없이 1줄로 축약",
              safe_style["hasSafe"] and safe_style["badges"] == 0 and "안전" in (safe_style["safeText"] or ""),
              json.dumps(safe_style, ensure_ascii=False))

        porder = pp.evaluate("""() => {
          const box = (name) => {
            const t = [...document.querySelectorAll('#routeMap .lbl')].find(x => x.textContent === name);
            const b = t.getBBox(); return Math.round(b.x);
          };
          return { dong: box('동고령IC'), goryeong: box('고령JC') };
        }""")
        check("세로: 동고령IC 라벨이 고령JC 라벨 왼쪽", porder["dong"] < porder["goryeong"],
              json.dumps(porder, ensure_ascii=False))
        pregions = pp.evaluate("""() => {
          const vb = document.querySelector('#routeMap').getAttribute('viewBox').split(' ').map(Number);
          return [...document.querySelectorAll('#routeMap .region')].map(t => {
            const b = t.getBBox(); return { name: t.textContent, x: b.x, y: b.y, right: b.x + b.width, w: vb[2] };
          });
        }""")
        poutside = [r["name"] for r in pregions if r["x"] < 2 or r["right"] > r["w"] - 2]
        check("세로에서도 배경 도명이 잘리지 않음", not poutside, str(poutside))
        pp.screenshot(path=str(ROOT.parent / "downloads" / "gwangju_daegu_v4_mobile_portrait.png"), full_page=False)

        # ── 모의 위험 단계 시인성 ──
        pp.goto(f"{base}/index.html?preview=alert", wait_until="load")
        pp.wait_for_timeout(600)
        prev = pp.evaluate("""() => {
          const zones = [...document.querySelectorAll('#zoneGrid .zone')];
          const worst = zones.map(z => z.dataset.worst);
          const hot = document.querySelector('#zoneGrid .zone[data-worst="3"]');
          const safe = document.querySelector('#zoneGrid .zone[data-worst="0"]');
          const strong = document.querySelector('#zoneGrid .badge.lv3');
          const safeLine = safe ? safe.querySelector('.zsafe') : null;
          const dot = strong ? getComputedStyle(strong, '::before') : null;
          return {
            pill: document.getElementById('modeText').textContent,
            tm: document.getElementById('rwisTm').textContent,
            worst,
            hotBorder: hot ? getComputedStyle(hot).borderTopColor : null,
            hotShadow: hot ? getComputedStyle(hot).boxShadow : null,
            safeBorder: safe ? getComputedStyle(safe).borderTopColor : null,
            strongColor: strong ? getComputedStyle(strong).color : null,
            strongDot: dot ? dot.backgroundColor : null,
            safeBadges: safe ? safe.querySelectorAll('.badge').length : -1,
            safeLineShown: !!safeLine,
            counts: {
              lv3: document.querySelectorAll('#zoneGrid .badge.lv3').length,
              lv2: document.querySelectorAll('#zoneGrid .badge.lv2').length,
              lv1: document.querySelectorAll('#zoneGrid .badge.lv1').length,
              safe: document.querySelectorAll('#zoneGrid .zsafe').length,
            },
          };
        }""")
        check("미리보기는 모의 등급임을 밝힘", "미리보기" in prev["pill"] and "모의" in prev["tm"],
              f"{prev['pill']} / {prev['tm']}")
        check("주의·위험 타일이 안전 타일과 확연히 다름",
              "3" in prev["worst"] and prev["hotBorder"] != prev["safeBorder"] and prev["hotShadow"] != "none",
              f"위험 {prev['hotBorder']} vs 안전 {prev['safeBorder']}")
        check("위험 배지는 붉은 점·글자로 채워지고 안전 구간은 배지 없음",
              prev["strongColor"] not in (None, "rgb(125, 148, 175)") and prev["strongDot"] not in (None, "rgba(0, 0, 0, 0)")
              and prev["safeBadges"] == 0 and prev["safeLineShown"],
              f"{prev['strongColor']} / 점 {prev['strongDot']} / 안전배지 {prev['safeBadges']}")
        check("미리보기에 1·2·3단계가 섞여 표시", prev["counts"]["lv1"] > 0 and prev["counts"]["lv2"] > 0
              and prev["counts"]["lv3"] > 0 and prev["counts"]["safe"] > 0, json.dumps(prev["counts"]))
        pp.screenshot(path=str(ROOT.parent / "downloads" / "gwangju_daegu_v4_alert_preview.png"), full_page=False)
        port4.close()

        print("\n[13] v6 — 다크 톤 · 자동 갱신 · 상향 하이라이트 · 리포트")
        v6 = page.evaluate("""() => {
          const wrap = getComputedStyle(document.getElementById('routeWrap'));
          const lbl = document.querySelector('#routeMap .lbl');
          const region = document.querySelector('#routeMap .region');
          const grad = [...document.querySelectorAll('#routeMap linearGradient#rmPaper stop')].map(s => s.getAttribute('stop-color'));
          const sizes = {};
          const pick = { zmeta: '#zoneGrid .zmeta', sum: '#rwisSummary .sum-box .label', foot: 'footer.side-foot', addr: '#pointList .pt-addr' };
          for (const k of Object.keys(pick)) {
            const el = document.querySelector(pick[k]);
            sizes[k] = el ? parseFloat(getComputedStyle(el).fontSize) : null;
          }
          return {
            wrapBg: wrap.backgroundImage,
            lblFill: lbl ? getComputedStyle(lbl).fill : null,
            regionFill: region ? getComputedStyle(region).fill : null,
            grad, sizes,
            refNote: !!document.querySelector('.ref-note') && document.querySelector('.ref-note').textContent.includes('95.0–176.0'),
            reportBtn: !!document.getElementById('btnReport'),
            refreshOpts: [...document.querySelectorAll('#refreshOpts button')].map(b => b.dataset.min),
          };
        }""")
        check("다크 톤 지도 — 흰 종이 박스 제거", "rgb(10, 21, 36)" in v6["wrapBg"] and v6["grad"][0] == "#081120",
              f"{v6['wrapBg'][:46]} · 종이 {v6['grad']}")
        check("지도 라벨·도명이 밝은 색", v6["lblFill"] in ("rgb(233, 243, 252)",) and v6["regionFill"] == "rgb(74, 108, 140)",
              f"{v6['lblFill']} / {v6['regionFill']}")
        check("작은 회색 메타 글씨 10.5px 이상",
              v6["sizes"]["zmeta"] >= 10.5 and v6["sizes"]["sum"] >= 10.5
              and v6["sizes"]["foot"] >= 11 and v6["sizes"]["addr"] >= 10.5,
              json.dumps(v6["sizes"], ensure_ascii=False))
        check("⚙에 자동 갱신 6주기 + 리포트 + 자료 기준",
              v6["refreshOpts"] == ["0", "1", "5", "10", "30", "60"] and v6["reportBtn"] and v6["refNote"],
              f"{v6['refreshOpts']} · 리포트={v6['reportBtn']} · 기준={v6['refNote']}")

        page.click("#btnSettings")
        page.wait_for_timeout(200)
        page.click('#refreshOpts button[data-min="5"]')
        page.wait_for_timeout(1400)
        auto1 = page.evaluate("""() => ({
          saved: localStorage.getItem('gdc.refreshMin'),
          on: document.getElementById('autoNext').dataset.on,
          text: document.getElementById('autoNext').textContent,
          line: document.getElementById('refreshText').textContent,
          minutes: window.__gdc.auto.minutes,
          ticker: !!window.__gdc.auto.ticker,
          nextAt: window.__gdc.auto.nextAt,
        })""")
        check("자동 갱신 5분 선택 + localStorage 저장",
              auto1["saved"] == "5" and auto1["minutes"] == 5 and auto1["on"] == "1",
              json.dumps(auto1, ensure_ascii=False))
        check("setInterval 타이머 + 다음 갱신 시각 설정",
              auto1["ticker"] and isinstance(auto1["nextAt"], (int, float)) and auto1["nextAt"] > 0,
              f"ticker={auto1['ticker']} nextAt={auto1['nextAt']}")
        check("다음 갱신까지 카운트다운 표시",
              "다음" in auto1["text"] and re.search(r"\d\d:\d\d", auto1["text"])
              and "다음 갱신" in auto1["line"],
              f"{auto1['text']} / {auto1['line']}")
        page.click('#refreshOpts button[data-min="0"]')
        page.wait_for_timeout(300)
        auto2 = page.evaluate("() => ({ saved: localStorage.getItem('gdc.refreshMin'), text: document.getElementById('autoNext').textContent, minutes: window.__gdc.auto.minutes })")
        check("수동으로 되돌리면 카운트다운 종료",
              auto2["saved"] == "0" and auto2["minutes"] == 0 and "수동" in auto2["text"], str(auto2))
        page.click("#btnSettings")
        page.wait_for_timeout(150)

        # ── 상향 하이라이트 시뮬레이션: 직전 관측(전부 안전)을 심고 모의 등급과 비교 ──
        zero = {f"{d}{s}{m}": 0 for d in "ES" for s in ["160", "170", "180", "190", "200", "210", "220", "230"] for m in ["fsm", "vir"]}
        page.goto(f"{base}/index.html", wait_until="load")
        page.wait_for_function('() => !!window.__gdc', timeout=30000)
        page.evaluate("() => localStorage.removeItem('gdc.workerBase')")
        page.goto(f"{base}/index.html", wait_until="load")
        page.wait_for_function("() => ['live','snapshot'].includes(window.__gdc.state.mode)", timeout=30000)
        page.wait_for_timeout(400)
        applied = page.evaluate("(m) => window.__gdc.setPrev(m, '202611230900|202611230850')", zero)
        page.wait_for_timeout(500)
        check("모의 상향 시나리오 적용", applied is True, str(applied))
        rise = page.evaluate("""() => ({
          zones: document.querySelectorAll('#zoneGrid .zone[data-rise="1"]').length,
          chips: document.querySelectorAll('#zoneGrid .zrise').length,
          halos: document.querySelectorAll('#routeMap path.rise-halo').length,
          marks: document.querySelectorAll('#routeMap .rise-mark').length,
          meta: document.getElementById('routeMeta').textContent,
          rises: Object.keys(window.__gdc.rises()).length,
          dbgCards: [...document.querySelectorAll('#zoneGrid .zone')].map(z => [z.dataset.segment, z.dataset.rise, z.dataset.lvEFsm, z.querySelectorAll('.badge').length]),
          dbgFilter: window.__gdc.state.rwisFilter,
          dbgPreview: window.__gdc.state.rwis.preview,
          dbgKeys: Object.keys(window.__gdc.rises()),
        })""")
        print("    상향 시나리오:", json.dumps(rise, ensure_ascii=False))
        check("직전 관측 대비 등급 상향 구간 자동 감지",
              rise["zones"] > 0 and rise["rises"] >= rise["zones"],
              f"상향 {rise['rises']}건 · 카드 {rise['zones']}구간")
        check("상향 구간 노선도 펄스 하이라이트 + ▲ 표식",
              rise["halos"] > 0 and rise["halos"] == rise["marks"] and rise["halos"] <= rise["zones"] * 2,
              f"펄스 {rise['halos']} · 표식 {rise['marks']} · 카드 {rise['zones']}구간(양방향 2선까지)")
        check("구간 카드 ▲ 배지 + 요약 '▲ 상향'",
              rise["chips"] == rise["zones"] and "▲ 상향" in rise["meta"],
              f"배지 {rise['chips']} · {rise['meta'][-24:]}")
        page.screenshot(path=str(dl_dir / "gwangju_daegu_v6_alert_rise.png"), full_page=False)

        print("\n[14] v7 — 양방향 통합 · 지표 일관성 · 모바일 헤더 · 리포트 가독성")
        page.evaluate("() => localStorage.removeItem('gdc.workerBase')")
        page.goto(f"{base}/index.html", wait_until="load")
        page.wait_for_function("() => ['live', 'snapshot', 'sample'].includes(window.__gdc.state.mode)", timeout=40000)
        page.wait_for_timeout(500)
        v7 = page.evaluate("""() => {
          const zones = [...document.querySelectorAll('#zoneGrid .zone')];
          const split = zones.filter(z => z.querySelector('.zrow'));
          const merged = zones.filter(z => z.querySelector('.zline .badge'));
          const safe = zones.filter(z => z.querySelector('.zsafe'));
          const sum = window.__gdc.zoneCounts8('fsm');
          const sumDist = [...document.querySelectorAll('#rwisSummary .sum-main .dist span')]
            .map(s => Number(s.textContent.replace(/[^0-9]/g, '')));
          const meta = document.getElementById('routeMeta').textContent.replace(/\\s+/g, ' ').trim();
          const tn = [...document.querySelectorAll('#routeMap .lbl-tn')];
          const ic = [...document.querySelectorAll('#routeMap .node .lbl')].filter(t => !t.classList.contains('lbl-tn'));
          const tnPill = tn.length ? tn[0].closest('.node').querySelector('.label-pill') : null;
          const icPill = ic.length ? ic[0].closest('.node').querySelector('.label-pill') : null;
          return {
            zones: zones.length,
            merged: merged.length, split: split.length, safe: safe.length,
            mergedText: merged.map(z => z.querySelector('.badge').textContent.replace(/\\s+/g, ' ').trim()),
            splitText: split.map(z => z.textContent.replace(/\\s+/g, ' ').trim()),
            sum: sum.counts, sumMax: sum.max, sumDist,
            basis: (document.querySelector('#rwisSummary .sum-main .label') || {}).textContent || '',
            filter: [...document.querySelectorAll('#rwisFilter button')].map(b => b.textContent.trim()),
            altHints: document.querySelectorAll('#zoneGrid .zalt').length,
            meta,
            tnCount: tn.length,
            tnSize: tn.length ? parseFloat(getComputedStyle(tn[0]).fontSize) : null,
            icSize: ic.length ? parseFloat(getComputedStyle(ic[0]).fontSize) : null,
            tnShadow: tnPill ? tnPill.getAttribute('filter') : 'none',
            icShadow: icPill ? icPill.getAttribute('filter') : null,
            listMeta: document.getElementById('listMeta').textContent.replace(/\\s+/g, ' ').trim(),
            report: window.__gdc.reportSvg(),
          };
        }""")
        check("v7 8구간 카드 — 양방향 동급은 한 줄, 다를 때만 분리",
              v7["zones"] == 8 and v7["merged"] + v7["safe"] + v7["split"] == 8
              and all("양방향" in t for t in v7["mergedText"]),
              f"통합 {v7['merged']} · 안전 {v7['safe']} · 분리 {v7['split']} · {v7['mergedText'][:2]}")
        check("v7 분리 표기는 '대구 … / 광주 …'",
              all("대구" in t and "광주" in t for t in v7["splitText"]),
              str(v7["splitText"][:2]))
        check("v7 요약·필터·목록이 8구간 기준 (16링크 숫자 제거)",
              v7["basis"].find("8구간") >= 0 and v7["filter"][0] == "전체 8"
              and "16" not in " ".join(v7["filter"]) and sum(v7["sumDist"]) == 8,
              f"{v7['basis']} · {v7['filter']} · 분포 {v7['sumDist']}")
        check("v7 좌측 노선 요약도 8구간 기준",
              "8구간" in v7["meta"], v7["meta"][:90])
        check("v7 선택 지표(살얼음) 기준으로 카드 강조 통일",
              v7["sumDist"] == [v7["sum"][3], v7["sum"][2], v7["sum"][1], v7["sum"][0]],
              f"요약 분포 {v7['sumDist']} / 8구간 {v7['sum']}")
        check("v7 다른 지표는 작은 보조 문구로만",
              v7["altHints"] >= 0 and "가시거리" in page.evaluate("() => document.getElementById('rwisSummary').textContent"),
              f"보조문구 {v7['altHints']}개")
        check("v7 터널 말풍선이 IC·JC보다 작고 그림자 없음",
              v7["tnCount"] >= 3 and v7["tnSize"] is not None and v7["icSize"] is not None
              and v7["tnSize"] < v7["icSize"] and v7["tnShadow"] in (None, ""),
              f"터널 {v7['tnSize']}px < IC {v7['icSize']}px · filter={v7['tnShadow']}")
        check("v7 스냅샷 모드일 때 'ITS 미연결' 대신 스냅샷 모드 표기",
              "스냅샷 모드" in v7["listMeta"] or "ITS 매칭" in v7["listMeta"], v7["listMeta"])

        rep = v7["report"]
        check("v7 리포트: 반복 '안전 0' 알약 제거 · 옅은 — 표기",
              "안전 0" not in rep and rep.count("양방향 —") >= 6,
              f"안전0={'안전 0' in rep} · — 표기 {rep.count('양방향 —')}개")
        check("v9 리포트: CCTV 없는 구간은 중립 회색 'CCTV 없음'",
              'CCTV 없음' in rep and 'fill="#9aabbd"' in rep and 'fill="#b45309"' not in rep,
              "회색 확인" if 'fill="#9aabbd"' in rep else "빨강 잔존")
        check("v7 리포트: 양방향 동급은 '양방향' 한 칸",
              rep.count("양방향") >= 8, f"양방향 {rep.count('양방향')}회")

        mob = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        mpg = mob.new_page()
        m_errors7: list[str] = []
        mpg.on("pageerror", lambda e: m_errors7.append(str(e)))
        mpg.goto(f"{base}/index.html", wait_until="load")
        mpg.wait_for_timeout(600)
        m7 = mpg.evaluate("""() => {
          const h1 = document.querySelector('.brand h1');
          const headBtns = [...document.querySelectorAll('.route-head .btn')].filter(b => getComputedStyle(b).display !== 'none');
          const dockReport = document.getElementById('btnShotDock');
          const dockBox = dockReport.getBoundingClientRect();
          return {
            title: h1.textContent.replace(/\\s+/g, ' ').trim(),
            h1Clipped: h1.scrollWidth > h1.clientWidth + 1,
            headReportButtons: headBtns.length,
            dockReportVisible: getComputedStyle(dockReport).display !== 'none' && dockBox.width > 0,
            dockText: dockReport.textContent.replace(/\\s+/g, ' ').trim(),
            metaClipped: [...document.querySelectorAll('#zoneGrid .zmeta, #zoneGrid .zcctv')]
              .some(n => n.scrollWidth > n.clientWidth + 1 || n.getBoundingClientRect().right > window.innerWidth + 1),
            pageW: document.documentElement.scrollWidth, innerW: window.innerWidth,
            pageH: document.documentElement.scrollHeight, innerH: window.innerHeight,
          };
        }""")
        check("v7 모바일 헤더 제목이 잘리지 않음", (not m7["h1Clipped"]) and "광주대구선" in m7["title"],
              f"'{m7['title']}' 잘림={m7['h1Clipped']}")
        check("v7 모바일 리포트 버튼 중복·겹침 정리 (하단 한 곳)",
              m7["headReportButtons"] == 0 and m7["dockReportVisible"] and "리포트" in m7["dockText"],
              f"상단 {m7['headReportButtons']}개 · 하단 {m7['dockText']}")
        check("v7 모바일 카드 하단 글자 잘림 없음", not m7["metaClipped"],
              f"page {m7['pageW']}/{m7['innerW']}")
        check("v7 모바일 한 화면 · 가로 넘침 없음",
              m7["pageW"] <= m7["innerW"] + 1 and m7["pageH"] <= m7["innerH"] + 1,
              f"{m7['pageW']}×{m7['pageH']} / {m7['innerW']}×{m7['innerH']}")
        mpg.screenshot(path=str(ROOT.parent / "downloads" / "gwangju_daegu_v7_mobile_portrait.png"), full_page=False)
        check("v7 모바일 콘솔 에러 0건", not m_errors7, "; ".join(m_errors7[:2]))
        mob.close()

        print("\n[15] v8 — 방향 일치 · 보조지표 시인성 · 하단 탭 · 지도 라벨 · 리포트")
        page.goto(f"{base}/index.html", wait_until="load", timeout=40000)
        page.wait_for_function("() => ['live', 'snapshot', 'sample'].includes(window.__gdc.state.mode)", timeout=40000)
        page.wait_for_timeout(500)
        v8 = page.evaluate("""() => {
          const segs = () => [...document.querySelectorAll('#routeMap path.seg[data-seg]')].map(s => s.dataset.dir);
          return {
            dirBoth: document.querySelector('#routeDir [data-rd="both"]').getAttribute('aria-pressed'),
            dirE: document.querySelector('#routeDir [data-rd="E"]').getAttribute('aria-pressed'),
            segs: segs(),
            cards: [...document.querySelectorAll('#zoneGrid .zone')].map(z => z.textContent.replace(/\\s+/g, ' ').trim()),
            live: document.getElementById('routeLive').textContent,
            meta: document.getElementById('routeMeta').textContent.replace(/\\s+/g, ' ').trim(),
            sum: document.querySelector('#rwisSummary .sum-main .big').textContent.replace(/\\s+/g, ' ').trim(),
            grp: (document.querySelector('#pointList .pgroup') || {}).textContent || '',
            hdr: [...document.querySelectorAll('#routeMap .hdr text')].map(t => t.textContent.trim()),
            alt: (() => {
              const el = document.querySelector('#zoneGrid .zalt');
              if (!el) return null;
              const cs = getComputedStyle(el);
              const m = cs.color.match(/\\d+/g).map(Number);
              return { text: el.textContent.trim(), color: m, dot: !!el.querySelector('.adot'), fs: parseFloat(cs.fontSize) };
            })(),
          };
        }""")
        check("v8 기본 방향 탭 = 양방향", v8["dirBoth"] == "true" and v8["dirE"] == "false"
              and set(v8["segs"]) == {"E", "S"} and all("양방향" in c for c in v8["cards"]),
              f"both={v8['dirBoth']} · 카드 {v8['cards'][:1]}")
        check("v8 지도 헤더가 패널 헤더와 중복되지 않음 (큰 제목 제거)",
              len(v8["hdr"]) == 2 and not any("현황" in h for h in v8["hdr"]), str(v8["hdr"]))

        page.click('#routeDir [data-rd="E"]')
        page.wait_for_timeout(500)
        east = page.evaluate("""() => ({
          segs: [...new Set([...document.querySelectorAll('#routeMap path.seg[data-seg]')].map(s => s.dataset.dir))],
          cards: [...document.querySelectorAll('#zoneGrid .zone')].map(z => z.textContent.replace(/\\s+/g, ' ').trim()),
          live: document.getElementById('routeLive').textContent,
          meta: document.getElementById('routeMeta').textContent.replace(/\\s+/g, ' ').trim(),
          sum: document.querySelector('#rwisSummary .sum-main .big').textContent.replace(/\\s+/g, ' ').trim(),
          sumBasis: document.querySelector('#rwisSummary .sum-time .dist').textContent.replace(/\\s+/g, ' ').trim(),
          grp: [...document.querySelectorAll('#pointList .pgroup .pg-lv')].map(n => n.textContent.trim()),
          tabsActive: [...document.querySelectorAll('#routeDir button')].filter(b => b.classList.contains('on')).map(b => b.textContent.trim()),
        })""")
        check("v8 '대구' 선택 — 지도·카드·요약·목록이 모두 대구 기준",
              east["segs"] == ["E"] and all("대구" in c and "양방향" not in c for c in east["cards"])
              and "대구방향 최고" in east["sum"] and "대구방향" in east["meta"]
              and all("대구" in g for g in east["grp"]) and east["tabsActive"] == ["대구 ↑"],
              f"{east['segs']} · {east['cards'][:2]} · {east['sum']}")
        check("v8 방향 선택 시 상단 요약 문구까지 일치",
              "대구방향(상행)" in east["live"] and "대구방향" in east["meta"] and "대구방향" in east["sumBasis"],
              f"{east['live']} · {east['sumBasis']}")

        page.click('#routeDir [data-rd="S"]')
        page.wait_for_timeout(450)
        south = page.evaluate("""() => ({
          segs: [...new Set([...document.querySelectorAll('#routeMap path.seg[data-seg]')].map(s => s.dataset.dir))],
          cards: [...document.querySelectorAll('#zoneGrid .zone')].map(z => z.textContent.replace(/\\s+/g, ' ').trim()),
          live: document.getElementById('routeLive').textContent,
        })""")
        check("v8 '광주' 선택 — 광주 기준으로 전환",
              south["segs"] == ["S"] and all("광주" in c and "대구" not in c for c in south["cards"])
              and "광주방향(하행)" in south["live"],
              f"{south['segs']} · {south['cards'][:1]}")
        page.click('#routeDir [data-rd="both"]')
        page.wait_for_timeout(400)

        check("v8 보조 지표(가시거리 주의) 앰버 톤 + 점",
              v8["alt"] is not None and v8["alt"]["color"][0] > 190 and v8["alt"]["color"][2] < 140
              and v8["alt"]["dot"] and v8["alt"]["fs"] >= 10,
              str(v8["alt"]))

        # 리포트 — CCTV 열이 주요 거점 + 영상 상태, 분포 문구 확대
        rep8 = page.evaluate("() => window.__gdc.reportSvg()")
        check("v9 리포트 CCTV 열 = 주요 거점 + 등록 대수",
              "CCTV · 등록" in rep8 and "지점" in rep8 and "등록 CCTV" in rep8 and "영상 연결" not in rep8
              and any(name in rep8 for name in ("함양산삼골휴게소", "함양·지곡", "거창·살피재TN")),
              "CCTV 열 확인")
        check("v8 리포트 8구간 분포 문구 확대", "8구간 분포" in rep8 and 'font-size="18"' in rep8 and 'font-size="20"' in rep8,
              "폰트 18/20 확인")

        # 모바일 — 하단 탭 숫자 제거 · 고령JC 여백
        mob8 = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        mpg8 = mob8.new_page()
        mpg8.goto(f"{base}/index.html", wait_until="load", timeout=40000)
        mpg8.wait_for_timeout(700)
        m8 = mpg8.evaluate("""() => {
          const svg = document.querySelector('#routeMap');
          const w = svg.viewBox.baseVal.width;
          const jc = [...document.querySelectorAll('#routeMap .node')].find(n => n.querySelector('.lbl').textContent === '고령JC');
          const pill = jc.querySelector('.label-pill').getBBox();
          const ic = [...document.querySelectorAll('#routeMap .node')].find(n => n.querySelector('.lbl').textContent === '함양IC');
          const hjc = [...document.querySelectorAll('#routeMap .node')].find(n => n.querySelector('.lbl').textContent === '함양JC');
          const hjcPill = hjc.querySelector('.label-pill').getBBox();
          const hjcCss = hjc.querySelector('.label-pill').getBoundingClientRect();
          const footTop = document.querySelector('#routeMap .ftr').getBoundingClientRect().y;
          const icGlyph = ic.querySelector('.glyph').getBBox();
          return {
            dock: document.getElementById('dockBar').textContent.replace(/\\s+/g, ' ').trim(),
            right: Math.round(w - (pill.x + pill.width)),
            hamGap: Math.round(hjcPill.x - (icGlyph.x + icGlyph.width)),
            legendGap: Math.round(footTop - hjcCss.bottom),
            alt: (() => { const el = document.querySelector('#zoneGrid .zalt'); return el ? el.textContent.trim() : null; })(),
          };
        }""")
        check("v8 모바일 하단 탭 CCTV 숫자 제거", "CCTV" in m8["dock"] and "62" not in m8["dock"], m8["dock"])
        check("v8 모바일 고령JC 오른쪽 여백 확보", m8["right"] >= 20, f"오른쪽 여백 {m8['right']}")
        check("v8 함양JC 말풍선이 시점 마커를 덮지 않음", m8["hamGap"] >= 30, f"시점 마커와 {m8['hamGap']}px")
        check("v9 모바일 세로(390) 함양JC 라벨 아래 범례 여백", m8["legendGap"] >= 16, f"범례까지 {m8['legendGap']}px")
        # 더 작은 세로 화면(360×640)에서도 범례에 닿지 않는지
        mpg8.set_viewport_size({"width": 360, "height": 640})
        mpg8.wait_for_timeout(600)
        m8b = mpg8.evaluate("""() => {
          const hjc = [...document.querySelectorAll('#routeMap .node')].find(n => n.querySelector('.lbl').textContent === '함양JC');
          const pill = hjc.querySelector('.label-pill').getBoundingClientRect();
          const foot = document.querySelector('#routeMap .ftr').getBoundingClientRect();
          return { gap: Math.round(foot.y - pill.bottom) };
        }""")
        check("v9 모바일 세로(360×640) 함양JC 라벨 아래 범례 여백", m8b["gap"] >= 16, f"범례까지 {m8b['gap']}px")
        mob8.close()

        print("\n[16] v9 — 셰브런 대칭 · 등록 CCTV · 인근 CCTV 버튼감")
        page.click('#routeDir [data-rd="both"]')
        page.wait_for_timeout(450)
        v9 = page.evaluate("""() => {
          const paths = [...document.querySelectorAll('#routeMap .chevrons path')];
          const arms = paths.map(p => {
            const m = (p.getAttribute('d') || '').match(/M([-0-9.]+) ([-0-9.]+)L([-0-9.]+) ([-0-9.]+)L([-0-9.]+) ([-0-9.]+)/);
            if (!m) return null;
            const [x1, y1, x2, y2, x3, y3] = m.slice(1).map(Number);
            const a = Math.hypot(x2 - x1, y2 - y1);
            const b = Math.hypot(x2 - x3, y2 - y3);
            return { ratio: Math.max(a, b) / Math.min(a, b), span: Math.hypot(x3 - x1, y3 - y1) };
          }).filter(Boolean);
          const btn = document.querySelector('#zoneGrid .zcctv');
          const cs = btn ? getComputedStyle(btn) : null;
          return {
            n: arms.length,
            maxRatio: Math.max(...arms.map(a => a.ratio)),
            span: Math.min(...arms.map(a => a.span)),
            btn: btn ? {
              border: parseFloat(cs.borderTopWidth), bg: cs.backgroundColor, radius: cs.borderRadius,
              chev: !!btn.querySelector('.zchev'), title: btn.getAttribute('aria-label') || '',
            } : null,
          };
        }""")
        check("v9 셰브런 두 팔 길이 대칭 (급커브 ㄱ·w 접힘 제거)", v9["n"] >= 8 and v9["maxRatio"] <= 1.06 and v9["span"] > 0,
              f"{v9['n']}개 · 두 팔 비율 최대 {round(v9['maxRatio'], 3)}")
        check("v9 인근 CCTV 버튼감 (테두리·배경·둥근 모서리·›)",
              bool(v9["btn"]) and v9["btn"]["border"] >= 1
              and v9["btn"]["bg"] not in ("rgba(0, 0, 0, 0)", "transparent")
              and v9["btn"]["radius"] not in ("0px", "")
              and v9["btn"]["chev"] and "인근 CCTV" in v9["btn"]["title"],
              str(v9["btn"]))
        rep9 = page.evaluate("() => window.__gdc.reportSvg()")
        check("v9 리포트 표는 '등록 CCTV' 기준 (실시간 송출 오해 제거)",
              "CCTV · 등록" in rep9 and "등록 CCTV ·" in rep9 and "영상 연결" not in rep9,
              "등록 CCTV 표기 확인")

        print("\n[17] v11 — 데스크톱 카드 '인근 CCTV ›' 우측 여백 · 이정 단위 접기")
        for vw in (1024, 1280, 1440):
            page.set_viewport_size({"width": vw, "height": 900})
            page.wait_for_timeout(320)
            v11 = page.evaluate("""() => {
              const gcs = (e) => getComputedStyle(e);
              const rows = [...document.querySelectorAll('#zoneGrid .zone')].map(c => {
                const cr = c.getBoundingClientRect();
                const st = gcs(c);
                const inner = cr.right - parseFloat(st.paddingRight) - parseFloat(st.borderRightWidth);
                const btn = c.querySelector('.zcctv');
                const chev = c.querySelector('.zchev');
                const unit = c.querySelector('.zk-u');
                const meta = c.querySelector('.zmeta');
                const b = btn && btn.getBoundingClientRect();
                const v = chev && chev.getBoundingClientRect();
                return {
                  name: (c.querySelector('.zh strong') || {}).textContent || '',
                  cardW: +cr.width.toFixed(1),
                  btnRight: b ? +(inner - b.right).toFixed(1) : null,
                  chevRight: v ? +(inner - v.right).toFixed(1) : null,
                  metaOvf: meta ? meta.scrollWidth - meta.clientWidth : 0,
                  unitHidden: unit ? gcs(unit).display === 'none' : null,
                  chevShown: chev ? gcs(chev).display !== 'none' && v.width > 0.5 : false,
                  titleHasKm: /km/.test(c.getAttribute('title') || ''),
                };
              });
              return rows;
            }""")
            btns = [r for r in v11 if r["btnRight"] is not None]
            gaps = [r["btnRight"] for r in btns]
            check(f"v11 {vw}px 모든 구간 카드에서 '인근 CCTV ›'가 카드 안 여백을 두고 들어감",
                  bool(btns) and min(gaps) >= 1 and not [r for r in v11 if r["metaOvf"] > 0],
                  f"최소 우측 여백 {min(gaps) if gaps else '-'}px · 카드 {len(v11)}개 · 넘침 "
                  f"{[r['name'] for r in v11 if r['metaOvf'] > 0]}")
            longest = [r for r in v11 if r["name"] in ("고령JC ↔ 옥포JC", "고령IC ↔ 동고령IC")]
            check(f"v11 {vw}px 이정이 가장 긴 두 카드도 버튼·› 잘림 없음",
                  len(longest) == 2 and all(r["btnRight"] >= 1 and (r["chevRight"] is None or r["chevRight"] >= 1)
                                            for r in longest),
                  " · ".join(f"{r['name']} 여백 {r['btnRight']}px" for r in longest))
            check(f"v11 {vw}px '인근 CCTV' 버튼의 › 가 접히지 않고 보임",
                  bool(btns) and all(r["chevShown"] for r in btns),
                  f"› 보임 {sum(1 for r in btns if r['chevShown'])}/{len(btns)}")
            check(f"v11 {vw}px 카드에서는 이정 단위 km를 접고 툴팁에는 남김",
                  all(r["unitHidden"] for r in v11) and all(r["titleHasKm"] for r in v11),
                  f"단위 숨김 {sum(bool(r['unitHidden']) for r in v11)}/{len(v11)}")
        page.set_viewport_size({"width": 1280, "height": 900})
        page.wait_for_timeout(250)

        page.screenshot(path=str(ROOT.parent / "downloads" / "gwangju_daegu_v7_desktop.png"), full_page=False)
        # 화면 3장(데스크톱·세로·가로)은 tests/test_dashboard_visual.py 가 따로 찍는다
        # (오래 산 브라우저에서 새 컨텍스트를 여는 것이 이 환경에서 멈추기 때문)

        check("v4 가로/세로 콘솔 에러 0건", not (l4_errors + p4_errors), "; ".join((l4_errors + p4_errors)[:3]))

        desktop_errors = [e for e in console_errors if "Failed to load resource" not in e]
        check("데스크톱 콘솔 에러 0건", not desktop_errors, "; ".join(desktop_errors[:3]))
        check("JS 예외(pageerror) 0건", not page_errors, "; ".join(page_errors[:3]))

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

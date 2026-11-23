#!/usr/bin/env python3
"""10종 해상도 + 라이브 스크린샷 검증 (별도 프로세스).

오래 산 브라우저가 뷰포트 전환에서 멈추는 환경이 있어, 이 파일은 자체 Playwright 로
새 브라우저를 띄워 해상도별 한 화면·라벨 순서·겹침을 확인하고, 실시간 연결 화면 3장
(데스크톱·세로·가로)을 저장한다.

    python3 tests/test_dashboard_visual.py
"""
from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tests"))

from playwright.sync_api import sync_playwright  # noqa: E402

import serve  # noqa: E402

RESULTS: list[tuple[str, bool, str]] = []
SIZES = [(360, 640), (390, 844), (412, 915), (430, 932), (768, 1024),
         (844, 390), (915, 412), (932, 430), (1024, 768), (1280, 800)]

MEASURE = """() => {
  const doc = document.documentElement;
  const box = (name) => {
    const t = [...document.querySelectorAll('#routeMap .lbl')].find(x => x.textContent === name);
    if (!t) return null;
    const b = t.getBBox(); return Math.round(b.x);
  };
  const svg = document.querySelector('#routeMap');
  if (!svg) return null;
  const vb = svg.getAttribute('viewBox').split(' ').map(Number);
  const regions = [...document.querySelectorAll('#routeMap .region')].map(t => {
    const b = t.getBBox(); return { name: t.textContent, x: b.x, right: b.x + b.width };
  });
  const pills = [...document.querySelectorAll('#routeMap .label-pill')].map(r => { const b = r.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const glyphs = [...document.querySelectorAll('#routeMap .glyph')].map(r => { const b = r.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  let pg = 0;
  for (const p of pills) for (const g of glyphs) {
    if (Math.min(p.x + p.w, g.x + g.w) - Math.max(p.x, g.x) > 0 && Math.min(p.y + p.h, g.y + g.h) - Math.max(p.y, g.y) > 0) pg += 1;
  }
  return {
    pageW: doc.scrollWidth, innerW: window.innerWidth,
    pageH: doc.scrollHeight, innerH: window.innerHeight,
    dong: box('동고령IC'), goryeong: box('고령JC'),
    outside: regions.filter(r => r.x < 2 || r.right > vb[2] - 2).map(r => r.name),
    labels: document.querySelectorAll('#routeMap .lbl').length,
    pg,
  };
}"""

SMALL = """() => {
  const doc = document.documentElement;
  const vh = window.innerHeight;
  const band = document.getElementById('zoneGrid');
  const bandBox = band.getBoundingClientRect();
  const dockTop = document.getElementById('dockBar').getBoundingClientRect().top;
  const inBox = (b, o) => b.top >= o.top - 0.5 && b.bottom <= o.bottom + 0.5
                        && b.left >= o.left - 0.5 && b.right <= o.right + 0.5;
  const bad = [];
  const cards = [...band.querySelectorAll('.zone')];
  for (const z of cards) {
    const zb = z.getBoundingClientRect();
    const name = (z.querySelector('.zh strong') || {}).textContent || '?';
    for (const sel of ['.zh strong', '.ztags', '.zmeta', '.zcctv']) {
      const e = z.querySelector(sel);
      if (!e) continue;
      const b = e.getBoundingClientRect();
      const why = [];
      if (b.height < 1) why.push('높이 0');
      if (!inBox(b, zb)) why.push('카드 밖');
      if (b.top < 0 || b.bottom > vh) why.push('화면 밖');
      if (e.scrollWidth > e.clientWidth + 1) why.push('가로 잘림');
      if (why.length) bad.push(`${name} ${sel}: ${why.join('·')}`);
    }
  }
  return {
    pageW: doc.scrollWidth, pageH: doc.scrollHeight,
    bandScrollH: band.scrollHeight, bandClientH: band.clientHeight,
    bandOverflow: getComputedStyle(band).overflowY,
    bandBottom: Math.round(bandBox.bottom), dockTop: Math.round(dockTop),
    cards: cards.length, bad,
  };
}"""


def check(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append((name, bool(ok), detail))
    print(("  ✔ " if ok else "  ✘ ") + name + (f"  — {detail}" if detail else ""))


def connect_any(pw, base: str) -> None:
    """설정 팝오버를 열어 Worker 주소를 넣고 연결한다."""
    if pw.evaluate("() => document.getElementById('settingsPanel').hidden"):
        immersive = pw.evaluate("() => document.body.classList.contains('immersive')")
        pw.click("#railSettings" if immersive else "#btnSettings")
    pw.fill("#workerUrl", base)
    pw.click("#btnConnect")


def main() -> int:
    httpd, port = serve.serve(0)
    base = f"http://127.0.0.1:{port}"
    print(f"테스트 서버: {base}")

    with sync_playwright() as pw:
        print("\n[V1] 10종 해상도 — 한 화면 · 지리 순서 · 라벨 겹침")
        for vw, vh in SIZES:
            browser = pw.chromium.launch()
            mob = vw < 1024
            ctx = browser.new_context(viewport={"width": vw, "height": vh}, is_mobile=mob, has_touch=mob)
            page = ctx.new_page()
            try:
                page.goto(f"{base}/index.html", wait_until="load", timeout=40000)
                page.wait_for_timeout(450)
                info = page.evaluate(MEASURE) or {}
            except Exception as err:  # noqa: BLE001
                info = {"error": str(err)[:160], "pageW": -1, "pageH": -1, "innerW": vw, "innerH": vh,
                        "dong": None, "goryeong": None, "outside": ["?"], "labels": 0, "pg": -1}
            finally:
                ctx.close()
                browser.close()
            label = f"{vw}×{vh}"
            check(f"{label} 한 화면(스크롤 없음)",
                  info.get("pageW", -1) <= info.get("innerW", 0) + 1 and info.get("pageH", -1) <= info.get("innerH", 0) + 1,
                  f"{info.get('pageW')}×{info.get('pageH')} / {info.get('innerW')}×{info.get('innerH')}"
                  + (f" · {info['error']}" if info.get("error") else ""))
            check(f"{label} 동고령IC가 고령JC 왼쪽 · 도명 잘림 없음",
                  info.get("dong") is not None and info.get("goryeong") is not None
                  and info["dong"] < info["goryeong"] and not info.get("outside") and info.get("labels") == 13,
                  f"동고령 {info.get('dong')} < 고령JC {info.get('goryeong')} · 도명 {info.get('outside')} · 라벨 {info.get('labels')}")
            check(f"{label} 라벨·아이콘 겹침 없음", info.get("pg") == 0, f"겹침 {info.get('pg')}쌍")

        print("\n[V2] 실시간 연결 스크린샷 3장 (데스크톱·세로·가로)")
        dl = ROOT.parent / "downloads"
        dl.mkdir(parents=True, exist_ok=True)
        for name, vw, vh, mob in (
            ("gwangju_daegu_v4_desktop", 1280, 800, False),
            ("gwangju_daegu_v4_mobile_portrait", 390, 844, True),
            ("gwangju_daegu_v4_mobile_landscape", 844, 390, True),
        ):
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport={"width": vw, "height": vh},
                                      device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
            page = ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(f"{base}/index.html", wait_until="load", timeout=40000)
            connect_any(page, base)
            try:
                page.wait_for_function("() => ['live','error'].includes(document.getElementById('modePill').dataset.state)", timeout=90000)
            except Exception:  # noqa: BLE001
                pass
            page.wait_for_timeout(700)
            out = dl / f"{name}.png"
            page.screenshot(path=str(out), full_page=False)
            pill = page.evaluate("() => document.getElementById('modeText').textContent")
            check(f"{name}.png 저장", out.exists() and out.stat().st_size > 20000,
                  f"{out.stat().st_size:,}bytes · {pill}")
            check(f"{name} 콘솔 에러 0건", not errors, "; ".join(errors[:2]))
            ctx.close()
            browser.close()

        print("\n[V3] v10 — 삼성 브라우저식 좁은 세로: 카드 잘림·스크롤 없음")
        for vw, vh, shot in ((390, 680, "v9_fix_mobile_680"), (360, 640, "v9_fix_mobile_640"),
                             (390, 700, "v9_fix_mobile_700"), (360, 600, "v9_fix_mobile_600")):
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=2,
                                      is_mobile=True, has_touch=True)
            page = ctx.new_page()
            page.goto(f"{base}/index.html", wait_until="load", timeout=40000)
            page.wait_for_timeout(900)
            info = page.evaluate(SMALL) or {}
            label = f"{vw}×{vh}"
            check(f"v10 {label} 페이지 스크롤 없음(100dvh)",
                  info.get("pageW", 10 ** 6) <= vw + 1 and info.get("pageH", 10 ** 6) <= vh + 1,
                  f"{info.get('pageW')}×{info.get('pageH')} / {vw}×{vh}")
            check(f"v10 {label} 구간 영역 안쪽 스크롤 없음",
                  info.get("bandScrollH", 1) <= info.get("bandClientH", 0) + 1,
                  f"{info.get('bandScrollH')}/{info.get('bandClientH')} · overflow {info.get('bandOverflow')}")
            check(f"v10 {label} 8구간 카드·버튼이 잘리지 않고 화면 안", not info.get("bad"),
                  f"카드 {info.get('cards')}개 · {info.get('bad')}")
            check(f"v10 {label} 카드가 하단 독을 침범하지 않음",
                  info.get("bandBottom", 10 ** 6) <= info.get("dockTop", 0) + 1,
                  f"카드하단 {info.get('bandBottom')} ≤ 독 {info.get('dockTop')}")
            page.screenshot(path=str(dl / f"{shot}.png"), full_page=False)
            check(f"v10 {shot}.png 저장", (dl / f"{shot}.png").exists(), str(dl / f"{shot}.png"))
            ctx.close()
            browser.close()

    httpd.shutdown()
    passed = sum(1 for _, ok, _ in RESULTS if ok)
    print(f"\n결과: {passed}/{len(RESULTS)} 통과")
    failed = [n for n, ok, _ in RESULTS if not ok]
    if failed:
        print("실패: " + ", ".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

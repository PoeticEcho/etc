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


# v11 — 모바일 상단 배지('… 전')와 지도 위 상·하행 화살표 분리도.
# 화살표는 SVG 경로라 화면 픽셀을 모르므로, 같은 구간의 반대 방향 화살표끼리
# ① 호 위 위치 간격 ② 촘촘히 샘플링한 점 사이 최소 거리를 재 둘 다 보고한다.
V11_MOBILE = """() => {
  const t = document.getElementById('modeText');
  const pill = document.getElementById('modePill');
  const topbar = document.getElementById('topbar');
  const svg = document.querySelector('#routeMap');
  const vb = (svg.getAttribute('viewBox') || '0 0 1 1').split(' ').map(Number);
  const scale = svg.getBoundingClientRect().width / vb[2];
  const paths = [...document.querySelectorAll('#routeMap .chevrons path')];
  const info = paths.map((p) => {
    const L = p.getTotalLength();
    const pts = [];
    for (let i = 0; i <= 24; i += 1) { const q = p.getPointAtLength(L * i / 24); pts.push([q.x, q.y]); }
    return { seg: p.dataset.seg, dir: p.dataset.dir, s: +p.dataset.s, size: +p.dataset.size, pts };
  });
  let pairs = 0, minArc = 1e9, minPx = 1e9, minArcRatio = 1e9, worst = null;
  for (let i = 0; i < info.length; i += 1) {
    for (let j = i + 1; j < info.length; j += 1) {
      const a = info[i], b = info[j];
      if (a.seg !== b.seg || a.dir === b.dir) continue;
      pairs += 1;
      let m = 1e9;
      for (const p of a.pts) for (const q of b.pts) m = Math.min(m, Math.hypot(p[0] - q[0], p[1] - q[1]));
      const arc = Math.abs(a.s - b.s);
      const box = Math.min(a.size, b.size);
      minArc = Math.min(minArc, arc);
      minArcRatio = Math.min(minArcRatio, arc / box);
      minPx = Math.min(minPx, m * scale);
      if (!worst || m * scale < worst.px) worst = { seg: a.seg, px: +(m * scale).toFixed(1), arc: +arc.toFixed(1) };
    }
  }
  return {
    badge: t.textContent.trim(),
    textOvf: t.scrollWidth - t.clientWidth,
    pillOvf: pill.scrollWidth - pill.clientWidth,
    headerOvf: topbar.scrollWidth - topbar.clientWidth,
    paths: paths.length, pairs,
    minArc: +minArc.toFixed(1), minArcRatio: +minArcRatio.toFixed(2), minPx: +minPx.toFixed(1), worst,
  };
}"""


# v12 — 상향 시나리오: 지금 스냅샷의 1단계 이상 구간을 한 단계씩 낮춘 값을 '직전 관측'으로 심는다.
# 그래야 관측값이 어떻게 바뀌든(배포마다 5분 단위로 갱신) 상향 ▲ 표식이 최소 1개는 생긴다.
SEED_PREV = """() => {
  const levels = window.__gdc.levels();
  const prev = {};
  for (const k of Object.keys(levels)) prev[k] = Math.max(0, levels[k] - 1);
  return prev;
}"""

# v12 — ▲ 표식이 도로선·아이콘·말풍선·서로와 얼마나 떨어져 앉았는지 화면 픽셀로 잰다.
V12_RISE = """() => {
  const svg = document.querySelector('#routeMap');
  const cm = svg.getScreenCTM();
  const toScreen = (p) => ({ x: p.x * cm.a + p.y * cm.c + cm.e, y: p.x * cm.b + p.y * cm.d + cm.f });
  const marks = [...document.querySelectorAll('#routeMap .rise-mark rect')].map((r) => {
    const b = r.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  const roads = [];
  for (const p of document.querySelectorAll('#routeMap .route-lines path')) {
    const L = p.getTotalLength(); const sw = +p.getAttribute('stroke-width');
    for (let i = 0; i <= 120; i += 1) { const q = p.getPointAtLength(L * i / 120); roads.push({ ...toScreen(q), r: sw / 2 }); }
  }
  const glyphs = [...document.querySelectorAll('#routeMap .node .glyph')].map((g) => {
    const b = g.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  const pills = [...document.querySelectorAll('#routeMap .label-pill')].map((g) => {
    const b = g.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  const dist = (b, p) => Math.hypot(Math.max(b.x - p.x, 0, p.x - (b.x + b.w)), Math.max(b.y - p.y, 0, p.y - (b.y + b.h)));
  const inter = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const interY = (a, b) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  let roadGap = 1e9, pillHits = 0, glyphHits = 0, pairGap = 1e9;
  for (let i = 0; i < marks.length; i += 1) {
    const m = marks[i];
    for (const p of roads) roadGap = Math.min(roadGap, dist(m, p) - p.r);
    for (const g of pills) if (inter(m, g) > 0 && interY(m, g) > 0) pillHits += 1;
    /* 아이콘은 다이아몬드·터널 모양이라 모서리 1~2px 스침은 눈에 띄지 않는다 — 3px 넘는 겹침만 센다 */
    for (const g of glyphs) if (inter(m, g) > 3 && interY(m, g) > 3) glyphHits += 1;
    for (let j = i + 1; j < marks.length; j += 1) {
      const n = marks[j];
      pairGap = Math.min(pairGap, Math.hypot(Math.max(m.x - (n.x + n.w), 0, n.x - (m.x + m.w)),
                                             Math.max(m.y - (n.y + n.h), 0, n.y - (m.y + m.h))));
    }
  }
  const rising = [...document.querySelectorAll('#zoneGrid .zone[data-rise="1"]')];
  const t = document.getElementById('modeText');
  const pill = document.getElementById('modePill');
  const st = window.__gdc.state;
  const when = new Date(Date.now() - 11 * 60000);
  const pad = (v) => String(v).padStart(2, '0');
  const tm = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}${pad(when.getHours())}${pad(when.getMinutes())}`;
  const liveShort = (() => {
    const keep = st.rwis; const mode = st.mode;
    st.rwis = Object.assign({}, keep, { preview: false, sample: false, tm: { FR: tm, VR: tm }, tmLabel: { FR: keep.tmLabel ? keep.tmLabel.FR : '', VR: '' } });
    st.mode = 'live';
    const out = window.__gdc.freshness();
    st.rwis = keep; st.mode = mode;
    return out.short;
  })();
  return {
    marks: marks.length, rising: rising.length,
    perCard: rising.map((z) => (z.querySelectorAll('.zh .zrise').length) + ':' + (z.querySelectorAll('.ztags em.rup').length)),
    zrise: document.querySelectorAll('#zoneGrid .zrise').length,
    rup: document.querySelectorAll('#zoneGrid .rup').length,
    roadGap: +roadGap.toFixed(1), pillHits, glyphHits, pairGap: +pairGap.toFixed(1),
    badge: t.textContent.trim(), liveShort,
    pageH: document.documentElement.scrollHeight, innerH: window.innerHeight,
    textOvf: t.scrollWidth - t.clientWidth, pillOvf: pill.scrollWidth - pill.clientWidth,
  };
}"""

# v12 — 최상단 배지 문구('● 실시간 11분 전')를 그 폭에서 그대로 넣어 넘침·스크롤을 잰다
V12_BADGE = """() => {
  const t = document.getElementById('modeText');
  const pill = document.getElementById('modePill');
  const keep = t.textContent;
  t.textContent = '실시간 11분 전';
  const out = {
    textOvf: t.scrollWidth - t.clientWidth,
    pillOvf: pill.scrollWidth - pill.clientWidth,
    headerOvf: document.getElementById('topbar').scrollWidth - document.getElementById('topbar').clientWidth,
    pageH: document.documentElement.scrollHeight, innerH: window.innerHeight,
    pageW: document.documentElement.scrollWidth, innerW: window.innerWidth,
  };
  t.textContent = keep;
  return out;
}"""


V13_SWEEP = """() => {
  const roots = ['#zoneGrid', '#routeMeta', '#topbar', '#rwisSummary', '#routeSection .sec-head',
                 '.route-foot', '#rail', '#dockBar', '#captureBar', '#listSection .sec-head'];
  const trunc = [];
  for (const sel of roots) {
    const root = document.querySelector(sel);
    if (!root) continue;
    for (const e of root.querySelectorAll('*')) {
      if (e.children.length || e.offsetParent === null) continue;
      const txt = (e.textContent || '').trim();
      if (!txt) continue;
      const st = getComputedStyle(e);
      if (st.visibility === 'hidden' || st.display === 'none') continue;
      if (e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1) {
        trunc.push({ root: sel, cls: String(e.className || e.tagName), txt: txt.slice(0, 24), ovf: e.scrollWidth - e.clientWidth });
      }
    }
  }
  // 카드 안 요소끼리 겹침 / 카드 밖으로 나감
  const ov = [];
  for (const card of document.querySelectorAll('#zoneGrid .zone')) {
    const cr = card.getBoundingClientRect();
    const parts = [...card.querySelectorAll('.zh', '.ztags > div', '.zmeta, .badge, .zcctv, .zno')]
      .filter(e => e.offsetParent !== null)
      .map(e => [e, e.getBoundingClientRect(), String(e.className || '') + '|' + e.textContent.trim().slice(0, 14)]);
    for (let i = 0; i < parts.length; i += 1) {
      const [ea, a, na] = parts[i];
      if (parts[i][1].left < cr.left - 0.5 || a.right > cr.right + 0.5 || a.top < cr.top - 0.5 || a.bottom > cr.bottom + 0.5) {
        ov.push({ card: card.dataset.segment, a: na, b: 'OUT', dx: +(a.right - cr.right).toFixed(1), dy: +(a.bottom - cr.bottom).toFixed(1) });
      }
      for (let j = i + 1; j < parts.length; j += 1) {
        const [eb, b, nb] = parts[j];
        if (ea.contains(eb) || eb.contains(ea)) continue;
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 2 && y > 2) ov.push({ card: card.dataset.segment, a: na, b: nb, dx: +x.toFixed(1), dy: +y.toFixed(1) });
      }
    }
  }
  return {
    trunc, ov,
    kmOvf: [...document.querySelectorAll('#zoneGrid .zkm')].filter(e => e.offsetParent).map(e => e.scrollWidth - e.clientWidth),
    pageH: document.documentElement.scrollHeight, innerH: window.innerHeight,
    pageW: document.documentElement.scrollWidth, innerW: window.innerWidth,
    cards: document.querySelectorAll('#zoneGrid .zone').length,
    rail: [...document.querySelectorAll('#rail button')].map(b => [(b.textContent || '').trim(), Math.round(b.getBoundingClientRect().height)]),
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

        print("\n[V4] v11 — 모바일 배지 '… 전' · 지도 화살표 상·하행 분리")
        for vw, vh in ((390, 680), (360, 640)):
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=2,
                                      is_mobile=True, has_touch=True)
            page = ctx.new_page()
            page.goto(f"{base}/index.html", wait_until="load", timeout=40000)
            page.wait_for_timeout(900)
            info = page.evaluate(V11_MOBILE) or {}
            label = f"{vw}×{vh}"
            badge = info.get("badge", "")
            import re
            check(f"v11 {label} 상단 배지가 경과를 '… 전'으로 표기",
                  bool(re.fullmatch(r"스냅샷 (방금|\d+분 전|\d+시간 전|\d+일 전)", badge)),
                  f"배지 '{badge}'")
            check(f"v11 {label} 배지·헤더가 말줄임·넘칩니다",
                  info.get("textOvf", 1) <= 0 and info.get("pillOvf", 1) <= 0 and info.get("headerOvf", 1) <= 0,
                  f"텍스트 {info.get('textOvf')} · 배지 {info.get('pillOvf')} · 헤더 {info.get('headerOvf')}px")
            check(f"v11 {label} 상·하행 화살표가 같은 자리에 겹치지 않음",
                  info.get("pairs", 0) >= 8 and info.get("minArcRatio", 0) >= 2.5 and info.get("minPx", 0) >= 3.0,
                  f"쌍 {info.get('pairs')} · 최소 호 간격 {info.get('minArc')}(화살 크기의 "
                  f"{info.get('minArcRatio')}배) · 최소 화면 거리 {info.get('minPx')}px · {info.get('worst')}")
            ctx.close()
            browser.close()

        print("\n[V5] v12 — 카드 ▲ 한 곳 · 지도 ▲ 여백 · 최상단 '… 전' 배지")
        for vw, vh, shot in ((390, 680, "v12_live_390x680"), (360, 640, "v12_live_360x640"),
                             (1280, 800, "v12_smoke_desktop")):
            is_mob = vw < 1024
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport={"width": vw, "height": vh},
                                      device_scale_factor=2 if is_mob else 1,
                                      is_mobile=is_mob, has_touch=is_mob)
            page = ctx.new_page()
            page.goto(f"{base}/index.html", wait_until="load", timeout=40000)
            page.wait_for_function("() => ['snapshot', 'live'].includes(window.__gdc.state.mode)", timeout=40000)
            prev = page.evaluate(SEED_PREV)
            page.evaluate("(p) => localStorage.setItem('gdc.prevLevels', JSON.stringify({ tm: 'seed', levels: p }))", prev)
            page.reload(wait_until="load")
            page.wait_for_function("() => ['snapshot', 'live'].includes(window.__gdc.state.mode)", timeout=40000)
            page.wait_for_timeout(900)
            info = page.evaluate(V12_RISE) or {}
            label = f"{vw}×{vh}"
            check(f"v12 {label} 상향 시나리오 성립(구간마다 ▲ 표식 하나)",
                  info.get("rising", 0) > 0 and info.get("marks", 0) == info.get("rising", 0),
                  f"상향 카드 {info.get('rising')} · 지도 표식 {info.get('marks')}")
            check(f"v12 {label} 구간 카드 ▲ 는 카드당 제목 줄 한 곳뿐",
                  all(p == "1:0" for p in info.get("perCard") or ["x"])
                  and info.get("zrise") == info.get("rising") and info.get("rup") == 0,
                  f"카드별 '제목:등급줄' {info.get('perCard')} · zrise {info.get('zrise')} · 등급줄 사본 {info.get('rup')}")
            check(f"v12 {label} 지도 ▲ 가 말풍선·아이콘과 겹치지 않음",
                  info.get("pillHits") == 0 and info.get("glyphHits") == 0,
                  f"말풍선 겹침 {info.get('pillHits')} · 아이콘 겹침 {info.get('glyphHits')}")
            check(f"v12 {label} 지도 ▲ 가 도로선 위에 얹히지 않고 ▲ 끼리 떨어짐",
                  info.get("roadGap", -99) >= -2 and info.get("pairGap", 0) >= 2,
                  f"도로선 여백 {info.get('roadGap')}px · ▲ 사이 {info.get('pairGap')}px")
            import re
            short = info.get("liveShort") or ""
            mins = re.fullmatch(r"실시간 (\d+)분 전", short)
            check(f"v12 {label} 최상단 배지가 '실시간 … 전'으로 표기",
                  bool(mins) and 10 <= int(mins.group(1)) <= 12,
                  f"short '{short}' · 화면 '{info.get('badge')}'")
            badge = page.evaluate(V12_BADGE) or {}
            check(f"v12 {label} '실시간 11분 전' 배지·제목 넘침 0 · 노스크롤",
                  badge.get("textOvf", 1) <= 0 and badge.get("pillOvf", 1) <= 0 and badge.get("headerOvf", 1) <= 0
                  and badge.get("pageH", 10 ** 6) <= badge.get("innerH", 0) + 1
                  and badge.get("pageW", 10 ** 6) <= badge.get("innerW", 0) + 1,
                  f"텍스트 {badge.get('textOvf')} · 배지 {badge.get('pillOvf')} · 헤더 {badge.get('headerOvf')}px · "
                  f"{badge.get('pageW')}×{badge.get('pageH')} / {badge.get('innerW')}×{badge.get('innerH')}")
            page.evaluate("() => localStorage.removeItem('gdc.prevLevels')")
            page.screenshot(path=str(dl / f"{shot}.png"), full_page=False)
            check(f"v12 {shot}.png 저장", (dl / f"{shot}.png").exists(), str(dl / f"{shot}.png"))
            ctx.close()
            browser.close()

        print("\n[V6] v13 — 전 화면 글자 잘림 0 · 배지/요소 겹침 0 · 데스크톱 4열 이정 온전")
        for vw, vh, shot, live in ((1280, 800, "v13_smoke_desktop", True),
                                   (390, 680, "v13_live_390x680", True),
                                   (1024, 768, "v13_live_1024x768", False),
                                   (360, 640, "v13_live_360x640", False),
                                   (844, 390, "v13_live_844x390", False)):
            is_mob = vw < 1024
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport={"width": vw, "height": vh},
                                      device_scale_factor=2, is_mobile=is_mob, has_touch=is_mob)
            page = ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(f"{base}/index.html", wait_until="load", timeout=40000)
            if live:
                connect_any(page, base)
                try:
                    page.wait_for_function("() => ['live','error'].includes(document.getElementById('modePill').dataset.state)", timeout=90000)
                except Exception:  # noqa: BLE001
                    pass
            page.wait_for_function("() => ['snapshot', 'live', 'error'].includes(window.__gdc.state.mode)", timeout=40000)
            page.wait_for_timeout(900)
            info = page.evaluate(V13_SWEEP) or {}
            label = f"{vw}×{vh}"
            badge = page.evaluate("() => document.getElementById('modeText').textContent.trim()")
            check(f"v13 {label} 글자 잘림 0건(카드·요약·상단바·노선 요약)",
                  not info.get("trunc"),
                  f"모드 '{badge}' · 말줄임 " + ", ".join(f"{t['cls']}:{t['txt']}(+{t['ovf']})" for t in (info.get("trunc") or []))[:160])
            check(f"v13 {label} 구간 카드 안 요소 겹침·밖으로 남 0건",
                  not info.get("ov"),
                  ", ".join(f"{o['card']}:{o['a']}/{o['b']}" for o in (info.get("ov") or []))[:160])
            if vw >= 1024:
                check(f"v13 {label} 8개 카드 이정 끝자리까지 온전(말줄임 0)",
                      info.get("cards") == 8 and info.get("kmOvf") and max(info["kmOvf"]) <= 0,
                      f"카드 {info.get('cards')}개 · 최대 말줄임 {max(info.get('kmOvf') or [0])}px")
            else:
                check(f"v13 {label} 8구간 카드 이정 끝자리까지 온전(말줄임 0)",
                      info.get("cards") in (0, 8) and (not info.get("kmOvf") or max(info["kmOvf"]) <= 0),
                      f"카드 {info.get('cards')}개 · 말줄임 {info.get('kmOvf')}")
            check(f"v13 {label} 한 화면 · 가로 스크롤 없음",
                  info.get("pageH", 10 ** 6) <= info.get("innerH", 0) + 1
                  and info.get("pageW", 10 ** 6) <= info.get("innerW", 0) + 1,
                  f"{info.get('pageW')}×{info.get('pageH')} / {info.get('innerW')}×{info.get('innerH')}")
            if vw == 844:
                rail = info.get("rail") or []
                check("v13 844×390 가로 레일 9버튼이 2줄 라벨로 온전",
                      len(rail) == 9 and all(txt for txt, _ in rail) and all(h <= 62 for _, h in rail),
                      f"{rail}")
            check(f"v13 {label} 콘솔 예외 0건", not errors, "; ".join(errors[:2]))
            out = dl / f"{shot}.png"
            page.screenshot(path=str(out), full_page=False)
            check(f"v13 {shot}.png 저장", out.exists() and out.stat().st_size > 20000,
                  f"{out.stat().st_size:,}bytes")
            ctx.close()
            browser.close()

        print("\n[V7] v14 — 390×680·360×640 인접 구간 카드 · 'CCTV 없음' 배지 (스크롤 0·잘림 0)")
        for vw, vh, shot in ((390, 680, "v14_live_390x680"), (360, 640, "v14_live_360x640")):
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport={"width": vw, "height": vh},
                                      device_scale_factor=2, is_mobile=True, has_touch=True)
            page = ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(f"{base}/index.html", wait_until="load", timeout=40000)
            page.wait_for_function("() => !!window.__gdc", timeout=40000)
            page.wait_for_timeout(800)
            label = f"{vw}×{vh}"

            sweep = page.evaluate(V13_SWEEP) or {}
            tile = page.evaluate("""() => {
              const z = document.querySelector('#zoneGrid .zone[data-segment="220"]');
              if (!z) return null;
              const btn = z.querySelector('.zcctv');
              const meta = z.querySelector('.zmeta');
              const zb = z.getBoundingClientRect();
              const bb = btn ? btn.getBoundingClientRect() : null;
              return {
                nearonly: z.classList.contains('nearonly'),
                own: z.dataset.ownCams, near: z.dataset.nearCams, cams: z.dataset.cams,
                label: btn ? btn.textContent.trim() : null,
                btnInCard: bb ? (bb.left >= zb.left - 0.5 && bb.right <= zb.right + 0.5
                  && bb.top >= zb.top - 0.5 && bb.bottom <= zb.bottom + 0.5) : false,
                btnH: bb ? Math.round(bb.height) : 0,
                metaOvf: meta ? meta.scrollWidth - meta.clientWidth : 0,
              };
            }""")
            check(f"v14 {label} 220 카드에 '인근 CCTV' 버튼이 카드 안에 온전히",
                  bool(tile) and tile["nearonly"] and tile["own"] == "0" and tile["near"] == "6"
                  and tile["btnInCard"] and tile["btnH"] >= 16 and tile["metaOvf"] <= 0,
                  f"{tile}")
            check(f"v14 {label} 카드 글자 잘림·겹침·밖으로 남 0건",
                  not sweep.get("trunc") and not sweep.get("ov"),
                  f"말줄임 {len(sweep.get('trunc') or [])} · 겹침 {len(sweep.get('ov') or [])}")
            check(f"v14 {label} 노선도 화면 한 화면·가로 스크롤 없음",
                  sweep.get("pageH", 10 ** 6) <= sweep.get("innerH", 0) + 1
                  and sweep.get("pageW", 10 ** 6) <= sweep.get("innerW", 0) + 1,
                  f"{sweep.get('pageW')}×{sweep.get('pageH')} / {sweep.get('innerW')}×{sweep.get('innerH')}")

            page.click('#dockBar button[data-view="list"]')
            page.wait_for_timeout(350)
            page.click('#dirTabs button[data-dir="D"]')
            page.wait_for_timeout(350)
            rows = page.evaluate("""() => {
              const bad = [];
              let badgeOut = 0;
              for (const r of document.querySelectorAll('#pointList .point')) {
                const rb = r.getBoundingClientRect();
                for (const e of r.querySelectorAll('.pt-cams, .pt-nocam, .cam, .pt-near')) {
                  if (e.offsetParent === null) continue;
                  const b = e.getBoundingClientRect();
                  if (b.left < rb.left - 0.5 || b.right > rb.right + 0.5 || b.top < rb.top - 0.5 || b.bottom > rb.bottom + 0.5) {
                    bad.push((r.querySelector('h3') || {}).textContent + ':' + String(e.className));
                  }
                  if (e.classList.contains('pt-nocam') && e.scrollWidth > e.clientWidth + 1) badgeOut += 1;
                }
              }
              const noCam = [...document.querySelectorAll('#pointList .point')].filter((r) => r.dataset.nocam === '1');
              return {
                count: document.getElementById('listCount').textContent,
                rows: document.querySelectorAll('#pointList .point').length,
                cams: document.querySelectorAll('#pointList .cam').length,
                badges: document.querySelectorAll('#pointList .pt-nocam').length,
                noCamNames: noCam.map((r) => r.querySelector('h3').textContent.trim()),
                badgeText: noCam.length && noCam[0].querySelector('.pt-nocam') ? noCam[0].querySelector('.pt-nocam').textContent.trim() : null,
                bad, badgeOut,
                pageH: document.documentElement.scrollHeight, innerH: window.innerHeight,
                pageW: document.documentElement.scrollWidth, innerW: window.innerWidth,
                listScrolls: (() => { const s = document.querySelector('.list-scroll'); return s ? s.scrollHeight > s.clientHeight + 1 : null; })(),
              };
            }""")
            check(f"v14 {label} 대구방향 목록에 'CCTV 없음' 배지(두산)",
                  rows["badges"] == 1 and rows["noCamNames"] == ["두산"] and rows["badgeText"] == "CCTV 없음"
                  and not rows["badgeOut"],
                  f"{rows['count']} · 배지 {rows['badgeText']} · {rows['noCamNames']}")
            check(f"v14 {label} 목록 행 안 배지·버튼이 잘리지 않음",
                  not rows["bad"], ", ".join(rows["bad"][:3]))
            check(f"v14 {label} 지점 목록 화면 한 화면·가로 스크롤 없음",
                  rows["pageH"] <= rows["innerH"] + 1 and rows["pageW"] <= rows["innerW"] + 1
                  and rows["listScrolls"] in (True, False),
                  f"{rows['pageW']}×{rows['pageH']} / {rows['innerW']}×{rows['innerH']} · 목록 내부 스크롤 {rows['listScrolls']}")
            check(f"v14 {label} 콘솔 예외 0건", not errors, "; ".join(errors[:2]))
            page.click('#dockBar button[data-view="route"]')
            page.wait_for_timeout(400)
            page.screenshot(path=str(dl / f"{shot}.png"), full_page=False)
            check(f"v14 {shot}.png 저장", (dl / f"{shot}.png").exists() and (dl / f"{shot}.png").stat().st_size > 20000,
                  f"downloads/{shot}.png")
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

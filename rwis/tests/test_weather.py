#!/usr/bin/env python3
"""v15 — 우측 패널 '노선 날씨' 탭 검증.

단위(서→동 정렬·6/12시간/내일까지 창·:17/:47 다음 갱신·숨김 시 건너뛰기)와
화면(fixture 응답으로 표·KPI·기준/다음 갱신·모바일 하단 탭·노스크롤)을 확인하고,
마지막으로 bionda.pages.dev/api/short-term-12 실호출(CORS)까지 본다.

    python3 tests/test_weather.py
"""
from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tests"))

from playwright.sync_api import sync_playwright  # noqa: E402

import serve  # noqa: E402

RESULTS: list[tuple[str, bool, str]] = []
FIXTURE = json.loads((ROOT / "tests" / "fixtures" / "short-term-12.sample.json").read_text(encoding="utf-8"))
WX_URL = "https://bionda.pages.dev/api/short-term-12"


def check(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append((name, bool(ok), detail))
    print(("  ✔ " if ok else "  ✘ ") + name + (f"  — {detail}" if detail else ""))


def measure(page) -> dict:
    return page.evaluate("""() => {
      const d = document.documentElement;
      const s = document.getElementById('wxScroll');
      const sb = s.getBoundingClientRect();
      const tabs = [...document.querySelectorAll('#sideTabs button')].map((b) => ({
        text: b.textContent.trim(), w: Math.round(b.getBoundingClientRect().width),
        h: Math.round(b.getBoundingClientRect().height), on: b.classList.contains('on'),
      }));
      const cut = [];
      for (const e of document.querySelectorAll('#wxSection *')) {
        if (e.offsetParent === null || e.children.length) continue;
        const txt = (e.textContent || '').trim();
        if (!txt) continue;
        if (e.closest('.wx-scroll')) continue;
        if (e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1) {
          cut.push({ cls: String(e.className || e.tagName), txt: txt.slice(0, 16), ovf: e.scrollWidth - e.clientWidth });
        }
      }
      const kpi = [...document.querySelectorAll('#wxKpi .k')].map((k) => ({
        w: Math.round(k.getBoundingClientRect().width), h: Math.round(k.getBoundingClientRect().height),
        label: (k.querySelector('.l') || {}).textContent, value: (k.querySelector('b') || {}).textContent,
      }));
      return {
        pageW: d.scrollWidth, pageH: d.scrollHeight, innerW: innerWidth, innerH: innerHeight,
        rows: document.querySelectorAll('#wxTableWrap tbody tr').length,
        cols: document.querySelectorAll('#wxTableWrap thead th.wx-h').length,
        orders: [...document.querySelectorAll('#wxTableWrap tbody tr')].map((tr) => Number(tr.dataset.order)),
        names: [...document.querySelectorAll('#wxTableWrap tbody tr')].map((tr) => (tr.querySelector('.rn') || {}).textContent),
        table: {
          sw: s.scrollWidth, cw: s.clientWidth, sh: s.scrollHeight, ch: s.clientHeight,
          top: Math.round(sb.top), bottom: Math.round(sb.bottom),
                },
        rowsBox: (() => {
          const tr = document.querySelectorAll('#wxTableWrap tbody tr');
          if (!tr.length) return null;
          const first = tr[0].getBoundingClientRect();
          const last = tr[tr.length - 1].getBoundingClientRect();
          return { firstTop: Math.round(first.top), lastBottom: Math.round(last.bottom), lastTop: Math.round(last.top) };
        })(),
        note: (() => {
          const n = document.getElementById('wxNote').getBoundingClientRect();
          return { h: Math.round(n.height), bottom: Math.round(n.bottom) };
        })(),
        tabs, kpi, cut,
        meta: document.getElementById('wxMeta').innerText.replace(/\\s+/g, ' ').trim(),
        stateText: document.getElementById('wxState').innerText.trim(),
        tab: document.getElementById('sidePanel').dataset.tab,
        wxHidden: document.getElementById('wxSection').hidden,
        tabW: Math.round(document.getElementById('tabWx').getBoundingClientRect().width),
        tabH: Math.round(document.getElementById('tabWx').getBoundingClientRect().height),
        dockActive: [...document.querySelectorAll('#dockBar button.on')].map((b) => b.textContent.trim()),
      };
    }""")


def main() -> int:
    httpd, port = serve.serve(0)
    base = f"http://127.0.0.1:{port}"
    print(f"테스트 서버: {base}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch()

        # ── [1] 노선 날씨 순수 로직 ─────────────────────────────
        print("\n[1] 서→동 정렬 · 기간 창 · :17/:47 갱신 계산")
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{base}/index.html", wait_until="load")
        page.wait_for_function("() => window.__gdc && window.__gdc.wx", timeout=20000)

        order = page.evaluate("""() => {
          const shuffled = [{ routeOrder: 13, name: '옥포읍' }, { routeOrder: 2, name: '지곡면' },
                            { routeOrder: 10, name: '쌍림면' }, { routeOrder: 1, name: '함양읍' }];
          return window.__gdc.wx.sortRegions(shuffled).map((r) => r.routeOrder);
        }""")
        check("routeOrder 오름차순(1 함양읍 → 13 옥포읍) 정렬", order == [1, 2, 10, 13], str(order))

        windows = page.evaluate("""(fix) => {
          const r = fix.regions[0];
          return ['h6', 'h12', 'tomorrow'].map((w) => window.__gdc.wx.hoursFor(r, w).length);
        }""", FIXTURE)
        # 내일까지 = 오늘 + 내일 두 날짜 (fixture 는 37시간)
        labels = [h["dateLabel"] for h in FIXTURE["regions"][0]["hours"]]
        two_days = labels.count(labels[0]) + labels.count([x for x in labels if x != labels[0]][0])
        check("기간 창 h6=6 · h12=12 · tomorrow=오늘+내일", windows == [6, 12, two_days],
              f"{windows} · 내일까지 {two_days}시간")

        extra = page.evaluate("""() => {
          const mk = (label, n, start) => Array.from({ length: n }, (_, i) => ({
            offset: start + i, dateLabel: label, hourKst: i, temp: 1, pop: 0, pty: '0', sky: '1', wet: false,
          }));
          const region = { hours: [...mk('11-25', 24, 0), ...mk('11-26', 24, 24), ...mk('11-27', 24, 48)] };
          return window.__gdc.wx.hoursFor(region, 'tomorrow').length;
        }""")
        check("내일 다음 날(모레)은 '내일까지'에서 제외", extra == 48, f"{extra}시간")

        slots = page.evaluate("""() => {
          const at = (h, m, s) => new Date(2026, 10, 25, h, m, s || 0).getTime();
          return [
            [at(11, 5), '11:17'], [at(11, 20), '11:47'], [at(11, 47), '12:17'],
            [at(11, 16, 59), '11:17'], [at(23, 50), '00:17'], [at(0, 5), '00:17'],
          ].map(([t, want]) => ({ want, got: window.__gdc.wx.slotLabel(window.__gdc.wx.nextSlot(t)) }));
        }""")
        bad = [s for s in slots if s["want"] != s["got"]]
        check("다음 갱신은 매시 :17 또는 :47", not bad, str(bad or [s["got"] for s in slots]))

        last = page.evaluate("""() => {
          const at = (h, m) => new Date(2026, 10, 25, h, m, 0).getTime();
          return [at(11, 5), at(11, 20), at(11, 47), at(0, 5)].map(
            (t) => window.__gdc.wx.slotLabel(window.__gdc.wx.lastSlot(t)));
        }""")
        check("지난 슬롯 계산(숨김 후 복귀 판정용)", last == ["10:47", "11:17", "11:47", "23:47"], str(last))

        actions = page.evaluate("""() => [
          window.__gdc.wx.slotAction(true, true), window.__gdc.wx.slotAction(false, true),
          window.__gdc.wx.slotAction(true, false), window.__gdc.wx.slotAction(false, false),
        ]""")
        check("탭이 숨겨져 있으면 호출 대신 pending", actions == ["pending", "fetch", "idle", "idle"], str(actions))

        schedule = page.evaluate("""() => {
          const st = window.__gdc.wx.state();
          const d = new Date(st.nextAt);
          return { min: d.getMinutes(), sec: d.getSeconds(), ms: d.getMilliseconds() };
        }""")
        check("예약된 다음 갱신이 :17/:47 정각", schedule["min"] in (17, 47) and schedule["sec"] == 0 and schedule["ms"] == 0,
              str(schedule))

        # ── [2] fixture 로 표·KPI 렌더 (요청은 가로채 fixture 응답) ──
        print("\n[2] 노선 날씨 탭 렌더 · 기간 전환 · 강조")
        requests: list[str] = []
        ctx2 = browser.new_context(viewport={"width": 1440, "height": 900})
        page2 = ctx2.new_page()
        page2_errors: list[str] = []
        page2.on("pageerror", lambda e: page2_errors.append(str(e)))
        page2.route(WX_URL + "*", lambda route: route.fulfill(
            status=200, content_type="application/json; charset=utf-8",
            headers={"Access-Control-Allow-Origin": "*"},
            body=json.dumps(FIXTURE, ensure_ascii=False)))
        page2.on("request", lambda r: requests.append(r.url) if WX_URL in r.url else None)
        page2.goto(f"{base}/index.html", wait_until="load")
        page2.wait_for_function("() => window.__gdc && window.__gdc.state.mode !== ''", timeout=30000)
        page2.wait_for_timeout(600)
        check("날씨 탭을 열기 전에는 호출하지 않음", not requests, f"요청 {len(requests)}건")

        page2.click("#tabWx")
        page2.wait_for_function("() => window.__gdc.wx.state().loaded", timeout=20000)
        page2.wait_for_timeout(350)
        m6 = measure(page2)
        check("날씨 탭 전환 — 패널 탭 weather · 표 표시", m6["tab"] == "weather" and not m6["wxHidden"], str(m6["tab"]))
        check("13개소가 routeOrder 순서로", m6["rows"] == 13 and m6["orders"] == sorted(m6["orders"])
              and m6["orders"][0] == 1 and m6["orders"][-1] == 13,
              f"{m6['rows']}행 · {m6['orders'][:3]}…{m6['orders'][-3:]}")
        check("6시간 창 = 6열 (12시~17시)", m6["cols"] == 6, f"{m6['cols']}열")
        check("요약 KPI 4칸(강수·영하·결빙 겹침·최저)", len(m6["kpi"]) == 4
              and [k["label"] for k in m6["kpi"]] == ["강수 지역", "영하 지역", "결빙 겹침", "최저 기온"],
              str([(k["label"], k["value"]) for k in m6["kpi"]]))
        kpi6 = FIXTURE["windowKPIs"]["h6"]
        check("KPI 값이 windowKPIs(h6)와 일치",
              m6["kpi"][0]["value"] == f"{kpi6['wetRegions']}곳" and m6["kpi"][1]["value"] == f"{kpi6['freezingRegions']}곳"
              and m6["kpi"][2]["value"] == f"{kpi6['overlapRegions']}곳" and m6["kpi"][3]["value"] == f"{kpi6['minTemp']}°",
              f"{[k['value'] for k in m6['kpi']]} vs {kpi6}")
        check("기준 시각(단기/초단기)과 다음 갱신 시각 표시",
              "기준" in m6["meta"] and "단기" in m6["meta"] and "초단기" in m6["meta"]
              and "다음 갱신" in m6["meta"] and (":17" in m6["meta"] or ":47" in m6["meta"]),
              m6["meta"])

        page2.click("#wxWindows button[data-w='h12']")
        page2.wait_for_timeout(250)
        m12 = measure(page2)
        page2.click("#wxWindows button[data-w='tomorrow']")
        page2.wait_for_timeout(250)
        m24 = measure(page2)
        check("12시간 창 = 12열", m12["cols"] == 12, f"{m12['cols']}열")
        check("내일까지 창 = 오늘+내일 전체 열", m24["cols"] == two_days, f"{m24['cols']}열")
        check("기간 전환은 다시 받지 않고 즉시 그린다", len(requests) == 1, f"요청 {len(requests)}건")
        kpi24 = FIXTURE["windowKPIs"]["tomorrow"]
        check("내일까지 KPI(영하 지역·최저 기온) 반영",
              m24["kpi"][1]["value"] == f"{kpi24['freezingRegions']}곳" and m24["kpi"][3]["value"] == f"{kpi24['minTemp']}°",
              f"{[k['value'] for k in m24['kpi']]}")

        frozen = page2.evaluate("""() => {
          const cells = [...document.querySelectorAll('#wxTableWrap td.fr')];
          return { n: cells.length, sample: cells[0] ? { t: cells[0].innerText.replace(/\\n/g, ' '), title: cells[0].title } : null };
        }""")
        check("영하(<0°C) 셀을 fr 클래스로 강조", frozen["n"] > 0, f"{frozen['n']}칸 · {frozen['sample']}")

        wet = page2.evaluate("""(fix) => {
          const data = JSON.parse(JSON.stringify(fix));
          const r = data.regions.find((x) => x.routeOrder === 1) || data.regions[0];
          const h = r.hours[2];
          h.temp = -2; h.wet = true; h.pty = '1'; h.pop = 80; h.type = '비';
          window.__gdc.wx.setData(data);
          window.__gdc.wx.setWindow('h6');
          const cell = document.querySelectorAll('#wxTableWrap tbody tr:first-child td')[2];
          return { cls: cell.className, text: cell.innerText.replace(/\\n/g, ' '), title: cell.title };
        }""", FIXTURE)
        check("강수·영하 동시 셀은 wet+ice 로 강조", "wet" in wet["cls"] and "ice" in wet["cls"] and "fr" in wet["cls"],
              f"{wet['cls']} · {wet['text']}")

        # ── v16 — 4°C 이하·0°C 미만·강수·강수×저온·결빙 색 구분 ──
        page2.evaluate("(fix) => window.__gdc.wx.setData(JSON.parse(JSON.stringify(fix)))", FIXTURE)
        page2.evaluate("() => window.__gdc.wx.setWindow('h6')")
        page2.wait_for_timeout(150)
        cold4 = page2.evaluate("""() => {
          const cells = [...document.querySelectorAll('#wxTableWrap td.cold4')];
          return {
            n: cells.length,
            sample: cells[0] ? {
              t: cells[0].innerText.replace(/\\n/g, ' '),
              col: getComputedStyle(cells[0].querySelector('.wx-t')).color,
              bg: getComputedStyle(cells[0]).backgroundColor,
              title: cells[0].title,
            } : null,
          };
        }""")
        check("4°C 이하(0~4°) 셀을 cold4 클래스·시안으로 강조",
              cold4["n"] > 0 and cold4["sample"]["col"] == "rgb(103, 232, 249)"
              and cold4["sample"]["bg"] == "rgba(34, 211, 238, 0.1)" and "4°C 이하" in cold4["sample"]["title"],
              f"{cold4['n']}칸 · {cold4['sample']}")

        palette = page2.evaluate("""(fix) => {
          const d = JSON.parse(JSON.stringify(fix));
          const set = (order, arr) => {
            const r = d.regions.find((x) => x.routeOrder === order);
            arr.forEach(([t, w], k) => {
              const h = r.hours[k];
              h.temp = t; h.wet = w; h.pty = w ? '1' : '0'; h.pop = w ? 70 : 0; h.rainMm = w ? 1 : 0;
            });
          };
          set(1, [[-3, true], [-1, false], [0, false], [2, true], [3, false], [4, false]]);
          set(2, [[1, true], [6, false], [6, true], [8, false], [10, false], [12, false]]);
          window.__gdc.wx.setData(d);
          window.__gdc.wx.setWindow('h6');
          const pick = (order, i) => {
            const tr = [...document.querySelectorAll('#wxTableWrap tbody tr')].find((t) => t.dataset.order === String(order));
            const td = tr.querySelectorAll('td')[i];
            return {
              cls: td.className, text: td.innerText.replace(/\\n/g, ' '),
              col: getComputedStyle(td.querySelector('.wx-t')).color,
              bg: getComputedStyle(td).backgroundColor,
              title: td.title,
            };
          };
          return { normal: pick(4, 0), cold4: pick(1, 2), fr: pick(1, 1), wet: pick(2, 2), chill: pick(1, 3), ice: pick(1, 0) };
        }""", FIXTURE)
        check("5가지 강조가 클래스로 구분된다(일반·4° 이하·영하·강수·강수×저온·결빙)",
              "cold4" in palette["cold4"]["cls"] and palette["cold4"]["cls"].strip() == "wx-cell cold4"
              and "fr" in palette["fr"]["cls"] and "wet" not in palette["fr"]["cls"]
              and "wet" in palette["wet"]["cls"] and "chill" not in palette["wet"]["cls"]
              and "chill" in palette["chill"]["cls"] and "ice" not in palette["chill"]["cls"]
              and "ice" in palette["ice"]["cls"] and "chill" not in palette["ice"]["cls"]
              and palette["normal"]["cls"].strip() == "wx-cell",
              json.dumps({k: v["cls"] for k, v in palette.items()}, ensure_ascii=False))
        cols = {k: v["col"] for k, v in palette.items()}
        check("색이 서로 다르다 — 4° 이하 시안 · 영하 블루 · 강수 에메랄드 · 강수×저온 앰버 · 결빙 레드",
              cols["cold4"] == "rgb(103, 232, 249)" and cols["fr"] == "rgb(147, 197, 253)"
              and cols["wet"] == "rgb(110, 231, 183)" and cols["chill"] == "rgb(252, 211, 77)"
              and cols["ice"] == "rgb(254, 202, 202)" and len(set(cols.values())) == 6,
              json.dumps(cols, ensure_ascii=False))
        check("색 배경도 서로 다르고 비어 있지 않다",
              len({palette[k]["bg"] for k in ("cold4", "fr", "wet", "chill", "ice")}) == 5
              and palette["normal"]["bg"] == "rgba(0, 0, 0, 0)",
              json.dumps({k: v["bg"] for k, v in palette.items()}, ensure_ascii=False))
        check("셀 title 에 4°C 이하·결빙 문구가 함께 남는다",
              "4°C 이하" in palette["cold4"]["title"] and "결빙 위험" in palette["ice"]["title"]
              and "결빙 주의" in palette["chill"]["title"] and "강수" in palette["wet"]["title"],
              f"{palette['cold4']['title']} / {palette['ice']['title']}")

        legend = page2.evaluate("""() => {
          const n = document.getElementById('wxNote');
          const chips = [...n.querySelectorAll('.lg')].map((x) => ({
            text: x.textContent.trim(),
            sw: getComputedStyle(x.querySelector('.sw')).backgroundColor,
          }));
          return {
            chips, h: Math.round(n.getBoundingClientRect().height),
            sh: n.scrollHeight, ch: n.clientHeight, sw: n.scrollWidth, cw: n.clientWidth,
          };
        }""")
        check("범례에 4° 이하·0° 미만·강수·강수×저온·결빙 색 견본 5개",
              [c["text"] for c in legend["chips"]] == ["4° 이하", "0° 미만", "강수", "강수×저온", "결빙"]
              and len({c["sw"] for c in legend["chips"]}) == 5,
              json.dumps(legend["chips"], ensure_ascii=False))
        check("범례는 한 줄(넘침·잘림 0)", legend["sh"] <= legend["ch"] + 1 and legend["sw"] <= legend["cw"] + 1
              and legend["h"] <= 20, f"{legend['h']}px · {legend['sw']}×{legend['sh']} in {legend['cw']}×{legend['ch']}")

        page2.evaluate("(fix) => window.__gdc.wx.setData(JSON.parse(JSON.stringify(fix)))", FIXTURE)
        page2.evaluate("() => window.__gdc.wx.setWindow('h6')")
        page2.wait_for_timeout(150)

        click_tab_back = page2.evaluate("""() => {
          document.getElementById('tabRwis').click();
          const a = { tab: document.getElementById('sidePanel').dataset.tab, wxHidden: document.getElementById('wxSection').hidden,
                      list: getComputedStyle(document.getElementById('listSection')).display };
          document.getElementById('tabWx').click();
          const b = { tab: document.getElementById('sidePanel').dataset.tab, wxHidden: document.getElementById('wxSection').hidden,
                      list: getComputedStyle(document.getElementById('listSection')).display };
          return { a, b };
        }""")
        check("탭을 오가도 도로기상 위험 패널로 정확히 복귀",
              click_tab_back["a"]["tab"] == "rwis" and click_tab_back["a"]["wxHidden"] and click_tab_back["a"]["list"] != "none"
              and click_tab_back["b"]["tab"] == "weather" and not click_tab_back["b"]["wxHidden"]
              and click_tab_back["b"]["list"] == "none",
              json.dumps(click_tab_back, ensure_ascii=False))

        page2.click("#wxReload")
        page2.wait_for_timeout(800)
        check("수동 새로고침 버튼이 다시 받아온다", len(requests) >= 2, f"요청 {len(requests)}건")
        check("렌더 과정 콘솔 예외 0건", not page2_errors, "; ".join(page2_errors[:2]))
        ctx2.close()

        # ── [3] 해상도별 레이아웃 ────────────────────────────────
        print("\n[3] 데스크톱·모바일 한 화면(노스크롤)")
        for vw, vh in ((1440, 900), (1280, 800), (1024, 768), (390, 844), (390, 680), (360, 640)):
            mob = vw < 1024
            c = browser.new_context(viewport={"width": vw, "height": vh}, is_mobile=mob, has_touch=mob)
            p = c.new_page()
            errs: list[str] = []
            p.on("pageerror", lambda e: errs.append(str(e)))
            p.route(WX_URL + "*", lambda route: route.fulfill(
                status=200, content_type="application/json; charset=utf-8",
                headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(FIXTURE, ensure_ascii=False)))
            p.goto(f"{base}/index.html", wait_until="load")
            p.wait_for_function("() => window.__gdc && ['snapshot','live'].includes(window.__gdc.state.mode)", timeout=30000)
            p.wait_for_timeout(500)
            if mob:
                p.click("#btnWxDock")
            else:
                p.click("#tabWx")
            p.wait_for_function("() => window.__gdc.wx.state().loaded", timeout=20000)
            p.wait_for_timeout(400)
            m = measure(p)
            label = f"{vw}×{vh}"
            check(f"{label} 노선 날씨 한 화면·가로 넘침 0",
                  m["pageH"] <= m["innerH"] + 1 and m["pageW"] <= m["innerW"] + 1,
                  f"{m['pageW']}×{m['pageH']} / {m['innerW']}×{m['innerH']}")
            check(f"{label} 13개소·6시간 표 · 카드 밖 글자 잘림 0",
                  m["rows"] == 13 and m["cols"] == 6 and not m["cut"],
                  f"{m['rows']}행 {m['cols']}열 · 잘림 {len(m['cut'])}")
            check(f"{label} 표 스크롤은 카드 안에서만", m["table"]["bottom"] <= m["innerH"] + 1,
                  f"표 하단 {m['table']['bottom']} / {m['innerH']} · 표 {m['table']['sw']}×{m['table']['sh']} in {m['table']['cw']}×{m['table']['ch']}")
            # v16 — 절대 기준: .wx-scroll 안에 세로·가로 스크롤 0px
            check(f"{label} .wx-scroll 세로 스크롤 0px", m["table"]["sh"] <= m["table"]["ch"],
                  f"scrollHeight {m['table']['sh']} / clientHeight {m['table']['ch']}")
            check(f"{label} .wx-scroll 가로 스크롤 0px", m["table"]["sw"] <= m["table"]["cw"],
                  f"scrollWidth {m['table']['sw']} / clientWidth {m['table']['cw']}")
            rb = m["rowsBox"] or {}
            check(f"{label} 1번 함양읍과 13번 옥포읍이 카드 안에",
                  bool(rb) and rb["firstTop"] >= m["table"]["top"] - 1 and rb["lastBottom"] <= m["table"]["bottom"] + 1,
                  f"첫 행 {rb.get('firstTop')} ≥ {m['table']['top']} · 끝 행 {rb.get('lastBottom')} ≤ {m['table']['bottom']}")
            check(f"{label} 기간 버튼·새로고침·안내가 보임",
                  all(t["w"] > 0 for t in m["tabs"]) and m["tabW"] > 0 and m["stateText"] != "" and m["meta"] != "",
                  f"탭 {m['tabs']} · 상태 '{m['stateText']}'")
            if mob:
                check(f"{label} 하단 탭 '날씨'만 켜짐", m["dockActive"] == ["🌦날씨"], str(m["dockActive"]))
                p.click('#dockBar button[data-view="route"]')
                p.wait_for_timeout(400)
                route = p.evaluate("() => ({ z: document.querySelectorAll('#zoneGrid .zone').length, pageH: document.documentElement.scrollHeight, innerH: innerHeight, pageW: document.documentElement.scrollWidth, innerW: innerWidth })")
                check(f"{label} 노선도 탭은 그대로 8구간 카드", route["z"] == 8, f"{route['z']}구간")
                check(f"{label} 노선도 화면도 한 화면", route["pageH"] <= route["innerH"] + 1 and route["pageW"] <= route["innerW"] + 1,
                      f"{route['pageW']}×{route['pageH']} / {route['innerW']}×{route['innerH']}")
            check(f"{label} 콘솔 예외 0건", not errs, "; ".join(errs[:2]))
            p.screenshot(path=str(ROOT / "tests" / "shots" / f"wx_{vw}x{vh}.png"))
            c.close()

        # ── [4] 실호출 (bionda.pages.dev, CORS) ─────────────────
        print("\n[4] bionda.pages.dev/api/short-term-12 실호출")
        c = browser.new_context(viewport={"width": 1280, "height": 800})
        p = c.new_page()
        live_errors: list[str] = []
        p.on("pageerror", lambda e: live_errors.append(str(e)))
        p.goto(f"{base}/index.html", wait_until="load")
        p.wait_for_function("() => window.__gdc && ['snapshot','live'].includes(window.__gdc.state.mode)", timeout=30000)
        p.click("#tabWx")
        p.wait_for_function("() => !window.__gdc.wx.state().busy", timeout=90000)
        p.wait_for_timeout(400)
        live = p.evaluate("() => ({ st: window.__gdc.wx.state(), rows: window.__gdc.wx.rows().length, text: document.getElementById('wxState').innerText.trim() })")
        check("실제 API 응답으로 13개소 표시", live["st"]["loaded"] and live["rows"] == 13 and not live["st"]["error"],
              f"{live['rows']}개소 · 오류 '{live['st']['error']}' · {live['text']}")
        src = p.evaluate("() => window.__gdc.state.wx && window.__gdc.state.wx.sources")
        check("단기·초단기 기준 시각 수신", isinstance(src, dict) and bool(src.get("shortBase")) and bool(src.get("ultraBase")), str(src))
        check("실호출 화면 콘솔 예외 0건", not live_errors, "; ".join(live_errors[:2]))
        p.screenshot(path=str(ROOT / "tests" / "shots" / "wx_live_1280x800.png"))
        c.close()

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

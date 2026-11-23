#!/usr/bin/env python3
"""RWIS 16개 구간 위험등급을 미리 계산해 JSON으로 저장한다.

용도
  1) Worker 가 직접 3단계 API를 호출하면 매 5분 캐시 미스마다 표 전체(약 2.8MB × 2개)를
     파싱해야 합니다. Cloudflare Workers 무료 플랜 CPU 한도(10ms)에는 이 파싱이 부담입니다.
  2) 그래서 GitHub Actions·NAS·cron 에서 이 스크립트를 5분마다 돌려 작은 JSON(약 10KB)을
     만들고, Worker 환경변수 RWIS_SOURCE_URL 로 그 주소를 넘기면 Worker CPU가 거의 들지 않습니다.

사용
    python3 tools/rwis_export.py                 # data/rwis_latest.json 갱신
    python3 tools/rwis_export.py --stdout         # 표준출력으로 (Actions 업로드용)
    python3 tools/rwis_export.py --out public/rwis.json

5분 슬롯 폴백
    기상청 표는 기준시각(nrmMaxTm)보다 몇 분 늦게 올라오는 일이 있고, 그때는 resultCode 03
    NODATA_ERROR + 빈 items 로 돌아옵니다. 그 경우 실패하지 않고 5분씩 최대 4단계(20분 전)까지
    직전 슬롯으로 후퇴해 값을 채웁니다. tm/tmLabel 은 실제 사용한 관측시각, tmLatest 는 최신
    기준시각, tmFallbackSteps 는 후퇴 칸 수입니다.

표준 라이브러리만 사용합니다.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
MASTER_PATH = ROOT / "data" / "cctv_master.json"
KST = timezone(timedelta(hours=9))

BASE = "https://rwis.kma.go.kr"
CONZONE = f"{BASE}/comis5/uis/gis/api/getConZoneByRoadNo.do"
TM = f"{BASE}/rrw/algo/info/getNrmRoadRiskTimeSet"
TABLE = f"{BASE}/rrw/algo/data/getNrmRiskRoadTableAll"
UA = {"User-Agent": "Mozilla/5.0 (gwangju-daegu-rwis-export)"}
ROAD = {"roadNo": "012", "roadNoN1": "12", "roadNoN2": "0120"}
DIRS = [("E", "대구방향", "대구"), ("S", "광주방향", "광주")]
LEVEL_NAME = ["안전", "관심", "주의", "위험"]
LEVEL_DETAIL = ["0단계 · 안전", "1단계 · 관심", "2단계 · 주의", "3단계 · 위험"]
TIMEOUT = 45
# 최신 5분 슬롯 표가 아직 안 올라왔을 때(NODATA_ERROR·빈 표) 5분씩 직전 슬롯으로 후퇴하는 한도
SLOT_MINUTES = 5
FALLBACK_STEPS = 4          # 최신 + 4단계 = 최대 20분 전 슬롯까지
NODATA_CODE = "03"


def _get(url: str):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=TIMEOUT) as res:
        return json.loads(res.read().decode("utf-8"))


def _post(url: str, params: dict):
    body = urllib.parse.urlencode(params).encode()
    with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=UA), timeout=TIMEOUT) as res:
        return json.loads(res.read().decode("utf-8"))


def fetch_conzones() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for code, _label, _short in DIRS:
        data = _post(CONZONE, {**ROAD, "cdpntTmnlDirDvCd": code})
        for item in data.get("data", []):
            links = [x for x in (item.get("linkIdArrStr") or "").split(",") if x]
            out[item["conzoneId"]] = {
                "id": item["conzoneId"],
                "dir": code,
                "name": item.get("conzoneNm") or "",
                "len": item.get("conzoneLen"),
                "links": links,
            }
    return out


def fetch_tm(risk: str) -> str:
    data = _get(f"{TM}?riskCd={risk}")
    items = (data.get("body") or {}).get("items") or []
    tm = str((items[0] if items else {}).get("nrmMaxTm") or "")
    if len(tm) != 12 or not tm.isdigit():
        raise RuntimeError(f"RWIS 최신 기준시각을 받지 못했습니다 ({risk})")
    return tm


def shift_tm(tm: str, minutes: int) -> str:
    """'202611230935' 에서 5분 단위로 앞뒤 이동한 관측시각을 만든다."""
    try:
        stamp = datetime.strptime(tm, "%Y%m%d%H%M")
    except (TypeError, ValueError):
        raise RuntimeError(f"RWIS 관측시각 형식이 아닙니다: {tm!r}")
    return (stamp + timedelta(minutes=minutes)).strftime("%Y%m%d%H%M")


def parse_levels(items, field: str, wanted: set[str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for item in items:
        link = str(item.get("LINK_ID") or "")
        if link not in wanted:
            continue
        raw = item.get(field)
        if raw is None or raw == "":
            continue
        try:
            value = round(float(raw))
        except (TypeError, ValueError):
            continue
        if 0 <= value <= 3:
            out[link] = value
    return out


def fetch_levels(risk: str, field: str, tm: str, wanted: set[str]) -> tuple[dict[str, int], str, int]:
    """위험등급 표를 가져온다. 최신 5분 슬롯이 아직 안 올라왔으면 직전 슬롯으로 후퇴한다.

    기상청 표는 기준시각(getNrmRoadRiskTimeSet 의 nrmMaxTm)보다 몇 분 늦게 올라오는 일이 있다.
    그때 표 조회는 HTTP 200 + `resultCode 03 NODATA_ERROR` + 빈 items 로 돌아오므로,
    5분씩 최대 FALLBACK_STEPS 단계(20분) 전까지 거슬러 올라가 실제 값이 있는 표를 쓴다.

    반환: (링크별 등급, 실제 사용한 관측시각, 후퇴한 단계 수)
    """
    notes: list[str] = []
    for step in range(FALLBACK_STEPS + 1):
        slot = shift_tm(tm, -SLOT_MINUTES * step)
        data = _get(f"{TABLE}?riskCd={risk}&tm={slot}")
        header = data.get("header") or {}
        code = str(header.get("resultCode", ""))
        items = (data.get("body") or {}).get("items") or []
        out = parse_levels(items, field, wanted)
        if out:
            if step:
                print(
                    f"[rwis_export] {risk}: 최신 슬롯 {tm} 이 비어 있어 "
                    f"{slot}({SLOT_MINUTES * step}분 전) 표를 사용합니다.",
                    file=sys.stderr,
                )
            return out, slot, step
        notes.append(f"{slot}(resultCode={code or '-'}, items={len(items)})")
    raise RuntimeError(
        f"RWIS 위험등급 표에서 우리 구간 등급을 얻지 못했습니다 ({risk}, 최신 {tm}). "
        f"최근 {FALLBACK_STEPS + 1}개 슬롯({SLOT_MINUTES * FALLBACK_STEPS}분 전까지) 모두 비었거나 "
        f"대상 LINK_ID 가 없습니다 — " + " / ".join(notes)
    )


def summarize(levels: dict[str, int], links: list[str]) -> dict:
    counts = [0, 0, 0, 0]
    known = 0
    mx = None
    for link in links:
        if link not in levels:
            continue
        level = levels[link]
        counts[level] += 1
        known += 1
        mx = level if mx is None else max(mx, level)
    return {"level": mx, "counts": counts if known else None, "known": known, "total": len(links)}


def view(info: dict) -> dict:
    level = info["level"]
    return {
        "level": level,
        "levelName": "결측" if level is None else LEVEL_NAME[level],
        "levelDetail": "등급 없음" if level is None else LEVEL_DETAIL[level],
        "counts": info["counts"],
        "knownLinks": info["known"],
        "totalLinks": info["total"],
    }


def fmt(tm: str) -> str:
    return f"{tm[0:4]}-{tm[4:6]}-{tm[6:8]} {tm[8:10]}:{tm[10:12]}" if len(tm) == 12 else tm


def build_payload(master: dict) -> dict:
    conzones = fetch_conzones()
    defs = []
    for zone in master["zones"]:
        for code, label, short in DIRS:
            defs.append((f"0120CZ{code}{zone['suffix']}", zone, code, label, short))

    wanted: set[str] = set()
    for cid, *_ in defs:
        if cid in conzones:
            wanted.update(conzones[cid]["links"])

    fr_latest, vr_latest = fetch_tm("FR"), fetch_tm("VR")
    fr, fr_tm, fr_steps = fetch_levels("FR", "FSM", fr_latest, wanted)
    vr, vr_tm, vr_steps = fetch_levels("VR", "VIR", vr_latest, wanted)

    zones = []
    for cid, zone, code, label, short in defs:
        cz = conzones.get(cid)
        links = cz["links"] if cz else []
        zones.append({
            "id": cid,
            "suffix": zone["suffix"],
            "name": (cz["name"] if cz and cz["name"] else zone["name"]),
            "dir": code,
            "dirLabel": label,
            "dirShort": short,
            "startKm": zone["startKm"],
            "endKm": zone["endKm"],
            "lengthM": cz["len"] if cz else None,
            "linkCount": len(links),
            "missing": cz is None,
            "fsm": view(summarize(fr, links)),
            "vir": view(summarize(vr, links)),
        })

    fsm_levels = [z["fsm"]["level"] for z in zones if z["fsm"]["level"] is not None]
    vir_levels = [z["vir"]["level"] for z in zones if z["vir"]["level"] is not None]
    now = datetime.now(KST)

    return {
        "ok": True,
        "kind": "rwis",
        "generatedAt": now.isoformat(timespec="seconds"),
        "source": "rwis.kma.go.kr 도로기상정보시스템",
        "road": {"no": "012", "n2": "0120", "name": "무안광주대구선", "range": master["range"]},
        # tm 은 실제로 등급을 읽어 온 관측시각(후퇴했으면 그 슬롯)입니다.
        "tm": {"FR": fr_tm, "VR": vr_tm},
        "tmLabel": {"FR": fmt(fr_tm), "VR": fmt(vr_tm)},
        "tmLatest": {"FR": fr_latest, "VR": vr_latest},
        "tmFallbackSteps": {"FR": fr_steps, "VR": vr_steps},
        "tmFallback": {
            "FR": fr_steps > 0,
            "VR": vr_steps > 0,
            "note": (
                f"최신 기준시각 표가 아직 없어 {SLOT_MINUTES}분 단위로 직전 슬롯을 씁니다."
                if (fr_steps or vr_steps)
                else None
            ),
        },
        "levelNames": LEVEL_NAME,
        "levelDetails": LEVEL_DETAIL,
        "summary": {
            "fsmMax": max(fsm_levels) if fsm_levels else None,
            "virMax": max(vir_levels) if vir_levels else None,
            "fsmZoneCounts": [sum(1 for z in zones if z["fsm"]["level"] == i) for i in range(4)],
            "virZoneCounts": [sum(1 for z in zones if z["vir"]["level"] == i) for i in range(4)],
            "missingZones": [z["id"] for z in zones if z["missing"]],
            "zonesWithoutData": [
                z["id"] for z in zones if not z["missing"] and z["fsm"]["level"] is None and z["vir"]["level"] is None
            ],
        },
        "alerts": [
            {
                "id": z["id"], "name": z["name"], "dirLabel": z["dirLabel"],
                "fsm": z["fsm"]["level"], "vir": z["vir"]["level"],
                "text": f"{z['name']}({z['dirLabel']}) " + " · ".join(filter(None, [
                    f"도로살얼음 {LEVEL_NAME[z['fsm']['level']]}" if (z["fsm"]["level"] or 0) >= 2 else None,
                    f"가시거리 {LEVEL_NAME[z['vir']['level']]}" if (z["vir"]["level"] or 0) >= 2 else None,
                ])),
            }
            for z in zones
            if (z["fsm"]["level"] or 0) >= 2 or (z["vir"]["level"] or 0) >= 2
        ],
        "zones": zones,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="RWIS 16개 구간 위험등급 JSON 생성")
    parser.add_argument("--out", default=str(ROOT / "data" / "rwis_latest.json"), help="저장 경로")
    parser.add_argument("--stdout", action="store_true", help="파일에 쓰지 않고 표준출력으로")
    args = parser.parse_args()

    master = json.loads(MASTER_PATH.read_text(encoding="utf-8"))
    started = time.time()
    payload = build_payload(master)
    text = json.dumps(payload, ensure_ascii=False, indent=1)

    if args.stdout:
        print(text)
    else:
        out = pathlib.Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
        print(f"{out} ({len(text.encode()):,} bytes, {time.time() - started:.1f}s)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

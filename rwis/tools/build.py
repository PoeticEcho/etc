#!/usr/bin/env python3
"""광주대구선 CCTV 마스터 데이터 빌드.

CSV(misc-db/gwangju-daegu-cctv/gwangju_daegu_cctv_hamyang_okpo.csv)를 읽어
  1) data/cctv_master.json
  2) worker.js            (src/worker.template.js 의 __MASTER__ 치환)
  3) index.html           (src/index.template.html 의 __MASTER__ 치환)
을 다시 만든다.

    python3 tools/build.py

CSV를 고친 뒤 이 스크립트만 다시 돌리면 worker.js · index.html 이 한 번에 갱신된다.
"""
from __future__ import annotations

import csv
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSV_PATH = ROOT.parent / "misc-db" / "gwangju-daegu-cctv" / "gwangju_daegu_cctv_hamyang_okpo.csv"
DATA_JSON = ROOT / "data" / "cctv_master.json"
GEO_JSON = ROOT / "data" / "route_geo.json"
WORKER_TPL = ROOT / "src" / "worker.template.js"
WORKER_OUT = ROOT / "worker.js"
INDEX_TPL = ROOT / "src" / "index.template.html"
INDEX_OUT = ROOT / "index.html"

DIR_CODE = {"대구방향": "D", "광주방향": "G"}

# RWIS 구간 경계(이정 km). CSV의 공식 IC·JC 이정과 구간 길이(conzoneLen)로 맞춘 값.
ZONES = [
    ("160", 95.0, 97.3, "함양IC–함양JC"),
    ("170", 97.3, 121.1, "함양JC–거창IC"),
    ("180", 121.1, 131.1, "거창IC–가조IC"),
    ("190", 131.1, 146.4, "가조IC–해인사IC"),
    ("200", 146.4, 152.9, "해인사IC–고령IC"),
    ("210", 152.9, 165.52, "고령IC–동고령IC"),
    ("220", 165.52, 166.99, "동고령IC–고령JC"),
    ("230", 166.99, 176.0, "고령JC–옥포JC"),
]


def zone_of(km: float) -> str:
    for suffix, start, end, _ in ZONES:
        if start <= km < end:
            return suffix
    return ZONES[-1][0] if km >= ZONES[-1][2] else ZONES[0][0]


# v14 — 구간 안에 CCTV가 한 대도 없을 때(동고령IC–고령JC 1.47km) 붙일 '인접' 지점의 범위.
# 구간에 들어서기 전 BRIDGE_KM 만큼의 접근 구간과, 구간 끝 경계(도달 km)에 붙은 지점까지만 본다.
BRIDGE_KM = 4.0
BRIDGE_MAX = 3


def attach_near_points(ordered: list[dict]) -> dict[str, list[dict]]:
    """CCTV가 0대인 구간에 접근 구간의 가까운 지점을 '인접(near)'으로 붙인다.

    지점의 원래 구간(zone)은 건드리지 않는다. 그래서 210·230 구간 목록도 그대로이고,
    등록 CCTV 총계(62지점·123대)도 늘지 않는다. 붙은 지점만 nearZones 에 구간 접미사가 남는다.
    """
    bridged: dict[str, list[dict]] = {}
    for suffix, start, end, _ in ZONES:
        if any(p["zone"] == suffix for p in ordered):
            continue
        window = [p for p in ordered if start - BRIDGE_KM <= p["km"] <= end + 1e-6]
        near = window[-BRIDGE_MAX:]
        for point in near:
            point.setdefault("nearZones", [])
            if suffix not in point["nearZones"]:
                point["nearZones"].append(suffix)
        bridged[suffix] = near
    return bridged


def build_master() -> dict:
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))

    points: dict[tuple[str, str], dict] = {}
    for row in rows:
        key = (row["CCTV명"], row["이정(km)"])
        point = points.get(key)
        if point is None:
            point = points[key] = {
                "name": row["CCTV명"],
                "km": float(row["이정(km)"]),
                "kmSource": row["이정 근거"],
                "facility": row["시설 구분"],
                "address": row["주소"],
                "lat": float(row["위도"]),
                "lon": float(row["경도"]),
                "cctvId": row["CCTV ID"],
                "note": row["비고"],
                "cams": [],
            }
        point["cams"].append({"dir": DIR_CODE[row["방향"]], "seq": int(row["순번"]), "cctvId": row["CCTV ID"]})

    ordered = sorted(points.values(), key=lambda p: (p["km"], p["name"]))
    for index, point in enumerate(ordered, 1):
        point["id"] = f"p{index:02d}"
        point["zone"] = zone_of(point["km"])
        point["cams"].sort(key=lambda c: c["dir"])

    bridged = attach_near_points(ordered)

    zones = []
    for suffix, start, end, name in ZONES:
        near = bridged.get(suffix, [])
        zones.append({
            "suffix": suffix, "startKm": start, "endKm": end, "name": name,
            "nearIds": [p["id"] for p in near],
            "nearNames": [p["name"] for p in near],
        })

    return {
        "route": "광주대구선",
        "routeNo": "012",
        "range": {"startKm": 95.0, "endKm": 176.0, "startName": "함양IC", "endName": "옥포JC"},
        "zones": zones,
        "points": ordered,
        "bridgeKm": BRIDGE_KM,
    }


def inject(template: str, master: dict, geo: dict | None) -> str:
    blob = json.dumps(master, ensure_ascii=False, separators=(",", ":"))
    if "__MASTER__" not in template:
        sys.exit("템플릿에 __MASTER__ 자리표시자가 없습니다.")
    out = template.replace("__MASTER__", blob)
    if "__ROUTE_GEO__" in out:
        geo_blob = json.dumps(geo or {}, ensure_ascii=False, separators=(",", ":"))
        out = out.replace("__ROUTE_GEO__", geo_blob)
    return out


def main() -> None:
    master = build_master()
    geo = json.loads(GEO_JSON.read_text(encoding="utf-8")) if GEO_JSON.exists() else None
    cameras = sum(len(p["cams"]) for p in master["points"])
    if len(master["points"]) != 62 or cameras != 123:
        sys.exit(f"예상과 다른 데이터입니다: {len(master['points'])}지점 / {cameras}대")

    # v14 — 인접 지점을 붙여도 원래 구간 기준 합계는 그대로여야 한다(중복 카운트 금지).
    own_total = sum(
        sum(len(p["cams"]) for p in master["points"] if p["zone"] == z["suffix"])
        for z in master["zones"]
    )
    if own_total != cameras:
        sys.exit(f"구간별 CCTV 합계가 전체와 다릅니다: {own_total} != {cameras}")
    for zone in master["zones"]:
        own = [p for p in master["points"] if p["zone"] == zone["suffix"]]
        if not own and not zone["nearIds"]:
            print(f"경고: {zone['name']}({zone['suffix']}) 구간에 CCTV도 인접 지점도 없습니다.")
        elif not own:
            print(f"인접 연결: {zone['name']}({zone['suffix']}) ← {'·'.join(zone['nearNames'])}")

    DATA_JSON.parent.mkdir(parents=True, exist_ok=True)
    DATA_JSON.write_text(json.dumps(master, ensure_ascii=False, indent=1), encoding="utf-8")

    for tpl, out in ((WORKER_TPL, WORKER_OUT), (INDEX_TPL, INDEX_OUT)):
        if not tpl.exists():
            print(f"건너뜀(템플릿 없음): {tpl.name}")
            continue
        out.write_text(inject(tpl.read_text(encoding="utf-8"), master, geo), encoding="utf-8")
        print(f"생성: {out.relative_to(ROOT)}  ({out.stat().st_size:,} bytes)")

    if geo:
        print(f"배경 지도: 시도 {len(geo.get('provinces', []))} · 시군 {len(geo.get('counties', []))} → {GEO_JSON.relative_to(ROOT)}")
    print(f"데이터: {len(master['points'])}지점 / {cameras}대 → {DATA_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

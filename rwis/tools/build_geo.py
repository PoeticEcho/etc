#!/usr/bin/env python3
"""시도·시군 경계 → 노선도 SVG 배경 좌표(data/route_geo.json).

`data/geo/` 에 둔 공개 경계 원본(kostat 2013 단순화 GeoJSON)에서
광주대구선 주변만 잘라 노선도 viewBox(1600×900) 좌표로 투영·단순화한다.
`tools/build.py` 가 이 JSON 을 `src/index.template.html` 의 `__ROUTE_GEO__` 자리에 넣는다.

    python3 tools/build_geo.py      # data/geo/*.json 이 있을 때만

투영은 노선도 JS 와 같은 값이어야 한다(ROUTE_GEO.proj).
"""
from __future__ import annotations

import json
import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
GEO_DIR = ROOT / "data" / "geo"
OUT = ROOT / "data" / "route_geo.json"

# ── 노선도 viewBox(1600×900) 투영 상수 ─────────────────────────────
LON_C = 128.1003      # 노선 중앙 경도
LAT_C = 35.6573       # 노선 중앙 위도
COS_LAT = math.cos(math.radians(35.655))
SCALE = 1900.0        # 위도 1도 = 1900px
X0 = 800.0
Y0 = 455.0
MAP_TOP, MAP_BOTTOM = 112.0, 792.0
MAP_LEFT, MAP_RIGHT = -30.0, 1630.0
CLIP_TOP, CLIP_BOTTOM = 88.0, 812.0
SIMPLIFY = 1.1        # px

PROVINCES = ["경상남도", "경상북도", "전라북도", "전라남도", "대구광역시"]
LABEL_TEXT = {"전라북도": "전북", "전라남도": "전남", "경상북도": "경북",
              "경상남도": "경남", "대구광역시": "대구"}
COUNTY_KEEP = [
    "함양군", "거창군", "합천군", "산청군", "성주군", "고령군", "김천시",
    "장수군", "남원시", "달성군", "창녕군", "의령군", "함안군", "거제시",
    "진주시", "칠곡군", "군위군", "구미시", "영덕군", "청도군", "경산시",
]


def prj(lon: float, lat: float) -> tuple[float, float]:
    return (
        X0 + (lon - LON_C) * COS_LAT * SCALE,
        Y0 - (lat - LAT_C) * SCALE,
    )


def clip_ring(ring: list[tuple[float, float]], x1, y1, x2, y2) -> list[tuple[float, float]]:
    """Sutherland–Hodgman (사각 창)."""
    def clip(points, inside, inter):
        out = []
        for i, cur in enumerate(points):
            prev = points[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(inter(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(inter(prev, cur))
        return out

    def ix(edge_x):
        def f(p, q):
            t = (edge_x - p[0]) / (q[0] - p[0]) if q[0] != p[0] else 0
            return (edge_x, p[1] + t * (q[1] - p[1]))
        return f

    def iy(edge_y):
        def f(p, q):
            t = (edge_y - p[1]) / (q[1] - p[1]) if q[1] != p[1] else 0
            return (p[0] + t * (q[0] - p[0]), edge_y)
        return f

    pts = ring
    for inside, inter in (
        (lambda p: p[0] >= x1, ix(x1)),
        (lambda p: p[0] <= x2, ix(x2)),
        (lambda p: p[1] >= y1, iy(y1)),
        (lambda p: p[1] <= y2, iy(y2)),
    ):
        if not pts:
            break
        pts = clip(pts, inside, inter)
    return pts


def simplify(points: list[tuple[float, float]], eps: float) -> list[tuple[float, float]]:
    """Douglas–Peucker."""
    if len(points) < 3:
        return points
    x1, y1 = points[0]
    x2, y2 = points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy)
    best_i, best_d = 0, -1.0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        if norm == 0:
            d = math.hypot(px - x1, py - y1)
        else:
            d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm
        if d > best_d:
            best_i, best_d = i, d
    if best_d <= eps:
        return [points[0], points[-1]]
    left = simplify(points[: best_i + 1], eps)
    right = simplify(points[best_i:], eps)
    return left[:-1] + right


def ring_to_path(ring) -> str:
    if len(ring) < 3:
        return ""
    cmds = [f"M{ring[0][0]:.1f} {ring[0][1]:.1f}"]
    for x, y in ring[1:]:
        cmds.append(f"L{x:.1f} {y:.1f}")
    cmds.append("Z")
    return "".join(cmds)


def feature_paths(feature) -> list[str]:
    geom = feature["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    paths = []
    for poly in polys:
        for ring_i, ring in enumerate(poly):
            pts = [prj(lon, lat) for lon, lat in ring]
            if max(p[0] for p in pts) < MAP_LEFT or min(p[0] for p in pts) > MAP_RIGHT:
                continue
            if max(p[1] for p in pts) < CLIP_TOP or min(p[1] for p in pts) > CLIP_BOTTOM:
                continue
            clipped = clip_ring(pts, MAP_LEFT, CLIP_TOP, MAP_RIGHT, CLIP_BOTTOM)
            if len(clipped) < 3:
                continue
            simple = simplify(clipped + [clipped[0]], SIMPLIFY)
            if len(simple) >= 4:
                paths.append(ring_to_path(simple[:-1]))
    return paths


def centroid_area(rings: list[list[tuple[float, float]]]) -> tuple[float, float, float]:
    total_a = cx = cy = 0.0
    for ring in rings:
        if len(ring) < 3:
            continue
        a = 0.0
        rx = ry = 0.0
        for i in range(len(ring)):
            x1, y1 = ring[i]
            x2, y2 = ring[(i + 1) % len(ring)]
            cross = x1 * y2 - x2 * y1
            a += cross
            rx += (x1 + x2) * cross
            ry += (y1 + y2) * cross
        a *= 0.5
        if abs(a) < 1e-6:
            continue
        total_a += abs(a)
        cx += rx / (6 * a) * abs(a)
        cy += ry / (6 * a) * abs(a)
    if total_a == 0:
        return 0, 0, 0
    return cx / total_a, cy / total_a, total_a


def main() -> None:
    prov = json.loads((GEO_DIR / "skorea_provinces_geo_simple.json").read_text(encoding="utf-8"))
    muni = json.loads((GEO_DIR / "skorea_municipalities_geo_simple.json").read_text(encoding="utf-8"))

    provinces, labels = [], []
    for feature in prov["features"]:
        name = feature["properties"]["name"]
        if name not in PROVINCES:
            continue
        paths = feature_paths(feature)
        if not paths:
            continue
        provinces.append({"name": name, "d": "".join(paths)})

        # 라벨은 잘린 조각 중 가장 큰 것의 중심
        geom = feature["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        best = None
        for poly in polys:
            ring = [prj(lon, lat) for lon, lat in poly[0]]
            clipped = clip_ring(ring, MAP_LEFT, CLIP_TOP, MAP_RIGHT, CLIP_BOTTOM)
            if len(clipped) < 3:
                continue
            cx, cy, area = centroid_area([clipped])
            if area > 0 and (best is None or area > best[2]):
                best = (cx, cy, area)
        if best and best[2] > 20000:
            labels.append({"name": LABEL_TEXT.get(name, name), "x": round(best[0], 1), "y": round(best[1], 1), "area": round(best[2])})

    counties = []
    for feature in muni["features"]:
        name = feature["properties"]["name"]
        if name not in COUNTY_KEEP:
            continue
        paths = feature_paths(feature)
        if paths:
            counties.append({"name": name, "d": "".join(paths)})

    payload = {
        "source": "kostat 2013 시도·시군 경계 단순화 (southkorea/southkorea-maps)",
        "proj": {"lonC": LON_C, "latC": LAT_C, "cosLat": round(COS_LAT, 5),
                 "scale": SCALE, "x0": X0, "y0": Y0,
                 "mapTop": MAP_TOP, "mapBottom": MAP_BOTTOM},
        "provinces": provinces,
        "counties": counties,
        "labels": sorted(labels, key=lambda l: -l["area"]),
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"생성: {OUT.relative_to(ROOT)}  ({OUT.stat().st_size:,} bytes)")
    for p in provinces:
        print(f"  시도 {p['name']}: path {len(p['d']):,}자")
    print(f"  시군 {len(counties)}개: " + ", ".join(c["name"] for c in counties))
    print("  라벨: " + ", ".join(f"{l['name']}({l['x']},{l['y']})" for l in payload["labels"]))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Country shapes for the 'emptying skies' check, cut to the area our aircraft source covers
(a circle of 250 nautical miles around 32.0N 34.9E) and simplified. Source: Natural Earth 1:50m
admin-0 countries v5.1.2 (public domain). Northern Cyprus is counted as part of Cyprus.
Usage: build_skies_areas.py <ne_50m_admin_0_countries.geojson> <out.json>"""
import json, sys

src, dst = sys.argv[1], sys.argv[2]
W, S, E, N = 29.0, 27.0, 41.0, 37.0          # a box a little larger than the circle
KEEP = {'IL', 'PS', 'LB', 'SY', 'JO', 'EG', 'CY', 'SA', 'IQ', 'TR'}

def clip(ring):                                 # Sutherland-Hodgman against the box
    def cut(pts, inside, cross):
        out = []
        for i, p in enumerate(pts):
            q = pts[i - 1]
            if inside(p):
                if not inside(q): out.append(cross(q, p))
                out.append(p)
            elif inside(q): out.append(cross(q, p))
        return out
    def at_x(x):  return lambda a, b: (x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]))
    def at_y(y):  return lambda a, b: (a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y)
    pts = [tuple(p) for p in ring]
    for inside, cross in ((lambda p: p[0] >= W, at_x(W)), (lambda p: p[0] <= E, at_x(E)),
                          (lambda p: p[1] >= S, at_y(S)), (lambda p: p[1] <= N, at_y(N))):
        if not pts: break
        pts = cut(pts, inside, cross)
    return pts

def simplify(pts, tol=0.003):                    # Douglas-Peucker
    if len(pts) < 4: return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = (dx * dx + dy * dy) ** 0.5 or 1e-12
    i, dmax = 0, 0
    for k in range(1, len(pts) - 1):
        d = abs(dy * pts[k][0] - dx * pts[k][1] + b[0] * a[1] - b[1] * a[0]) / L
        if d > dmax: i, dmax = k, d
    if dmax <= tol: return [a, b]
    return simplify(pts[:i + 1], tol)[:-1] + simplify(pts[i:], tol)

out = {}
for f in json.load(open(src, encoding='utf-8'))['features']:
    p, g = f['properties'], f['geometry']
    code = p.get('ISO_A2_EH') or p.get('ISO_A2')
    if p.get('NAME') == 'N. Cyprus': code = 'CY'
    if code not in KEEP: continue
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    for poly in polys:
        ring = clip(poly[0])                       # outer ring only; holes are negligible here
        if len(ring) < 3: continue
        far = max(range(len(ring)), key=lambda k: (ring[k][0] - ring[0][0]) ** 2 + (ring[k][1] - ring[0][1]) ** 2)
        ring = simplify(ring[:far + 1]) + simplify(ring[far:] + [ring[0]])[1:]   # a closed ring is simplified in two halves
        if len(ring) >= 4:
            out.setdefault(code, []).append([[round(x, 3), round(y, 3)] for x, y in ring])
json.dump(out, open(dst, 'w'), separators=(',', ':'), sort_keys=True)
print({k: sum(len(r) for r in v) for k, v in out.items()})

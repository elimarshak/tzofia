import json, math, base64, io, sys
from pathlib import Path
B = Path('/home/claude/tzofia/mockup')
W, H = 440, 900
PX = 112.0            # pixels per degree of latitude
C_LAT, C_LON = 32.35, 34.75
CY = 315.0
MAPB = 560
KX = PX * math.cos(math.radians(C_LAT))
def xy(lon, lat):
    return (W/2 + (lon - C_LON)*KX, CY - (lat - C_LAT)*PX)
LON0, LON1 = C_LON - W/2/KX - 1, C_LON + W/2/KX + 1
LAT0, LAT1 = C_LAT - H/2/PX - 1, C_LAT + H/2/PX + 1

def rings(geom):
    t = geom['type']
    if t == 'Polygon': return geom['coordinates']
    if t == 'MultiPolygon': return [r for p in geom['coordinates'] for r in p]
    return []
def path(rs):
    out = []
    for r in rs:
        if not any(LON0 < x < LON1 and LAT0 < y < LAT1 for x, y in r): continue
        pts = [xy(x, y) for x, y in r]
        out.append('M' + 'L'.join(f'{a:.1f},{b:.1f}' for a, b in pts) + 'Z')
    return ''.join(out)

countries = json.load(open(B/'ne/geojson/ne_10m_admin_0_countries.geojson'))
land = ''.join(path(rings(f['geometry'])) for f in countries['features'])
lakes = json.load(open(B/'ne/geojson/ne_10m_lakes.geojson'))
water = ''.join(path(rings(f['geometry'])) for f in lakes['features'])

CITIES = [('תל אביב',34.78,32.08),('ירושלים',35.21,31.77),('חיפה',34.99,32.80),('באר שבע',34.79,31.25),
          ('אילת',34.95,29.56),('ביירות',35.50,33.89),('דמשק',36.29,33.51),('עמאן',35.93,31.95),
          ('עזה',34.46,31.50),('פורט סעיד',32.30,31.26)]

RAW = """32.548|30.485|152|36025||B38M|0|8|422;32.693|30.995|175|35025||A21N|0|8|391;34.611|31.093|130|37000|ELY282|B738|0|8|454;31.556|31.12|174|41000|ABP941|GLF6|0|8|467;34.602|31.27|131|35000|CYF131|A320|0|8|466;31.516|31.372|351|36025|ENT5158|B738|0|8|498;33.624|31.498|304|31350|ELY027|B789|0|8|479;33.988|31.597|343|31950|RWZ016|T204|0|8|498;34.567|32.249|142|35000|RJA875|A20N|0|8|416;29.915|32.435|145|35000|TKJ3ZG|A21N|0|8|443;35.18|32.708|120|17475|KLM461|B739|0|8|356;33.507|32.866|136|35000|BBG271|A320|0|8|444;33.711|32.908|87|37000|AIZ514|A21N|0|8|511;34.936|32.998|314|33975|WZZ456|A21N|0|8|438;33.095|33.141|123|29450|ISR346|A320|0|8|464;33.312|33.271|148|31875|AIZ284|A320|0|8|415;32.911|33.471|123|22525|AIZ282|A320|0|8|435;34.829|33.567|227|2500|VKG051|A21N|0|8|198;34.886|33.668|65|3600|WZZ6771|A321|0|8|243;33.926|33.695|44|30725|ETH406|B38M|0|8|487;34.551|33.756|153|12875|ISR584|A320|0|0|364;32.7|33.78|134|16150|ISR164|A320|0|8|335;35.281|33.901|112|16000|||0|0|97;34.677|33.954|186|29225|ELY5416|A320|0|0|390;32.405|34.158|124|9850|AUA83|A321|0|8|331;34.063|34.195|202|31000|RFF803||0|0|298;33.393|34.314|355|34350|AHY322|B788|0|8|543;35.946|34.649|167|37000|ABY777||0|8|397;32.003|34.71|290|3725|ELY001|B772|0|8|232;32.008|34.83|258|1125|ELY005|B789|0|8|208;29.039|34.996|269|38000|KAC543|A359|0|8|402;31.945|35.03|91|6275|ELY083|B772|0|8|280;35.253|35.057|151|39000|KAC163|A339|0|8|445;31.939|35.331|92|12675|ETH405|A359|0|8|404;29.966|35.475|37|31200|MSC935|A20N|0|8|536;29.988|35.514|35|37000|MSR635|B738|0|8|526;29.549|35.549|75|41000|QTR22L|B788|0|8|550;36.026|35.816|129|39000|AIC158|B788|0|8|488;35.109|35.861|306|36000|AIC119|B77W|0|0|444;31.753|36.038|115|20275|ETD3QV|A321|0|8|428;31.601|36.037|124|9725|RJA734||0|8|296;35.54|36.214|157|33000|PGT720|A21N|0|8|416;35.132|36.426|157|31000|PGT1712|A20N|0|2|408;32.113|36.463|62|19150|RJA818|A20N|0|8|396;34.663|36.923|149|35000|ABY859||0|7|417;33.896|37.435|153|39000|AIC152|B788|0|8|473;33.093|37.791|129|37000|QTR15K|B77W|0|8|505"""
AC = []
for r in RAW.split(';'):
    p = r.split('|')
    AC.append(dict(lat=float(p[0]), lon=float(p[1]), trk=int(p[2]), alt=int(p[3]), cs=p[4], t=p[5], nic=int(p[7])))

PLANE = 'M0,-9 L1.6,-3 L8,1.5 L8,3 L1.6,1.2 L1.2,6 L3.4,7.8 L3.4,9 L0,8 L-3.4,9 L-3.4,7.8 L-1.2,6 L-1.6,1.2 L-8,3 L-8,1.5 L-1.6,-3 Z'
LABELED = {'ELY001','ELY005','ELY083','ETH405','WZZ456','KLM461','ISR584','ELY5416','RJA818','KAC543','AIC119','MSR635','RJA875'}

def font_b64(name):
    return base64.b64encode(open(B/f'gf/ofl/{name}', 'rb').read()).decode()
HEEBO = font_b64('heebo/Heebo[wght].ttf')

THEMES = {
 1: dict(name='יום', sea='#C7D6E0', land='#EEF0EA', border='#A9B0A6', lake='#B5C8D6', ink='#16222E', sub='#4A5866',
         panel='#FFFFFF', line='#D9DEE2', city='#3A4652', halo='#EEF0EA', accent='#0B4F8A', warn='#A8195C',
         alt=['#8A4B12','#B8860B','#1F7A6B','#1B4F9C'], btn='#FFFFFF', btnink='#16222E', shadow='rgba(22,34,46,.22)'),
 2: dict(name='לילה', sea='#0D1822', land='#1A2733', border='#3B4A58', lake='#0D1822', ink='#EDF2F6', sub='#A9B6C2',
         panel='#15212C', line='#2A3946', city='#C3CED8', halo='#1A2733', accent='#7FB8F0', warn='#FF7EB6',
         alt=['#F2A65A','#F2D15A','#6FD6C2','#8FB8FF'], btn='#15212C', btnink='#EDF2F6', shadow='rgba(0,0,0,.5)'),
}
def band(alt):
    return 0 if alt < 5000 else 1 if alt < 15000 else 2 if alt < 30000 else 3

def build(n):
    T = THEMES[n]
    planes, labels, cities, boxes = [], [], [], []
    def free(b):
        return all(b[2] < o[0] or b[0] > o[2] or b[3] < o[1] or b[1] > o[3] for o in boxes)
    for nm, lo, la in CITIES:
        x, y = xy(lo, la)
        if 30 < x < W-4 and 70 < y < MAPB-10:
            wd = len(nm)*7.6
            if nm in ('תל אביב','חיפה','עזה','ביירות'):
                cities.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2.2" fill="{T["city"]}"/><text x="{x-6:.1f}" y="{y+4:.1f}" class="city" style="text-anchor:start">{nm}</text>')
                boxes.append((x-8-wd, y-9, x+4, y+8))
            else:
                cities.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2.2" fill="{T["city"]}"/><text x="{x+6:.1f}" y="{y+4:.1f}" class="city">{nm}</text>')
                boxes.append((x-4, y-9, x+8+wd, y+8))
    vis = []
    for a in AC:
        x, y = xy(a['lon'], a['lat'])
        if -10 < x < W+10 and 62 < y < MAPB: vis.append((a, x, y))
    for a, x, y in vis: boxes.append((x-11, y-11, x+11, y+11))
    for a, x, y in sorted(vis, key=lambda v: v[0]['nic']):
        col = T['alt'][band(a['alt'])]
        ring = f'<circle r="13" fill="none" stroke="{T["warn"]}" stroke-width="1.8" stroke-dasharray="3.5 3"/>' if a['nic'] < 7 else ''
        planes.append(f'<g transform="translate({x:.1f},{y:.1f})">{ring}<path d="{PLANE}" transform="rotate({a["trk"]})" fill="{col}" stroke="{T["halo"]}" stroke-width="1" stroke-linejoin="round"/></g>')
        if a['cs']:
            w = len(a['cs'])*6.6
            for bx in ((x+15, y-7, x+15+w, y+7), (x-15-w, y-7, x-15, y+7), (x-w/2, y+13, x+w/2, y+27), (x-w/2, y-27, x-w/2+w, y-13)):
                if bx[0] > 4 and bx[2] < W-4 and bx[1] > 66 and bx[3] < MAPB and free(bx):
                    boxes.append(bx); labels.append(f'<text x="{bx[0]:.1f}" y="{bx[3]-3:.1f}" class="cs">{a["cs"]}</text>'); break
    shown = len(planes); low = sum(1 for a in AC if a['nic'] < 7)
    html = f'''<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{{font-family:Heebo;src:url(data:font/ttf;base64,{HEEBO});font-weight:100 900}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{width:{W}px;height:{H}px;font-family:Heebo,sans-serif;color:{T['ink']};background:{T['sea']};position:relative;overflow:hidden}}
svg.map{{position:absolute;inset:0}}
.city{{font:500 12.5px Heebo;fill:{T['city']};text-anchor:end;paint-order:stroke;stroke:{T['halo']};stroke-width:3px;stroke-linejoin:round}}
.cs{{font:500 11px Heebo;fill:{T['ink']};paint-order:stroke;stroke:{T['halo']};stroke-width:3px;stroke-linejoin:round;direction:ltr;text-anchor:start}}
.top{{position:absolute;top:0;left:0;right:0;padding:14px 14px 0;display:flex;align-items:center;justify-content:space-between}}
.brand{{display:flex;align-items:center;gap:9px;background:{T['btn']};border-radius:12px;padding:6px 12px 6px 14px;box-shadow:0 2px 10px {T['shadow']}}}
.mark{{width:34px;height:34px;border-radius:9px;background:{T['accent']};color:{T['panel'] if n==1 else '#0D1822'};font:800 24px/34px Heebo;text-align:center}}
.brand b{{font:700 20px Heebo;letter-spacing:.2px}}
.btns{{display:flex;gap:8px}}
button{{font:500 15px Heebo;color:{T['btnink']};background:{T['btn']};border:1.5px solid {T['line']};border-radius:12px;height:46px;padding:0 14px;display:flex;align-items:center;gap:7px;box-shadow:0 2px 10px {T['shadow']}}}
button svg{{width:19px;height:19px}}
.sheet{{position:absolute;left:0;right:0;bottom:0;background:{T['panel']};border-radius:18px 18px 0 0;box-shadow:0 -4px 22px {T['shadow']};padding:8px 18px 14px}}
.grip{{width:42px;height:4px;border-radius:2px;background:{T['line']};margin:0 auto 10px}}
.sheet h2{{font:700 19px Heebo;margin-bottom:2px}}
.fresh{{font:400 13px Heebo;color:{T['sub']};margin-bottom:8px}}
.row{{display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid {T['line']};width:100%;background:none;border-left:0;border-right:0;border-bottom:0;border-radius:0;box-shadow:none;height:auto;text-align:right}}
.dot{{flex:none;width:11px;height:11px;border-radius:50%}}
.row div{{flex:1}}
.row strong{{display:block;font:600 15.5px Heebo;color:{T['ink']}}}
.row span{{display:block;font:400 13.5px/1.35 Heebo;color:{T['sub']}}}
.chev{{flex:none;width:18px;height:18px;color:{T['sub']}}}
.credit{{font:400 11.5px Heebo;color:{T['sub']};border-top:1px solid {T['line']};padding-top:8px}}
.num{{position:absolute;top:74px;left:14px;width:44px;height:44px;border-radius:50%;background:#111;color:#fff;font:800 26px/44px Heebo;text-align:center;border:3px solid #fff}}
.legend{{position:absolute;right:14px;bottom:340px;background:{T['btn']};border-radius:10px;padding:7px 10px;box-shadow:0 2px 10px {T['shadow']};font:400 11.5px Heebo;color:{T['sub']}}}
.legend i{{display:inline-block;width:10px;height:10px;border-radius:2px;margin-inline-start:8px;margin-inline-end:4px;vertical-align:-1px}}
</style></head><body>
<svg class="map" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<path d="{land}" fill="{T['land']}" stroke="{T['border']}" stroke-width="1" fill-rule="evenodd"/>
<path d="{water}" fill="{T['lake']}" stroke="{T['border']}" stroke-width=".6"/>
{''.join(cities)}{''.join(planes)}{''.join(labels)}
</svg>
<div class="top">
 <div class="brand"><div class="mark">צ</div><b>צופיה</b></div>
 <div class="btns">
  <button><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/></svg>שכבות</button>
  <button>English</button>
 </div>
</div>
<div class="num">{n}</div>
<div class="legend" id="lg">גובה הטיסה<i style="background:{T['alt'][0]}"></i>נמוך<i style="background:{T['alt'][1]}"></i><i style="background:{T['alt'][2]}"></i><i style="background:{T['alt'][3]}"></i>גבוה</div>
<div class="sheet" id="sh">
 <div class="grip"></div>
 <h2>מה חריג עכשיו</h2>
 <p class="fresh">המטוסים עודכנו לפני 2 שניות</p>
 <button class="row"><i class="dot" style="background:{T['warn']}"></i><div><strong>שיבושי ניווט</strong><span>{low} מטוסים באזור מדווחים על דיוק מיקום נמוך. הם מסומנים במפה בעיגול מקווקו.</span></div><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m14 6-6 6 6 6"/></svg></button>
 <button class="row"><i class="dot" style="background:{T['alt'][2]}"></i><div><strong>מצבי חירום</strong><span>אף מטוס בעולם לא מכריז כרגע על חירום.</span></div><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m14 6-6 6 6 6"/></svg></button>
 <button class="row"><i class="dot" style="background:{T['alt'][2]}"></i><div><strong>השמיים באזור</strong><span>47 מטוסים באוויר סביב ישראל.</span></div><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m14 6-6 6 6 6"/></svg></button>
 <p class="credit">מקור המטוסים: adsb.lol. מקור המפה: Natural Earth.</p>
</div>
<script>document.fonts.ready.then(function(){{var s=document.getElementById('sh').offsetHeight;document.getElementById('lg').style.bottom=(s+12)+'px';document.title=s}});</script>
</body></html>'''
    (B/f'screen{n}.html').write_text(html, encoding='utf-8')
    return shown, low

from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/opt/pw-browsers/chromium/chrome-linux/chrome' if Path('/opt/pw-browsers/chromium/chrome-linux/chrome').exists() else None)
    for n in (1, 2):
        print(n, build(n))
        pg = br.new_page(viewport={'width': W, 'height': H}, device_scale_factor=2.5)
        pg.goto(f'file://{B}/screen{n}.html'); pg.wait_for_timeout(900); print('sheet', pg.title())
        pg.screenshot(path=str(B/f'tzofia-screen-{n}.png'))
    br.close()

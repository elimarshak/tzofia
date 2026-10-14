// Tzofia: map tiles of the CAMS air-quality forecast (Copernicus Atmosphere Monitoring Service, ECMWF; data licence CC BY 4.0).
// ECMWF's public map service does not allow other sites to use its pictures in a map directly (no CORS header),
// so this function fetches each tile and passes it on unchanged, with the header the browser needs.
//   GET ?l=pm25&t=2026-10-14T05:00:00Z&bbox=minx,miny,maxx,maxy   (web-map metres, EPSG:3857) -> a 256 x 256 PNG
// Only the layers listed here can be asked for, and only a sane box and time.
const LAYERS: Record<string, { layer: string; style: string }> = {
  // PM2.5 near the ground, the regional (European) model, about 10 km; the 'Reds' style covers 0 to 40 micrograms per cubic metre
  pm25: { layer: "composition_europe_pm2p5_forecast_surface", style: "sh_Reds_surface_concentration" },
};
const ORIGINS = ["https://openeye.co.il", "https://www.openeye.co.il", "https://elimarshak.github.io"];

Deno.serve(async (req) => {
  const o = req.headers.get("origin") ?? "";
  const h: Record<string, string> = { "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0], Vary: "Origin" };
  const q = new URL(req.url).searchParams;
  const def = LAYERS[q.get("l") ?? ""];
  const t = q.get("t") ?? "";
  const bbox = (q.get("bbox") ?? "").split(",").map(Number);
  if (!def || !/^\d{4}-\d\d-\d\dT\d\d:00:00Z$/.test(t) || bbox.length !== 4 || bbox.some((v) => !Number.isFinite(v) || Math.abs(v) > 20037509))
    return new Response("bad request", { status: 400, headers: h });
  const url = "https://eccharts.ecmwf.int/wms/?token=public&service=WMS&version=1.3.0&request=GetMap&format=image/png&transparent=true"
    + `&crs=EPSG:3857&width=256&height=256&layers=${def.layer}&styles=${def.style}&bbox=${bbox.join(",")}&time=${t}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "tzofia/0.1 (+https://github.com/elimarshak/tzofia)" } });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("image/")) return new Response("upstream error", { status: 502, headers: h });
    return new Response(r.body, { headers: { ...h, "Content-Type": type, "Cache-Control": "public, max-age=3600" } });
  } catch {
    return new Response("upstream error", { status: 502, headers: h });
  }
});

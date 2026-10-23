# 'חשופית' test only: AI super-resolution (SEN2SR, ESA OpenSR, RGB+NIR 10 m -> 2.5 m) of one point, for Ilya to
# compare with the pictures we already make. Follows the package's own README example step by step:
# cubo data cube (its default catalogue), bands B04 B03 B02 B08, values / 10,000, NaN -> 0, the SEN2SRLite
# NonReference_RGBN_x4 model, run on the CPU. Nothing here is used by the site or by the weekly run.
#   python sr_test.py POINT_META.json OUT_DIR
import json, sys, os
import numpy as np, torch, cubo, mlstac, sen2sr

META, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
m = json.load(open(META))
lat, lon = m["centre"]["lat"], m["centre"]["lon"]
device = "cpu"
mlstac.download(file="https://huggingface.co/tacofoundation/sen2sr/resolve/main/SEN2SRLite/NonReference_RGBN_x4/mlm.json",
                output_dir="model/SEN2SRLite_RGBN")
model = mlstac.load("model/SEN2SRLite_RGBN").compiled_model(device=device)

def clearest(label):
    days = m[label]["composite_days"]                    # the clear days our composite already used
    da = cubo.create(lat=lat, lon=lon, collection="sentinel-2-l2a", bands=["B04", "B03", "B02", "B08", "SCL"],
                     start_date=days[0], end_date=days[-1], edge_size=192, resolution=10)
    scl = da.sel(band="SCL").compute().to_numpy()
    bad = np.isin(scl, (0, 3, 8, 9, 10, 11)).mean(axis=(1, 2))
    i = int(np.argmin(bad))
    t = str(da.time.values[i])[:10]
    print(label, "dates", [str(x)[:10] for x in da.time.values], "cloud share", [round(float(b), 4) for b in bad], "chosen", t, flush=True)
    x = (da.sel(band=["B04", "B03", "B02", "B08"])[i].compute().to_numpy() / 10_000).astype("float32")
    return x, t, float(bad[i])

out = {}
for label in ("before", "after"):
    x, t, bad = clearest(label)
    X = torch.nan_to_num(torch.from_numpy(x).float().to(device), nan=0.0, posinf=0.0, neginf=0.0)
    with torch.no_grad():
        sup = model(X[None]).squeeze(0).cpu().numpy()
    np.save(f"{OUT}/{label}_orig10.npy", x)
    np.save(f"{OUT}/{label}_sr25.npy", sup)
    out[label] = {"date": t, "cloud_share": bad, "orig_shape": list(x.shape), "sr_shape": list(sup.shape)}
    print(label, out[label], flush=True)
json.dump({"centre": m["centre"], "edge_m": 1920, **out}, open(f"{OUT}/sr_meta.json", "w"), indent=1)

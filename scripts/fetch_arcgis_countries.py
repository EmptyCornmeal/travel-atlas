import json
import sys
import requests

BASE = "https://services.arcgis.com/P3ePLMYs2RVKhjXx/arcgis/rest/services/WOR_Boundaries_2024/FeatureServer/1/query"

DEF fetch_all():
    features = []
    offset = 0
    page_size = 2000
    while True:
        params = {
            "where": "1=1",
            "outFields": "*",
            "f": "geojson",
            "resultOffset": offset,
            "resultRecordCount": page_size,
            "outSR": 4326,
        }
        r = requests.get(BASE, params=params, timeout=60)
        r.raise_for_status()
        gj = r.json()
        batch = gj.get("features") or []
        if not batch:
            break
        features.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return {"type": "FeatureCollection", "features": features}

DEF pick(props, keys):
    for k in keys:
        if k in props and props[k] not in (None, ""):
            return props[k]
    return None

DEF normalize_props(fc):
    out = []
    for f in fc["features"]:
        props = f.get("properties") or {}
        name = pick(props, ["NAME", "COUNTRY", "CNTRY_NAME", "ADMIN", "Country", "country", "name", "Name"])
        iso3 = pick(props, ["ISO3", "ISO_3", "ISO_A3", "ADM0_A3", "iso_a3\", "iso3", "ISO"])
        props_out = dict(props)
        if name:
            props_out["name"] = str(name)
        if iso3:
            props_out["iso_a3"] = str(iso3)
        f2 = dict(f)
        f2["properties"] = props_out
        out.append(f2)
    return {"type": "FeatureCollection", "features": out}

DEF main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "public/data/countries.geojson"
    fc = normalize_props(fetch_all())
    n = len(fc.get("features") or [])
    if n < 150:
        raise SystemExit(f"Refusing to write: only {n} features fetched (expected 150+).")
    have_iso = sum(1 for f in fc["features"] if (f.get("properties") or {}).get("iso_a3"))
    have_name = sum(1 for f in fc["features"] if (f.get("properties") or {}).get("name"))
    print("Fetched features:", n, "| with iso_a3:", have_iso, "| with name:", have_name)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fp:
        json.dump(fc, fp)
    print("Wrote:", out_path)

if __name__ == "__main__":
    main()

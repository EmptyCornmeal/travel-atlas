import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import bbox from '@turf/bbox';
import { point as turfPoint } from '@turf/helpers';

export function findCountryIsoA3(
  countries: GeoJSON.FeatureCollection,
  lat: number,
  lng: number
): string | null {
  const pt = turfPoint([lng, lat]);

  for (const f of countries.features) {
    if (!f.geometry) continue;

    // quick bbox pre-check to avoid slow polygon checks
    const [minX, minY, maxX, maxY] = bbox(f as any);
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;

    if (booleanPointInPolygon(pt, f as any)) {
      const iso = (f.properties as any)?.iso_a3;
      return iso ? String(iso) : null;
    }
  }
  return null;
}

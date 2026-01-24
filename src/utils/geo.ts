import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import bbox from '@turf/bbox';
import { area as turfArea } from '@turf/turf';
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

export function buildCountryNameIndex(
  countries: GeoJSON.FeatureCollection | null
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(buildCountryIndex(countries)).map(([iso, entry]) => [iso, entry.name])
  );
}

export type CountryIndexEntry = {
  name: string;
  bounds: [number, number, number, number];
};

export function buildCountryIndex(
  countries: GeoJSON.FeatureCollection | null
): Record<string, CountryIndexEntry> {
  if (!countries) return {};

  const byIso: Record<string, { name: string; area: number; bounds: [number, number, number, number] }> = {};

  for (const feature of countries.features) {
    const props = feature.properties as Record<string, unknown> | undefined;
    const iso = props?.iso_a3 ? String(props.iso_a3) : null;
    if (!iso) continue;

    const name = String(props?.name || props?.COUNTRY || iso);
    let featureArea = 0;
    try {
      featureArea = turfArea(feature as any);
    } catch {
      featureArea = 0;
    }

    let featureBounds: [number, number, number, number];
    try {
      featureBounds = bbox(feature as any) as [number, number, number, number];
    } catch {
      continue;
    }

    const existing = byIso[iso];
    if (!existing) {
      byIso[iso] = { name, area: featureArea, bounds: featureBounds };
      continue;
    }

    const [minX, minY, maxX, maxY] = existing.bounds;
    const [fMinX, fMinY, fMaxX, fMaxY] = featureBounds;
    existing.bounds = [
      Math.min(minX, fMinX),
      Math.min(minY, fMinY),
      Math.max(maxX, fMaxX),
      Math.max(maxY, fMaxY),
    ];

    if (featureArea > existing.area) {
      existing.name = name;
      existing.area = featureArea;
    }
  }

  return Object.fromEntries(
    Object.entries(byIso).map(([iso, entry]) => [iso, { name: entry.name, bounds: entry.bounds }])
  );
}

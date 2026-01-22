/**
 * Script to fetch GeoJSON data from ArcGIS REST API and cache it locally.
 *
 * Usage: npx tsx scripts/fetch_esri_data.ts
 *
 * This script fetches:
 * - Countries boundaries with ISO A3 codes
 * - World cities dataset
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = join(process.cwd(), 'public', 'data');

// ArcGIS item IDs from the spec
const ARCGIS_ITEMS = {
  // World Countries (Generalized)
  countries: 'acc8fccf06d74364bffe6a9bd0dfded7',
  // Alternative country datasets if needed
  countries_alt1: '6b294b610199461b8e172acc1cfd2fee',
  countries_alt2: '2816c6a03f0740e9b13d563b93e60b9d',
};

// World Cities dataset URL (from ArcGIS Hub)
const WORLD_CITIES_URL = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/World_Cities/FeatureServer/0';

interface ArcGISItemResponse {
  url?: string;
  type?: string;
  name?: string;
}

interface ArcGISFeature {
  attributes: Record<string, unknown>;
  geometry: {
    rings?: number[][][];
    x?: number;
    y?: number;
    paths?: number[][][];
  };
}

interface ArcGISQueryResponse {
  features: ArcGISFeature[];
  exceededTransferLimit?: boolean;
  fields?: Array<{ name: string; type: string }>;
}

// Fetch item metadata to get the service URL
async function getItemServiceUrl(itemId: string): Promise<string | null> {
  const metadataUrl = `https://www.arcgis.com/sharing/rest/content/items/${itemId}?f=json`;

  try {
    const response = await fetch(metadataUrl);
    const data: ArcGISItemResponse = await response.json();

    if (data.url) {
      return data.url;
    }

    console.warn(`No service URL found for item ${itemId}`);
    return null;
  } catch (error) {
    console.error(`Error fetching item metadata for ${itemId}:`, error);
    return null;
  }
}

// Query features from an ArcGIS Feature Service with pagination
async function queryFeatures(
  serviceUrl: string,
  options: {
    where?: string;
    outFields?: string;
    returnGeometry?: boolean;
    resultOffset?: number;
    resultRecordCount?: number;
  } = {}
): Promise<ArcGISFeature[]> {
  const {
    where = '1=1',
    outFields = '*',
    returnGeometry = true,
    resultOffset = 0,
    resultRecordCount = 2000,
  } = options;

  const allFeatures: ArcGISFeature[] = [];
  let offset = resultOffset;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      where,
      outFields,
      returnGeometry: String(returnGeometry),
      f: 'json',
      resultOffset: String(offset),
      resultRecordCount: String(resultRecordCount),
    });

    const url = `${serviceUrl}/query?${params}`;
    console.log(`Fetching from offset ${offset}...`);

    try {
      const response = await fetch(url);
      const data: ArcGISQueryResponse = await response.json();

      if (data.features) {
        allFeatures.push(...data.features);
        console.log(`  Retrieved ${data.features.length} features (total: ${allFeatures.length})`);
      }

      hasMore = data.exceededTransferLimit === true;
      offset += resultRecordCount;
    } catch (error) {
      console.error('Error querying features:', error);
      hasMore = false;
    }
  }

  return allFeatures;
}

// Convert ArcGIS features to GeoJSON
function toGeoJSON(features: ArcGISFeature[], geometryType: 'polygon' | 'point'): GeoJSON.FeatureCollection {
  const geoJSONFeatures: GeoJSON.Feature[] = features.map(f => {
    let geometry: GeoJSON.Geometry;

    if (geometryType === 'polygon' && f.geometry.rings) {
      geometry = {
        type: 'Polygon',
        coordinates: f.geometry.rings,
      };

      // Check if it's a MultiPolygon (multiple rings that aren't holes)
      if (f.geometry.rings.length > 1) {
        // Simple check: if rings don't share the same winding, treat as MultiPolygon
        geometry = {
          type: 'MultiPolygon',
          coordinates: f.geometry.rings.map(ring => [ring]),
        };
      }
    } else if (geometryType === 'point' && f.geometry.x !== undefined) {
      geometry = {
        type: 'Point',
        coordinates: [f.geometry.x, f.geometry.y!],
      };
    } else {
      // Fallback for unknown geometry
      geometry = { type: 'Point', coordinates: [0, 0] };
    }

    return {
      type: 'Feature' as const,
      properties: f.attributes,
      geometry,
    };
  });

  return {
    type: 'FeatureCollection',
    features: geoJSONFeatures,
  };
}

// Fetch and process countries data
async function fetchCountries(): Promise<void> {
  console.log('\n=== Fetching Countries Data ===\n');

  // Try to get service URL from item ID
  let serviceUrl = await getItemServiceUrl(ARCGIS_ITEMS.countries);

  if (!serviceUrl) {
    // Fallback to a known working URL for world countries
    console.log('Using fallback URL for countries...');
    serviceUrl = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/World_Countries_Generalized/FeatureServer/0';
  }

  // ✅ ArcGIS item URLs often point at FeatureServer root. Query needs a layer (/0).
  if (/\/FeatureServer\/?$/.test(serviceUrl)) {
    serviceUrl = serviceUrl.replace(/\/FeatureServer\/?$/, '/FeatureServer/0');
  }

  console.log(`Service URL: ${serviceUrl}`);


  // Query features - focus on getting ISO_A3 and country name
  const features = await queryFeatures(serviceUrl, {
    outFields: '*',
    returnGeometry: true,
  });

  if (features.length === 0) {
    console.error('No country features retrieved!');
    return;
  }

  console.log(`\nTotal countries: ${features.length}`);

  // Convert to GeoJSON
  const geojson = toGeoJSON(features, 'polygon');

  // Normalize field names to ensure iso_a3 exists
  geojson.features.forEach(f => {
    const props = f.properties as Record<string, unknown>;

    // Try to find ISO A3 field (various naming conventions)
    const isoA3 = props.ISO_A3 || props.iso_a3 || props.ISO3 || props.iso3 ||
                  props.COUNTRY_CODE || props.ADM0_A3 || props.ISO;

    if (isoA3) {
      props.iso_a3 = String(isoA3);
    }

    // Normalize country name
    const name = props.COUNTRY || props.NAME || props.Country || props.name ||
                 props.NAME_EN || props.ADMIN;
    if (name) {
      props.name = String(name);
    }
  });

  // Write to file
  const outputPath = join(OUTPUT_DIR, 'countries.geojson');
  writeFileSync(outputPath, JSON.stringify(geojson, null, 2));
  console.log(`\nWritten to: ${outputPath}`);
}

// Fetch and process world cities data
async function fetchWorldCities(): Promise<void> {
  console.log('\n=== Fetching World Cities Data ===\n');
  console.log(`Service URL: ${WORLD_CITIES_URL}`);

  // Query features
  const features = await queryFeatures(WORLD_CITIES_URL, {
    outFields: '*',
    returnGeometry: true,
  });

  if (features.length === 0) {
    console.error('No city features retrieved!');
    return;
  }

  console.log(`\nTotal cities: ${features.length}`);

  // Convert to GeoJSON
  const geojson = toGeoJSON(features, 'point');

  // Normalize field names
  geojson.features.forEach(f => {
    const props = f.properties as Record<string, unknown>;

    // Normalize city name
    const name = props.CITY_NAME || props.NAME || props.City || props.city;
    if (name) {
      props.name = String(name);
    }

    // Normalize country
    const country = props.CNTRY_NAME || props.COUNTRY || props.Country || props.country;
    if (country) {
      props.country = String(country);
    }

    // Normalize population
    const pop = props.POP || props.POPULATION || props.pop || props.population;
    if (pop !== undefined) {
      props.pop = Number(pop);
    }
  });

  // Write to file
  const outputPath = join(OUTPUT_DIR, 'world_cities.geojson');
  writeFileSync(outputPath, JSON.stringify(geojson, null, 2));
  console.log(`\nWritten to: ${outputPath}`);
}

// Main execution
async function main(): Promise<void> {
  console.log('ArcGIS Data Fetcher for Travel Atlas\n');
  console.log('=====================================\n');

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created directory: ${OUTPUT_DIR}`);
  }

  try {
    await fetchCountries();
    await fetchWorldCities();
    console.log('\n✓ All data fetched successfully!\n');
  } catch (error) {
    console.error('\nError during data fetch:', error);
    process.exit(1);
  }
}

main();

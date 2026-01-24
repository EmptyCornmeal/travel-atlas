// Nominatim geocoding service with throttling and debouncing

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'TravelAtlas/1.0';
const MIN_REQUEST_INTERVAL = 1000; // Nominatim requires 1 second between requests

let lastRequestTime = 0;

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
  type?: string;
  class?: string;
}

export interface GeocodingResult {
  id: string;
  name: string;
  displayName: string;
  lat: number;
  lng: number;
  country?: string;
  countryCode?: string;
  type: 'city' | 'poi' | 'other';
  placeClass?: string;
  placeType?: string;
}

// Throttle requests to respect Nominatim rate limits
async function throttledFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();

  return fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });
}

// Forward geocoding - search for places by name
type SearchOptions = {
  limit?: number;
  bounds?: [number, number, number, number];
  countryName?: string;
};

export async function searchPlaces(query: string, options: SearchOptions = {}): Promise<GeocodingResult[]> {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [];

  const { limit = 10, bounds, countryName } = options;
  const effectiveQuery = countryName ? `${normalizedQuery}, ${countryName}` : normalizedQuery;

  const params = new URLSearchParams({
    q: effectiveQuery,
    format: 'json',
    addressdetails: '1',
    limit: String(limit),
    'accept-language': 'en',
  });

  if (bounds) {
    params.set('viewbox', `${bounds[0]},${bounds[3]},${bounds[2]},${bounds[1]}`);
    params.set('bounded', '1');
  }

  try {
    const response = await throttledFetch(`${NOMINATIM_BASE_URL}/search?${params}`);

    if (!response.ok) {
      console.error('Nominatim search failed:', response.status);
      return [];
    }

    const results: NominatimResult[] = await response.json();

    return results.map(r => ({
      id: String(r.place_id),
      name: r.name || r.display_name.split(',')[0],
      displayName: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      country: r.address?.country,
      countryCode: r.address?.country_code?.toUpperCase(),
      type: inferResultType(r),
      placeClass: r.class,
      placeType: r.type,
    }));
  } catch (error) {
    console.error('Geocoding error:', error);
    return [];
  }
}

// Reverse geocoding - get place info from coordinates
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodingResult | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'json',
    addressdetails: '1',
    'accept-language': 'en',
  });

  try {
    const response = await throttledFetch(`${NOMINATIM_BASE_URL}/reverse?${params}`);

    if (!response.ok) {
      console.error('Nominatim reverse geocode failed:', response.status);
      return null;
    }

    const result: NominatimResult = await response.json();

    if (!result.lat) return null;

    // Extract a good name from the address
    const name = extractBestName(result);

    return {
      id: String(result.place_id),
      name,
      displayName: result.display_name,
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      country: result.address?.country,
      countryCode: result.address?.country_code?.toUpperCase(),
      type: inferResultType(result),
      placeClass: result.class,
      placeType: result.type,
    };
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

// Extract the best name from a Nominatim result
function extractBestName(result: NominatimResult): string {
  if (result.name) return result.name;

  const address = result.address;
  if (!address) return result.display_name.split(',')[0];

  // Priority order for name extraction
  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    result.display_name.split(',')[0]
  );
}

// Infer the type of result based on Nominatim classification
function inferResultType(result: NominatimResult): 'city' | 'poi' | 'other' {
  const placeClass = result.class;
  const placeType = result.type;

  // Cities and populated places
  if (placeClass === 'place') {
    if (['city', 'town', 'village', 'hamlet', 'municipality'].includes(placeType || '')) {
      return 'city';
    }
  }

  // POI-like places
  if (['tourism', 'amenity', 'shop', 'leisure', 'historic'].includes(placeClass || '')) {
    return 'poi';
  }

  return 'other';
}

function normalizeQuery(query: string): string {
  return query
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/(,\s*){2,}/g, ', ')
    .replace(/,\s*$/, '');
}

// Debounce helper for search input
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

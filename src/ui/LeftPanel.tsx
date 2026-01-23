import { useState, useCallback, useMemo } from 'react';
import bbox from '@turf/bbox';
import type { FilterState, LayerVisibility, Category, User } from '../types';
import { searchPlaces, debounce, type GeocodingResult } from '../services/geocoding';
import { USER_COLORS } from '../types';
import './LeftPanel.css';

// Country search result type
export interface CountrySearchResult {
  id: string;
  isoA3: string;
  name: string;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  type: 'country';
}

interface LeftPanelProps {
  user: User;
  otherUser: User | null;
  filters: FilterState;
  layers: LayerVisibility;
  categories: Category[];
  countriesGeoJSON: GeoJSON.FeatureCollection | null;
  worldCities: GeoJSON.FeatureCollection | null;
  onFiltersChange: (filters: FilterState) => void;
  onLayersChange: (layers: LayerVisibility) => void;
  onSearchResultPreview: (result: GeocodingResult) => void;
  onCountrySelect: (isoA3: string, bbox: [number, number, number, number]) => void;
  onSearchReset: () => void;
}

export function LeftPanel({
  user,
  otherUser,
  filters,
  layers,
  categories,
  countriesGeoJSON,
  worldCities,
  onFiltersChange,
  onLayersChange,
  onSearchResultPreview,
  onCountrySelect,
  onSearchReset,
}: LeftPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [countryResults, setCountryResults] = useState<CountrySearchResult[]>([]);
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'filters' | 'legend'>('filters');

  const normalizeCoordinates = (coords: number[]): { lat: number; lng: number } | null => {
    if (coords.length < 2) return null;
    const [x, y] = coords;

    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
      return { lat: y, lng: x };
    }

    const originShift = 20037508.34;
    const lng = (x / originShift) * 180;
    const lat = (y / originShift) * 180;
    const latRadians = (Math.PI / 180) * lat;
    const latDegrees =
      (180 / Math.PI) * (2 * Math.atan(Math.exp(latRadians)) - Math.PI / 2);

    if (!Number.isFinite(lng) || !Number.isFinite(latDegrees)) return null;

    return { lat: latDegrees, lng };
  };

  // Search countries, then world cities, then fall back to Nominatim
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setCountryResults([]);
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const lowerQuery = query.toLowerCase();

    // First, search countries by name
    const matchedCountries: CountrySearchResult[] = [];
    if (countriesGeoJSON) {
      countriesGeoJSON.features.forEach(feature => {
        const name = feature.properties?.name || '';
        const isoA3 = feature.properties?.iso_a3;

        if (isoA3 && name.toLowerCase().includes(lowerQuery)) {
          // Compute bbox for the country
          const featureBbox = bbox(feature as any) as [number, number, number, number];
          matchedCountries.push({
            id: `country-${isoA3}`,
            isoA3,
            name,
            bbox: featureBbox,
            type: 'country',
          });
        }
      });
    }
    // Sort: exact matches first, then by name length (shorter = more specific)
    matchedCountries.sort((a, b) => {
      const aExact = a.name.toLowerCase() === lowerQuery;
      const bExact = b.name.toLowerCase() === lowerQuery;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.name.length - b.name.length;
    });
    setCountryResults(matchedCountries.slice(0, 5));

    // Then search in local world cities dataset
    const localResults: GeocodingResult[] = [];
    if (worldCities) {
      worldCities.features.forEach(feature => {
        const name = feature.properties?.name || feature.properties?.CITY_NAME || '';
        const country = feature.properties?.country || feature.properties?.CNTRY_NAME || '';

        if (name.toLowerCase().includes(lowerQuery)) {
          const coords = (feature.geometry as GeoJSON.Point).coordinates as number[];
          const normalizedCoords = normalizeCoordinates(coords);
          if (!normalizedCoords) {
            return;
          }
          localResults.push({
            id: `local-${name}-${normalizedCoords.lng}-${normalizedCoords.lat}`,
            name,
            displayName: `${name}, ${country}`,
            lat: normalizedCoords.lat,
            lng: normalizedCoords.lng,
            country,
            type: 'city',
          });
        }
      });
    }

    // Also search Nominatim for more results
    try {
      const nominatimResults = await searchPlaces(query, 5);
      // Combine results, prioritizing local cities and deduping
      const combined = [...localResults, ...nominatimResults];
      const deduped = combined.filter((result, index, all) => {
        const key = `${result.name.toLowerCase()}|${result.country?.toLowerCase() || ''}|${result.type}`;
        return all.findIndex(r =>
          `${r.name.toLowerCase()}|${r.country?.toLowerCase() || ''}|${r.type}` === key
        ) === index;
      });
      setSearchResults(deduped.slice(0, 10));
    } catch (error) {
      console.error('Search error:', error);
      // Keep local results if Nominatim fails
      setSearchResults(localResults.slice(0, 10));
    }

    setIsSearching(false);
  }, [countriesGeoJSON, worldCities]);

  // Debounced search
  const debouncedSearch = useMemo(
    () => debounce((query: string) => performSearch(query), 300),
    [performSearch]
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    debouncedSearch(query);
  };

  const handleCountryResultClick = (result: CountrySearchResult) => {
    onCountrySelect(result.isoA3, result.bbox);
    setSearchQuery('');
    setCountryResults([]);
    setSearchResults([]);
  };

  const handleResultClick = (result: GeocodingResult) => {
    onSearchResultPreview(result);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setCountryResults([]);
    setSearchResults([]);
    onSearchReset();
  };

  const handleFilterChange = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const handleLayerToggle = (layer: keyof LayerVisibility) => {
    onLayersChange({ ...layers, [layer]: !layers[layer] });
  };

  const handleCategoryToggle = (categoryId: string) => {
    const newCategories = filters.categories.includes(categoryId)
      ? filters.categories.filter(c => c !== categoryId)
      : [...filters.categories, categoryId];
    handleFilterChange('categories', newCategories);
  };

  return (
    <div className="left-panel">
      <div className="panel-header">
        <h2>Travel Atlas</h2>
        <span className="user-badge" style={{ backgroundColor: USER_COLORS[user.color].light }}>
          {user.name}
        </span>
      </div>

      {/* Search */}
      <div className="search-section">
        <div className="search-field">
          <input
            type="text"
            placeholder="Search countries, cities, or places..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="search-input"
          />
          {searchQuery && (
            <button className="search-clear-btn" onClick={handleClearSearch} aria-label="Reset search">
              ×
            </button>
          )}
        </div>
        {isSearching && <div className="search-loading">Searching...</div>}

        {(countryResults.length > 0 || searchResults.length > 0) && (
          <ul className="search-results">
            {/* Country results first */}
            {countryResults.map(result => (
              <li key={result.id} className="search-result-item">
                <button onClick={() => handleCountryResultClick(result)} className="result-btn">
                  <span className="result-name">{result.name}</span>
                  <span className="result-detail">Country</span>
                  <span className="result-type type-country">country</span>
                </button>
              </li>
            ))}
            {/* City/place results */}
            {searchResults.map(result => (
              <li key={result.id} className="search-result-item">
                <button onClick={() => handleResultClick(result)} className="result-btn">
                  <span className="result-name">{result.name}</span>
                  <span className="result-detail">{result.country || result.displayName}</span>
                  <span className={`result-type type-${result.type}`}>{result.type}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Layer Toggles */}
      <div className="section">
        <h3>Layers</h3>
        <div className="toggle-group">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={layers.countries}
              onChange={() => handleLayerToggle('countries')}
            />
            <span>Countries</span>
          </label>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={layers.cities}
              onChange={() => handleLayerToggle('cities')}
            />
            <span>Cities</span>
          </label>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={layers.pois}
              onChange={() => handleLayerToggle('pois')}
            />
            <span>POIs</span>
          </label>
        </div>
      </div>

      <div className="section panel-tabs">
        <button
          className={`panel-tab ${activeTab === 'filters' ? 'active' : ''}`}
          onClick={() => setActiveTab('filters')}
        >
          Filters
        </button>
        <button
          className={`panel-tab ${activeTab === 'legend' ? 'active' : ''}`}
          onClick={() => setActiveTab('legend')}
        >
          Legend
        </button>
      </div>

      {activeTab === 'filters' && (
        <div className="section filter-sections">
          <details className="filter-section" open>
            <summary>People & status</summary>
            <div className="filter-group">
              <label>Who</label>
              <select
                value={filters.who}
                onChange={e => handleFilterChange('who', e.target.value as FilterState['who'])}
              >
                <option value="all">Everyone</option>
                <option value="mine">Mine only</option>
                <option value="theirs">{otherUser?.name || 'Theirs'} only</option>
                <option value="both">Both</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Status</label>
              <select
                value={filters.status}
                onChange={e => handleFilterChange('status', e.target.value as FilterState['status'])}
              >
                <option value="all">All</option>
                <option value="want">Want to visit</option>
                <option value="been">Have visited</option>
              </select>
            </div>
          </details>

          <details className="filter-section" open>
            <summary>POI details</summary>
            <div className="filter-group">
              <label>Priority (POIs)</label>
              <select
                value={filters.priority}
                onChange={e => handleFilterChange('priority', e.target.value as FilterState['priority'])}
              >
                <option value="all">All</option>
                <option value="high">High</option>
                <option value="med">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            {categories.length > 0 && (
              <div className="filter-group">
                <label>Categories (POIs)</label>
                <div className="category-chips">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      className={`category-chip ${filters.categories.includes(cat.id) ? 'active' : ''}`}
                      onClick={() => handleCategoryToggle(cat.id)}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </details>
        </div>
      )}

      {activeTab === 'legend' && (
        <div className="section legend">
          <h3>Legend</h3>

          <div className="legend-group">
            <span className="legend-title">Color = Who</span>
            <div className="legend-item">
              <span className="legend-swatch" style={{ backgroundColor: USER_COLORS.blue.solid }}></span>
              <span>{user.color === 'blue' ? user.name : otherUser?.name || 'Myles'}</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch" style={{ backgroundColor: USER_COLORS.red.solid }}></span>
              <span>{user.color === 'red' ? user.name : otherUser?.name || 'Viktoria'}</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch" style={{ backgroundColor: USER_COLORS.purple.solid }}></span>
              <span>Both</span>
            </div>
          </div>

          <div className="legend-group">
            <span className="legend-title">Fill = Status</span>
            <div className="legend-item">
              <span className="legend-swatch solid"></span>
              <span>Have visited</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch hatched"></span>
              <span>Want to visit</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LeftPanel;

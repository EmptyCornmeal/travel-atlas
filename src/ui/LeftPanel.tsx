import { useState, useCallback, useMemo, useEffect } from 'react';
import type { FilterState, LayerVisibility, Category, User } from '../types';
import { searchPlaces, debounce, type GeocodingResult } from '../services/geocoding';
import { USER_COLORS } from '../types';
import './LeftPanel.css';

type SelectedCountry = {
  isoA3: string;
  name: string;
  bounds: [number, number, number, number];
};

interface LeftPanelProps {
  user: User;
  otherUser: User | null;
  filters: FilterState;
  layers: LayerVisibility;
  categories: Category[];
  selectedCountry: SelectedCountry | null;
  isDropPinMode: boolean;
  onFiltersChange: (filters: FilterState) => void;
  onLayersChange: (layers: LayerVisibility) => void;
  onSearchResultPreview: (result: GeocodingResult) => void;
  onSearchReset: () => void;
  onStartDropPin: () => void;
}

export function LeftPanel({
  user,
  otherUser,
  filters,
  layers,
  categories,
  selectedCountry,
  isDropPinMode,
  onFiltersChange,
  onLayersChange,
  onSearchResultPreview,
  onSearchReset,
  onStartDropPin,
}: LeftPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchWithinCountry, setSearchWithinCountry] = useState(!!selectedCountry);
  const [activeTab, setActiveTab] = useState<'filters' | 'legend'>('filters');

  useEffect(() => {
    if (selectedCountry) {
      setSearchWithinCountry(true);
      return;
    }
    setSearchWithinCountry(false);
  }, [selectedCountry]);

  // Search Nominatim for places (POI-focused)
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);

    try {
      const nominatimResults = await searchPlaces(query, {
        limit: 20,
        bounds: searchWithinCountry && selectedCountry ? selectedCountry.bounds : undefined,
        countryName: searchWithinCountry && selectedCountry ? selectedCountry.name : undefined,
      });
      const filtered = nominatimResults.filter(result => {
        if (result.type === 'city') return false;
        if (result.type === 'other' && result.country) {
          return result.name.toLowerCase() !== result.country.toLowerCase();
        }
        return true;
      });
      setSearchResults(filtered.slice(0, 12));
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    }

    setIsSearching(false);
  }, [searchWithinCountry, selectedCountry]);

  // Debounced search
  const debouncedSearch = useMemo(
    () => debounce((query: string) => performSearch(query), 300),
    [performSearch]
  );

  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      debouncedSearch(searchQuery);
    }
  }, [searchWithinCountry, selectedCountry, searchQuery, debouncedSearch]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    debouncedSearch(query);
  };

  const handleResultClick = (result: GeocodingResult) => {
    onSearchResultPreview(result);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
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
            placeholder="Search places..."
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
        <div className="search-options">
          <label className={`toggle-label ${!selectedCountry ? 'disabled' : ''}`}>
            <input
              type="checkbox"
              checked={searchWithinCountry}
              onChange={() => setSearchWithinCountry(prev => !prev)}
              disabled={!selectedCountry}
            />
            <span>
              Search within selected country
              {selectedCountry ? ` (${selectedCountry.name})` : ''}
            </span>
          </label>
          {!selectedCountry && (
            <span className="search-helper">Select a country to enable local search.</span>
          )}
        </div>
        {isSearching && <div className="search-loading">Searching...</div>}

        {searchResults.length > 0 && (
          <ul className="search-results">
            {searchResults.map(result => (
              <li key={result.id} className="search-result-item">
                <button onClick={() => handleResultClick(result)} className="result-btn">
                  <span className="result-name">{result.name}</span>
                  <span className="result-detail">{result.country || result.displayName}</span>
                  <span className={`result-type type-${result.type === 'poi' ? 'poi' : 'place'}`}>
                    {result.type === 'poi' ? 'poi' : 'place'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!isSearching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
          <div className="search-empty">
            <p>No results yet. Try a different spelling or switch off the country filter.</p>
            <button className="secondary-action" onClick={onStartDropPin}>
              Add POI by clicking the map
            </button>
          </div>
        )}
        {isDropPinMode && (
          <div className="search-pin-mode">
            Click the map to drop a pin for a new POI.
          </div>
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
            <div className="legend-item">
              <span className="legend-swatch" style={{ backgroundColor: USER_COLORS.mixed.solid }}></span>
              <span>Mixed status</span>
            </div>
          </div>

          <div className="legend-group">
            <span className="legend-title">Countries</span>
            <div className="legend-item">
              <span className="legend-swatch solid"></span>
              <span>Visited (fill)</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch hatched"></span>
              <span>Want to visit (hatched)</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch neutral"></span>
              <span>Unmarked</span>
            </div>
          </div>

          <div className="legend-group">
            <span className="legend-title">Cities</span>
            <div className="legend-item legend-item-multi">
              <span className="legend-item-label">Visited</span>
              <div className="legend-swatch-row">
                <span className="legend-swatch city-solid" style={{ borderColor: USER_COLORS.blue.dark, backgroundColor: USER_COLORS.blue.solid }}></span>
                <span className="legend-swatch city-solid" style={{ borderColor: USER_COLORS.red.dark, backgroundColor: USER_COLORS.red.solid }}></span>
                <span className="legend-swatch city-solid" style={{ borderColor: USER_COLORS.purple.dark, backgroundColor: USER_COLORS.purple.solid }}></span>
                <span className="legend-swatch city-solid" style={{ borderColor: USER_COLORS.mixed.dark, backgroundColor: USER_COLORS.mixed.solid }}></span>
              </div>
            </div>
            <div className="legend-item legend-item-multi">
              <span className="legend-item-label">Want to visit</span>
              <div className="legend-swatch-row">
                <span className="legend-swatch city-hollow city-outline" style={{ borderColor: USER_COLORS.blue.dark }}></span>
                <span className="legend-swatch city-hollow city-outline" style={{ borderColor: USER_COLORS.red.dark }}></span>
                <span className="legend-swatch city-hollow city-outline" style={{ borderColor: USER_COLORS.purple.dark }}></span>
                <span className="legend-swatch city-hollow city-outline" style={{ borderColor: USER_COLORS.mixed.dark }}></span>
              </div>
            </div>
            <div className="legend-item">
              <span className="legend-swatch city-neutral"></span>
              <span>Unmarked</span>
            </div>
          </div>

          <div className="legend-group">
            <span className="legend-title">Points of interest</span>
            <div className="legend-item">
              <span className="legend-swatch poi-solid" style={{ backgroundColor: USER_COLORS.purple.solid }}></span>
              <span>Both (endorsed)</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch poi-solid"></span>
              <span>Visited</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch poi-hatched"></span>
              <span>Want to visit</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LeftPanel;

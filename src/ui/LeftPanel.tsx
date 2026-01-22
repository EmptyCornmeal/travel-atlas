import { useState, useCallback, useMemo } from 'react';
import type { FilterState, LayerVisibility, Category, User } from '../types';
import { searchPlaces, debounce, type GeocodingResult } from '../services/geocoding';
import { USER_COLORS } from '../types';
import './LeftPanel.css';

interface LeftPanelProps {
  user: User;
  otherUser: User | null;
  filters: FilterState;
  layers: LayerVisibility;
  categories: Category[];
  worldCities: GeoJSON.FeatureCollection | null;
  onFiltersChange: (filters: FilterState) => void;
  onLayersChange: (layers: LayerVisibility) => void;
  onSearchResultSelect: (result: GeocodingResult, type: 'city' | 'poi') => void;
}

export function LeftPanel({
  user,
  otherUser,
  filters,
  layers,
  categories,
  worldCities,
  onFiltersChange,
  onLayersChange,
  onSearchResultSelect,
}: LeftPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAddOptions, setShowAddOptions] = useState<GeocodingResult | null>(null);

  // Search in world cities dataset first, then fall back to Nominatim
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);

    // First, search in local world cities dataset
    const localResults: GeocodingResult[] = [];
    if (worldCities) {
      const lowerQuery = query.toLowerCase();
      worldCities.features.forEach(feature => {
        const name = feature.properties?.name || feature.properties?.CITY_NAME || '';
        const country = feature.properties?.country || feature.properties?.CNTRY_NAME || '';

        if (name.toLowerCase().includes(lowerQuery)) {
          const coords = (feature.geometry as GeoJSON.Point).coordinates;
          localResults.push({
            id: `local-${name}-${coords[0]}-${coords[1]}`,
            name,
            displayName: `${name}, ${country}`,
            lat: coords[1],
            lng: coords[0],
            country,
            type: 'city',
          });
        }
      });
    }

    // If we have local results, show them first
    if (localResults.length > 0) {
      setSearchResults(localResults.slice(0, 10));
    }

    // Also search Nominatim for more results
    try {
      const nominatimResults = await searchPlaces(query, 5);
      // Combine results, prioritizing local cities
      const combined = [...localResults.slice(0, 5), ...nominatimResults];
      setSearchResults(combined.slice(0, 10));
    } catch (error) {
      console.error('Search error:', error);
      // Keep local results if Nominatim fails
      setSearchResults(localResults.slice(0, 10));
    }

    setIsSearching(false);
  }, [worldCities]);

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

  const handleResultClick = (result: GeocodingResult) => {
    setShowAddOptions(result);
  };

  const handleAddAs = (result: GeocodingResult, type: 'city' | 'poi') => {
    onSearchResultSelect(result, type);
    setShowAddOptions(null);
    setSearchQuery('');
    setSearchResults([]);
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
        <input
          type="text"
          placeholder="Search cities or places..."
          value={searchQuery}
          onChange={handleSearchChange}
          className="search-input"
        />
        {isSearching && <div className="search-loading">Searching...</div>}

        {searchResults.length > 0 && (
          <ul className="search-results">
            {searchResults.map(result => (
              <li key={result.id} className="search-result-item">
                {showAddOptions?.id === result.id ? (
                  <div className="add-options">
                    <span className="result-name">{result.displayName}</span>
                    <div className="add-buttons">
                      <button onClick={() => handleAddAs(result, 'city')} className="add-btn add-city">
                        + City
                      </button>
                      <button onClick={() => handleAddAs(result, 'poi')} className="add-btn add-poi">
                        + POI
                      </button>
                      <button onClick={() => setShowAddOptions(null)} className="add-btn cancel">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => handleResultClick(result)} className="result-btn">
                    <span className="result-name">{result.name}</span>
                    <span className="result-detail">{result.country || result.displayName}</span>
                    <span className={`result-type type-${result.type}`}>{result.type}</span>
                  </button>
                )}
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

      {/* Filters */}
      <div className="section">
        <h3>Filters</h3>

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
      </div>

      {/* Legend */}
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
    </div>
  );
}

export default LeftPanel;

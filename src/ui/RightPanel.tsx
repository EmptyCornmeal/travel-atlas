import { useState, useEffect, useMemo } from 'react';
import type { CountryState, City, POI, Category, User, Selection, POILink } from '../types';
import type { GeocodingResult } from '../services/geocoding';
import { USER_COLORS } from '../types';
import './RightPanel.css';

interface RightPanelProps {
  user: User;
  otherUser: User | null;
  selection: Selection;
  searchResult: GeocodingResult | null;
  countriesState: CountryState[];
  cities: City[];
  pois: POI[];
  categories: Category[];
  countriesGeoJSON: GeoJSON.FeatureCollection | null;
  worldCities: GeoJSON.FeatureCollection | null;
  onClose: () => void;
  onSearchResultAdd: (result: GeocodingResult) => void;
  onSearchResultClear: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onCountryFlagToggle: (isoA3: string, flag: 'want' | 'been', value: boolean) => void;
  onCountryCityAdd: (city: {
    name: string;
    lat: number;
    lng: number;
    countryIsoA3: string;
    status: 'want' | 'been';
  }) => void;
  onCitySelect: (cityId: string) => void;
  onCityFlagToggle: (cityId: string, flag: 'want' | 'been', value: boolean) => void;
  onCityDelete: (cityId: string) => void;
  onPOIUpdate: (poiId: string, updates: {
    label: string;
    status: 'want' | 'been';
    category_id: string | null;
    priority: 'low' | 'med' | 'high' | null;
    notes: string | null;
    links: POILink[];
  }) => void;
  onPOIEndorse: (poiId: string, value: boolean) => void;
  onPOIDelete: (poiId: string) => void;
  onCreateCategory: (name: string) => Promise<Category | null>;
}

export function RightPanel({
  user,
  otherUser,
  selection,
  searchResult,
  countriesState,
  cities,
  pois,
  categories,
  countriesGeoJSON,
  worldCities,
  onClose,
  onSearchResultAdd,
  onSearchResultClear,
  isCollapsed,
  onToggleCollapse,
  onCountryFlagToggle,
  onCountryCityAdd,
  onCitySelect,
  onCityFlagToggle,
  onCityDelete,
  onPOIUpdate,
  onPOIEndorse,
  onPOIDelete,
  onCreateCategory,
}: RightPanelProps) {
  const hasSelection = !!selection.type && !!selection.id;
  const hasSearchResult = !!searchResult;

  if (!hasSelection && !hasSearchResult) return null;

  const selectionSummary = getSelectionSummary({
    selection,
    cities,
    pois,
    countriesGeoJSON,
  });

  return (
    <div className={`right-panel ${isCollapsed ? 'collapsed' : ''}`}>
      <button className="close-btn" onClick={onClose}>×</button>
      <button className="collapse-btn" onClick={onToggleCollapse} aria-label="Toggle panel size">
        {isCollapsed ? '⟨' : '⟩'}
      </button>

      {isCollapsed ? (
        <div className="collapsed-summary">
          <div className="details-header">
            <h2>{hasSearchResult ? searchResult?.name : selectionSummary?.title}</h2>
            <span className="details-type">
              {hasSearchResult ? 'Search result' : selectionSummary?.typeLabel}
            </span>
          </div>
          <p className="collapsed-note">
            {hasSearchResult
              ? searchResult?.displayName
              : selectionSummary?.subtitle || 'Expand for details'}
          </p>
        </div>
      ) : (
        <>
          {hasSearchResult && searchResult && (
            <SearchDetails
              result={searchResult}
              onAdd={onSearchResultAdd}
              onClear={onSearchResultClear}
            />
          )}

          {selection.type === 'country' && (
            <CountryDetails
              isoA3={selection.id}
              user={user}
              otherUser={otherUser}
              countriesState={countriesState}
              countriesGeoJSON={countriesGeoJSON}
              cities={cities}
              worldCities={worldCities}
              onFlagToggle={onCountryFlagToggle}
              onCityAdd={onCountryCityAdd}
              onCitySelect={onCitySelect}
            />
          )}

          {selection.type === 'city' && (
            <CityDetails
              cityId={selection.id}
              user={user}
              otherUser={otherUser}
              cities={cities}
              onFlagToggle={onCityFlagToggle}
              onDelete={onCityDelete}
            />
          )}

          {selection.type === 'poi' && (
            <POIDetails
              poiId={selection.id}
              user={user}
              otherUser={otherUser}
              pois={pois}
              categories={categories}
              onUpdate={onPOIUpdate}
              onEndorse={onPOIEndorse}
              onDelete={onPOIDelete}
              onCreateCategory={onCreateCategory}
            />
          )}
        </>
      )}
    </div>
  );
}

function getSelectionSummary({
  selection,
  cities,
  pois,
  countriesGeoJSON,
}: {
  selection: Selection;
  cities: City[];
  pois: POI[];
  countriesGeoJSON: GeoJSON.FeatureCollection | null;
}): { title: string; subtitle?: string; typeLabel: string } | null {
  if (!selection.type || !selection.id) return null;
  if (selection.type === 'city') {
    const city = cities.find(c => c.id === selection.id);
    return { title: city?.name || 'City', typeLabel: 'City' };
  }
  if (selection.type === 'poi') {
    const poi = pois.find(p => p.id === selection.id);
    return { title: poi?.label || 'POI', typeLabel: 'POI' };
  }
  const countryFeature = countriesGeoJSON?.features.find(
    f => f.properties?.iso_a3 === selection.id
  );
  return {
    title: countryFeature?.properties?.name || selection.id,
    typeLabel: 'Country',
  };
}

function SearchDetails({
  result,
  onAdd,
  onClear,
}: {
  result: GeocodingResult;
  onAdd: (result: GeocodingResult) => void;
  onClear: () => void;
}) {
  return (
    <div className="details-content">
      <div className="details-header">
        <h2>{result.name}</h2>
        <span className="details-type">Search result</span>
      </div>

      <div className="search-meta">
        <div className="search-meta-row">
          <span className="meta-label">Location</span>
          <span className="meta-value">{result.displayName}</span>
        </div>
        <div className="search-meta-row">
          <span className="meta-label">Type</span>
          <span className={`result-type type-${result.type === 'poi' ? 'poi' : 'place'}`}>
            {result.type === 'poi' ? 'poi' : 'place'}
          </span>
        </div>
      </div>

      <div className="search-actions">
        <button className="primary-action" onClick={() => { onAdd(result); onClear(); }}>
          Add point of interest
        </button>
        <button className="secondary-action" onClick={onClear}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

// Country Details Component
function CountryDetails({
  isoA3,
  user,
  otherUser,
  countriesState,
  countriesGeoJSON,
  cities,
  worldCities,
  onFlagToggle,
  onCityAdd,
  onCitySelect,
}: {
  isoA3: string;
  user: User;
  otherUser: User | null;
  countriesState: CountryState[];
  countriesGeoJSON: GeoJSON.FeatureCollection | null;
  cities: City[];
  worldCities: GeoJSON.FeatureCollection | null;
  onFlagToggle: (isoA3: string, flag: 'want' | 'been', value: boolean) => void;
  onCityAdd: (city: {
    name: string;
    lat: number;
    lng: number;
    countryIsoA3: string;
    status: 'want' | 'been';
  }) => void;
  onCitySelect: (cityId: string) => void;
}) {
  const state = countriesState.find(s => s.iso_a3 === isoA3);
  const countryFeature = countriesGeoJSON?.features.find(
    f => f.properties?.iso_a3 === isoA3
  );
  const countryName = countryFeature?.properties?.name || isoA3;

  const userWant = state?.want_by?.[user.id] === true;
  const userBeen = state?.been_by?.[user.id] === true;
  const otherWant = otherUser && state?.want_by?.[otherUser.id] === true;
  const otherBeen = otherUser && state?.been_by?.[otherUser.id] === true;

  return (
    <div className="details-content">
      <div className="details-header">
        <h2>{countryName}</h2>
        <span className="details-type">Country</span>
      </div>

      <div className="status-section">
        <h3>Your Status</h3>
        <div className="status-buttons">
          <button
            className={`status-chip ${userWant ? 'active want' : ''}`}
            onClick={() => onFlagToggle(isoA3, 'want', !userWant)}
          >
            {userWant ? '✓' : ''} Want to visit
          </button>
          <button
            className={`status-chip ${userBeen ? 'active been' : ''}`}
            onClick={() => onFlagToggle(isoA3, 'been', !userBeen)}
          >
            {userBeen ? '✓' : ''} Have visited
          </button>
        </div>
      </div>

      {otherUser && (
        <div className="other-status">
          <h3>{otherUser.name}'s Status</h3>
          <div className="badges">
            {otherWant && (
              <span className="badge want" style={{ backgroundColor: USER_COLORS[otherUser.color].light }}>
                Wants to visit
              </span>
            )}
            {otherBeen && (
              <span className="badge been" style={{ backgroundColor: USER_COLORS[otherUser.color].light }}>
                Has visited
              </span>
            )}
            {!otherWant && !otherBeen && (
              <span className="badge none">No status</span>
            )}
          </div>
        </div>
      )}

      <CountryCityManager
        isoA3={isoA3}
        countryName={countryName}
        user={user}
        cities={cities}
        worldCities={worldCities}
        onCityAdd={onCityAdd}
        onCitySelect={onCitySelect}
        defaultStatus={userBeen ? 'been' : 'want'}
      />
    </div>
  );
}

function CountryCityManager({
  isoA3,
  countryName,
  user,
  cities,
  worldCities,
  onCityAdd,
  onCitySelect,
  defaultStatus,
}: {
  isoA3: string;
  countryName: string;
  user: User;
  cities: City[];
  worldCities: GeoJSON.FeatureCollection | null;
  onCityAdd: (city: {
    name: string;
    lat: number;
    lng: number;
    countryIsoA3: string;
    status: 'want' | 'been';
  }) => void;
  onCitySelect: (cityId: string) => void;
  defaultStatus: 'want' | 'been';
}) {
  const [cityQuery, setCityQuery] = useState('');
  const [cityStatus, setCityStatus] = useState<'want' | 'been'>(defaultStatus);

  useEffect(() => {
    setCityStatus(defaultStatus);
  }, [defaultStatus]);

  const citiesInCountry = useMemo(() => (
    cities
      .filter(city => city.country_iso_a3 === isoA3)
      .sort((a, b) => a.name.localeCompare(b.name))
  ), [cities, isoA3]);

  const matchingCities = useMemo(() => {
    if (!worldCities || cityQuery.trim().length < 2) return [];

    const query = cityQuery.trim().toLowerCase();
    const country = countryName.toLowerCase();
    const matches: GeocodingResult[] = [];

    for (const feature of worldCities.features) {
      const props = feature.properties as Record<string, unknown> | undefined;
      const name = (props?.name || props?.CITY_NAME || '') as string;
      const featureCountry = (props?.country || props?.CNTRY_NAME || '') as string;

      if (!name || !featureCountry) continue;

      const nameLower = name.toLowerCase();
      const countryLower = featureCountry.toLowerCase();

      if (!nameLower.includes(query)) continue;
      if (!(countryLower.includes(country) || country.includes(countryLower))) continue;

      const coords = (feature.geometry as GeoJSON.Point).coordinates as number[];
      if (coords.length < 2 || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) continue;

      matches.push({
        id: `local-${name}-${coords[0]}-${coords[1]}`,
        name,
        displayName: `${name}, ${featureCountry}`,
        lat: coords[1],
        lng: coords[0],
        country: featureCountry,
        type: 'city',
      });

      if (matches.length >= 8) break;
    }

    return matches;
  }, [worldCities, cityQuery, countryName]);

  const handleAddCity = (result: GeocodingResult) => {
    onCityAdd({
      name: result.name,
      lat: result.lat,
      lng: result.lng,
      countryIsoA3: isoA3,
      status: cityStatus,
    });
  };

  return (
    <div className="city-manager">
      <div className="section-header">
        <h3>Cities in {countryName}</h3>
        <span className="count-pill">{citiesInCountry.length}</span>
      </div>

      {citiesInCountry.length > 0 ? (
        <ul className="city-list">
          {citiesInCountry.map(city => {
            const userBeen = city.been_by?.[user.id] === true;
            const userWant = city.want_by?.[user.id] === true;
            const statusLabel = userBeen ? 'Visited' : userWant ? 'Want to visit' : 'Unmarked';
            return (
              <li key={city.id}>
                <button className="city-row" onClick={() => onCitySelect(city.id)}>
                  <span className="city-name">{city.name}</span>
                  <span className={`city-status ${userBeen ? 'been' : userWant ? 'want' : 'none'}`}>
                    {statusLabel}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty-state">No cities saved yet. Add the ones you have visited.</p>
      )}

      <div className="city-search">
        <div className="city-search-row">
          <input
            type="text"
            value={cityQuery}
            onChange={event => setCityQuery(event.target.value)}
            placeholder={`Add a city in ${countryName}`}
          />
          <select value={cityStatus} onChange={event => setCityStatus(event.target.value as 'want' | 'been')}>
            <option value="been">Visited</option>
            <option value="want">Want to visit</option>
          </select>
        </div>

        {cityQuery.trim().length >= 2 && (
          <ul className="city-search-results">
            {matchingCities.length > 0 ? (
              matchingCities.map(result => {
                const alreadyAdded = citiesInCountry.some(
                  city => city.name.toLowerCase() === result.name.toLowerCase()
                );
                return (
                  <li key={result.id}>
                    <button
                      className="city-result"
                      onClick={() => handleAddCity(result)}
                      disabled={alreadyAdded}
                    >
                      <span>
                        {result.name}
                        <span className="city-result-sub">{result.country}</span>
                      </span>
                      <span className="city-result-action">{alreadyAdded ? 'Added' : 'Add'}</span>
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="city-search-empty">No matches. Try another spelling.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

// City Details Component
function CityDetails({
  cityId,
  user,
  otherUser,
  cities,
  onFlagToggle,
  onDelete,
}: {
  cityId: string;
  user: User;
  otherUser: User | null;
  cities: City[];
  onFlagToggle: (cityId: string, flag: 'want' | 'been', value: boolean) => void;
  onDelete: (cityId: string) => void;
}) {
  const city = cities.find(c => c.id === cityId);
  if (!city) return <div className="details-content">City not found</div>;

  const isCreator = city.created_by === user.id;
  const userWant = city.want_by?.[user.id] === true;
  const userBeen = city.been_by?.[user.id] === true;
  const otherWant = otherUser && city.want_by?.[otherUser.id] === true;
  const otherBeen = otherUser && city.been_by?.[otherUser.id] === true;

  return (
    <div className="details-content">
      <div className="details-header">
        <h2>{city.name}</h2>
        <span className="details-type">City</span>
      </div>

      {isCreator && (
        <div className="creator-badge">You added this city</div>
      )}

      <div className="status-section">
        <h3>Your Status</h3>
        <div className="status-buttons">
          <button
            className={`status-chip ${userWant ? 'active want' : ''}`}
            onClick={() => onFlagToggle(cityId, 'want', !userWant)}
          >
            {userWant ? '✓' : ''} Want to visit
          </button>
          <button
            className={`status-chip ${userBeen ? 'active been' : ''}`}
            onClick={() => onFlagToggle(cityId, 'been', !userBeen)}
          >
            {userBeen ? '✓' : ''} Have visited
          </button>
        </div>
      </div>

      {otherUser && (
        <div className="other-status">
          <h3>{otherUser.name}'s Status</h3>
          <div className="badges">
            {otherWant && (
              <span className="badge want" style={{ backgroundColor: USER_COLORS[otherUser.color].light }}>
                Wants to visit
              </span>
            )}
            {otherBeen && (
              <span className="badge been" style={{ backgroundColor: USER_COLORS[otherUser.color].light }}>
                Has visited
              </span>
            )}
            {!otherWant && !otherBeen && (
              <span className="badge none">No status</span>
            )}
          </div>
        </div>
      )}

      {isCreator && (
        <div className="actions-section">
          <details className="danger-zone">
            <summary>Danger zone</summary>
            <button className="delete-btn" onClick={() => onDelete(cityId)}>
              Delete City
            </button>
          </details>
        </div>
      )}
    </div>
  );
}

// POI Details Component
function POIDetails({
  poiId,
  user,
  otherUser,
  pois,
  categories,
  onUpdate,
  onEndorse,
  onDelete,
  onCreateCategory,
}: {
  poiId: string;
  user: User;
  otherUser: User | null;
  pois: POI[];
  categories: Category[];
  onUpdate: (poiId: string, updates: {
    label: string;
    status: 'want' | 'been';
    category_id: string | null;
    priority: 'low' | 'med' | 'high' | null;
    notes: string | null;
    links: POILink[];
  }) => void;
  onEndorse: (poiId: string, value: boolean) => void;
  onDelete: (poiId: string) => void;
  onCreateCategory: (name: string) => Promise<Category | null>;
}) {
  const poi = pois.find(p => p.id === poiId);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    label: '',
    status: 'want' as 'want' | 'been',
    category_id: '' as string,
    priority: '' as string,
    notes: '',
    links: [] as POILink[],
  });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  useEffect(() => {
    if (poi) {
      setEditForm({
        label: poi.label,
        status: poi.status,
        category_id: poi.category_id || '',
        priority: poi.priority || '',
        notes: poi.notes || '',
        links: poi.links || [],
      });
    }
  }, [poi]);

  if (!poi) return <div className="details-content">POI not found</div>;

  const isCreator = poi.created_by === user.id;
  const userEndorsed = poi.endorsed_by?.[user.id] === true;
  const otherEndorsed = otherUser && poi.endorsed_by?.[otherUser.id] === true;
  const category = categories.find(c => c.id === poi.category_id);

  const handleSave = () => {
    onUpdate(poiId, {
      label: editForm.label,
      status: editForm.status,
      category_id: editForm.category_id || null,
      priority: (editForm.priority || null) as 'low' | 'med' | 'high' | null,
      notes: editForm.notes || null,
      links: editForm.links,
    });
    setIsEditing(false);
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    const newCat = await onCreateCategory(newCategoryName.trim());
    if (newCat) {
      setEditForm({ ...editForm, category_id: newCat.id });
      setNewCategoryName('');
    }
  };

  const handleAddLink = () => {
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return;
    setEditForm({
      ...editForm,
      links: [...editForm.links, { label: newLinkLabel.trim(), url: newLinkUrl.trim() }],
    });
    setNewLinkLabel('');
    setNewLinkUrl('');
  };

  const handleRemoveLink = (index: number) => {
    setEditForm({
      ...editForm,
      links: editForm.links.filter((_, i) => i !== index),
    });
  };

  if (isEditing && isCreator) {
    return (
      <div className="details-content edit-mode">
        <div className="details-header">
          <h2>Edit POI</h2>
        </div>

        <div className="edit-form">
          <div className="form-group">
            <label>Label</label>
            <input
              type="text"
              value={editForm.label}
              onChange={e => setEditForm({ ...editForm, label: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Status</label>
            <select
              value={editForm.status}
              onChange={e => setEditForm({ ...editForm, status: e.target.value as 'want' | 'been' })}
            >
              <option value="want">Want to visit</option>
              <option value="been">Have visited</option>
            </select>
          </div>

          <div className="form-group">
            <label>Category</label>
            <select
              value={editForm.category_id}
              onChange={e => setEditForm({ ...editForm, category_id: e.target.value })}
            >
              <option value="">No category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <div className="new-category">
              <input
                type="text"
                placeholder="New category name"
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
              />
              <button onClick={handleCreateCategory}>Add</button>
            </div>
          </div>

          <div className="form-group">
            <label>Priority</label>
            <select
              value={editForm.priority}
              onChange={e => setEditForm({ ...editForm, priority: e.target.value })}
            >
              <option value="">No priority</option>
              <option value="low">Low</option>
              <option value="med">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea
              value={editForm.notes}
              onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>Links</label>
            <div className="links-list">
              {editForm.links.map((link, index) => (
                <div key={index} className="link-item">
                  <span>{link.label}</span>
                  <a href={link.url} target="_blank" rel="noopener noreferrer">{link.url}</a>
                  <button className="remove-link" onClick={() => handleRemoveLink(index)}>×</button>
                </div>
              ))}
            </div>
            <div className="new-link">
              <input
                type="text"
                placeholder="Link label"
                value={newLinkLabel}
                onChange={e => setNewLinkLabel(e.target.value)}
              />
              <input
                type="url"
                placeholder="URL"
                value={newLinkUrl}
                onChange={e => setNewLinkUrl(e.target.value)}
              />
              <button onClick={handleAddLink}>Add Link</button>
            </div>
          </div>

          <div className="form-actions">
            <button className="save-btn" onClick={handleSave}>Save</button>
            <button className="cancel-btn" onClick={() => setIsEditing(false)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="details-content">
      <div className="details-header">
        <h2>{poi.label}</h2>
        <span className="details-type">POI</span>
      </div>

      <div className="poi-meta">
        <span className={`status-badge ${poi.status}`}>
          {poi.status === 'been' ? 'Visited' : 'Want to visit'}
        </span>
        {poi.priority && (
          <span className={`priority-badge ${poi.priority}`}>
            {poi.priority === 'high' ? 'High' : poi.priority === 'med' ? 'Medium' : 'Low'} priority
          </span>
        )}
        {category && (
          <span className="category-badge">{category.name}</span>
        )}
      </div>

      <div className="creator-info">
        <span>
          Added by {isCreator ? 'you' : (otherUser?.name || 'other user')}
        </span>
        <span
          className="creator-dot"
          style={{ backgroundColor: USER_COLORS[isCreator ? user.color : (otherUser?.color || 'purple')].solid }}
        />
      </div>

      {poi.notes && (
        <div className="notes-section">
          <h3>Notes</h3>
          <p>{poi.notes}</p>
        </div>
      )}

      {poi.links && poi.links.length > 0 && (
        <div className="links-section">
          <h3>Links</h3>
          <ul>
            {poi.links.map((link, index) => (
              <li key={index}>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="endorsement-section">
        <h3>Endorsements</h3>
        {isCreator ? (
          <div className="endorsement-status">
            {otherEndorsed ? (
              <span className="endorsed" style={{ color: USER_COLORS[otherUser?.color || 'purple'].solid }}>
                {otherUser?.name || 'Other user'} endorsed this
              </span>
            ) : (
              <span className="not-endorsed">Not yet endorsed by {otherUser?.name || 'other user'}</span>
            )}
          </div>
        ) : (
          <div className="endorsement-action">
            <button
              className={`endorse-btn ${userEndorsed ? 'endorsed' : ''}`}
              onClick={() => onEndorse(poiId, !userEndorsed)}
            >
              {userEndorsed ? '✓ Endorsed' : 'Endorse this POI'}
            </button>
          </div>
        )}
      </div>

      {isCreator && (
        <div className="actions-section">
          <button className="edit-btn" onClick={() => setIsEditing(true)}>
            Edit POI
          </button>
          <details className="danger-zone">
            <summary>Danger zone</summary>
            <button className="delete-btn" onClick={() => onDelete(poiId)}>
              Delete POI
            </button>
          </details>
        </div>
      )}
    </div>
  );
}

export default RightPanel;

import { useState, useEffect } from 'react';
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
  onClose: () => void;
  onSearchResultAdd: (result: GeocodingResult, type: 'city' | 'poi') => void;
  onSearchResultClear: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onCountryFlagToggle: (isoA3: string, flag: 'want' | 'been', value: boolean) => void;
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
  onClose,
  onSearchResultAdd,
  onSearchResultClear,
  isCollapsed,
  onToggleCollapse,
  onCountryFlagToggle,
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
              onFlagToggle={onCountryFlagToggle}
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
  onAdd: (result: GeocodingResult, type: 'city' | 'poi') => void;
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
          <span className={`result-type type-${result.type}`}>{result.type}</span>
        </div>
      </div>

      <div className="search-actions">
        <button className="primary-action" onClick={() => { onAdd(result, 'city'); onClear(); }}>
          Add city
        </button>
        <button className="secondary-action" onClick={() => { onAdd(result, 'poi'); onClear(); }}>
          Add POI
        </button>
        <button className="tertiary-action" onClick={onClear}>
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
  onFlagToggle,
}: {
  isoA3: string;
  user: User;
  otherUser: User | null;
  countriesState: CountryState[];
  countriesGeoJSON: GeoJSON.FeatureCollection | null;
  onFlagToggle: (isoA3: string, flag: 'want' | 'been', value: boolean) => void;
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

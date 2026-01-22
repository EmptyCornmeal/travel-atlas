import { useState, useEffect } from 'react';
import type { Category, POILink } from '../types';
import { reverseGeocode } from '../services/geocoding';
import './POIForm.css';

interface POIFormProps {
  lat: number;
  lng: number;
  categories: Category[];
  onSubmit: (poi: {
    label: string;
    lat: number;
    lng: number;
    status: 'want' | 'been';
    category_id: string | null;
    priority: 'low' | 'med' | 'high' | null;
    notes: string | null;
    links: POILink[];
  }) => void;
  onCancel: () => void;
  onCreateCategory: (name: string) => Promise<Category | null>;
}

export function POIForm({
  lat,
  lng,
  categories,
  onSubmit,
  onCancel,
  onCreateCategory,
}: POIFormProps) {
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState<'want' | 'been'>('want');
  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState('');
  const [notes, setNotes] = useState('');
  const [links, setLinks] = useState<POILink[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [isLoadingLabel, setIsLoadingLabel] = useState(false);

  // Auto-suggest label from reverse geocoding
  useEffect(() => {
    const fetchLabel = async () => {
      setIsLoadingLabel(true);
      const result = await reverseGeocode(lat, lng);
      if (result) {
        setLabel(result.name);
      }
      setIsLoadingLabel(false);
    };

    fetchLabel();
  }, [lat, lng]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!label.trim()) return;

    onSubmit({
      label: label.trim(),
      lat,
      lng,
      status,
      category_id: categoryId || null,
      priority: (priority || null) as 'low' | 'med' | 'high' | null,
      notes: notes.trim() || null,
      links,
    });
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    const newCat = await onCreateCategory(newCategoryName.trim());
    if (newCat) {
      setCategoryId(newCat.id);
      setNewCategoryName('');
    }
  };

  const handleAddLink = () => {
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return;
    setLinks([...links, { label: newLinkLabel.trim(), url: newLinkUrl.trim() }]);
    setNewLinkLabel('');
    setNewLinkUrl('');
  };

  const handleRemoveLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  return (
    <div className="poi-form-overlay" onClick={onCancel}>
      <div className="poi-form-modal" onClick={e => e.stopPropagation()}>
        <div className="poi-form-header">
          <h2>Add New POI</h2>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="poi-form">
          <div className="form-group">
            <label htmlFor="label">Label *</label>
            <input
              id="label"
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={isLoadingLabel ? 'Loading suggestion...' : 'Enter a name for this place'}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="status">Status *</label>
              <select
                id="status"
                value={status}
                onChange={e => setStatus(e.target.value as 'want' | 'been')}
              >
                <option value="want">Want to visit</option>
                <option value="been">Have visited</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="priority">Priority</label>
              <select
                id="priority"
                value={priority}
                onChange={e => setPriority(e.target.value)}
              >
                <option value="">No priority</option>
                <option value="high">High</option>
                <option value="med">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="category">Category</label>
            <select
              id="category"
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
            >
              <option value="">No category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <div className="inline-add">
              <input
                type="text"
                placeholder="New category name"
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
              />
              <button type="button" onClick={handleCreateCategory}>+</button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add any notes about this place"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>Links</label>
            {links.length > 0 && (
              <div className="links-preview">
                {links.map((link, index) => (
                  <div key={index} className="link-preview-item">
                    <span>{link.label}</span>
                    <span className="link-url">{link.url}</span>
                    <button type="button" onClick={() => handleRemoveLink(index)}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="link-inputs">
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
              <button type="button" onClick={handleAddLink}>Add</button>
            </div>
          </div>

          <div className="form-location">
            <span>Location: {lat.toFixed(5)}, {lng.toFixed(5)}</span>
          </div>

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={!label.trim()}>
              Add POI
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default POIForm;

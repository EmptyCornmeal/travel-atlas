import { useState, useEffect, useCallback } from 'react';
import type { User, CountryState, City, POI, Category, FilterState, LayerVisibility, Selection, POILink } from './types';
import {
  supabase,
  getCurrentUser,
  getOtherUser,
  toAppUser,
  fetchCountriesState,
  fetchCities,
  fetchPOIs,
  fetchCategories,
  setCountryFlag,
  createCity,
  setCityFlag,
  deleteCity,
  createPOI,
  updatePOIAsCreator,
  setPOIEndorsement,
  deletePOI,
  createCategory,
} from './services/supabase';
import { type GeocodingResult } from './services/geocoding';
import { TravelMap } from './map/TravelMap';
import { LeftPanel } from './ui/LeftPanel';
import { RightPanel } from './ui/RightPanel';
import { Auth } from './ui/Auth';
import { POIForm } from './ui/POIForm';
import { ToastContainer, useToasts } from './ui/Toast';
import './App.css';
import { findCountryIsoA3 } from './utils/geo';

// Sync interval (15 seconds)
const SYNC_INTERVAL = 15000;

// =========================
// Admin setup mode
// =========================
type ActingAs = 'me' | 'viktoria' | 'both';

const ADMIN_EMAIL = 'myles.colling@gmail.com';
const VIKTORIA_USER_ID = '329d827a-7e6d-4b43-8967-5d85c5776ff1';

// localStorage keys (persist on your device)
const LS_ADMIN_MODE = 'ta_adminMode';
const LS_ACTING_AS = 'ta_actingAs';

function App() {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // Data state
  const [countriesState, setCountriesState] = useState<CountryState[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [pois, setPOIs] = useState<POI[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [countriesGeoJSON, setCountriesGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [worldCities, setWorldCities] = useState<GeoJSON.FeatureCollection | null>(null);

  // UI state
  const [filters, setFilters] = useState<FilterState>({
    who: 'all',
    status: 'all',
    categories: [],
    priority: 'all',
  });
  const [layers, setLayers] = useState<LayerVisibility>({
    countries: true,
    cities: true,
    pois: true,
  });
  const [selection, setSelection] = useState<Selection>({ type: null, id: null });
  const [isLoading, setIsLoading] = useState(false);
  const [showPOIForm, setShowPOIForm] = useState<{ lat: number; lng: number } | null>(null);
  const [focusCountry, setFocusCountry] = useState<{ isoA3: string; bbox: [number, number, number, number] } | null>(
    null
  );

  // Admin UI state (persist on this device)
  const [adminMode, setAdminMode] = useState<boolean>(() => localStorage.getItem(LS_ADMIN_MODE) === '1');
  const [actingAs, setActingAs] = useState<ActingAs>(() => {
    const v = localStorage.getItem(LS_ACTING_AS) as ActingAs | null;
    return v === 'me' || v === 'viktoria' || v === 'both' ? v : 'me';
  });

  // Toast notifications
  const toast = useToasts();

  const isAdmin = user?.email === ADMIN_EMAIL;

  // Persist admin state locally (doesn't depend on her logging in)
  useEffect(() => {
    localStorage.setItem(LS_ADMIN_MODE, adminMode ? '1' : '0');
  }, [adminMode]);

  useEffect(() => {
    localStorage.setItem(LS_ACTING_AS, actingAs);
  }, [actingAs]);

  // Check auth state on mount with hard timeout fail-open
  useEffect(() => {
    let cancelled = false;

    // Hard timeout: never get stuck on Loading, even if auth explodes
    const timeout = setTimeout(() => {
      if (!cancelled) {
        console.warn('Auth check timed out, failing open');
        setIsAuthChecking(false);
      }
    }, 2500);

    (async () => {
      try {
        const currentUser = await getCurrentUser();
        if (cancelled) return;

        if (currentUser) {
          setUser(currentUser);
          try {
            const other = await getOtherUser(currentUser.email);
            if (!cancelled) setOtherUser(other);
          } catch (e) {
            console.warn('getOtherUser failed (non-fatal):', e);
          }
        }
      } catch (e) {
        console.error('Auth bootstrap failed (non-fatal):', e);
      } finally {
        if (!cancelled) {
          setIsAuthChecking(false);
          clearTimeout(timeout);
        }
      }
    })();

    // Listen for auth state changes (sign in/out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        // Skip INITIAL_SESSION to avoid racing bootstrap
        if (event === 'INITIAL_SESSION') return;

        if (event === 'SIGNED_IN' && session?.user) {
          const currentUser = toAppUser(session.user);
          if (!currentUser) return;

          setUser(currentUser);
          try {
            const other = await getOtherUser(currentUser.email);
            setOtherUser(other);
          } catch (e) {
            console.warn('getOtherUser in listener failed (non-fatal):', e);
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setOtherUser(null);
        }
      } catch (e) {
        console.error('onAuthStateChange failed:', e);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  // Load GeoJSON data on mount
  useEffect(() => {
    const loadGeoJSON = async () => {
      try {
        const base = import.meta.env.BASE_URL; // "/travel-atlas/" in production

        const [countriesRes, citiesRes] = await Promise.all([
          fetch(`${base}data/countries.geojson`),
          fetch(`${base}data/world_cities.geojson`),
        ]);

        if (countriesRes.ok) {
          const data = await countriesRes.json();
          setCountriesGeoJSON(data);
        }

        if (citiesRes.ok) {
          const data = await citiesRes.json();
          setWorldCities(data);
        }
      } catch (error) {
        console.error('Error loading GeoJSON:', error);
      }
    };

    loadGeoJSON();
  }, []);

  useEffect(() => {
    (window as any).__TA_DEBUG__ = {
      ...(window as any).__TA_DEBUG__,
      countriesLoaded: !!countriesGeoJSON,
      countryCount: countriesGeoJSON?.features?.length ?? 0,
    };
  }, [countriesGeoJSON]);

  // Fetch data when user is authenticated
  const fetchAllData = useCallback(async () => {
    if (!user) return;

    try {
      const [countries, citiesData, poisData, categoriesData] = await Promise.all([
        fetchCountriesState(),
        fetchCities(),
        fetchPOIs(),
        fetchCategories(),
      ]);

      setCountriesState(countries);
      setCities(citiesData);
      setPOIs(poisData);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
    }
  }, [user, toast]);

  useEffect(() => {
    if (user) {
      fetchAllData();
    }
  }, [user, fetchAllData]);

  // Periodic sync
  useEffect(() => {
    if (!user) return;

    const intervalId = setInterval(fetchAllData, SYNC_INTERVAL);

    // Also sync on window focus
    const handleFocus = () => {
      fetchAllData();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, fetchAllData]);

  // =========================
  // Admin-aware country writes
  // =========================
  const getTargetUserIds = useCallback((): string[] => {
    if (!user) return [];

    // Non-admin sessions always act as current user
    if (!isAdmin) return [user.id];

    // Admin off or acting as me -> current user only
    if (!adminMode || actingAs === 'me') return [user.id];

    if (actingAs === 'viktoria') return [VIKTORIA_USER_ID];
    return [user.id, VIKTORIA_USER_ID]; // both
  }, [user, isAdmin, adminMode, actingAs]);

  const adminAwareSetCountryFlag = useCallback(async (isoA3: string, flag: 'want' | 'been', value: boolean) => {
    if (!user) return;

    const targets = getTargetUserIds();

    // If only current user, use existing RPC for normal behavior
    if (targets.length === 1 && targets[0] === user.id) {
      await setCountryFlag(isoA3, flag, value);
      return;
    }

    // Otherwise admin path: write for each target user id
    for (const targetId of targets) {
      const { error } = await supabase.rpc('admin_set_country_flag', {
        p_iso_a3: isoA3,
        p_flag: flag,
        p_value: value,
        p_target_user_id: targetId,
      });
      if (error) throw error;
    }
  }, [user, getTargetUserIds]);

  const adminAwareSetCityFlag = useCallback(async (cityId: string, flag: 'want' | 'been', value: boolean) => {
    if (!user) return;

    const targets = getTargetUserIds();

    // Normal path (me-only)
    if (targets.length === 1 && targets[0] === user.id) {
      await setCityFlag(cityId, flag, value);
      return;
    }

    // Admin path
    for (const targetId of targets) {
      const { error } = await supabase.rpc('admin_set_city_flag', {
        p_city_id: cityId,
        p_flag: flag,
        p_value: value,
        p_target_user_id: targetId,
      });
      if (error) throw error;
    }
  }, [user, getTargetUserIds]);



  // Handlers
  const handleCountryClick = useCallback((isoA3: string) => {
    setSelection({ type: 'country', id: isoA3 });
  }, []);

  const handleCityClick = useCallback((cityId: string) => {
    setSelection({ type: 'city', id: cityId });
  }, []);

  const handlePOIClick = useCallback((poiId: string) => {
    setSelection({ type: 'poi', id: poiId });
  }, []);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setShowPOIForm({ lat, lng });
  }, []);

  const handleCloseSelection = useCallback(() => {
    setSelection({ type: null, id: null });
  }, []);

  // Country select from search (zoom and select)
  const handleCountrySelect = useCallback((isoA3: string, bbox: [number, number, number, number]) => {
    setSelection({ type: 'country', id: isoA3 });
    setFocusCountry({ isoA3, bbox });
    setTimeout(() => setFocusCountry(null), 800);
  }, []);

  // Country flag toggle with mutual exclusivity (been turns off want)
  const handleCountryFlagToggle = useCallback(async (isoA3: string, flag: 'want' | 'been', value: boolean) => {
    if (!user) return;

    setIsLoading(true);
    try {
      if (flag === 'been' && value) {
        await adminAwareSetCountryFlag(isoA3, 'want', false);
        await adminAwareSetCountryFlag(isoA3, 'been', true);
      } else {
        await adminAwareSetCountryFlag(isoA3, flag, value);
      }

      // If we acted as someone other than "me", re-sync from DB (avoid wrong optimistic write)
      if (isAdmin && adminMode && actingAs !== 'me') {
        await fetchAllData();
        toast.success('Saved');
        setIsLoading(false);
        return;
      }

      // Optimistic update (me-only)
      setCountriesState(prev => {
        const existing = prev.find(s => s.iso_a3 === isoA3);
        if (existing) {
          return prev.map(s => {
            if (s.iso_a3 !== isoA3) return s;
            const updated = { ...s };
            if (flag === 'been' && value) {
              updated.want_by = { ...s.want_by, [user.id]: false };
              updated.been_by = { ...s.been_by, [user.id]: true };
            } else {
              const flagKey = flag === 'want' ? 'want_by' : 'been_by';
              updated[flagKey] = { ...s[flagKey], [user.id]: value };
            }
            return updated;
          });
        } else {
          const newState: CountryState = {
            iso_a3: isoA3,
            want_by: flag === 'want' ? { [user.id]: value } : {},
            been_by: flag === 'been' ? { [user.id]: value } : {},
          };
          return [...prev, newState];
        }
      });

      toast.success('Saved');
    } catch (error) {
      console.error('Error toggling country flag:', error);
      toast.error('Failed to save');
    }
    setIsLoading(false);
  }, [user, isAdmin, adminMode, actingAs, adminAwareSetCountryFlag, fetchAllData, toast]);

  // City flag toggle (admin-aware)
  const handleCityFlagToggle = useCallback(async (cityId: string, flag: 'want' | 'been', value: boolean) => {
    if (!user) return;

    setIsLoading(true);
    try {
      await adminAwareSetCityFlag(cityId, flag, value);

      // If we acted as someone other than "me", re-sync from DB (avoid wrong optimistic write)
      if (isAdmin && adminMode && actingAs !== 'me') {
        await fetchAllData();
        toast.success('Saved');
        setIsLoading(false);
        return;
      }

      // Optimistic update (me-only)
      setCities(prev => prev.map(c => {
        if (c.id !== cityId) return c;
        const flagKey = flag === 'want' ? 'want_by' : 'been_by';
        return {
          ...c,
          [flagKey]: { ...c[flagKey], [user.id]: value },
        };
      }));

      toast.success('Saved');
    } catch (error) {
      console.error('Error toggling city flag:', error);
      toast.error('Failed to save');
    }
    setIsLoading(false);
  }, [
    user,
    isAdmin,
    adminMode,
    actingAs,
    adminAwareSetCityFlag,
    fetchAllData,
    toast,
  ]);


  // City delete
  const handleCityDelete = useCallback(async (cityId: string) => {
    if (!user) return;

    const city = cities.find(c => c.id === cityId);
    if (!city || city.created_by !== user.id) {
      toast.error('You can only delete cities you created');
      return;
    }

    if (!confirm('Are you sure you want to delete this city?')) return;

    setIsLoading(true);
    try {
      await deleteCity(cityId);
      setCities(prev => prev.filter(c => c.id !== cityId));
      setSelection({ type: null, id: null });
      toast.success('City deleted');
    } catch (error) {
      console.error('Error deleting city:', error);
      toast.error('Failed to delete city');
    }
    setIsLoading(false);
  }, [user, cities, toast]);

  // POI update
  const handlePOIUpdate = useCallback(async (
    poiId: string,
    updates: {
      label: string;
      status: 'want' | 'been';
      category_id: string | null;
      priority: 'low' | 'med' | 'high' | null;
      notes: string | null;
      links: POILink[];
    }
  ) => {
    if (!user) return;

    const poi = pois.find(p => p.id === poiId);
    if (!poi || poi.created_by !== user.id) {
      toast.error('You can only edit POIs you created');
      return;
    }

    setIsLoading(true);
    try {
      await updatePOIAsCreator(poiId, updates);

      setPOIs(prev => prev.map(p => {
        if (p.id !== poiId) return p;
        return { ...p, ...updates };
      }));

      toast.success('Saved');
    } catch (error) {
      console.error('Error updating POI:', error);
      toast.error('Failed to save');
    }
    setIsLoading(false);
  }, [user, pois, toast]);

  // POI endorse
  const handlePOIEndorse = useCallback(async (poiId: string, value: boolean) => {
    if (!user) return;

    setIsLoading(true);
    try {
      await setPOIEndorsement(poiId, value);

      setPOIs(prev => prev.map(p => {
        if (p.id !== poiId) return p;
        return {
          ...p,
          endorsed_by: { ...p.endorsed_by, [user.id]: value },
        };
      }));

      toast.success(value ? 'Endorsed' : 'Endorsement removed');
    } catch (error) {
      console.error('Error endorsing POI:', error);
      toast.error('Failed to save');
    }
    setIsLoading(false);
  }, [user, toast]);

  // POI delete
  const handlePOIDelete = useCallback(async (poiId: string) => {
    if (!user) return;

    const poi = pois.find(p => p.id === poiId);
    if (!poi || poi.created_by !== user.id) {
      toast.error('You can only delete POIs you created');
      return;
    }

    if (!confirm('Are you sure you want to delete this POI?')) return;

    setIsLoading(true);
    try {
      await deletePOI(poiId);
      setPOIs(prev => prev.filter(p => p.id !== poiId));
      setSelection({ type: null, id: null });
      toast.success('POI deleted');
    } catch (error) {
      console.error('Error deleting POI:', error);
      toast.error('Failed to delete POI');
    }
    setIsLoading(false);
  }, [user, pois, toast]);

  // Create category
  const handleCreateCategory = useCallback(async (name: string): Promise<Category | null> => {
    if (!user) return null;

    try {
      const newCategory = await createCategory(name);
      if (newCategory) {
        setCategories(prev => [...prev, newCategory].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success('Category created');
      }
      return newCategory;
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error('Failed to create category');
      return null;
    }
  }, [user, toast]);

  // Add city from search
  const handleSearchResultSelect = useCallback(async (result: GeocodingResult, type: 'city' | 'poi') => {
    if (!user) return;

    if (type === 'city') {
      setIsLoading(true);
      try {
        const countryIsoA3 = countriesGeoJSON
          ? findCountryIsoA3(countriesGeoJSON, result.lat, result.lng)
          : null;

        const newCity = await createCity({
          name: result.name,
          country_iso_a3: countryIsoA3,
          lat: result.lat,
          lng: result.lng,
          want_by: { [user.id]: true },
          been_by: {},
        });

        if (newCity) {
          setCities(prev => [newCity, ...prev]);
          setSelection({ type: 'city', id: newCity.id });
          toast.success('City added');
        }
      } catch (error) {
        console.error('Error creating city:', error);
        toast.error('Failed to add city');
      }
      setIsLoading(false);
    } else if (type === 'poi') {
      setShowPOIForm({ lat: result.lat, lng: result.lng });
    }
  }, [user, countriesGeoJSON, toast]);

  // Submit POI form
  const handlePOIFormSubmit = useCallback(async (poi: {
    label: string;
    lat: number;
    lng: number;
    status: 'want' | 'been';
    category_id: string | null;
    priority: 'low' | 'med' | 'high' | null;
    notes: string | null;
    links: POILink[];
  }) => {
    if (!user) return;

    setIsLoading(true);
    try {
      const isoA3 =
        countriesGeoJSON
          ? findCountryIsoA3(countriesGeoJSON, poi.lat, poi.lng)
          : null;

      const newPOI = await createPOI({
        ...poi,
        country_iso_a3: isoA3,
        city_id: null,
      });

      if (newPOI) {
        setPOIs(prev => [newPOI, ...prev]);
        setShowPOIForm(null);
        setSelection({ type: 'poi', id: newPOI.id });
        toast.success('POI added');

        // Auto-mark the country with the same status as the POI (me-only as-is)
        if (isoA3) {
          try {
            const flag = poi.status;
            await setCountryFlag(isoA3, flag, true);
            if (flag === 'been') {
              await setCountryFlag(isoA3, 'want', false);
            }
            setCountriesState(prev => {
              const existing = prev.find(s => s.iso_a3 === isoA3);
              if (existing) {
                return prev.map(s => {
                  if (s.iso_a3 !== isoA3) return s;
                  const updated = { ...s };
                  if (flag === 'been') {
                    updated.want_by = { ...s.want_by, [user.id]: false };
                    updated.been_by = { ...s.been_by, [user.id]: true };
                  } else {
                    updated.want_by = { ...s.want_by, [user.id]: true };
                  }
                  return updated;
                });
              } else {
                return [...prev, {
                  iso_a3: isoA3,
                  want_by: flag === 'want' ? { [user.id]: true } : {},
                  been_by: flag === 'been' ? { [user.id]: true } : {},
                }];
              }
            });
          } catch {
            console.warn('Failed to auto-mark country');
          }
        }
      }
    } catch (error) {
      console.error('Error creating POI:', error);
      toast.error('Failed to add POI');
    }
    setIsLoading(false);
  }, [user, countriesGeoJSON, toast]);

  // Show auth screen if not logged in
  if (isAuthChecking) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Auth onAuthSuccess={() => {}} />;
  }

  return (
    <div className="app">
      {/* Admin controls (Myles only) */}
      {isAdmin && (
        <div className="admin-panel" style={{ padding: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={adminMode}
              onChange={e => setAdminMode(e.target.checked)}
            />
            Admin setup mode
          </label>

          {adminMode && (
            <select value={actingAs} onChange={e => setActingAs(e.target.value as ActingAs)}>
              <option value="me">Myles</option>
              <option value="viktoria">Viktoria</option>
              <option value="both">Both</option>
            </select>
          )}
        </div>
      )}

      <TravelMap
        user={user}
        otherUser={otherUser}
        countriesState={countriesState}
        cities={cities}
        pois={pois}
        filters={filters}
        layers={layers}
        selection={selection}
        focusCountry={focusCountry}
        onCountryClick={handleCountryClick}
        onCityClick={handleCityClick}
        onPOIClick={handlePOIClick}
        onMapClick={handleMapClick}
      />

      <LeftPanel
        user={user}
        otherUser={otherUser}
        filters={filters}
        layers={layers}
        categories={categories}
        countriesGeoJSON={countriesGeoJSON}
        worldCities={worldCities}
        onFiltersChange={setFilters}
        onLayersChange={setLayers}
        onSearchResultSelect={handleSearchResultSelect}
        onCountrySelect={handleCountrySelect}
      />

      <RightPanel
        user={user}
        otherUser={otherUser}
        selection={selection}
        countriesState={countriesState}
        cities={cities}
        pois={pois}
        categories={categories}
        countriesGeoJSON={countriesGeoJSON}
        onClose={handleCloseSelection}
        onCountryFlagToggle={handleCountryFlagToggle}
        onCityFlagToggle={handleCityFlagToggle}
        onCityDelete={handleCityDelete}
        onPOIUpdate={handlePOIUpdate}
        onPOIEndorse={handlePOIEndorse}
        onPOIDelete={handlePOIDelete}
        onCreateCategory={handleCreateCategory}
      />

      {showPOIForm && (
        <POIForm
          lat={showPOIForm.lat}
          lng={showPOIForm.lng}
          categories={categories}
          onSubmit={handlePOIFormSubmit}
          onCancel={() => setShowPOIForm(null)}
          onCreateCategory={handleCreateCategory}
        />
      )}

      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismissToast} />

      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner small" />
        </div>
      )}
    </div>
  );
}

export default App;
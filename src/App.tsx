import { useState, useEffect, useCallback, useMemo } from 'react';
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
  updateCity,
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
import { buildCountryIndex, findCountryIsoA3 } from './utils/geo';
import { USER_COLORS } from './types';

// Sync interval (15 seconds)
const SYNC_INTERVAL = 15000;
const DEFAULT_VIEW = { lat: 45, lng: 10, zoom: 3 };

// =========================
// Admin setup mode
// =========================
type ActingAs = 'me' | 'viktoria' | 'both';

const ADMIN_EMAIL = 'myles.colling@gmail.com';
const VIKTORIA_EMAIL = 'viktoria.venkates@gmail.com';
const VIKTORIA_USER_ID = '329d827a-7e6d-4b43-8967-5d85c5776ff1';

// localStorage keys (persist on your device)
const LS_ADMIN_MODE = 'ta_adminMode';
const LS_ACTING_AS = 'ta_actingAs';
const LS_CITY_PROMPT_SKIP = 'ta_cityPromptSkip';

const CITY_DEDUPE_DISTANCE_KM = 5;

function isValidCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinLat = Math.sin(dLat / 2) ** 2;
  const sinLng = Math.sin(dLng / 2) ** 2;
  const cosLat = Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(sinLat + cosLat * sinLng), Math.sqrt(1 - sinLat - cosLat * sinLng));
  return earthRadiusKm * c;
}

function findDuplicateCity(
  cities: City[],
  candidate: { id: string | null; name: string; lat: number; lng: number; country_iso_a3: string }
): City | null {
  const normalizedName = candidate.name.trim().toLowerCase();
  return cities.find(city => {
    if (city.country_iso_a3 !== candidate.country_iso_a3) return false;
    if (candidate.id && city.id === candidate.id) return false;
    const cityName = city.name.trim().toLowerCase();
    if (cityName === normalizedName) return true;
    if (!isValidCoordinate(city.lat, city.lng) || !isValidCoordinate(candidate.lat, candidate.lng)) return false;
    return distanceKm({ lat: city.lat, lng: city.lng }, { lat: candidate.lat, lng: candidate.lng }) <= CITY_DEDUPE_DISTANCE_KM;
  }) || null;
}

function cityPromptStorageKey(userId: string, isoA3: string): string {
  return `${LS_CITY_PROMPT_SKIP}:${userId}:${isoA3}`;
}

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
  const [searchSelection, setSearchSelection] = useState<GeocodingResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPOIForm, setShowPOIForm] = useState<{ lat: number; lng: number } | null>(null);
  const [focusLocation, setFocusLocation] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [mapClickMode, setMapClickMode] = useState<'poi' | 'city' | null>(null);
  const [cityPromptTarget, setCityPromptTarget] = useState<string | null>(null);
  const [cityPromptSkips, setCityPromptSkips] = useState<Record<string, boolean>>({});
  const [pendingCityLocation, setPendingCityLocation] = useState<{ cityId: string; lat: number; lng: number } | null>(null);
  const [pendingCityPickId, setPendingCityPickId] = useState<string | null>(null);

  // Admin UI state (persist on this device)
  const [adminMode, setAdminMode] = useState<boolean>(() => localStorage.getItem(LS_ADMIN_MODE) === '1');
  const [actingAs, setActingAs] = useState<ActingAs>(() => {
    const v = localStorage.getItem(LS_ACTING_AS) as ActingAs | null;
    return v === 'me' || v === 'viktoria' || v === 'both' ? v : 'me';
  });

  // Toast notifications
  const toast = useToasts();

  const isAdmin = user?.email === ADMIN_EMAIL;

  const resolvedOtherUser = useMemo(() => {
    if (!user) return otherUser;
    if (otherUser?.id) return otherUser;
    if (user.email === ADMIN_EMAIL) {
      return {
        id: VIKTORIA_USER_ID,
        email: VIKTORIA_EMAIL,
        name: 'Viktoria',
        color: 'red',
      };
    }
    return otherUser;
  }, [user, otherUser]);

  // =========================
  // Acting user (admin setup mode)
  // =========================
  const actingUser: User | null = (() => {
    if (!user) return null;
    if (!isAdmin || !adminMode) return user;

    if (actingAs === 'viktoria') {
      return {
        id: VIKTORIA_USER_ID,
        email: VIKTORIA_EMAIL,
        name: 'Viktoria',
        color: 'red',
      };
    }

    // actingAs === 'me' or 'both' -> keep you as the "You" view
    return user;
  })();

  const actingOtherUser: User | null = (() => {
    if (!user) return null;
    if (!isAdmin || !adminMode) return resolvedOtherUser;

    if (actingAs === 'viktoria') {
      // If you're acting as her, "other user" should be you
      return user;
    }

    return resolvedOtherUser;
  })();

  const activeUser = actingUser ?? user;
  const countryIndex = useMemo(() => buildCountryIndex(countriesGeoJSON), [countriesGeoJSON]);

  const selectedCountry = useMemo(() => {
    if (selection.type !== 'country' || !selection.id || !countriesGeoJSON) return null;
    const entry = countryIndex[selection.id];
    if (!entry) return null;
    return {
      isoA3: selection.id,
      name: entry.name || selection.id,
      bounds: entry.bounds,
    };
  }, [selection, countryIndex]);

  const cityPromptSkippedForSelection = useMemo(() => {
    if (!activeUser || selection.type !== 'country' || !selection.id) return false;
    const storageKey = cityPromptStorageKey(activeUser.id, selection.id);
    return cityPromptSkips[storageKey] ?? localStorage.getItem(storageKey) === 'true';
  }, [activeUser, selection, cityPromptSkips]);

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

  const applyCountryVisitedOptimistic = useCallback((isoA3: string, userId: string) => {
    setCountriesState(prev => {
      const existing = prev.find(s => s.iso_a3 === isoA3);
      if (existing) {
        return prev.map(s => {
          if (s.iso_a3 !== isoA3) return s;
          return {
            ...s,
            want_by: { ...s.want_by, [userId]: false },
            been_by: { ...s.been_by, [userId]: true },
          };
        });
      }
      return [
        ...prev,
        {
          iso_a3: isoA3,
          want_by: { [userId]: false },
          been_by: { [userId]: true },
        },
      ];
    });
  }, []);

  const ensureCountryVisited = useCallback(async (isoA3: string) => {
    if (!user) return;
    await adminAwareSetCountryFlag(isoA3, 'want', false);
    await adminAwareSetCountryFlag(isoA3, 'been', true);

    const shouldOptimisticallyUpdate = !isAdmin || !adminMode || actingAs === 'me';
    if (shouldOptimisticallyUpdate) {
      applyCountryVisitedOptimistic(isoA3, user.id);
    }
  }, [user, adminAwareSetCountryFlag, applyCountryVisitedOptimistic, isAdmin, adminMode, actingAs]);



  // Handlers
  const handleCountryClick = useCallback((isoA3: string) => {
    setSelection({ type: 'country', id: isoA3 });
    setSearchSelection(null);
  }, []);

  const handleCityClick = useCallback((cityId: string) => {
    setSelection({ type: 'city', id: cityId });
    setSearchSelection(null);
  }, []);

  const handlePOIClick = useCallback((poiId: string) => {
    setSelection({ type: 'poi', id: poiId });
    setSearchSelection(null);
  }, []);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (mapClickMode === 'city' && pendingCityPickId) {
      setPendingCityLocation({ cityId: pendingCityPickId, lat, lng });
      setMapClickMode(null);
      setPendingCityPickId(null);
      return;
    }

    if (mapClickMode === 'poi') {
      setShowPOIForm({ lat, lng });
      setSearchSelection(null);
      setMapClickMode(null);
    }
  }, [mapClickMode, pendingCityPickId]);

  const handleCloseSelection = useCallback(() => {
    setSelection({ type: null, id: null });
    setSearchSelection(null);
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

      if (flag === 'been' && value && activeUser) {
        const storageKey = cityPromptStorageKey(activeUser.id, isoA3);
        const isSkipped = cityPromptSkips[storageKey] ?? localStorage.getItem(storageKey) === 'true';
        if (!isSkipped) {
          setCityPromptTarget(isoA3);
        }
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
  }, [user, isAdmin, adminMode, actingAs, adminAwareSetCountryFlag, fetchAllData, toast, activeUser, cityPromptSkips]);

  // City flag toggle (admin-aware)
  const handleCityFlagToggle = useCallback(async (cityId: string, flag: 'want' | 'been', value: boolean) => {
    if (!user) return;

    setIsLoading(true);
    try {
      const city = cities.find(c => c.id === cityId);
      await adminAwareSetCityFlag(cityId, flag, value);

      if (flag === 'been' && value && city?.country_iso_a3) {
        await ensureCountryVisited(city.country_iso_a3);
      }

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
    ensureCountryVisited,
    cities,
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

  const handleCityUpdate = useCallback(async (cityId: string, updates: { name: string; lat: number; lng: number }) => {
    if (!user) return;

    const city = cities.find(c => c.id === cityId);
    if (!city || city.created_by !== user.id) {
      toast.error('You can only edit cities you created');
      return;
    }

    if (!isValidCoordinate(updates.lat, updates.lng)) {
      toast.error('That location looks invalid. Try another spot.');
      return;
    }

    const duplicate = findDuplicateCity(cities, {
      id: cityId,
      name: updates.name,
      lat: updates.lat,
      lng: updates.lng,
      country_iso_a3: city.country_iso_a3,
    });

    if (duplicate) {
      toast.error(`Looks like ${duplicate.name} already exists in this country.`);
      return;
    }

    const previousCity = city;
    setCities(prev => prev.map(c => (c.id === cityId ? { ...c, ...updates } : c)));

    try {
      await updateCity(cityId, updates);
      toast.success('City updated');
    } catch (error) {
      console.error('Error updating city:', error);
      setCities(prev => prev.map(c => (c.id === cityId ? previousCity : c)));
      toast.error('Failed to update city');
    }
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

  const handlePOISearchAdd = useCallback((result: GeocodingResult) => {
    setSearchSelection(null);
    setShowPOIForm({ lat: result.lat, lng: result.lng });
    setMapClickMode(null);
  }, []);

  const handleCountryCityAdd = useCallback(async (city: {
    name: string;
    lat: number;
    lng: number;
    countryIsoA3: string;
    status: 'want' | 'been';
  }) => {
    if (!user) return;

    if (!isValidCoordinate(city.lat, city.lng)) {
      toast.error('That location looks invalid. Try another city.');
      return;
    }

    const duplicate = findDuplicateCity(cities, {
      id: null,
      name: city.name,
      lat: city.lat,
      lng: city.lng,
      country_iso_a3: city.countryIsoA3,
    });

    const isAdminActingAsOther = isAdmin && adminMode && actingAs !== 'me';

    if (!isAdminActingAsOther && duplicate) {
      toast.error(`Looks like ${duplicate.name} is already saved for this country.`);
      return;
    }

    setIsLoading(true);
    try {
      if (isAdminActingAsOther) {
        const targets = getTargetUserIds();
        if (!targets.length) return;

        if (duplicate) {
          for (const targetId of targets) {
            const { error } = await supabase.rpc('admin_set_city_flag', {
              p_city_id: duplicate.id,
              p_flag: city.status,
              p_value: true,
              p_target_user_id: targetId,
            });
            if (error) throw error;
          }

          if (city.status === 'been') {
            try {
              await ensureCountryVisited(city.countryIsoA3);
            } catch (error) {
              console.warn('Failed to auto-mark country for city visit:', error);
            }
          }

          await fetchAllData();
          setSelection({ type: 'city', id: duplicate.id });
          setFocusLocation({ lat: duplicate.lat, lng: duplicate.lng, zoom: 6 });
          setTimeout(() => setFocusLocation(null), 800);
          toast.success('City updated');
          setCityPromptTarget(null);
          return;
        }

        const { data, error } = await supabase.rpc('admin_create_city', {
          p_name: city.name,
          p_country_iso_a3: city.countryIsoA3,
          p_lat: city.lat,
          p_lng: city.lng,
          p_target_user: targets[0],
        });
        if (error) throw error;

        const newCity = Array.isArray(data) ? data[0] : data;
        if (!newCity) {
          throw new Error('Admin city creation returned no data.');
        }

        for (const targetId of targets) {
          const { error: flagError } = await supabase.rpc('admin_set_city_flag', {
            p_city_id: newCity.id,
            p_flag: city.status,
            p_value: true,
            p_target_user_id: targetId,
          });
          if (flagError) throw flagError;
        }

        if (city.status === 'been') {
          try {
            await ensureCountryVisited(city.countryIsoA3);
          } catch (error) {
            console.warn('Failed to auto-mark country for city visit:', error);
          }
        }

        await fetchAllData();
        setSelection({ type: 'city', id: newCity.id });
        setFocusLocation({ lat: newCity.lat, lng: newCity.lng, zoom: 6 });
        setTimeout(() => setFocusLocation(null), 800);
        toast.success('City added');
        setCityPromptTarget(null);
        return;
      }

      const newCity = await createCity({
        name: city.name,
        country_iso_a3: city.countryIsoA3,
        lat: city.lat,
        lng: city.lng,
        want_by: city.status === 'want' ? { [user.id]: true } : {},
        been_by: city.status === 'been' ? { [user.id]: true } : {},
      });

      if (newCity) {
        setCities(prev => [newCity, ...prev]);
        setSelection({ type: 'city', id: newCity.id });
        setFocusLocation({ lat: newCity.lat, lng: newCity.lng, zoom: 6 });
        setTimeout(() => setFocusLocation(null), 800);
        toast.success('City added');
        setCityPromptTarget(null);

        if (city.status === 'been') {
          try {
            await ensureCountryVisited(city.countryIsoA3);
          } catch (error) {
            console.warn('Failed to auto-mark country for city visit:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error creating city:', error);
      toast.error('Failed to add city');
    } finally {
      setIsLoading(false);
    }
  }, [
    user,
    cities,
    isAdmin,
    adminMode,
    actingAs,
    getTargetUserIds,
    fetchAllData,
    ensureCountryVisited,
    toast,
  ]);

  const handleSearchResultPreview = useCallback((result: GeocodingResult) => {
    setSearchSelection(result);
    setSelection({ type: null, id: null });
    setIsRightPanelCollapsed(false);
    setMapClickMode(null);
  }, []);

  const handleSearchReset = useCallback(() => {
    setSearchSelection(null);
    setMapClickMode(null);
  }, []);

  const handleStartDropPin = useCallback(() => {
    setMapClickMode('poi');
    setSearchSelection(null);
  }, []);

  const handleStartCityReposition = useCallback((cityId: string) => {
    setMapClickMode('city');
    setPendingCityPickId(cityId);
  }, []);

  const handleCancelCityReposition = useCallback(() => {
    setMapClickMode(null);
    setPendingCityPickId(null);
  }, []);

  const handleCityRepositionComplete = useCallback(() => {
    setPendingCityLocation(null);
  }, []);

  const handleCityPromptSkip = useCallback((isoA3: string) => {
    if (!activeUser) return;
    const storageKey = cityPromptStorageKey(activeUser.id, isoA3);
    setCityPromptSkips(prev => ({ ...prev, [storageKey]: true }));
    localStorage.setItem(storageKey, 'true');
    setCityPromptTarget(null);
  }, [activeUser]);

  const handleCityPromptShow = useCallback((isoA3: string) => {
    setCityPromptTarget(isoA3);
  }, []);

  const handleCityPromptDismiss = useCallback(() => {
    setCityPromptTarget(null);
  }, []);

  const handleResetView = useCallback(() => {
    setFocusLocation(DEFAULT_VIEW);
    setTimeout(() => setFocusLocation(null), 800);
  }, []);

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
      {isAdmin && (
        <div className="topbar">
          <div className="topbar-left">
            <span className="brand">Travel Atlas · build 3303252</span>
            <span className={`badge badge-${actingUser?.color || 'blue'}`}>
              {actingUser?.name || '—'}
            </span>
          </div>

          <div className="topbar-right">
            <label className="admin-toggle">
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
        </div>
      )}


      <TravelMap
        user={actingUser ?? user}
        otherUser={actingOtherUser}
        countriesState={countriesState}
        cities={cities}
        pois={pois}
        filters={filters}
        layers={layers}
        selection={selection}
        focusLocation={focusLocation}
        onCountryClick={handleCountryClick}
        onCityClick={handleCityClick}
        onPOIClick={handlePOIClick}
        onMapClick={handleMapClick}
      />

      <div className="map-controls">
        <button className="reset-view-btn" onClick={handleResetView}>
          Reset view
        </button>
        <div className="map-legend">
          <span className="legend-label">Legend</span>
          <span className="legend-label">Colors</span>
          <div className="legend-row">
            <span className="legend-swatch" style={{ backgroundColor: USER_COLORS.blue.solid }}></span>
            <span>{(actingUser ?? user).color === 'blue' ? (actingUser ?? user).name : actingOtherUser?.name || 'Myles'}</span>
          </div>
          <div className="legend-row">
            <span className="legend-swatch" style={{ backgroundColor: USER_COLORS.red.solid }}></span>
            <span>{(actingUser ?? user).color === 'red' ? (actingUser ?? user).name : actingOtherUser?.name || 'Viktoria'}</span>
          </div>
          <div className="legend-row">
            <span className="legend-swatch" style={{ backgroundColor: USER_COLORS.purple.solid }}></span>
            <span>Both</span>
          </div>
          <div className="legend-row">
            <span className="legend-swatch" style={{ backgroundColor: USER_COLORS.mixed.solid }}></span>
            <span>Mixed status</span>
          </div>
          <span className="legend-label">Countries</span>
          <div className="legend-row">
            <span className="legend-swatch solid"></span>
            <span>Visited</span>
          </div>
          <div className="legend-row">
            <span className="legend-swatch hatched"></span>
            <span>Want to visit</span>
          </div>
          <div className="legend-row">
            <span className="legend-swatch neutral"></span>
            <span>Unmarked</span>
          </div>
          <span className="legend-label">Cities</span>
          <div className="legend-row legend-row-multi">
            <span className="legend-row-label">Visited</span>
            <div className="legend-row-swatches">
              <span className="legend-swatch city-solid" style={{ borderColor: USER_COLORS.blue.dark, backgroundColor: USER_COLORS.blue.solid }}></span>
              <span className="legend-swatch city-solid" style={{ borderColor: USER_COLORS.red.dark, backgroundColor: USER_COLORS.red.solid }}></span>
              <span className="legend-swatch city-solid" style={{ borderColor: USER_COLORS.purple.dark, backgroundColor: USER_COLORS.purple.solid }}></span>
              <span className="legend-swatch city-solid" style={{ borderColor: USER_COLORS.mixed.dark, backgroundColor: USER_COLORS.mixed.solid }}></span>
            </div>
          </div>
          <div className="legend-row legend-row-multi">
            <span className="legend-row-label">Want to visit</span>
            <div className="legend-row-swatches">
              <span className="legend-swatch city-hollow city-outline" style={{ borderColor: USER_COLORS.blue.dark }}></span>
              <span className="legend-swatch city-hollow city-outline" style={{ borderColor: USER_COLORS.red.dark }}></span>
              <span className="legend-swatch city-hollow city-outline" style={{ borderColor: USER_COLORS.purple.dark }}></span>
              <span className="legend-swatch city-hollow city-outline" style={{ borderColor: USER_COLORS.mixed.dark }}></span>
            </div>
          </div>
          <span className="legend-label">POIs</span>
          <div className="legend-row">
            <span className="legend-swatch poi-solid" style={{ backgroundColor: USER_COLORS.purple.solid }}></span>
            <span>Both (endorsed)</span>
          </div>
          <div className="legend-row">
            <span className="legend-swatch poi-solid"></span>
            <span>Visited</span>
          </div>
          <div className="legend-row">
            <span className="legend-swatch poi-hatched"></span>
            <span>Want to visit</span>
          </div>
        </div>
      </div>

      <LeftPanel
        user={actingUser ?? user}
        otherUser={actingOtherUser}
        filters={filters}
        layers={layers}
        categories={categories}
        selectedCountry={selectedCountry}
        isDropPinMode={mapClickMode === 'poi'}
        onFiltersChange={setFilters}
        onLayersChange={setLayers}
        onSearchResultPreview={handleSearchResultPreview}
        onSearchReset={handleSearchReset}
        onStartDropPin={handleStartDropPin}
      />

      <RightPanel
        user={actingUser ?? user}
        otherUser={actingOtherUser}
        selection={selection}
        searchResult={searchSelection}
        countriesState={countriesState}
        cities={cities}
        pois={pois}
        categories={categories}
        countriesGeoJSON={countriesGeoJSON}
        worldCities={worldCities}
        onClose={handleCloseSelection}
        onSearchResultAdd={handlePOISearchAdd}
        onSearchResultClear={handleSearchReset}
        isCollapsed={isRightPanelCollapsed}
        onToggleCollapse={() => setIsRightPanelCollapsed(prev => !prev)}
        onCountryFlagToggle={handleCountryFlagToggle}
        onCountryCityAdd={handleCountryCityAdd}
        onCitySelect={handleCityClick}
        onCityFlagToggle={handleCityFlagToggle}
        onCityUpdate={handleCityUpdate}
        onCityRepositionStart={handleStartCityReposition}
        onCityRepositionCancel={handleCancelCityReposition}
        onCityDelete={handleCityDelete}
        onPOISelect={handlePOIClick}
        onPOIUpdate={handlePOIUpdate}
        onPOIEndorse={handlePOIEndorse}
        onPOIDelete={handlePOIDelete}
        onCreateCategory={handleCreateCategory}
        pendingCityLocation={pendingCityLocation}
        onCityRepositionComplete={handleCityRepositionComplete}
        cityPromptTarget={cityPromptTarget}
        cityPromptSkipped={cityPromptSkippedForSelection}
        onCityPromptSkip={handleCityPromptSkip}
        onCityPromptShow={handleCityPromptShow}
        onCityPromptDismiss={handleCityPromptDismiss}
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

// User types
export interface User {
  id: string;
  email: string;
  name: string;
  color: 'blue' | 'red';
}

// Who flags (jsonb maps)
export type WhoFlags = Record<string, boolean>;

// Country state
export interface CountryState {
  iso_a3: string;
  want_by: WhoFlags;
  been_by: WhoFlags;
}

// City
export interface City {
  id: string;
  name: string;
  country_iso_a3: string | null;
  lat: number;
  lng: number;
  created_by: string;
  want_by: WhoFlags;
  been_by: WhoFlags;
  created_at?: string;
}

// POI
export interface POI {
  id: string;
  label: string;
  lat: number;
  lng: number;
  country_iso_a3: string | null;
  city_id: string | null;
  status: 'want' | 'been';
  category_id: string | null;
  priority: 'low' | 'med' | 'high' | null;
  notes: string | null;
  links: POILink[];
  created_by: string;
  endorsed_by: WhoFlags;
  created_at?: string;
}

export interface POILink {
  label: string;
  url: string;
}

// Category
export interface Category {
  id: string;
  name: string;
  created_by: string;
  created_at?: string;
}

// Map feature types for GeoJSON
export interface CountryFeatureProperties {
  iso_a3: string;
  name: string;
  [key: string]: unknown;
}

export interface WorldCityProperties {
  name: string;
  country: string;
  pop?: number;
  [key: string]: unknown;
}

// Filter state
export interface FilterState {
  who: 'all' | 'mine' | 'theirs' | 'both';
  status: 'all' | 'want' | 'been';
  categories: string[]; // category IDs, empty = all
  priority: 'all' | 'low' | 'med' | 'high';
}

// Layer visibility
export interface LayerVisibility {
  countries: boolean;
  cities: boolean;
  pois: boolean;
}

// Selection state
export type SelectionType = 'country' | 'city' | 'poi' | null;

export interface Selection {
  type: SelectionType;
  id: string | null;
}

// App context state
export interface AppState {
  user: User | null;
  otherUser: User | null;
  countriesState: CountryState[];
  cities: City[];
  pois: POI[];
  categories: Category[];
  filters: FilterState;
  layers: LayerVisibility;
  selection: Selection;
  isLoading: boolean;
  lastSync: Date | null;
}

// Known users configuration
export const KNOWN_USERS: Record<string, { name: string; color: 'blue' | 'red' }> = {
  // These will be matched by email domain/address
  // Myles = Blue, Viktoria = Red
};

// User colors for styling
export const USER_COLORS = {
  blue: {
    solid: '#3B82F6',
    light: '#93C5FD',
    dark: '#1D4ED8',
  },
  red: {
    solid: '#EF4444',
    light: '#FCA5A5',
    dark: '#B91C1C',
  },
  purple: {
    solid: '#8B5CF6',
    light: '#C4B5FD',
    dark: '#6D28D9',
  },
  mixed: {
    solid: '#F59E0B',
    light: '#FDE68A',
    dark: '#B45309',
  },
} as const;

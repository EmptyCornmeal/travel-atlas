import { createClient, SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import type { CountryState, City, POI, Category, POILink, User } from '../types';

// Supabase configuration - these should be set in environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Allowlisted emails (only these users can access the app)
const ALLOWLISTED_EMAILS = (import.meta.env.VITE_ALLOWLISTED_EMAILS || '').split(',').map((e: string) => e.trim().toLowerCase());

// User name/color mapping by email
const USER_CONFIG: Record<string, { name: string; color: 'blue' | 'red' }> = {
  // Will be populated from env or defaults
};

// Parse user config from env
const userConfigStr = import.meta.env.VITE_USER_CONFIG || '';
if (userConfigStr) {
  try {
    const parsed = JSON.parse(userConfigStr);
    Object.assign(USER_CONFIG, parsed);
  } catch {
    console.warn('Failed to parse VITE_USER_CONFIG');
  }
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Check if email is allowlisted
export function isEmailAllowlisted(email: string): boolean {
  return ALLOWLISTED_EMAILS.includes(email.toLowerCase());
}

// Get user info from email
export function getUserInfo(email: string): { name: string; color: 'blue' | 'red' } | null {
  const config = USER_CONFIG[email.toLowerCase()];
  if (config) return config;

  // Default assignment based on order in allowlist
  const index = ALLOWLISTED_EMAILS.indexOf(email.toLowerCase());
  if (index === 0) return { name: email.split('@')[0], color: 'blue' };
  if (index === 1) return { name: email.split('@')[0], color: 'red' };
  return null;
}

// Convert Supabase user to app User type
export function toAppUser(supabaseUser: SupabaseUser): User | null {
  const email = supabaseUser.email;
  if (!email || !isEmailAllowlisted(email)) return null;

  const info = getUserInfo(email);
  if (!info) return null;

  return {
    id: supabaseUser.id,
    email,
    name: info.name,
    color: info.color,
  };
}

// Auth functions
export async function signInWithMagicLink(email: string): Promise<{ error: Error | null }> {
  if (!isEmailAllowlisted(email)) {
    return { error: new Error('Email not authorized') };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });

  return { error: error ? new Error(error.message) : null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return toAppUser(user);
}

// Get the other allowlisted user (for display purposes)
export async function getOtherUser(currentEmail: string): Promise<User | null> {
  const otherEmail = ALLOWLISTED_EMAILS.find(e => e !== currentEmail.toLowerCase());
  if (!otherEmail) return null;

  const info = getUserInfo(otherEmail);
  if (!info) return null;

  // We need to get the user ID from Supabase if they exist
  // For now, create a placeholder - the ID will be resolved when we see their data
  return {
    id: '', // Will be resolved from data
    email: otherEmail,
    name: info.name,
    color: info.color,
  };
}

// Country state functions
export async function fetchCountriesState(): Promise<CountryState[]> {
  const { data, error } = await supabase
    .from('countries_state')
    .select('*');

  if (error) {
    console.error('Error fetching countries state:', error);
    return [];
  }

  return data || [];
}

export async function setCountryFlag(
  iso_a3: string,
  flag: 'want' | 'been',
  value: boolean
): Promise<void> {
  const { error } = await supabase.rpc('set_country_flag', {
    p_iso_a3: iso_a3,
    p_flag: flag,
    p_value: value,
  });

  if (error) {
    console.error('Error setting country flag:', error);
    throw error;
  }
}

// City functions
export async function fetchCities(): Promise<City[]> {
  const { data, error } = await supabase
    .from('cities')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching cities:', error);
    return [];
  }

  return data || [];
}

export async function createCity(city: Omit<City, 'id' | 'created_at' | 'created_by'>): Promise<City | null> {
  const { data, error } = await supabase
    .from('cities')
    .insert([city])
    .select()
    .single();

  if (error) {
    console.error('Error creating city:', error);
    throw error;
  }

  return data;
}

export async function setCityFlag(
  city_id: string,
  flag: 'want' | 'been',
  value: boolean
): Promise<void> {
  const { error } = await supabase.rpc('set_city_flag', {
    p_city_id: city_id,
    p_flag: flag,
    p_value: value,
  });

  if (error) {
    console.error('Error setting city flag:', error);
    throw error;
  }
}

export async function updateCity(
  city_id: string,
  updates: { name?: string }
): Promise<void> {
  const { error } = await supabase
    .from('cities')
    .update(updates)
    .eq('id', city_id);

  if (error) {
    console.error('Error updating city:', error);
    throw error;
  }
}

export async function deleteCity(city_id: string): Promise<void> {
  const { error } = await supabase
    .from('cities')
    .delete()
    .eq('id', city_id);

  if (error) {
    console.error('Error deleting city:', error);
    throw error;
  }
}

// POI functions
export async function fetchPOIs(): Promise<POI[]> {
  const { data, error } = await supabase
    .from('pois')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching POIs:', error);
    return [];
  }

  return data || [];
}

export async function createPOI(poi: Omit<POI, 'id' | 'created_at' | 'created_by' | 'endorsed_by'>): Promise<POI | null> {
  const { data, error } = await supabase
    .from('pois')
    .insert([{ ...poi, endorsed_by: {} }])
    .select()
    .single();

  if (error) {
    console.error('Error creating POI:', error);
    throw error;
  }

  return data;
}

export async function updatePOIAsCreator(
  poi_id: string,
  updates: {
    label: string;
    status: 'want' | 'been';
    category_id: string | null;
    priority: 'low' | 'med' | 'high' | null;
    notes: string | null;
    links: POILink[];
  }
): Promise<void> {
  const { error } = await supabase.rpc('update_poi_as_creator', {
    p_poi_id: poi_id,
    p_label: updates.label,
    p_status: updates.status,
    p_category_id: updates.category_id,
    p_priority: updates.priority,
    p_notes: updates.notes,
    p_links: updates.links,
  });

  if (error) {
    console.error('Error updating POI:', error);
    throw error;
  }
}

export async function setPOIEndorsement(poi_id: string, value: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_poi_endorsement', {
    p_poi_id: poi_id,
    p_value: value,
  });

  if (error) {
    console.error('Error setting POI endorsement:', error);
    throw error;
  }
}

export async function deletePOI(poi_id: string): Promise<void> {
  const { error } = await supabase
    .from('pois')
    .delete()
    .eq('id', poi_id);

  if (error) {
    console.error('Error deleting POI:', error);
    throw error;
  }
}

// Category functions
export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }

  return data || [];
}

export async function createCategory(name: string): Promise<Category | null> {
  // Normalize the name
  const normalizedName = name.trim().replace(/\s+/g, ' ');

  const { data, error } = await supabase
    .from('categories')
    .insert([{ name: normalizedName }])
    .select()
    .single();

  if (error) {
    console.error('Error creating category:', error);
    throw error;
  }

  return data;
}

export async function deleteCategory(category_id: string): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', category_id);

  if (error) {
    console.error('Error deleting category:', error);
    throw error;
  }
}

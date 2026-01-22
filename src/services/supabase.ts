import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { CountryState, City, POI, Category, POILink, User } from '../types';


// =========================
// Supabase config
// =========================
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// User name/color mapping by email (JSON in env)
const USER_CONFIG: Record<string, { name: string; color: 'blue' | 'red' }> = {};

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

// =========================
// User helpers
// =========================
// RLS in Supabase enforces allowlisting; do not rely on client-side allowlists.
export function isEmailAllowlisted(_email: string): boolean {
  return true;
}

export function getUserInfo(email: string): { name: string; color: 'blue' | 'red' } {
  const cfg = USER_CONFIG[email.toLowerCase()];
  if (cfg) return cfg;

  // Safe fallback (not security-related)
  return { name: email.split('@')[0], color: 'blue' };
}

export function toAppUser(supabaseUser: SupabaseUser): User | null {
  const email = supabaseUser.email;
  if (!email) return null;

  const info = getUserInfo(email);

  return {
    id: supabaseUser.id,
    email,
    name: info.name,
    color: info.color,
  };
}

// =========================
// Auth
// =========================
export async function signInWithMagicLink(email: string): Promise<{ error: Error | null }> {
  // Use BASE_URL so it works on GitHub Pages (/travel-atlas/)
  const redirectTo = window.location.origin + import.meta.env.BASE_URL;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
    },
  });

  return { error: error ? new Error(error.message) : null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  if (!data?.user) return null;
  return toAppUser(data.user);
}

/**
 * "Other user" is optional sugar for UI. We derive it from VITE_USER_CONFIG keys.
 * ID is left blank unless you later choose to resolve via profiles table.
 */
export async function getOtherUser(currentEmail: string): Promise<User | null> {
  const emails = Object.keys(USER_CONFIG).map(e => e.toLowerCase());
  const otherEmail = emails.find(e => e !== currentEmail.toLowerCase());
  if (!otherEmail) return null;

  const info = getUserInfo(otherEmail);
  return {
    id: '',
    email: otherEmail,
    name: info.name,
    color: info.color,
  };
}

// =========================
// Countries
// =========================
export async function fetchCountriesState(): Promise<CountryState[]> {
  const { data, error } = await supabase.from('countries_state').select('*');
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

// =========================
// Cities
// =========================
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

export async function createCity(
  city: Omit<City, 'id' | 'created_at' | 'created_by'>
): Promise<City | null> {
  const { data, error } = await supabase.from('cities').insert([city]).select().single();

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

/**
 * NOTE: updateCity() removed on purpose.
 * Your RLS disables direct UPDATE on cities (updates must go through RPC),
 * and v1 does not require renaming cities.
 */

export async function deleteCity(city_id: string): Promise<void> {
  const { error } = await supabase.from('cities').delete().eq('id', city_id);

  if (error) {
    console.error('Error deleting city:', error);
    throw error;
  }
}

// =========================
// POIs
// =========================
export async function fetchPOIs(): Promise<POI[]> {
  const { data, error } = await supabase.from('pois').select('*').order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching POIs:', error);
    return [];
  }

  return data || [];
}

export async function createPOI(
  poi: Omit<POI, 'id' | 'created_at' | 'created_by' | 'endorsed_by'>
): Promise<POI | null> {
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
    p_id: poi_id, // IMPORTANT: matches your actual function signature (p_id ...)
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
    p_id: poi_id, // IMPORTANT: matches your actual function signature (p_id ...)
    p_value: value,
  });

  if (error) {
    console.error('Error setting POI endorsement:', error);
    throw error;
  }
}

export async function deletePOI(poi_id: string): Promise<void> {
  const { error } = await supabase.from('pois').delete().eq('id', poi_id);

  if (error) {
    console.error('Error deleting POI:', error);
    throw error;
  }
}

// =========================
// Categories
// =========================
export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('*').order('name');

  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }

  return data || [];
}

export async function createCategory(name: string): Promise<Category | null> {
  const normalizedName = name.trim().replace(/\s+/g, ' ');
  if (!normalizedName) return null;

  const { data, error } = await supabase
    .from('categories')
    .insert([{ name: normalizedName }])
    .select()
    .single();

  // If unique violation, fetch the existing category and return it
  if (error) {
    // Postgres unique violation code is 23505 (often exposed as error.code)
    // If not present, we still just throw.
    // @ts-expect-error supabase error typing varies
    const code = (error as any)?.code;
    if (code === '23505') {
      const { data: existing, error: fetchErr } = await supabase
        .from('categories')
        .select('*')
        .eq('name', normalizedName)
        .single();

      if (fetchErr) throw fetchErr;
      return existing;
    }

    console.error('Error creating category:', error);
    throw error;
  }

  return data;
}

export async function deleteCategory(category_id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', category_id);

  if (error) {
    console.error('Error deleting category:', error);
    throw error;
  }
}

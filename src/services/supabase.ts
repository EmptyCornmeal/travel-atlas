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
// Helpers
// =========================
function isAbortError(err: any): boolean {
  const name = err?.name ?? '';
  const msg = String(err?.message ?? '');
  const details = String(err?.details ?? '');

  return (
    name === 'AbortError' ||
    msg.includes('AbortError') ||
    msg.includes('signal is aborted') ||
    details.includes('AbortError') ||
    details.includes('signal is aborted')
  );
}

/**
 * Detect whether current URL looks like a Supabase auth callback.
 * Supports both:
 * - PKCE/code flow (?code=... or #code=...)
 * - token-in-hash flow (#access_token=...&refresh_token=...)
 */
function hasAuthCallbackParams(): boolean {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const search = url.searchParams;

  return (
    hash.has('access_token') ||
    hash.has('refresh_token') ||
    hash.has('code') ||
    search.has('code')
  );
}

/**
 * Remove auth params from URL so refresh/back doesn't re-run the callback.
 * Safe no-op if params aren't present.
 */
function stripAuthParamsFromUrl(): void {
  const url = new URL(window.location.href);

  // remove code from querystring
  url.searchParams.delete('code');

  // remove auth tokens/callback params from hash
  if (url.hash) {
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));

    hash.delete('access_token');
    hash.delete('refresh_token');
    hash.delete('expires_in');
    hash.delete('expires_at');
    hash.delete('token_type');
    hash.delete('type');
    hash.delete('provider_token');
    hash.delete('provider_refresh_token');
    hash.delete('code');

    const newHash = hash.toString();
    url.hash = newHash ? `#${newHash}` : '';
  }

  window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
}

/**
 * Finalize + persist session when landing from a magic link.
 * Handles:
 * - PKCE/code: exchangeCodeForSession(code)
 * - token-in-hash: setSession({ access_token, refresh_token })
 */
async function hydrateSessionFromUrl(): Promise<void> {
  if (!hasAuthCallbackParams()) return;

  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));

  // 1) PKCE/code flow (most reliable)
  const code = url.searchParams.get('code') || hash.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // Non-fatal: some links/configs won't use code flow
      console.warn('exchangeCodeForSession (non-fatal):', error.message);
    }
    stripAuthParamsFromUrl();
    return;
  }

  // 2) Token-in-hash flow
  const access_token = hash.get('access_token');
  const refresh_token = hash.get('refresh_token');

  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) {
      console.warn('setSession (non-fatal):', error.message);
    }
    stripAuthParamsFromUrl();
  }
}

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
  try {
    // If we landed here from a magic link, finalize + persist session
    await hydrateSessionFromUrl();

    const { data, error } = await supabase.auth.getUser();

    if (error) {
      // Silently return null on AbortError (lock collision — not a real error)
      if (isAbortError(error)) return null;
      return null;
    }

    if (!data?.user) return null;
    return toAppUser(data.user);
  } catch (e: any) {
    // Silently return null on AbortError (lock collision — not a real error)
    if (isAbortError(e)) return null;
    console.error('getCurrentUser failed:', e);
    return null;
  }
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
    if (isAbortError(error)) return [];
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
    if (isAbortError(error)) return [];
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
  const { data, error } = await supabase
    .from('pois')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    if (isAbortError(error)) return [];
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
    if (isAbortError(error)) return [];
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
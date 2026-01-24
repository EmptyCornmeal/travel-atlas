-- Travel Atlas Supabase Schema
-- Run this in your Supabase SQL editor to set up the database

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- TABLES
-- =============================================================================

-- Countries state table
CREATE TABLE IF NOT EXISTS countries_state (
  iso_a3 TEXT PRIMARY KEY,
  want_by JSONB NOT NULL DEFAULT '{}',
  been_by JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cities table
CREATE TABLE IF NOT EXISTS cities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  country_iso_a3 TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  want_by JSONB NOT NULL DEFAULT '{}',
  been_by JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- POIs table
CREATE TABLE IF NOT EXISTS pois (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  country_iso_a3 TEXT,
  city_id UUID REFERENCES cities(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('want', 'been')),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  priority TEXT CHECK (priority IS NULL OR priority IN ('low', 'med', 'high')),
  notes TEXT,
  links JSONB NOT NULL DEFAULT '[]',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endorsed_by JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cities_created_by ON cities(created_by);
CREATE INDEX IF NOT EXISTS idx_pois_created_by ON pois(created_by);
CREATE INDEX IF NOT EXISTS idx_pois_category_id ON pois(category_id);
CREATE INDEX IF NOT EXISTS idx_pois_city_id ON pois(city_id);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE countries_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE pois ENABLE ROW LEVEL SECURITY;

-- Create a function to check if user is allowlisted
-- You'll need to set the ALLOWLISTED_EMAILS in your app settings
CREATE OR REPLACE FUNCTION is_allowlisted()
RETURNS BOOLEAN AS $$
DECLARE
  user_email TEXT;
  allowlist TEXT[];
BEGIN
  -- Get current user's email
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();

  -- Get allowlist from app settings (you can also hardcode this)
  -- For now, we'll allow all authenticated users
  -- In production, you should check against a specific list
  RETURN user_email IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Countries State Policies
CREATE POLICY "Authenticated users can read countries_state"
  ON countries_state FOR SELECT
  TO authenticated
  USING (is_allowlisted());

CREATE POLICY "Authenticated users can insert countries_state"
  ON countries_state FOR INSERT
  TO authenticated
  WITH CHECK (is_allowlisted());

-- Cities Policies
CREATE POLICY "Authenticated users can read cities"
  ON cities FOR SELECT
  TO authenticated
  USING (is_allowlisted());

CREATE POLICY "Authenticated users can insert cities"
  ON cities FOR INSERT
  TO authenticated
  WITH CHECK (is_allowlisted() AND created_by = auth.uid());

CREATE POLICY "Creators can delete their cities"
  ON cities FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- Categories Policies
CREATE POLICY "Authenticated users can read categories"
  ON categories FOR SELECT
  TO authenticated
  USING (is_allowlisted());

CREATE POLICY "Authenticated users can insert categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (is_allowlisted() AND created_by = auth.uid());

CREATE POLICY "Creators can delete their categories"
  ON categories FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- POIs Policies
CREATE POLICY "Authenticated users can read pois"
  ON pois FOR SELECT
  TO authenticated
  USING (is_allowlisted());

CREATE POLICY "Authenticated users can insert pois"
  ON pois FOR INSERT
  TO authenticated
  WITH CHECK (is_allowlisted() AND created_by = auth.uid());

CREATE POLICY "Creators can delete their pois"
  ON pois FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- =============================================================================
-- RPC FUNCTIONS
-- =============================================================================

-- Admin: create city for target user
CREATE OR REPLACE FUNCTION admin_create_city(
  p_name TEXT,
  p_country_iso_a3 TEXT,
  p_lat FLOAT8,
  p_lng FLOAT8,
  p_target_user UUID
)
RETURNS cities AS $$
DECLARE
  v_admin_email TEXT;
  v_is_admin BOOLEAN;
  v_city cities%ROWTYPE;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check admin by email (admins table)
  SELECT email INTO v_admin_email FROM auth.users WHERE id = auth.uid();
  SELECT EXISTS (SELECT 1 FROM admins WHERE email = v_admin_email) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO cities (name, country_iso_a3, lat, lng, created_by)
  VALUES (p_name, p_country_iso_a3, p_lat, p_lng, p_target_user)
  RETURNING * INTO v_city;

  RETURN v_city;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set country flag (want or been)
CREATE OR REPLACE FUNCTION set_country_flag(
  p_iso_a3 TEXT,
  p_flag TEXT,
  p_value BOOLEAN
)
RETURNS VOID AS $$
DECLARE
  v_user_id TEXT;
  v_existing RECORD;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT is_allowlisted() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_user_id := auth.uid()::TEXT;

  -- Check if country exists
  SELECT * INTO v_existing FROM countries_state WHERE iso_a3 = p_iso_a3;

  IF v_existing IS NULL THEN
    -- Insert new record
    IF p_flag = 'want' THEN
      INSERT INTO countries_state (iso_a3, want_by, been_by)
      VALUES (p_iso_a3, jsonb_build_object(v_user_id, p_value), '{}');
    ELSE
      INSERT INTO countries_state (iso_a3, want_by, been_by)
      VALUES (p_iso_a3, '{}', jsonb_build_object(v_user_id, p_value));
    END IF;
  ELSE
    -- Update existing record
    IF p_flag = 'want' THEN
      UPDATE countries_state
      SET want_by = want_by || jsonb_build_object(v_user_id, p_value),
          updated_at = NOW()
      WHERE iso_a3 = p_iso_a3;
    ELSE
      UPDATE countries_state
      SET been_by = been_by || jsonb_build_object(v_user_id, p_value),
          updated_at = NOW()
      WHERE iso_a3 = p_iso_a3;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set city flag (want or been)
CREATE OR REPLACE FUNCTION set_city_flag(
  p_city_id UUID,
  p_flag TEXT,
  p_value BOOLEAN
)
RETURNS VOID AS $$
DECLARE
  v_user_id TEXT;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT is_allowlisted() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_user_id := auth.uid()::TEXT;

  IF p_flag = 'want' THEN
    UPDATE cities
    SET want_by = want_by || jsonb_build_object(v_user_id, p_value),
        updated_at = NOW()
    WHERE id = p_city_id;
  ELSE
    UPDATE cities
    SET been_by = been_by || jsonb_build_object(v_user_id, p_value),
        updated_at = NOW()
    WHERE id = p_city_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set POI endorsement
CREATE OR REPLACE FUNCTION set_poi_endorsement(
  p_poi_id UUID,
  p_value BOOLEAN
)
RETURNS VOID AS $$
DECLARE
  v_user_id TEXT;
  v_poi RECORD;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT is_allowlisted() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_user_id := auth.uid()::TEXT;

  -- Get POI and check user is not the creator (can't endorse own POI)
  SELECT * INTO v_poi FROM pois WHERE id = p_poi_id;

  IF v_poi IS NULL THEN
    RAISE EXCEPTION 'POI not found';
  END IF;

  IF v_poi.created_by = auth.uid() THEN
    RAISE EXCEPTION 'Cannot endorse your own POI';
  END IF;

  UPDATE pois
  SET endorsed_by = endorsed_by || jsonb_build_object(v_user_id, p_value),
      updated_at = NOW()
  WHERE id = p_poi_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update POI as creator
CREATE OR REPLACE FUNCTION update_poi_as_creator(
  p_poi_id UUID,
  p_label TEXT,
  p_status TEXT,
  p_category_id UUID,
  p_priority TEXT,
  p_notes TEXT,
  p_links JSONB
)
RETURNS VOID AS $$
DECLARE
  v_poi RECORD;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT is_allowlisted() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Get POI and check ownership
  SELECT * INTO v_poi FROM pois WHERE id = p_poi_id;

  IF v_poi IS NULL THEN
    RAISE EXCEPTION 'POI not found';
  END IF;

  IF v_poi.created_by != auth.uid() THEN
    RAISE EXCEPTION 'Only the creator can update this POI';
  END IF;

  -- Validate status
  IF p_status NOT IN ('want', 'been') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  -- Validate priority
  IF p_priority IS NOT NULL AND p_priority NOT IN ('low', 'med', 'high') THEN
    RAISE EXCEPTION 'Invalid priority';
  END IF;

  UPDATE pois
  SET label = p_label,
      status = p_status,
      category_id = p_category_id,
      priority = p_priority,
      notes = p_notes,
      links = COALESCE(p_links, '[]'::jsonb),
      updated_at = NOW()
  WHERE id = p_poi_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS update_countries_state_updated_at ON countries_state;
CREATE TRIGGER update_countries_state_updated_at
  BEFORE UPDATE ON countries_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_cities_updated_at ON cities;
CREATE TRIGGER update_cities_updated_at
  BEFORE UPDATE ON cities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_pois_updated_at ON pois;
CREATE TRIGGER update_pois_updated_at
  BEFORE UPDATE ON pois
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- SAMPLE DATA (Optional - for testing)
-- =============================================================================

-- You can uncomment and run this to add sample categories
-- INSERT INTO categories (name, created_by) VALUES
--   ('Restaurant', 'YOUR_USER_ID'),
--   ('Museum', 'YOUR_USER_ID'),
--   ('Beach', 'YOUR_USER_ID'),
--   ('Historical Site', 'YOUR_USER_ID'),
--   ('Nature', 'YOUR_USER_ID'),
--   ('Shopping', 'YOUR_USER_ID'),
--   ('Entertainment', 'YOUR_USER_ID');

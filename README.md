# Travel Atlas

A private couples travel map web app for tracking countries, cities, and POIs you've visited or want to visit together.

## Features

- **Countries Layer**: Mark countries as "want to visit" or "have visited" per user
- **Cities Layer**: Add and track cities with want/been status
- **POIs Layer**: Add points of interest with categories, notes, priority, and links
- **Two-User System**: Blue (Myles) and Red (Viktoria) color coding
- **Visual Symbology**: Solid = visited, Hatched = want to visit, Purple = both users
- **Magic Link Auth**: Passwordless login for allowlisted users only
- **Auto-sync**: Changes sync every 15 seconds and on window focus

## Tech Stack

- **Frontend**: Vite + React + TypeScript
- **Map**: MapLibre GL JS
- **Backend**: Supabase (auth, database, RLS)
- **Geocoding**: Nominatim (OpenStreetMap)
- **Hosting**: GitHub Pages

## Setup

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/travel-atlas.git
cd travel-atlas
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the schema from `supabase/schema.sql`
3. Enable Email Auth in Authentication settings
4. Configure Magic Link in Authentication > Email Templates

### 3. Configure Environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ALLOWLISTED_EMAILS=user1@email.com,user2@email.com
VITE_USER_CONFIG={"user1@email.com":{"name":"Myles","color":"blue"},"user2@email.com":{"name":"Viktoria","color":"red"}}
```

### 4. Fetch GeoJSON Data

```bash
npm run fetch-data
```

This downloads country boundaries and world cities data from ArcGIS.

### 5. Run Development Server

```bash
npm run dev
```

## Deployment

### GitHub Pages

1. Update `vite.config.ts` base path to match your repo name
2. Run:
```bash
npm run deploy
```

### Manual Deployment

```bash
npm run build
# Upload contents of dist/ to your hosting
```

## Project Structure

```
travel-atlas/
├── public/
│   └── data/           # Cached GeoJSON files
├── scripts/
│   └── fetch_esri_data.ts  # Data fetch script
├── src/
│   ├── map/            # MapLibre components
│   ├── services/       # Supabase, geocoding
│   ├── types/          # TypeScript types
│   └── ui/             # React UI components
├── supabase/
│   └── schema.sql      # Database schema
└── .env.example        # Environment template
```

## Data Model

### Countries State
- Keyed by ISO A3 code
- `want_by` / `been_by`: JSONB maps of `{ user_id: boolean }`

### Cities
- Name, coordinates, country
- `want_by` / `been_by`: JSONB maps
- `created_by`: UUID of creator (only they can delete)

### POIs
- Label, coordinates, status (want/been)
- Category, priority (low/med/high), notes, links
- `created_by`: Only creator can edit/delete
- `endorsed_by`: Other user can endorse (no disagree)

### Categories
- Shared between users
- Created dynamically, immediately available to both

## Permissions

- Only allowlisted emails can access the app
- Countries/Cities: Both users can toggle their own want/been status
- POIs: Only creator can edit core fields; other user can only endorse
- No "disagree" functionality - absence of endorsement = no overlap

## Visual Rules

| Status | Fill |
|--------|------|
| Have visited | Solid |
| Want to visit | Hatched |

| Who | Color |
|-----|-------|
| Myles | Blue |
| Viktoria | Red |
| Both | Purple |

If both "want" and "been" are true, "been" wins visually.

## License

Private project - not for redistribution.

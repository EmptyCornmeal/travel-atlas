import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import type { Map, GeoJSONSource, MapMouseEvent, LngLatLike } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CountryState, City, POI, User, FilterState, LayerVisibility, Selection } from '../types';
import { USER_COLORS } from '../types';

interface TravelMapProps {
  user: User;
  otherUser: User | null;
  countriesState: CountryState[];
  cities: City[];
  pois: POI[];
  filters: FilterState;
  layers: LayerVisibility;
  selection: Selection;
  onCountryClick: (isoA3: string) => void;
  onCityClick: (cityId: string) => void;
  onPOIClick: (poiId: string) => void;
  onMapClick: (lat: number, lng: number) => void;
}

// Hatched pattern images for "want" status (PNG data URIs — MapLibre-friendly)
const HATCH_PATTERN_BLUE = createHatchPatternPng(USER_COLORS.blue.solid);
const HATCH_PATTERN_RED = createHatchPatternPng(USER_COLORS.red.solid);
const HATCH_PATTERN_PURPLE = createHatchPatternPng(USER_COLORS.purple.solid);

function createHatchPatternPng(color: string): string {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // transparent background
  ctx.clearRect(0, 0, size, size);

  // draw diagonal hatch lines
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  // A few lines to tile nicely
  for (let i = -size; i <= size * 2; i += 6) {
    ctx.beginPath();
    ctx.moveTo(i, size);
    ctx.lineTo(i + size, 0);
    ctx.stroke();
  }

  return canvas.toDataURL('image/png');
}


export function TravelMap({
  user,
  otherUser,
  countriesState,
  cities,
  pois,
  filters,
  layers,
  selection,
  onCountryClick,
  onCityClick,
  onPOIClick,
  onMapClick,
}: TravelMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const loaded = useRef(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'carto-light': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          },
        },
        layers: [
          {
            id: 'carto-light-layer',
            type: 'raster',
            source: 'carto-light',
            minzoom: 0,
            maxzoom: 20,
          },
        ],
      },
      center: [10, 45],
      zoom: 3,
    });

    map.current.on('load', () => {
      loaded.current = true;
      initializeLayers(map.current!);
    });

    // Add navigation controls
    map.current.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    return () => {
      map.current?.remove();
      map.current = null;
      loaded.current = false;
    };
  }, []);

  // Initialize layers and sources
  const initializeLayers = useCallback(async (mapInstance: Map) => {
    // Load hatched pattern images
    await Promise.all([
      loadImage(mapInstance, 'hatch-blue', HATCH_PATTERN_BLUE),
      loadImage(mapInstance, 'hatch-red', HATCH_PATTERN_RED),
      loadImage(mapInstance, 'hatch-purple', HATCH_PATTERN_PURPLE),
    ]);

    // Add countries source
    mapInstance.addSource('countries', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    // Add countries fill layer (for solid "been" status)
    mapInstance.addLayer({
      id: 'countries-fill',
      type: 'fill',
      source: 'countries',
      paint: {
        'fill-color': ['get', 'fillColor'],
        'fill-opacity': ['get', 'fillOpacity'],
      },
      filter: ['==', ['get', 'pattern'], 'solid'],
    });

    // Add countries fill pattern layer (for hatched "want" status)
    mapInstance.addLayer({
      id: 'countries-pattern',
      type: 'fill',
      source: 'countries',
      paint: {
        'fill-pattern': ['get', 'patternImage'],
        'fill-opacity': 0.6,
      },
      filter: ['==', ['get', 'pattern'], 'hatched'],
    });

    // Add countries outline layer
    mapInstance.addLayer({
      id: 'countries-outline',
      type: 'line',
      source: 'countries',
      paint: {
        'line-color': ['get', 'outlineColor'],
        'line-width': [
          'case',
          ['==', ['get', 'selected'], true], 3,
          1
        ],
        'line-opacity': 0.8,
      },
    });

    // Add cities source
    mapInstance.addSource('cities', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    // Add cities circle layer
    mapInstance.addLayer({
      id: 'cities-circle',
      type: 'circle',
      source: 'cities',
      paint: {
        'circle-radius': [
          'case',
          ['==', ['get', 'selected'], true], 10,
          7
        ],
        'circle-color': ['get', 'fillColor'],
        'circle-stroke-color': ['get', 'outlineColor'],
        'circle-stroke-width': [
          'case',
          ['==', ['get', 'pattern'], 'hatched'], 3,
          ['==', ['get', 'selected'], true], 3,
          1.5
        ],
        'circle-opacity': [
          'case',
          ['==', ['get', 'pattern'], 'hatched'], 0.3,
          0.8
        ],
      },
    });

    // Add cities label layer
    mapInstance.addLayer({
      id: 'cities-label',
      type: 'symbol',
      source: 'cities',
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': 11,
        'text-offset': [0, 1.5],
        'text-anchor': 'top',
      },
      paint: {
        'text-color': '#333',
        'text-halo-color': '#fff',
        'text-halo-width': 1,
      },
    });

    // Add POIs source
    mapInstance.addSource('pois', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: true,
      clusterMaxZoom: 12,
      clusterRadius: 50,
    });

    // Add POI cluster layer
    mapInstance.addLayer({
      id: 'pois-cluster',
      type: 'circle',
      source: 'pois',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#6B7280',
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          15,
          10, 20,
          50, 25,
        ],
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 2,
      },
    });

    // Add cluster count label
    mapInstance.addLayer({
      id: 'pois-cluster-count',
      type: 'symbol',
      source: 'pois',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': 12,
      },
      paint: {
        'text-color': '#fff',
      },
    });

    // Add individual POI layer
    mapInstance.addLayer({
      id: 'pois-point',
      type: 'circle',
      source: 'pois',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': [
          'case',
          ['==', ['get', 'selected'], true], 12,
          ['==', ['get', 'priority'], 'high'], 10,
          ['==', ['get', 'priority'], 'med'], 8,
          6
        ],
        'circle-color': ['get', 'fillColor'],
        'circle-stroke-color': ['get', 'outlineColor'],
        'circle-stroke-width': [
          'case',
          ['==', ['get', 'pattern'], 'hatched'], 3,
          ['==', ['get', 'selected'], true], 3,
          2
        ],
        'circle-opacity': [
          'case',
          ['==', ['get', 'pattern'], 'hatched'], 0.3,
          0.9
        ],
      },
    });

    // Add POI label layer
    mapInstance.addLayer({
      id: 'pois-label',
      type: 'symbol',
      source: 'pois',
      filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': 12,
        'text-offset': [0, 1.8],
        'text-anchor': 'top',
        'text-max-width': 12,
      },
      paint: {
        'text-color': '#1F2937',
        'text-halo-color': '#fff',
        'text-halo-width': 1.5,
      },
    });

    // Add click handlers
    mapInstance.on('click', 'countries-fill', (e: MapMouseEvent) => {
     const feature = (e as any).features?.[0];
      if (feature?.properties?.iso_a3) {
        onCountryClick(feature.properties.iso_a3);
      }
    });

    mapInstance.on('click', 'countries-pattern', (e: MapMouseEvent) => {
     const feature = (e as any).features?.[0];
      if (feature?.properties?.iso_a3) {
        onCountryClick(feature.properties.iso_a3);
      }
    });

    mapInstance.on('click', 'cities-circle', (e: MapMouseEvent) => {
      e.originalEvent.stopPropagation();
     const feature = (e as any).features?.[0];
      if (feature?.properties?.id) {
        onCityClick(feature.properties.id);
      }
    });

    mapInstance.on('click', 'pois-point', (e: MapMouseEvent) => {
      e.originalEvent.stopPropagation();
     const feature = (e as any).features?.[0];
      if (feature?.properties?.id) {
        onPOIClick(feature.properties.id);
      }
    });

    mapInstance.on('click', 'pois-cluster', (e: MapMouseEvent) => {
      const features = mapInstance.queryRenderedFeatures(e.point, {
        layers: ['pois-cluster'],
      });
      const clusterId = features[0]?.properties?.cluster_id;
      const source = mapInstance.getSource('pois') as GeoJSONSource;
      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        const coords = (features[0].geometry as GeoJSON.Point).coordinates as LngLatLike;
        mapInstance.easeTo({
          center: coords,
          zoom: zoom!,
        });
      });
    });

    // General map click for adding POIs
    mapInstance.on('click', (e: MapMouseEvent) => {
      // Check if we clicked on a feature
      const features = mapInstance.queryRenderedFeatures(e.point, {
        layers: ['countries-fill', 'countries-pattern', 'cities-circle', 'pois-point', 'pois-cluster'],
      });

      if (features.length === 0) {
        onMapClick(e.lngLat.lat, e.lngLat.lng);
      }
    });

    // Cursor changes
    const pointerLayers = ['countries-fill', 'countries-pattern', 'cities-circle', 'pois-point', 'pois-cluster'];
    pointerLayers.forEach(layer => {
      mapInstance.on('mouseenter', layer, () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });
      mapInstance.on('mouseleave', layer, () => {
        mapInstance.getCanvas().style.cursor = '';
      });
    });
  }, [onCountryClick, onCityClick, onPOIClick, onMapClick]);

  // Load base GeoJSON and merge with state
  useEffect(() => {
    if (!map.current || !loaded.current) return;

    loadCountriesData();
  }, [countriesState, filters, layers.countries, selection, user, otherUser]);

  // Update cities layer
  useEffect(() => {
    if (!map.current || !loaded.current) return;

    updateCitiesData();
  }, [cities, filters, layers.cities, selection, user, otherUser]);

  // Update POIs layer
  useEffect(() => {
    if (!map.current || !loaded.current) return;

    updatePOIsData();
  }, [pois, filters, layers.pois, selection, user, otherUser]);

  // Load and process countries data
  const loadCountriesData = useCallback(async () => {
    if (!map.current) return;

    try {
      const base = import.meta.env.BASE_URL;
      const response = await fetch(`${base}data/countries.geojson`);
      const countriesGeoJSON: GeoJSON.FeatureCollection = await response.json();

      // Merge with state and apply styling
      const styledFeatures = countriesGeoJSON.features
        .map(feature => {
          const isoA3 = feature.properties?.iso_a3;
          if (!isoA3) return null;

          const state = countriesState.find(s => s.iso_a3 === isoA3);
          const styling = getCountryStyling(state, user, otherUser, filters, selection);

          if (!styling.visible || !layers.countries) return null;

          return {
            ...feature,
            properties: {
              ...feature.properties,
              ...styling,
              selected: selection.type === 'country' && selection.id === isoA3,
            },
          };
        })
        .filter(Boolean);

      const source = map.current.getSource('countries') as GeoJSONSource;
      if (source) {
        source.setData({
          type: 'FeatureCollection',
          features: styledFeatures as GeoJSON.Feature[],
        });
      }
    } catch (error) {
      console.error('Error loading countries data:', error);
    }
  }, [countriesState, filters, layers.countries, selection, user, otherUser]);

  // Update cities data
  const updateCitiesData = useCallback(() => {
    if (!map.current) return;

    const filteredCities = cities.filter(city => passesFilters(city, user, filters, 'city'));

    const features: GeoJSON.Feature[] = filteredCities.map(city => {
      const styling = getCityStyling(city, user, otherUser, selection);

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [city.lng, city.lat],
        },
        properties: {
          id: city.id,
          name: city.name,
          ...styling,
          selected: selection.type === 'city' && selection.id === city.id,
        },
      };
    });

    const source = map.current.getSource('cities') as GeoJSONSource;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: layers.cities ? features : [],
      });
    }
  }, [cities, filters, layers.cities, selection, user, otherUser]);

  // Update POIs data
  const updatePOIsData = useCallback(() => {
    if (!map.current) return;

    const filteredPOIs = pois.filter(poi => passesFilters(poi, user, filters, 'poi'));

    const features: GeoJSON.Feature[] = filteredPOIs.map(poi => {
      const styling = getPOIStyling(poi, user, otherUser, selection);

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [poi.lng, poi.lat],
        },
        properties: {
          id: poi.id,
          label: poi.label,
          priority: poi.priority,
          ...styling,
          selected: selection.type === 'poi' && selection.id === poi.id,
        },
      };
    });

    const source = map.current.getSource('pois') as GeoJSONSource;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: layers.pois ? features : [],
      });
    }
  }, [pois, filters, layers.pois, selection, user, otherUser]);

  return (
    <div
      ref={mapContainer}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    />
  );
}

// Helper to load image into map (Promise-based)
async function loadImage(
  mapInstance: Map,
  name: string,
  url: string
): Promise<void> {
  if (mapInstance.hasImage(name)) return;

  const image = await mapInstance.loadImage(url);
  mapInstance.addImage(name, image.data);
}

// Determine who has marked an entity
function getWhoMarked(
  wantBy: Record<string, boolean>,
  beenBy: Record<string, boolean>,
  userId: string,
  otherUserId: string | null
): { userWant: boolean; userBeen: boolean; otherWant: boolean; otherBeen: boolean } {
  return {
    userWant: wantBy[userId] === true,
    userBeen: beenBy[userId] === true,
    otherWant: otherUserId ? wantBy[otherUserId] === true : false,
    otherBeen: otherUserId ? beenBy[otherUserId] === true : false,
  };
}

// Get country styling based on state
function getCountryStyling(
  state: CountryState | undefined,
  user: User,
  otherUser: User | null,
  filters: FilterState,
  selection: Selection
): {
  visible: boolean;
  fillColor: string;
  outlineColor: string;
  fillOpacity: number;
  pattern: 'solid' | 'hatched';
  patternImage: string;
} {
  const defaultStyling = {
    visible: false,
    fillColor: '#9CA3AF',
    outlineColor: '#6B7280',
    fillOpacity: 0.1,
    pattern: 'solid' as const,
    patternImage: '',
  };

  if (!state) return defaultStyling;

  const { userWant, userBeen, otherWant, otherBeen } = getWhoMarked(
    state.want_by || {},
    state.been_by || {},
    user.id,
    otherUser?.id || null
  );

  // Determine if anything is marked
  const hasAnyMark = userWant || userBeen || otherWant || otherBeen;
  if (!hasAnyMark) return defaultStyling;

  // Apply filters
  if (!passesWhoFilter(userWant || userBeen, otherWant || otherBeen, filters.who)) {
    return defaultStyling;
  }

  // Determine final status (been wins over want)
  const effectiveUserBeen = userBeen;
  const effectiveOtherBeen = otherBeen;
  const effectiveUserWant = userWant && !userBeen;
  const effectiveOtherWant = otherWant && !otherBeen;

  // Apply status filter
  const hasBeen = effectiveUserBeen || effectiveOtherBeen;
  const hasWant = effectiveUserWant || effectiveOtherWant;

  if (filters.status === 'been' && !hasBeen) return defaultStyling;
  if (filters.status === 'want' && !hasWant) return defaultStyling;

  // Determine color (who)
  const bothBeen = effectiveUserBeen && effectiveOtherBeen;
  const bothWant = effectiveUserWant && effectiveOtherWant;

  let color: 'blue' | 'red' | 'purple';
  let pattern: 'solid' | 'hatched';

  if (bothBeen) {
    color = 'purple';
    pattern = 'solid';
  } else if (bothWant) {
    color = 'purple';
    pattern = 'hatched';
  } else if (effectiveUserBeen) {
    color = user.color;
    pattern = 'solid';
  } else if (effectiveOtherBeen && otherUser) {
    color = otherUser.color;
    pattern = 'solid';
  } else if (effectiveUserWant) {
    color = user.color;
    pattern = 'hatched';
  } else if (effectiveOtherWant && otherUser) {
    color = otherUser.color;
    pattern = 'hatched';
  } else {
    return defaultStyling;
  }

  const colors = USER_COLORS[color];

  return {
    visible: true,
    fillColor: colors.solid,
    outlineColor: colors.dark,
    fillOpacity: pattern === 'solid' ? 0.5 : 0.3,
    pattern,
    patternImage: pattern === 'hatched' ? `hatch-${color}` : '',
  };
}

// Get city styling
function getCityStyling(
  city: City,
  user: User,
  otherUser: User | null,
  selection: Selection
): {
  fillColor: string;
  outlineColor: string;
  pattern: 'solid' | 'hatched';
} {
  const { userWant, userBeen, otherWant, otherBeen } = getWhoMarked(
    city.want_by || {},
    city.been_by || {},
    user.id,
    otherUser?.id || null
  );

  // Been wins over want
  const effectiveUserBeen = userBeen;
  const effectiveOtherBeen = otherBeen;
  const effectiveUserWant = userWant && !userBeen;
  const effectiveOtherWant = otherWant && !otherBeen;

  const bothBeen = effectiveUserBeen && effectiveOtherBeen;
  const bothWant = effectiveUserWant && effectiveOtherWant;

  let color: 'blue' | 'red' | 'purple';
  let pattern: 'solid' | 'hatched';

  if (bothBeen) {
    color = 'purple';
    pattern = 'solid';
  } else if (bothWant) {
    color = 'purple';
    pattern = 'hatched';
  } else if (effectiveUserBeen) {
    color = user.color;
    pattern = 'solid';
  } else if (effectiveOtherBeen && otherUser) {
    color = otherUser.color;
    pattern = 'solid';
  } else if (effectiveUserWant) {
    color = user.color;
    pattern = 'hatched';
  } else if (effectiveOtherWant && otherUser) {
    color = otherUser.color;
    pattern = 'hatched';
  } else {
    // Default - gray
    return {
      fillColor: '#9CA3AF',
      outlineColor: '#6B7280',
      pattern: 'solid',
    };
  }

  const colors = USER_COLORS[color];

  return {
    fillColor: colors.solid,
    outlineColor: colors.dark,
    pattern,
  };
}

// Get POI styling
function getPOIStyling(
  poi: POI,
  user: User,
  otherUser: User | null,
  selection: Selection
): {
  fillColor: string;
  outlineColor: string;
  pattern: 'solid' | 'hatched';
} {
  const isCreator = poi.created_by === user.id;
  const isEndorsed = otherUser && poi.endorsed_by?.[otherUser.id] === true;

  // Status determines pattern
  const pattern: 'solid' | 'hatched' = poi.status === 'been' ? 'solid' : 'hatched';

  // Color based on creator and endorsement
  let color: 'blue' | 'red' | 'purple';

  if (isCreator) {
    // Created by current user
    if (isEndorsed) {
      color = 'purple'; // Both users involved
    } else {
      color = user.color;
    }
  } else {
    // Created by other user
    if (otherUser) {
      const creatorEndorsed = poi.endorsed_by?.[user.id] === true;
      if (creatorEndorsed) {
        color = 'purple';
      } else {
        color = otherUser.color;
      }
    } else {
      color = 'purple'; // Fallback
    }
  }

  const colors = USER_COLORS[color];

  return {
    fillColor: colors.solid,
    outlineColor: colors.dark,
    pattern,
  };
}

// Check if entity passes who filter
function passesWhoFilter(
  userMarked: boolean,
  otherMarked: boolean,
  filter: FilterState['who']
): boolean {
  switch (filter) {
    case 'mine':
      return userMarked;
    case 'theirs':
      return otherMarked;
    case 'both':
      return userMarked && otherMarked;
    case 'all':
    default:
      return true;
  }
}

// Check if entity passes all filters
function passesFilters(
  entity: City | POI,
  user: User,
  filters: FilterState,
  type: 'city' | 'poi'
): boolean {
  if (type === 'city') {
    const city = entity as City;
    const userMarked = city.want_by?.[user.id] || city.been_by?.[user.id];
    const otherMarked = Object.keys(city.want_by || {}).some(k => k !== user.id && city.want_by?.[k]) ||
                        Object.keys(city.been_by || {}).some(k => k !== user.id && city.been_by?.[k]);

    if (!passesWhoFilter(!!userMarked, !!otherMarked, filters.who)) return false;

    const hasBeen = Object.values(city.been_by || {}).some(Boolean);
    const hasWant = Object.values(city.want_by || {}).some(Boolean);

    if (filters.status === 'been' && !hasBeen) return false;
    if (filters.status === 'want' && !hasWant) return false;

    return true;
  }

  if (type === 'poi') {
    const poi = entity as POI;

    // Who filter - based on creator
    const userCreated = poi.created_by === user.id;
    const userEndorsed = poi.endorsed_by?.[user.id] === true;
    const otherInvolved = !userCreated || Object.keys(poi.endorsed_by || {}).some(k => k !== user.id && poi.endorsed_by?.[k]);

    if (filters.who === 'mine' && !userCreated && !userEndorsed) return false;
    if (filters.who === 'theirs' && userCreated) return false;
    if (filters.who === 'both' && !(userCreated || userEndorsed) && !otherInvolved) return false;

    // Status filter
    if (filters.status === 'been' && poi.status !== 'been') return false;
    if (filters.status === 'want' && poi.status !== 'want') return false;

    // Category filter
    if (filters.categories.length > 0 && poi.category_id && !filters.categories.includes(poi.category_id)) {
      return false;
    }

    // Priority filter
    if (filters.priority !== 'all' && poi.priority !== filters.priority) return false;

    return true;
  }

  return true;
}

export default TravelMap;

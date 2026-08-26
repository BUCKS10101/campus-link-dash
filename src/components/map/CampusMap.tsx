import * as React from 'react'
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'

// MapLibre computes its worker script's URL relative to its own bundled
// location at runtime - a pattern neither Vite's dev-time esbuild
// pre-bundler nor its Rollup production build can statically detect, so
// the worker request 404s in both dev and build (confirmed via direct
// testing) unless pointed at the real file explicitly. The `?url` import
// makes Vite resolve/emit the actual worker asset correctly in both
// modes; setWorkerUrl() is maplibre-gl's own supported override for
// exactly this bundler situation. Without this, every GeoJSON-backed
// source silently never loads (worker fails, map.on('load') never
// fires) while the background/controls/DOM markers - none of which need
// the worker - still render fine, which is what made this look like a
// partial rendering bug rather than a totally dead source.
setWorkerUrl(maplibreWorkerUrl)

export interface CampusMapPoint {
  lat: number
  lng: number
  label: string
}

export interface CampusMapProps {
  pickup?: CampusMapPoint | null
  delivery?: CampusMapPoint | null
  /** A GeoJSON LineString from compute_walking_route(), or null if only a straight-line distance was available. */
  route?: { type: 'LineString'; coordinates: [number, number][] } | null
  /** The deliverer's current position, or null while unavailable/not yet shared. */
  liveLocation?: { lat: number; lng: number } | null
  className?: string
  /**
   * Custom-pin placement (PHASE3_3A_LOCATION_SPEC.md §14) - when provided,
   * the map becomes tap-to-place: a click drops/moves the delivery marker
   * and calls this with the new coordinate; the marker also becomes
   * draggable for fine adjustment before confirming. Omit for a read-only
   * tracking view (e.g. Activity), where nothing should be movable.
   */
  onSelectLocation?: (lat: number, lng: number) => void
}

// Campus centroid, roughly the middle of the coordinate spread already
// sourced for campus_points/campus_path_nodes - not a citywide or global
// default, this map only ever shows this one small area.
const DEFAULT_CENTER: [number, number] = [79.161, 12.9705]
const DEFAULT_ZOOM = 15.5

/**
 * Renders ONLY this project's own self-hosted campus geometry
 * (public/campus-map.geojson, a one-time OpenStreetMap export - see
 * PHASE3_3A_ARCHITECTURE_REVISION.md) - no basemap tile source, no
 * external request of any kind at runtime, so this can never incur a
 * tile-provider bill. Styled in the Counter palette rather than a
 * default OSM look. Markers are DOM elements (maplibre-gl's Marker), not
 * vector text layers, specifically to avoid needing a glyph/font server -
 * keeping the zero-external-dependency property for labels too.
 */
export function CampusMap({ pickup, delivery, route, liveLocation, className, onSelectLocation }: CampusMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const mapRef = React.useRef<MapLibreMap | null>(null)
  const markersRef = React.useRef<Marker[]>([])
  // Kept in a ref so the click handler (bound once, in the map-creation
  // effect below) always calls the latest callback without needing to
  // tear down and recreate the whole map when it changes identity.
  const onSelectLocationRef = React.useRef(onSelectLocation)
  onSelectLocationRef.current = onSelectLocation

  React.useEffect(() => {
    if (!containerRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          campus: { type: 'geojson', data: '/campus-map.geojson' },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': 'hsl(38, 40%, 88%)' } },
          {
            id: 'buildings',
            type: 'fill',
            source: 'campus',
            filter: ['==', ['get', 'kind'], 'building'],
            paint: { 'fill-color': 'hsl(154, 20%, 60%)', 'fill-opacity': 0.5 },
          },
          {
            id: 'building-outline',
            type: 'line',
            source: 'campus',
            filter: ['==', ['get', 'kind'], 'building'],
            paint: { 'line-color': 'hsl(162, 17%, 11%)', 'line-width': 0.5 },
          },
          {
            id: 'paths',
            type: 'line',
            source: 'campus',
            filter: ['==', ['get', 'kind'], 'path'],
            paint: { 'line-color': 'hsl(133, 8%, 52%)', 'line-width': 1 },
          },
        ],
      },
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    })

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    map.on('click', (e) => onSelectLocationRef.current?.(e.lngLat.lat, e.lngLat.lng))
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Route line - added/updated as a second source once the map exists,
  // independent of the static campus geometry above.
  React.useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const applyRoute = () => {
      const data: GeoJSON.Feature = {
        type: 'Feature',
        properties: {},
        geometry: route ?? { type: 'LineString', coordinates: [] },
      }
      const source = map.getSource('route') as GeoJSONSource | undefined
      if (source) {
        source.setData(data)
      } else if (map.isStyleLoaded()) {
        map.addSource('route', { type: 'geojson', data })
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          paint: { 'line-color': 'hsl(154, 25%, 16%)', 'line-width': 3 },
        })
      }
    }

    if (map.isStyleLoaded()) applyRoute()
    else map.once('load', applyRoute)
  }, [route])

  // Pickup/delivery/live-location markers - plain DOM elements so no
  // glyph server is needed for labels.
  React.useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    const addMarker = (point: CampusMapPoint | null | undefined, sizeAndColorClass: string, draggable = false) => {
      if (!point) return
      const el = document.createElement('div')
      el.className = `rounded-full border-2 border-background ${sizeAndColorClass}`
      el.setAttribute('aria-label', point.label)
      const marker = new Marker({ element: el, draggable }).setLngLat([point.lng, point.lat]).addTo(map)
      if (draggable) {
        marker.on('dragend', () => {
          const { lat, lng } = marker.getLngLat()
          onSelectLocationRef.current?.(lat, lng)
        })
      }
      markersRef.current.push(marker)
    }

    addMarker(pickup, 'size-3 bg-accent')
    // A custom pin (draggable, once onSelectLocation is wired up) is
    // rendered as a distinctly larger berry marker - a rare-signal color
    // reserved for exactly this kind of "this needs your attention/input"
    // moment, per the Counter palette's own rules - so it never reads as
    // just another catalog point on the map.
    addMarker(
      delivery,
      onSelectLocation ? 'size-5 bg-primary-deep' : 'size-3 bg-foreground',
      Boolean(onSelectLocation),
    )

    if (liveLocation) {
      const el = document.createElement('div')
      el.className = 'size-4 rounded-full border-2 border-background bg-primary-deep animate-dot-settle'
      el.setAttribute('aria-label', 'Deliverer’s current location')
      const marker = new Marker({ element: el }).setLngLat([liveLocation.lng, liveLocation.lat]).addTo(map)
      markersRef.current.push(marker)
    }

    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
    }
  }, [pickup, delivery, liveLocation, onSelectLocation])

  return onSelectLocation ? (
    <div ref={containerRef} className={className} role="application" aria-label="Campus map — tap to drop a pin, drag to adjust" />
  ) : (
    <div ref={containerRef} className={className} role="img" aria-label="Campus map" />
  )
}

export default CampusMap

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo } from 'react'
import { Circle, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import { TILE_URL } from './maps'

export interface MapPoint {
  id: string
  latitude: number
  longitude: number
  accuracy: number | null
  /** Shown inside the pin (1, 2, 3… in entry order). */
  label?: string
}

interface Props {
  points: MapPoint[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** Mini map: no dragging, zoom or wheel, so it never traps the page scroll (UX-COMPONENTS.md §4.9). */
  interactive?: boolean
  className?: string
}

const pinIcon = (label: string | undefined, selected: boolean) =>
  L.divIcon({
    className: 'map-pin-wrap',
    html: `<span class="map-pin${selected ? ' map-pin-selected' : ''}">${label ?? ''}</span>`,
    iconSize: [selected ? 28 : 22, selected ? 28 : 22],
    iconAnchor: [selected ? 14 : 11, selected ? 14 : 11],
  })

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) map.setView([points[0].latitude, points[0].longitude], 17)
    else map.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number])), { padding: [40, 40], maxZoom: 17 })
  }, [map, points])
  return null
}

/** Leaflet over OpenStreetMap tiles. Lazy-loaded by its callers so field screens stay light. */
export default function MapView({ points, selectedId, onSelect, interactive = true, className }: Props) {
  const first = points[0]
  const stable = useMemo(() => points, [points])
  return (
    <MapContainer
      center={first ? [first.latitude, first.longitude] : [20.59, 78.96]}
      zoom={first ? 17 : 4}
      zoomControl={false}
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      keyboard={interactive}
      boxZoom={false}
      attributionControl
      className={className}
      style={{ height: '100%', width: '100%' }}
    >
      {/* Attribution is required by the OSM tile policy and is never hidden. */}
      <TileLayer url={TILE_URL} maxZoom={19} attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' />
      <FitBounds points={stable} />
      {stable.map((p) => {
        const selected = p.id === selectedId
        const low = (p.accuracy ?? 0) > 100
        return (
          <span key={p.id}>
            {p.accuracy !== null && p.accuracy > 0 && (
              <Circle
                center={[p.latitude, p.longitude]}
                radius={p.accuracy}
                pathOptions={{ color: '#0052ff', weight: 1, dashArray: low ? '4 4' : undefined, fillColor: '#0052ff', fillOpacity: 0.08, interactive: false }}
              />
            )}
            <Marker
              position={[p.latitude, p.longitude]}
              icon={pinIcon(p.label, selected)}
              keyboard={false}
              eventHandlers={onSelect ? { click: () => onSelect(p.id) } : undefined}
              zIndexOffset={selected ? 1000 : 0}
            />
          </span>
        )
      })}
    </MapContainer>
  )
}

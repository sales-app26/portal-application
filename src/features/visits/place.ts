import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { PlaceName } from '@/lib/types'

/** Asks again only once the position has moved more than this. */
const MOVE_METRES = 30
/** A position must settle this long before it is looked up. */
const SETTLE_MS = 600

interface Position {
  latitude: number
  longitude: number
}

/**
 * The area a position is in. The API looks it up on OpenStreetMap; the app never calls
 * a map service itself. Null when no name is known.
 */
export function fetchPlace(latitude: number, longitude: number, signal?: AbortSignal): Promise<PlaceName | null> {
  return api<PlaceName | null>('/geo/reverse', { query: { lat: round(latitude, 5), lng: round(longitude, 5) }, signal })
}

/** The short name a rep would type: the area, else the first part of the line. */
export const shortPlace = (place: PlaceName): string => (place.area ?? place.label.split(',')[0]).trim()

/** The free OpenStreetMap page for a position, opened in a new tab. */
export function openStreetMapUrl(latitude: number, longitude: number): string {
  const lat = round(latitude, 6)
  const lng = round(longitude, 6)
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`
}

/** Metres between two positions (haversine; plenty for "has it moved 30 m"). */
export function distanceMetres(a: Position, b: Position): number {
  const rad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * rad
  const dLng = (b.longitude - a.longitude) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

/**
 * "Near <area>" for a live position: looked up once it settles, and again only when it
 * moves more than about 30 m, so a jittery fix never floods the lookup.
 */
export function usePlaceNear(fix: Position | null): PlaceName | null {
  const [anchor, setAnchor] = useState<Position | null>(null)
  const lat = fix?.latitude
  const lng = fix?.longitude

  useEffect(() => {
    if (lat === undefined || lng === undefined) return
    const next = { latitude: lat, longitude: lng }
    if (anchor && distanceMetres(anchor, next) <= MOVE_METRES) return
    const t = setTimeout(() => setAnchor(next), anchor ? SETTLE_MS : SETTLE_MS / 2)
    return () => clearTimeout(t)
  }, [lat, lng, anchor])

  const q = useQuery({
    queryKey: ['place', anchor && round(anchor.latitude, 4), anchor && round(anchor.longitude, 4)],
    queryFn: ({ signal }) => fetchPlace(anchor!.latitude, anchor!.longitude, signal),
    enabled: !!anchor,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
  })
  return anchor ? (q.data ?? null) : null
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places

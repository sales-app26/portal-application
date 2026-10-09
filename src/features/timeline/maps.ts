/** "Open in Maps" per platform (UX-COMPONENTS.md §4.9). */
export function openInMapsUrl(lat: number, lng: number): string {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return `geo:${lat},${lng}?q=${lat},${lng}`
  if (/iPhone|iPad|iPod/i.test(ua)) return `https://maps.apple.com/?q=${lat},${lng}`
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`
}

export const TILE_URL = (import.meta.env.VITE_MAP_TILE_URL as string | undefined) ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

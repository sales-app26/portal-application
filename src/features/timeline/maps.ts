/** Free OpenStreetMap tiles; VITE_MAP_TILE_URL may point at another free tile server. */
export const TILE_URL = (import.meta.env.VITE_MAP_TILE_URL as string | undefined) ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

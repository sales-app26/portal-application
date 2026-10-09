import { lazy, Suspense } from 'react'
import { cn } from '@/lib/cn'
import type { MapPoint } from './MapView'

const MapView = lazy(() => import('./MapView'))

/** Loads Leaflet only when a map is actually on screen; skeleton until then. */
export function LazyMap(props: { points: MapPoint[]; selectedId?: string | null; onSelect?: (id: string) => void; interactive?: boolean; className?: string }) {
  return (
    <div className={cn('relative isolate overflow-hidden bg-surface-strong', props.className)}>
      <Suspense fallback={<div aria-hidden className="skeleton absolute inset-0" />}>
        <MapView {...props} className="absolute inset-0" />
      </Suspense>
    </div>
  )
}

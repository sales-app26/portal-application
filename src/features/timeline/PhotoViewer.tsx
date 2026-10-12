import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, IconButton } from '@/components/ui/Button'
import { Skeleton, Tag } from '@/components/ui/Display'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'
import { formatDateTime } from '@/lib/format'
import type { Entry } from '@/lib/types'
import { openInMapsUrl } from './maps'
import { fetchPhotoUrl } from './queries'

interface Props {
  entry: Entry | null
  title?: string
  onClose: () => void
}

/**
 * Full-screen photo (UX-COMPONENTS.md §3, §4.6): fresh signed URL, double-tap or
 * double-click to zoom, drag down to close, details panel with "Open in Maps".
 */
export function PhotoViewer({ entry, title, onClose }: Props) {
  useOverlayHistory(!!entry, onClose)
  const photo = useQuery({
    queryKey: ['entries', entry?.id, 'photo'],
    enabled: !!entry,
    queryFn: () => fetchPhotoUrl(entry!.id),
    staleTime: 0,
    gcTime: 0,
  })
  const [zoomed, setZoomed] = useState(false)
  const [dragY, setDragY] = useState(0)
  const touchStart = useRef<number | null>(null)

  if (!entry) return null
  const hasGps = entry.latitude !== null && entry.longitude !== null

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title ?? 'Visit photo'} className="fixed inset-0 z-[65] flex flex-col bg-surface-dark text-on-dark">
      <div className="flex items-center gap-2 px-2 pt-[max(8px,env(safe-area-inset-top))]">
        <IconButton icon="multiply" label="Close photo" tone="dark" onClick={onClose} />
        <p className="min-w-0 flex-1 truncate text-title-sm">{title}</p>
      </div>

      <div
        className={zoomed ? 'min-h-0 flex-1 overflow-auto' : 'flex min-h-0 flex-1 items-center justify-center overflow-hidden'}
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, opacity: dragY ? Math.max(0.4, 1 - dragY / 400) : 1, transition: dragY ? 'none' : 'transform 200ms, opacity 200ms' }}
        onTouchStart={(e) => {
          if (!zoomed && e.touches.length === 1) touchStart.current = e.touches[0].clientY
        }}
        onTouchMove={(e) => {
          if (touchStart.current !== null) setDragY(Math.max(0, e.touches[0].clientY - touchStart.current))
        }}
        onTouchEnd={() => {
          if (dragY > 120) onClose()
          setDragY(0)
          touchStart.current = null
        }}
      >
        {photo.isLoading ? (
          <Skeleton className="h-3/4 w-11/12 rounded-lg" />
        ) : photo.isError ? (
          <div className="px-8 text-center">
            <p className="text-title-sm">The photo could not be loaded</p>
            <p className="mt-1 text-body-sm text-on-dark-soft">{photo.error.message}</p>
            <Button className="mt-4" variant="secondary-dark" onClick={() => void photo.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <img
            src={photo.data!.url}
            alt={`Visit photo, ${formatDateTime(entry.createdAt)}`}
            onDoubleClick={() => setZoomed((z) => !z)}
            draggable={false}
            className={zoomed ? 'max-w-none w-[250%] cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in object-contain'}
          />
        )}
      </div>

      <div className="space-y-2 bg-surface-dark-elevated px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        <p className="text-body-sm">
          {entry.user.name} · {formatDateTime(entry.createdAt)}
        </p>
        {hasGps && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="tabular-nums text-caption text-on-dark-soft">
              {entry.latitude!.toFixed(5)}, {entry.longitude!.toFixed(5)} · ± {Math.round(entry.gpsAccuracyM ?? 0)} m
            </span>
            {entry.lowAccuracy && <Tag>Low accuracy</Tag>}
            <Button asChild variant="outline-dark" size="sm" className="ml-auto">
              <a href={openInMapsUrl(entry.latitude!, entry.longitude!)} target="_blank" rel="noreferrer">
                Open in Maps
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

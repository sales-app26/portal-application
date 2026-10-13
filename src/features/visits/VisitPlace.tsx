import { Button } from '@/components/ui/Button'
import { Tag } from '@/components/ui/Display'
import { Icon } from '@/icons'
import { cn } from '@/lib/cn'
import type { Entry } from '@/lib/types'
import { openStreetMapUrl } from './place'

type Proof = Pick<Entry, 'latitude' | 'longitude' | 'gpsAccuracyM' | 'lowAccuracy' | 'placeName'>

/**
 * Where a visit photo was taken: "Taken at <place>" (the position itself when no name is
 * known), how close the phone's location was, and an "Open map" link to OpenStreetMap.
 * Place names are OpenStreetMap data, so they carry its credit.
 */
export function VisitPlace({ entry, tone = 'light', mapButton = false, className }: { entry: Proof; tone?: 'light' | 'dark'; mapButton?: boolean; className?: string }) {
  if (entry.latitude === null || entry.longitude === null) return null
  const place = entry.placeName?.trim() || null
  const dark = tone === 'dark'
  const href = openStreetMapUrl(entry.latitude, entry.longitude)

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <p className={cn('flex items-start gap-1 text-caption', dark ? 'text-on-dark' : 'text-body')}>
        <Icon name="marker" size={16} className={cn('mt-px flex-none', dark ? 'text-on-dark-soft' : 'text-muted')} />
        <span className="min-w-0">
          Taken at <span className={cn('font-semibold', !place && 'tabular-nums')}>{place ?? `${entry.latitude.toFixed(5)}, ${entry.longitude.toFixed(5)}`}</span>
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {entry.gpsAccuracyM !== null && (
          <span className={cn('tabular-nums text-caption', dark ? 'text-on-dark-soft' : 'text-body')} aria-label={`Within about ${Math.round(entry.gpsAccuracyM)} metres`}>
            ± {Math.round(entry.gpsAccuracyM)} m
          </span>
        )}
        {entry.lowAccuracy && <Tag className="font-sans">Location is approximate</Tag>}
        {mapButton ? (
          <Button asChild variant={dark ? 'outline-dark' : 'secondary'} size="sm" className="ml-auto">
            <a href={href} target="_blank" rel="noreferrer" aria-label="Open map in a new tab">
              Open map
            </a>
          </Button>
        ) : (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label="Open map in a new tab"
            className={cn('inline-flex min-h-6 items-center gap-1 text-caption-strong underline-offset-2 active:underline expanded:hover:underline', dark ? 'text-on-dark' : 'text-primary')}
          >
            <Icon name="map" size={16} />
            Open map
          </a>
        )}
      </div>
      {place && <OsmCredit dark={dark} />}
    </div>
  )
}

/** The credit OpenStreetMap's licence asks for next to its data. */
export function OsmCredit({ dark, className }: { dark?: boolean; className?: string }) {
  return (
    <a
      href="https://www.openstreetmap.org/copyright"
      target="_blank"
      rel="noreferrer"
      className={cn('self-start text-[11px] leading-4', dark ? 'text-on-dark-soft' : 'text-muted', className)}
    >
      © OpenStreetMap
    </a>
  )
}

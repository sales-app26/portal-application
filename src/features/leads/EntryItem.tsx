import { Link } from 'react-router'
import { StatusChip } from '@/components/ui/Choice'
import { Button } from '@/components/ui/Button'
import { Tag } from '@/components/ui/Display'
import { Icon } from '@/icons'
import { formatDateTime, formatTime, REASON_LABEL, relativeDay } from '@/lib/format'
import type { Entry } from '@/lib/types'

/** One row in a lead's history (PRD §5.11). A visit's photo opens the entry: full photo and map pin. */
export function EntryItem({ entry, mine, onDelete }: { entry: Entry; mine: boolean; onDelete?: () => void }) {
  const isVisit = entry.hasPhoto
  return (
    <li className="group relative flex gap-3 pb-6 last:pb-0">
      <span aria-hidden className="absolute top-8 bottom-0 left-[15px] w-px bg-hairline group-last:hidden" />
      <span className="relative z-[1] flex size-8 flex-none items-center justify-center rounded-full bg-surface-strong">
        <Icon name={isVisit ? 'camera' : entry.entryType === 'status_change' ? 'synchronize' : 'checkmark'} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-title-sm">{isVisit ? 'Visit' : entry.entryType === 'status_change' ? 'Status change' : 'Follow-up'}</span>
          <time dateTime={entry.createdAt} className="text-caption text-muted">
            {formatDateTime(entry.createdAt)}
          </time>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusChip status={entry.status} />
          {entry.nextFollowUpDate && (
            <span className="inline-flex items-center gap-1 text-caption text-body">
              <Icon name="calendar" size={16} /> Next: {relativeDay(entry.nextFollowUpDate)}
            </span>
          )}
          {entry.reason && <Tag tone="down">{REASON_LABEL[entry.reason]}</Tag>}
          {entry.lowAccuracy && <Tag>Low accuracy</Tag>}
          {entry.entryType === 'status_change' && <Tag>Manual change</Tag>}
        </div>
        {entry.note && <p className="mt-2 text-body-md whitespace-pre-line text-ink">{entry.note}</p>}
        <p className="mt-1 flex flex-wrap gap-x-2 text-caption text-muted">
          {entry.location && (
            <span className="inline-flex items-center gap-1">
              <Icon name="marker" size={16} />
              {entry.location.name}
            </span>
          )}
          {isVisit && entry.gpsAccuracyM !== null && <span className="tabular-nums">± {Math.round(entry.gpsAccuracyM)} m</span>}
          {!mine && <span>by {entry.user.name}</span>}
          {entry.edited && <span>Edited {formatTime(entry.updatedAt)}</span>}
        </p>
        {onDelete && (
          <Button variant="tertiary" size="sm" icon="trash" className="mt-1 -ml-2 text-down" onClick={onDelete}>
            Delete entry
          </Button>
        )}
        {isVisit && entry.photoUrl && (
          <Link to={`/entries/${entry.id}`} className="pressable mt-3 inline-flex items-center gap-3 rounded-md active:opacity-80" aria-label="Open the visit photo and map">
            <img src={entry.photoUrl} alt={`Visit photo, ${formatDateTime(entry.createdAt)}`} loading="lazy" className="size-16 rounded-md bg-surface-strong object-cover" />
            <span className="inline-flex items-center gap-1 text-body-sm font-semibold text-primary">
              <Icon name="map" size={18} /> Photo and map
            </span>
          </Link>
        )}
      </div>
    </li>
  )
}

import { Link } from 'react-router'
import { FeedbackButton, FeedbackList } from '@/features/team/EntryFeedback'
import { VisitPlace } from '@/features/visits/VisitPlace'
import { Button } from '@/components/ui/Button'
import { StatusChip } from '@/components/ui/Choice'
import { Tag } from '@/components/ui/Display'
import { Icon } from '@/icons'
import { cn } from '@/lib/cn'
import { formatTime, REASON_LABEL, relativeDay } from '@/lib/format'
import type { TimelineEntry } from '@/lib/types'

interface Props {
  entry: TimelineEntry
  /** Pin number on the map, for entries with a GPS position. */
  number?: number
  selected?: boolean
  showProject: boolean
  onSelect?: () => void
  onOpenPhoto: () => void
  onOpenMap: () => void
  onEdit: () => void
  /** A manager looking at someone's day may leave feedback on an entry. */
  canFeedback?: boolean
}

/** One entry in a day (PRD §5.11): time, lead, status, note, typed location and visit proof. */
export function TimelineEntryCard({ entry, number, selected, showProject, onSelect, onOpenPhoto, onOpenMap, onEdit, canFeedback }: Props) {
  const isVisit = entry.hasPhoto
  const hasGps = entry.latitude !== null && entry.longitude !== null
  return (
    <li data-entry-id={entry.id} onMouseEnter={onSelect} className={cn('group relative flex gap-3 rounded-xl px-1 py-3 transition-colors', selected && 'bg-accent-soft')}>
      <span aria-hidden className="absolute top-12 bottom-0 left-[16px] w-px bg-hairline group-last:hidden" />
      <span className="relative z-[1] flex size-8 flex-none items-center justify-center rounded-full bg-surface-strong">
        {number ? <span className="tabular-nums text-caption-strong">{number}</span> : <Icon name={entry.entryType === 'status_change' ? 'synchronize' : 'checkmark'} size={16} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <time dateTime={entry.createdAt} className="tabular-nums text-caption-strong">
            {formatTime(entry.createdAt)}
          </time>
          {showProject && <span className="truncate text-caption text-muted">{entry.project.name}</span>}
          {entry.edited && <span className="text-caption text-muted">Edited {formatTime(entry.updatedAt)}</span>}
        </div>

        <Link to={`/leads/${entry.lead.id}`} className="mt-0.5 block min-w-0 truncate text-title-sm active:underline">
          {entry.lead.name}
          {entry.lead.businessName && <span className="font-normal text-body"> · {entry.lead.businessName}</span>}
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusChip status={entry.status} />
          {entry.entryType === 'status_change' && <Tag>Changed by hand</Tag>}
          {entry.reason && <Tag tone="down">{REASON_LABEL[entry.reason]}</Tag>}
          {entry.nextFollowUpDate && (
            <span className="inline-flex items-center gap-1 text-caption text-body">
              <Icon name="calendar" size={16} /> {relativeDay(entry.nextFollowUpDate)}
            </span>
          )}
        </div>

        {entry.note && <p className="mt-2 text-body-md whitespace-pre-line">{entry.note}</p>}

        {entry.location && (
          <p className="mt-1 flex items-center gap-1 text-caption text-muted">
            <Icon name="marker" size={16} /> {entry.location.name}
          </p>
        )}

        {isVisit && (
          <div className="mt-3 flex items-start gap-3">
            <button
              type="button"
              onClick={onOpenPhoto}
              aria-label="Open visit photo"
              className="pressable flex size-16 flex-none items-center justify-center overflow-hidden rounded-md bg-surface-strong"
            >
              {entry.photoUrl ? <img src={entry.photoUrl} alt="" loading="lazy" className="size-full object-cover" /> : <Icon name="image" className="text-muted" />}
            </button>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
              <VisitPlace entry={entry} />
              {hasGps && (
                <Button variant="secondary" size="sm" icon="marker" onClick={onOpenMap}>
                  Map
                </Button>
              )}
            </div>
          </div>
        )}

        {entry.coveringFor && <p className="mt-1 text-caption text-muted">Covering for {entry.coveringFor.name}</p>}
        <FeedbackList entry={entry} />
        {canFeedback && <FeedbackButton entry={entry} leadId={entry.lead.id} />}
        {entry.editable && (
          <Button variant="tertiary" size="sm" icon="edit" className="mt-1 -ml-2" onClick={onEdit}>
            Edit
          </Button>
        )}
      </div>
    </li>
  )
}

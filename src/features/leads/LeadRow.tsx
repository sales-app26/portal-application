import { NavLink } from 'react-router'
import { StatusChip } from '@/components/ui/Choice'
import { Avatar, Tag } from '@/components/ui/Display'
import { Icon } from '@/icons'
import { cn } from '@/lib/cn'
import { plural, relativeDay } from '@/lib/format'
import type { LeadSummary } from '@/lib/types'

/** 72px lead row (UX-COMPONENTS.md §4.6). Active state highlights it in the split view. */
export function LeadRow({ lead, showOwner, selected, onToggle }: { lead: LeadSummary; showOwner?: boolean; selected?: boolean; onToggle?: () => void }) {
  const secondary = [lead.businessName, lead.location.name, showOwner ? lead.owner.name : null].filter(Boolean).join(' · ')
  const right = (
    <span className="flex flex-none flex-col items-end gap-1">
      <StatusChip status={lead.status} />
      {lead.ownerTag ? (
        <Tag>{lead.ownerTag === 'owner_inactive' ? 'Owner inactive' : 'Owner removed'}</Tag>
      ) : lead.overdueDays ? (
        <Tag tone="down">Overdue {plural(lead.overdueDays, 'day')}</Tag>
      ) : lead.nextFollowUpDate ? (
        <span className="text-caption text-muted">{relativeDay(lead.nextFollowUpDate)}</span>
      ) : lead.hasPendingTransfer ? (
        <span className="text-caption text-muted">Transfer pending</span>
      ) : null}
    </span>
  )
  // Selection mode (bulk reassign): the whole row toggles instead of navigating.
  if (onToggle)
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={!!selected}
        onClick={onToggle}
        className={cn('flex min-h-[72px] w-full items-center gap-3 border-b border-hairline-soft px-4 py-3 text-left', selected ? 'bg-surface-strong' : 'active:bg-surface-soft')}
      >
        <span className={cn('flex size-6 flex-none items-center justify-center rounded-full border-2', selected ? 'border-primary bg-primary text-on-primary' : 'border-hairline')}>
          {selected && <Icon name="checkmark" size={16} />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-title-sm">{lead.name}</span>
          <span className="truncate text-body-sm text-body">{secondary}</span>
        </span>
        {right}
      </button>
    )
  return (
    <NavLink
      to={`/leads/${lead.id}`}
      className={({ isActive }) =>
        cn(
          'flex min-h-[72px] items-center gap-3 border-b border-hairline-soft px-4 py-3 active:bg-surface-soft expanded:hover:bg-surface-soft',
          isActive && 'expanded:bg-surface-strong expanded:hover:bg-surface-strong',
        )
      }
    >
      <Avatar name={lead.name} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-title-sm">{lead.name}</span>
        <span className="truncate text-body-sm text-body">{secondary}</span>
      </span>
      {right}
    </NavLink>
  )
}

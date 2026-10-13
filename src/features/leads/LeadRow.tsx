import { NavLink } from 'react-router'
import { StatusChip } from '@/components/ui/Choice'
import { Avatar, Tag } from '@/components/ui/Display'
import { Icon } from '@/icons'
import { cn } from '@/lib/cn'
import { dealOf } from '@/lib/deal'
import { plural, relativeDay } from '@/lib/format'
import type { LeadSummary } from '@/lib/types'
import { ContactButtons } from './ContactActions'

/** "Overdue 2 days", "Next: Tomorrow", "Owner inactive"… the one thing to know about when. */
export function LeadWhen({ lead }: { lead: LeadSummary }) {
  if (lead.ownerTag) return <Tag>{lead.ownerTag === 'owner_inactive' ? 'Owner left the team' : 'Owner removed'}</Tag>
  if (lead.overdueDays) return <Tag tone="down">Overdue {plural(lead.overdueDays, 'day')}</Tag>
  if (lead.nextFollowUpDate) return <span className="text-caption whitespace-nowrap text-body">Next: {relativeDay(lead.nextFollowUpDate)}</span>
  if (lead.hasPendingTransfer) return <span className="text-caption whitespace-nowrap text-muted">Handover pending</span>
  return null
}

/** "Growth · ₹2,249/mo · 6 months · Diwali offer": plan, price after discount, tenure and offer. */
function DealValue({ lead }: { lead: LeadSummary }) {
  const deal = dealOf(lead)
  if (!deal.hasDeal || (!deal.plan && !lead.dealValue)) return null
  return (
    <span className="min-w-0 truncate text-caption-strong text-ink tabular-nums">{[deal.plan, deal.price, deal.tenure, deal.offer].filter(Boolean).join(' · ')}</span>
  )
}

const secondaryLine = (lead: LeadSummary, showOwner?: boolean) => [lead.businessName, lead.location.name, showOwner ? lead.owner.name : null].filter(Boolean).join(' · ')

/**
 * Lead row (UX-COMPONENTS.md §4.6).
 *  - `contact`: the rep's own lists. Call and WhatsApp sit on the row, so the commonest
 *    job (reach the client) is one tap from Home or My leads.
 *  - otherwise: admin lists, with an avatar and the owner.
 */
export function LeadRow({
  lead,
  showOwner,
  selected,
  onToggle,
  contact,
}: {
  lead: LeadSummary
  showOwner?: boolean
  selected?: boolean
  onToggle?: () => void
  contact?: boolean
}) {
  const secondary = secondaryLine(lead, showOwner)

  // Selection mode (bulk reassign): the whole row toggles instead of navigating.
  if (onToggle)
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={!!selected}
        onClick={onToggle}
        className={cn(
          'flex min-h-[72px] w-full items-center gap-3 border-b border-separator px-4 py-3 text-left transition-colors',
          selected ? 'bg-accent-soft' : 'active:bg-surface-secondary',
        )}
      >
        <span className={cn('flex size-6 flex-none items-center justify-center rounded-full border-2', selected ? 'border-primary bg-primary text-on-primary' : 'border-hairline')}>
          {selected && <Icon name="checkmark" size={16} />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-title-sm">{lead.name}</span>
          <span className="truncate text-body-sm text-body">{secondary}</span>
        </span>
        <span className="flex flex-none flex-col items-end gap-1">
          <StatusChip status={lead.status} />
          <LeadWhen lead={lead} />
        </span>
      </button>
    )

  if (contact)
    return (
      <div className="flex items-center border-b border-separator transition-colors last:border-b-0 hover:bg-surface-secondary has-[a[aria-current=page]]:expanded:bg-accent-soft">
        <NavLink to={`/leads/${lead.id}`} className="flex min-h-[84px] min-w-0 flex-1 items-center gap-3 py-3 pr-2 pl-4">
          <Avatar name={lead.name} className="hidden medium:flex" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-title-sm">{lead.name}</span>
            {secondary && <span className="truncate text-body-sm text-body">{secondary}</span>}
            <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <StatusChip status={lead.status} size="sm" />
              <DealValue lead={lead} />
              <LeadWhen lead={lead} />
            </span>
          </span>
        </NavLink>
        <ContactButtons lead={lead} className="pr-4" />
      </div>
    )

  return (
    <NavLink
      to={`/leads/${lead.id}`}
      className={({ isActive }) =>
        cn(
          'flex min-h-[72px] items-center gap-3 border-b border-separator px-4 py-3 transition-colors last:border-b-0 active:bg-surface-secondary expanded:hover:bg-surface-secondary',
          isActive && 'expanded:bg-accent-soft expanded:hover:bg-accent-soft',
        )
      }
    >
      <Avatar name={lead.name} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-title-sm">{lead.name}</span>
        <span className="truncate text-body-sm text-body">{secondary}</span>
        <DealValue lead={lead} />
      </span>
      <span className="flex flex-none flex-col items-end gap-1">
        <StatusChip status={lead.status} />
        <LeadWhen lead={lead} />
      </span>
    </NavLink>
  )
}

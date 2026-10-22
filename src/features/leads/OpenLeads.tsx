import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/Display'
import { LoadMore } from '@/components/ui/LoadMore'
import { Confirm } from '@/components/ui/Overlay'
import { settleOverlays } from '@/hooks/useOverlayHistory'
import { Icon } from '@/icons'
import { ApiError, apiWithMessage } from '@/lib/api'
import { ago, leadTitle, SOURCE_LABEL } from '@/lib/format'
import type { OpenLead, Project } from '@/lib/types'
import { invalidateLeadData, useOpenLeads } from './queries'

/**
 * Open leads: a campaign's unassigned leads, which a rep can take for themselves. Each card
 * shows what's needed to decide (business, person, area, notes, whether there's a number);
 * the number itself shows once the lead is theirs.
 */
export function OpenLeadsList({ project, search }: { project: Pick<Project, 'id' | 'status'>; search: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const list = useOpenLeads(project.id, search)
  const [taking, setTaking] = useState<OpenLead | null>(null)
  const [busy, setBusy] = useState(false)
  const leads = list.data?.pages.flatMap((p) => p.items) ?? []
  const total = list.data?.pages[0]?.meta.total
  const closed = project.status === 'closed'

  const take = async () => {
    if (!taking) return
    setBusy(true)
    try {
      const { message } = await apiWithMessage<{ leadId: string }>(`/leads/${taking.id}/claim`, { method: 'POST' })
      toast.success(message)
      invalidateLeadData(qc)
      setTaking(null)
      await settleOverlays()
      void navigate(`/leads/${taking.id}`)
    } catch (err) {
      // Most likely a teammate took it first: say who, and drop it from the list.
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t take this lead. Try again.')
      setTaking(null)
      invalidateLeadData(qc)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="mb-1 flex min-h-9 items-center text-caption text-muted" aria-live="polite">
        {total === undefined ? '' : total === 1 ? '1 lead waiting for someone' : `${total} leads waiting for someone`}
      </p>
      {list.isLoading ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : leads.length === 0 ? (
        search ? (
          <EmptyState icon="search" title="No open leads match" body="Try another business, name or area." />
        ) : (
          <EmptyState icon="contacts" title="No open leads" body="When your manager uploads leads without assigning them, they wait here for anyone on the team to take." />
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {leads.map((l) => (
            <OpenLeadCard key={l.id} lead={l} disabled={closed} onTake={() => setTaking(l)} />
          ))}
          <LoadMore hasNext={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
        </ul>
      )}
      <Confirm
        open={!!taking}
        onOpenChange={(o) => !o && !busy && setTaking(null)}
        title={taking ? `Take ${leadTitle(taking)}?` : 'Take this lead?'}
        body="It becomes yours and moves to My leads, with its phone number. You can hand it over to a teammate later, but it can't go back to Open leads."
        confirmLabel="Take lead"
        onConfirm={take}
        loading={busy}
      />
    </>
  )
}

function OpenLeadCard({ lead, disabled, onTake }: { lead: OpenLead; disabled: boolean; onTake: () => void }) {
  const title = leadTitle(lead)
  // The person, when the business is the title.
  const person = lead.businessName && lead.name ? lead.name : null
  return (
    <li className="card card--default flex flex-col gap-2 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="truncate text-title-sm">{title}</h3>
          {person && <p className="truncate text-body-sm text-body">{person}</p>}
        </div>
        <Button size="sm" disabled={disabled} onClick={onTake} aria-label={`Take ${title}`}>
          Take lead
        </Button>
      </div>
      <p className="flex items-center gap-1.5 text-body-sm text-ink">
        <Icon name="marker" size={16} className="flex-none text-muted" />
        <span className="truncate">{lead.location.name}</span>
      </p>
      {lead.notes && <p className="line-clamp-2 text-body-sm text-body">{lead.notes}</p>}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
        <span className="flex items-center gap-1">
          <Icon name="phone" size={14} />
          {lead.hasPhone ? 'Has a number' : 'No number yet'}
        </span>
        <span aria-hidden>·</span>
        <span>
          Added {ago(lead.createdAt)}
          {lead.addedBy && ` by ${lead.addedBy.name}`}
        </span>
        {lead.source && lead.source !== 'import' && (
          <>
            <span aria-hidden>·</span>
            <span>{SOURCE_LABEL[lead.source]}</span>
          </>
        )}
      </p>
    </li>
  )
}

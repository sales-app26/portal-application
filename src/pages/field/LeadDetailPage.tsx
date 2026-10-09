import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { useMe } from '@/auth/AuthProvider'
import { Page } from '@/components/layout/Page'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Button } from '@/components/ui/Button'
import { settleOverlays } from '@/hooks/useOverlayHistory'
import { StatusChip } from '@/components/ui/Choice'
import { Avatar, EmptyState, ErrorState, SectionTitle, Skeleton, Tag } from '@/components/ui/Display'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { Confirm } from '@/components/ui/Overlay'
import { ReassignForm } from '@/features/admin/MemberForms'
import { useProjectMembers } from '@/features/admin/queries'
import { LoadMore } from '@/components/ui/LoadMore'
import { EntryItem } from '@/features/leads/EntryItem'
import { ChangeStatusForm, EditLeadForm, LogFollowUpForm, RequestTransferForm } from '@/features/leads/LeadForms'
import { invalidateLeadData, leadKeys, useLead, useLeadEntries } from '@/features/leads/queries'
import { invalidateTimelines } from '@/features/timeline/queries'
import { useIsSheetLayout } from '@/hooks/useWindowClass'
import { Icon } from '@/icons'
import { ApiError, apiWithMessage } from '@/lib/api'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import { formatDateTime, formatPhone, plural, relativeDay } from '@/lib/format'
import type { LeadDetail } from '@/lib/types'

type FormName = 'follow-up' | 'status' | 'edit' | 'transfer' | 'reassign' | 'delete' | null

/** Lead detail. A pushed page on phones; the right pane of My leads on laptops. */
export function LeadDetailPage({ embedded = false }: { embedded?: boolean }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [deleting, setDeleting] = useState(false)
  const lead = useLead(id)
  const [form, setForm] = useState<FormName>(null)
  const sheet = useIsSheetLayout()

  const notFound = lead.error instanceof ApiError && lead.error.code === 'NOT_FOUND'
  const d = lead.data
  const p = d?.permissions
  const actions = d && p && (
    <ActionMenu
      title={d.name}
      items={[
        { label: 'Change status', icon: 'synchronize', onSelect: () => setForm('status'), hidden: !p.canChangeStatus },
        { label: 'Edit lead', icon: 'edit', onSelect: () => setForm('edit'), hidden: !p.canEdit },
        { label: 'Request transfer', icon: 'swap', onSelect: () => setForm('transfer'), hidden: !p.canRequestTransfer },
        { label: 'Reassign', icon: 'swap', onSelect: () => setForm('reassign'), hidden: !p.canReassign },
        { label: 'Delete lead', icon: 'trash', onSelect: () => setForm('delete'), hidden: !p.canDelete },
      ]}
    />
  )
  const cta = p?.canLogFollowUp ? { label: 'Log follow-up', icon: 'plus-math' as const, onClick: () => setForm('follow-up') } : undefined

  const body = lead.isLoading ? (
    <DetailSkeleton />
  ) : notFound ? (
    <EmptyState icon="search" title="Lead not found" body="It may have been transferred to someone else or removed." />
  ) : lead.isError ? (
    <ErrorState message={lead.error.message} onRetry={() => void lead.refetch()} />
  ) : d ? (
    <LeadBody lead={d} />
  ) : null

  const forms = d && (
    <>
      <LogFollowUpForm open={form === 'follow-up'} onOpenChange={(o) => setForm(o ? 'follow-up' : null)} lead={d} />
      <ChangeStatusForm open={form === 'status'} onOpenChange={(o) => setForm(o ? 'status' : null)} lead={d} />
      <EditLeadForm open={form === 'edit'} onOpenChange={(o) => setForm(o ? 'edit' : null)} lead={d} />
      <RequestTransferForm open={form === 'transfer'} onOpenChange={(o) => setForm(o ? 'transfer' : null)} lead={d} />
      {p?.canReassign && <ReassignLead lead={d} open={form === 'reassign'} onOpenChange={(o) => setForm(o ? 'reassign' : null)} />}
      <Confirm
        open={form === 'delete'}
        onOpenChange={(o) => setForm(o ? 'delete' : null)}
        title={`Delete ${d.name}?`}
        body="The lead disappears everywhere, its phone number can be added again, and a conversion no longer counts toward the target. This can't be undone from the app."
        confirmLabel="Delete lead"
        loading={deleting}
        onConfirm={async () => {
          setDeleting(true)
          try {
            const { message } = await apiWithMessage(`/leads/${d.id}`, { method: 'DELETE' })
            haptic.success()
            toast.success(message)
            qc.removeQueries({ queryKey: leadKeys.detail(d.id) })
            invalidateLeadData(qc)
            void qc.invalidateQueries({ queryKey: ['transfers'] })
            setForm(null)
            await settleOverlays()
            navigate('/dashboard', { replace: true })
          } catch (err) {
            handleFormError(err)
          } finally {
            setDeleting(false)
          }
        }}
      />
    </>
  )

  if (embedded && !sheet) {
    return (
      <div className="px-8 pt-6 pb-10">
        <div className="mb-6 flex items-center justify-end gap-2">
          {cta && (
            <Button icon={cta.icon} onClick={cta.onClick}>
              {cta.label}
            </Button>
          )}
          {actions}
        </div>
        {body}
        {forms}
      </div>
    )
  }

  return (
    <Page title={d?.name ?? 'Lead'} back="/leads" actions={actions} cta={cta}>
      {body}
      {forms}
    </Page>
  )
}

function LeadBody({ lead }: { lead: LeadDetail }) {
  const me = useMe()
  const qc = useQueryClient()
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null)
  const [deletingEntry, setDeletingEntry] = useState(false)
  const mine = lead.owner.id === me.id
  const [showOlder, setShowOlder] = useState(false)
  const older = useLeadEntries(lead.id, showOlder)
  // The embedded 20 are the newest; paged history starts again from the top, so skip what we already show.
  const shownIds = new Set(lead.recentEntries.map((e) => e.id))
  const olderEntries = (older.data?.pages.flatMap((pg) => pg.items) ?? []).filter((e) => !shownIds.has(e.id))
  const hasMore = lead.entryCount > lead.recentEntries.length

  return (
    <div className="flex flex-col gap-6 expanded:max-w-[720px]">
      <header className="flex items-start gap-4">
        <Avatar name={lead.name} size={56} />
        <div className="min-w-0 flex-1">
          <h2 className="text-title-md break-words">{lead.name}</h2>
          {lead.businessName && <p className="text-body-md text-body">{lead.businessName}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusChip status={lead.status} />
            {lead.overdueDays ? <Tag tone="down">Overdue {plural(lead.overdueDays, 'day')}</Tag> : null}
            {lead.ownerTag && <Tag>{lead.ownerTag === 'owner_inactive' ? 'Owner inactive' : 'Owner removed'}</Tag>}
            {lead.project.status === 'closed' && <Tag>Closed project</Tag>}
          </div>
        </div>
      </header>

      <Button asChild variant="secondary" block className="medium:w-auto medium:self-start">
        <a href={`tel:+91${lead.phone}`}>
          <Icon name="phone" size={20} />
          Call {formatPhone(lead.phone)}
        </a>
      </Button>

      {lead.pendingTransfer && (
        <Notice icon="swap" title={`Transfer to ${lead.pendingTransfer.toUser.name} is waiting for approval`}>
          {lead.pendingTransfer.reason}
        </Notice>
      )}
      {!lead.pendingTransfer && lead.lastDecidedTransfer?.status === 'rejected' && (
        <Notice icon="cancel" title={`Transfer to ${lead.lastDecidedTransfer.toUser.name} was rejected`}>
          {lead.lastDecidedTransfer.decidedBy ? `By ${lead.lastDecidedTransfer.decidedBy.name}` : 'Rejected automatically'}
          {lead.lastDecidedTransfer.decisionNote ? `: ${lead.lastDecidedTransfer.decisionNote}` : '.'}
        </Notice>
      )}

      <ListGroup>
        <ListRow icon="phone" title={<span className="font-mono">{formatPhone(lead.phone)}</span>} subtitle="Phone" />
        <ListRow icon="marker" title={lead.location.name} subtitle="Location" />
        {lead.nextFollowUpDate && <ListRow icon="calendar" title={relativeDay(lead.nextFollowUpDate)} subtitle="Next follow-up" />}
        {!mine && <ListRow icon="user-male-circle" title={lead.owner.name} subtitle="Owner" />}
        {lead.convertedAt && <ListRow icon="ok" title={formatDateTime(lead.convertedAt)} subtitle={lead.convertedBy ? `Converted by ${lead.convertedBy.name}` : 'Converted'} />}
        <ListRow icon="briefcase" title={lead.project.name} subtitle={lead.project.type === 'door_to_door' ? 'Door-to-door project' : 'Online project'} />
      </ListGroup>

      {lead.notes && (
        <section>
          <SectionTitle>About the client</SectionTitle>
          <p className="text-body-md whitespace-pre-line text-body">{lead.notes}</p>
        </section>
      )}

      <section aria-labelledby="history-title">
        <SectionTitle>
          <span id="history-title">History · {lead.entryCount}</span>
        </SectionTitle>
        <ol>
          {[...lead.recentEntries, ...olderEntries].map((e) => (
            <EntryItem key={e.id} entry={e} mine={e.user.id === me.id} onDelete={lead.permissions.canDelete ? () => setEntryToDelete(e.id) : undefined} />
          ))}
        </ol>
        {hasMore && !showOlder && (
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => setShowOlder(true)}>
            Show older entries
          </Button>
        )}
        {showOlder && <LoadMore hasNext={!!older.hasNextPage} loading={older.isFetching} onLoad={() => void older.fetchNextPage()} />}
      </section>
      <Confirm
        open={!!entryToDelete}
        onOpenChange={(o) => !o && setEntryToDelete(null)}
        title="Delete this entry?"
        body="It's hidden from timelines and counts. If it was the lead's latest entry, the lead's status and next date fall back to the entry before it. A correct entry has to be logged again."
        confirmLabel="Delete entry"
        loading={deletingEntry}
        onConfirm={async () => {
          if (!entryToDelete) return
          setDeletingEntry(true)
          try {
            const { message } = await apiWithMessage(`/entries/${entryToDelete}`, { method: 'DELETE' })
            toast.success(message)
            invalidateLeadData(qc, lead.id)
            invalidateTimelines(qc, entryToDelete)
            void qc.invalidateQueries({ queryKey: leadKeys.entries(lead.id) })
            setEntryToDelete(null)
          } catch (err) {
            handleFormError(err)
            setEntryToDelete(null)
          } finally {
            setDeletingEntry(false)
          }
        }}
      />
    </div>
  )
}

function Notice({ icon, title, children }: { icon: 'swap' | 'cancel'; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg bg-surface-strong p-4">
      <Icon name={icon} className="flex-none" />
      <div className="min-w-0">
        <p className="text-title-sm">{title}</p>
        <p className="text-body-sm text-body">{children}</p>
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-11 rounded-pill" />
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
    </div>
  )
}

/** Admin moves one lead to another active member (PRD §5.10). */
function ReassignLead({ lead, open, onOpenChange }: { lead: LeadDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const members = useProjectMembers(lead.projectId)
  return <ReassignForm projectId={lead.projectId} leadIds={[lead.id]} members={members.data ?? []} excludeUserId={lead.owner.id} open={open} onOpenChange={onOpenChange} onDone={() => {}} />
}

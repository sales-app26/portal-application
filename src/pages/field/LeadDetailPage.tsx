import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useMe } from '@/auth/AuthProvider'
import { Page } from '@/components/layout/Page'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Button } from '@/components/ui/Button'
import { settleOverlays } from '@/hooks/useOverlayHistory'
import { StatusChip } from '@/components/ui/Choice'
import { Avatar, Card, EmptyState, ErrorState, SectionTitle, Skeleton, Tag } from '@/components/ui/Display'
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
import { ago, formatDateTime, formatPhone, plural, relativeDay, rupees, SOURCE_LABEL, STATUS_LABEL } from '@/lib/format'
import { cn } from '@/lib/cn'
import { dealOf } from '@/lib/deal'
import { ChatIcon } from '@/features/leads/ContactActions'
import { LeadComments, PinnedNote } from '@/features/team/LeadComments'
import { telHref } from '@/lib/contact'
import { rememberContact } from '@/lib/contactPrompt'
import { WhatsAppSheet } from '@/features/leads/WhatsAppSheet'
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
  const [params, setParams] = useSearchParams()

  // "Log it" from the after-call prompt lands here with ?log=1: open the form once the lead is in.
  const wantsLog = params.get('log') === '1'
  const canLog = !!lead.data?.permissions.canLogFollowUp
  useEffect(() => {
    if (!wantsLog || !lead.data) return
    setParams((p) => (p.delete('log'), p), { replace: true })
    if (canLog) setForm('follow-up')
  }, [wantsLog, lead.data, canLog, setParams])

  const notFound = lead.error instanceof ApiError && lead.error.code === 'NOT_FOUND'
  const d = lead.data
  const p = d?.permissions
  const actions = d && p && (
    <ActionMenu
      title={d.name}
      items={[
        { label: 'Change status', icon: 'synchronize', onSelect: () => setForm('status'), hidden: !p.canChangeStatus },
        { label: 'Edit lead', icon: 'edit', onSelect: () => setForm('edit'), hidden: !p.canEdit },
        { label: 'Ask for handover', icon: 'swap', onSelect: () => setForm('transfer'), hidden: !p.canRequestTransfer },
        { label: 'Assign to…', icon: 'swap', onSelect: () => setForm('reassign'), hidden: !p.canReassign },
        { label: 'Delete lead', icon: 'trash', onSelect: () => setForm('delete'), hidden: !p.canDelete },
      ]}
    />
  )
  const cta = p?.canLogFollowUp ? { label: 'Log follow-up', icon: 'plus-math' as const, onClick: () => setForm('follow-up') } : undefined

  const body = lead.isLoading ? (
    <DetailSkeleton />
  ) : notFound ? (
    <EmptyState icon="search" title="Lead not found" body="It may have been handed over to someone else or deleted." />
  ) : lead.isError ? (
    <ErrorState message={lead.error.message} onRetry={() => void lead.refetch()} />
  ) : d ? (
    <LeadBody lead={d} onOpenForm={setForm} />
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
        body="The lead disappears everywhere, its phone number can be added again, and a win no longer counts toward the target. This can't be undone from the app."
        confirmLabel="Delete lead"
        loading={deleting}
        danger
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
    <Page title={d?.name ?? 'Lead'} back="/leads" actions={actions} cta={cta} heroTitle>
      {body}
      {forms}
    </Page>
  )
}

function LeadBody({ lead, onOpenForm }: { lead: LeadDetail; onOpenForm: (f: FormName) => void }) {
  const me = useMe()
  const qc = useQueryClient()
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null)
  const [deletingEntry, setDeletingEntry] = useState(false)
  const mine = lead.owner.id === me.id
  const deal = dealOf(lead)
  const [showOlder, setShowOlder] = useState(false)
  const [chat, setChat] = useState(false)
  const older = useLeadEntries(lead.id, showOlder)
  // The embedded 20 are the newest; paged history starts again from the top, so skip what we already show.
  const shownIds = new Set(lead.recentEntries.map((e) => e.id))
  const olderEntries = (older.data?.pages.flatMap((pg) => pg.items) ?? []).filter((e) => !shownIds.has(e.id))
  const hasMore = lead.entryCount > lead.recentEntries.length
  const lastEntry = lead.recentEntries[0]
  // Where the rep last stood with this client: the newest visit with a GPS fix.
  const lastGps = lead.recentEntries.find((e) => e.latitude !== null && e.longitude !== null)

  return (
    <div className="flex flex-col gap-6 expanded:max-w-[720px]">
      <header className="flex items-start gap-4">
        <Avatar name={lead.name} size={56} />
        <div className="min-w-0 flex-1">
          <h2 className="text-title-md break-words">{lead.name}</h2>
          {lead.businessName && <p className="text-body-md text-body">{lead.businessName}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {lead.permissions.canChangeStatus ? (
              <button
                type="button"
                onClick={() => onOpenForm('status')}
                aria-label={`Status: ${STATUS_LABEL[lead.status]}. Change status`}
                className="pressable inline-flex items-center rounded-pill"
              >
                <StatusChip status={lead.status} className="h-8 pr-2.5" trailing={<Icon name="expand-arrow" size={14} className="text-body" />} />
              </button>
            ) : (
              <StatusChip status={lead.status} />
            )}
            {lead.overdueDays ? <Tag tone="down">Overdue {plural(lead.overdueDays, 'day')}</Tag> : null}
            {lead.ownerTag && <Tag>{lead.ownerTag === 'owner_inactive' ? 'Owner left the team' : 'Owner removed'}</Tag>}
            {lead.project.status === 'closed' && <Tag>Closed campaign</Tag>}
          </div>
          {lastEntry && (
            <p className="mt-2 text-caption text-muted">
              Last activity {ago(lastEntry.createdAt)} · {plural(lead.entryCount, 'entry', 'entries')}
            </p>
          )}
        </div>
      </header>

      <div className="flex gap-3">
        <QuickAction
          href={telHref(lead.phone)}
          onClick={() => lead.permissions.canLogFollowUp && rememberContact({ leadId: lead.id, name: lead.name, kind: 'call' })}
          icon={<Icon name="phone" />}
          label="Call"
          sub={formatPhone(lead.phone)}
          tone="primary"
        />
        <QuickAction onClick={() => setChat(true)} icon={<ChatIcon size={24} />} label="WhatsApp" sub="Ready messages" tone="whatsapp" />
        <WhatsAppSheet open={chat} onOpenChange={setChat} lead={lead} prompt={lead.permissions.canLogFollowUp} />
        {lastGps && (
          <QuickAction
            href={`https://www.google.com/maps/dir/?api=1&destination=${lastGps.latitude},${lastGps.longitude}`}
            external
            icon={<Icon name="near-me" />}
            label="Directions"
            sub="Last visit"
          />
        )}
      </div>

      {lead.coveringFor && (
        <div className="flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-accent-soft-foreground">
          <Icon name="leave" size={20} className="flex-none" />
          <p className="text-body-sm">
            <strong>{lead.coveringFor.name}</strong> is on leave, and you're covering. What you log is credited to them, with your name on it.
          </p>
        </div>
      )}
      <PinnedNote lead={lead} />

      {lead.pendingTransfer && (
        <Notice icon="swap" title={`Handover to ${lead.pendingTransfer.toUser.name} is waiting for approval`}>
          {lead.pendingTransfer.reason}
        </Notice>
      )}
      {!lead.pendingTransfer && lead.lastDecidedTransfer?.status === 'rejected' && (
        <Notice icon="cancel" title={`Handover to ${lead.lastDecidedTransfer.toUser.name} was rejected`}>
          {lead.lastDecidedTransfer.decidedBy ? `By ${lead.lastDecidedTransfer.decidedBy.name}` : 'Rejected automatically'}
          {lead.lastDecidedTransfer.decisionNote ? `: ${lead.lastDecidedTransfer.decisionNote}` : '.'}
        </Notice>
      )}

      <ListGroup>
        {deal.hasDeal && (
          <ListRow
            icon="goal"
            title={[deal.plan, deal.price, deal.tenure ? `for ${deal.tenure}` : null].filter(Boolean).join(' · ')}
            subtitle={[lead.status === 'converted' ? 'Deal won' : 'Expected deal', deal.offer, lead.dealTotal !== null && lead.planCode !== 'free' && (lead.dealTenureMonths ?? 1) > 1 ? `${rupees(lead.dealTotal)} in all` : null]
              .filter(Boolean)
              .join(' · ')}
          />
        )}
        <ListRow icon="marker" title={lead.location.name} subtitle="Location" />
        {lead.nextFollowUpDate && (
          <ListRow
            icon="calendar"
            title={relativeDay(lead.nextFollowUpDate)}
            subtitle="Next follow-up"
            onClick={lead.permissions.canLogFollowUp ? () => onOpenForm('follow-up') : undefined}
            chevron={lead.permissions.canLogFollowUp}
          />
        )}
        {!mine && <ListRow icon="user-male-circle" title={lead.owner.name} subtitle="Owner" />}
        {lead.convertedAt && <ListRow icon="ok" title={formatDateTime(lead.convertedAt)} subtitle={lead.convertedBy ? `Won by ${lead.convertedBy.name}` : 'Won'} />}
        <ListRow
          icon="briefcase"
          title={lead.project.name}
          subtitle={[lead.project.type === 'door_to_door' ? 'Door-to-door campaign' : 'Online campaign', lead.source ? `Source: ${SOURCE_LABEL[lead.source]}` : null]
            .filter(Boolean)
            .join(' · ')}
        />
      </ListGroup>

      {lead.notes && (
        <Card>
          <SectionTitle>About the client</SectionTitle>
          <p className="text-body-md whitespace-pre-line text-body">{lead.notes}</p>
        </Card>
      )}

      <LeadComments lead={lead} />

      <section aria-labelledby="history-title" className="card card--default gap-0 rounded-2xl p-5 expanded:p-6">
        <SectionTitle>
          <span id="history-title">History · {lead.entryCount}</span>
        </SectionTitle>
        <ol>
          {[...lead.recentEntries, ...olderEntries].map((e) => (
            <EntryItem
              key={e.id}
              entry={e}
              mine={e.user.id === me.id}
              canFeedback={lead.permissions.canReassign}
              onDelete={lead.permissions.canDelete ? () => setEntryToDelete(e.id) : undefined}
            />
          ))}
        </ol>
        {hasMore && !showOlder && (
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => setShowOlder(true)}>
            Show older activity
          </Button>
        )}
        {showOlder && <LoadMore hasNext={!!older.hasNextPage} loading={older.isFetching} onLoad={() => void older.fetchNextPage()} />}
      </section>
      <Confirm
        open={!!entryToDelete}
        onOpenChange={(o) => !o && setEntryToDelete(null)}
        title="Delete this follow-up?"
        body="It's hidden from activity and counts. If it was the lead's latest follow-up, the lead's status and next date go back to the one before it. A correct follow-up has to be logged again."
        confirmLabel="Delete follow-up"
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

/** A big round action with a label under it, like a phone's contact card. */
function QuickAction({
  href,
  onClick,
  icon,
  label,
  sub,
  tone,
  external,
}: {
  href?: string
  onClick?: () => void
  icon: React.ReactNode
  label: string
  sub?: string
  tone?: 'primary' | 'whatsapp'
  external?: boolean
}) {
  const Comp = href ? 'a' : 'button'
  return (
    <Comp
      {...(href ? { href } : { type: 'button' as const })}
      onClick={onClick}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="card card--default pressable min-w-0 flex-1 items-center gap-1.5 rounded-2xl px-2 py-3.5 text-center transition-shadow hover:shadow-lift active:bg-surface-secondary expanded:max-w-44"
    >
      <span
        className={cn(
          'flex size-11 items-center justify-center rounded-full',
          tone === 'primary' ? 'bg-primary text-on-primary' : tone === 'whatsapp' ? 'bg-[#25d366] text-white' : 'bg-surface-strong text-ink',
        )}
      >
        {icon}
      </span>
      <span className="text-body-sm font-semibold text-ink">{label}</span>
      {sub && <span className="-mt-1.5 w-full truncate text-caption text-muted tabular-nums">{sub}</span>}
    </Comp>
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
  return (
    <ReassignForm
      projectId={lead.projectId}
      leadIds={[lead.id]}
      members={members.data ?? []}
      excludeUserId={lead.owner.id}
      open={open}
      onOpenChange={onOpenChange}
      onDone={() => {}}
    />
  )
}

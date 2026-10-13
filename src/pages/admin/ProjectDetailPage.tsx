import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useMe } from '@/auth/AuthProvider'
import { Page } from '@/components/layout/Page'
import { BackupPicker } from '@/features/team/BackupPicker'
import { TemplatesManager } from '@/features/team/TemplatesManager'
import { LeaveForm } from '@/features/team/LeaveForm'
import { cn } from '@/lib/cn'
import { SearchInput } from '@/components/ui/SearchInput'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Button } from '@/components/ui/Button'
import { FilterChips, Segmented } from '@/components/ui/Choice'
import { Avatar, EmptyState, ErrorState, ListSkeleton, Skeleton, Tag } from '@/components/ui/Display'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { LoadMore } from '@/components/ui/LoadMore'
import { Confirm } from '@/components/ui/Overlay'
import { AddMemberForm, ReassignForm, SetTargetForm } from '@/features/admin/MemberForms'
import { ProjectForm } from '@/features/admin/ProjectForm'
import { invalidateProjects, projectMembersKey, useProjectDetail, useProjectMembers } from '@/features/admin/queries'
import { LeadRow } from '@/features/leads/LeadRow'
import { invalidateLeadData, useLeadList } from '@/features/leads/queries'
import { useDebounced } from '@/hooks/useDebounced'
import { Icon } from '@/icons'
import { ApiError, apiWithMessage } from '@/lib/api'
import { formatDate, ROLE_LABEL, STATUS_LABEL, STATUSES } from '@/lib/format'
import { handleFormError } from '@/lib/forms'
import type { LeadStatus, Member, Project } from '@/lib/types'

type Tab = 'members' | 'leads' | 'messages' | 'settings'

export function ProjectDetailPage() {
  const { id } = useParams()
  const me = useMe()
  const isSuper = me.role === 'super_admin'
  const [params, setParams] = useSearchParams()
  const tab = (['members', 'leads', 'messages', 'settings'] as const).find((t) => t === params.get('tab') && (t !== 'settings' || isSuper)) ?? 'members'
  const project = useProjectDetail(id)
  const p = project.data
  const notFound = project.error instanceof ApiError && project.error.code === 'NOT_FOUND'

  return (
    <Page title={p?.name ?? 'Campaign'} back="/projects" wide>
      {project.isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : notFound ? (
        <EmptyState icon="briefcase" title="Campaign not found" body="It may be closed, or you may not be on its team." />
      ) : project.isError ? (
        <ErrorState message={project.error.message} onRetry={() => void project.refetch()} />
      ) : p ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Tag>{p.type === 'door_to_door' ? 'Door-to-door' : 'Online'}</Tag>
            {p.status === 'closed' && <Tag>Closed · view only</Tag>}
            {p.pastEndDate && <Tag tone="down">Past end date</Tag>}
            <span className="text-body-sm text-body">
              {formatDate(p.startDate, { withYear: true })}
              {p.endDate && ` – ${formatDate(p.endDate, { withYear: true })}`}
            </span>
          </div>
          {p.description && <p className="max-w-2xl text-body-md text-body">{p.description}</p>}
          <Segmented<Tab>
            label="Section"
            value={tab}
            onChange={(t) => setParams({ tab: t }, { replace: true })}
            options={[
              { value: 'members', label: `Team · ${p.memberCount}` },
              { value: 'leads', label: `Leads · ${p.leadCount}` },
              { value: 'messages', label: 'Messages' },
              ...(isSuper ? [{ value: 'settings' as Tab, label: 'Settings' }] : []),
            ]}
            className="w-full medium:w-auto medium:self-start"
          />
          {tab === 'members' && <MembersTab project={p} />}
          {tab === 'leads' && <LeadsTab project={p} />}
          {tab === 'messages' && <TemplatesManager projectId={p.id} canEdit={p.status === 'active'} />}
          {tab === 'settings' && isSuper && <SettingsTab project={p} />}
        </div>
      ) : null}
    </Page>
  )
}

// ---------------------------------------------------------------- members

const targetText = (m: Member) => (m.targetCount ? `${m.targetCount} / ${m.targetPeriod === 'monthly' ? 'month' : 'week'}` : 'No target')

function MembersTab({ project }: { project: Project }) {
  const me = useMe()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isSuper = me.role === 'super_admin'
  const q = useProjectMembers(project.id)
  const [adding, setAdding] = useState(false)
  const [target, setTarget] = useState<Member | null>(null)
  const [backupFor, setBackupFor] = useState<Member | null>(null)
  const [leaveFor, setLeaveFor] = useState<Member | null>(null)
  const [removing, setRemoving] = useState<Member | null>(null)
  const [busy, setBusy] = useState(false)
  const closed = project.status === 'closed'
  const members = (q.data ?? []).filter((m) => m.isActive)
  // A moderator can remove sales persons and himself, never another moderator (PRD §5.4).
  const canRemove = (m: Member) => !closed && (isSuper || m.role === 'sales_person' || m.userId === me.id)

  const remove = async () => {
    if (!removing) return
    setBusy(true)
    try {
      const { message } = await apiWithMessage(`/projects/${project.id}/members/${removing.userId}`, { method: 'DELETE' })
      toast.success(message)
      void qc.invalidateQueries({ queryKey: projectMembersKey(project.id) })
      invalidateProjects(qc)
      void qc.invalidateQueries({ queryKey: ['leads'] })
      setRemoving(null)
    } catch (err) {
      handleFormError(err)
      setRemoving(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 expanded:max-w-[800px]">
      {!closed && (
        <div className="flex flex-wrap gap-2">
          <Button icon="add-user-male" variant="secondary" onClick={() => setAdding(true)}>
            Add to team
          </Button>
          <Button asChild variant="secondary">
            <Link to={`/projects/${project.id}/import`}>
              <Icon name="csv" size={20} />
              Add leads from a sheet
            </Link>
          </Button>
        </div>
      )}
      {q.isLoading ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : members.length === 0 ? (
        <EmptyState icon="conference-call" title="No one on the team yet" body="Add sales reps so they can log leads here." />
      ) : (
        <ListGroup>
          {members.map((m) => (
            <ListRow
              key={m.userId}
              leading={<Avatar name={m.name} />}
              title={
                <span className="flex items-center gap-2">
                  {m.name}
                  {m.role === 'moderator' && <Tag>Manager</Tag>}
                </span>
              }
              subtitle={[targetText(m), m.backup ? `Backup: ${m.backup.name}` : null, m.onLeave ? `On leave until ${formatDate(m.onLeave.endsOn)}` : null]
                .filter(Boolean)
                .join(' · ')}
              trailing={
                !closed && (
                  <ActionMenu
                    title={m.name}
                    items={[
                      { label: 'Week and month', icon: 'statistics', onSelect: () => navigate(`/people/${m.userId}`) },
                      { label: 'View their day', icon: 'timeline', onSelect: () => navigate(`/people/${m.userId}/day`) },
                      { label: 'Set target', icon: 'goal', onSelect: () => setTarget(m), hidden: !isSuper && m.role === 'moderator' && m.userId !== me.id },
                      {
                        label: m.backup ? `Backup: ${m.backup.name}` : 'Set backup',
                        icon: 'shield',
                        onSelect: () => setBackupFor(m),
                        hidden: !m.isActive || m.role === 'super_admin' || (!isSuper && m.role === 'moderator' && m.userId !== me.id),
                      },
                      {
                        label: 'Set leave',
                        icon: 'leave',
                        onSelect: () => setLeaveFor(m),
                        hidden: !m.isActive || !m.userIsActive || m.userId === me.id || (!isSuper && m.role !== 'sales_person'),
                      },
                      {
                        label: 'Add leads for them from a sheet',
                        icon: 'csv',
                        onSelect: () => navigate(`/projects/${project.id}/import?owner=${m.userId}`),
                        hidden: !m.isActive || !m.userIsActive || m.role === 'super_admin',
                      },
                      { label: 'Remove from campaign', icon: 'trash', onSelect: () => setRemoving(m), hidden: !canRemove(m) },
                    ]}
                  />
                )
              }
            />
          ))}
        </ListGroup>
      )}
      <AddMemberForm projectId={project.id} members={q.data ?? []} canAddModerators={isSuper} open={adding} onOpenChange={setAdding} />
      {target && <SetTargetForm projectId={project.id} member={target} open onOpenChange={(o) => !o && setTarget(null)} />}
      {backupFor && <BackupPicker projectId={project.id} member={backupFor} members={members} open onOpenChange={(o) => !o && setBackupFor(null)} />}
      <LeaveForm open={!!leaveFor} onOpenChange={(o) => !o && setLeaveFor(null)} person={leaveFor ? { id: leaveFor.userId, name: leaveFor.name } : undefined} />
      <Confirm
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? ''}?`}
        body="Their history stays. Their leads here are tagged “Owner removed” until you assign them to someone else, and any handover request involving them is rejected."
        confirmLabel={`Remove ${removing?.name ?? ''}`.trim()}
        onConfirm={remove}
        loading={busy}
      />
    </section>
  )
}

// ---------------------------------------------------------------- leads

function LeadsTab({ project }: { project: Project }) {
  const qc = useQueryClient()
  // Only the sales head deletes leads; managers can still select to assign.
  const canDelete = useMe().role === 'super_admin'
  const members = useProjectMembers(project.id)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<LeadStatus | 'all'>('all')
  const [owner, setOwner] = useState('all') // 'all' | 'unavailable' | member id
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [reassigning, setReassigning] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const q = useDebounced(search.trim(), 300)
  const closed = project.status === 'closed'

  const list = useLeadList(project.id, {
    search: q || undefined,
    status: status === 'all' ? null : status,
    ownerId: owner !== 'all' && owner !== 'unavailable' ? owner : undefined,
    ownerUnavailable: owner === 'unavailable',
  })
  const leads = list.data?.pages.flatMap((pg) => pg.items) ?? []
  const toggle = (id: string) => setPicked((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)))
  const exit = () => (setSelecting(false), setPicked(new Set()))
  const n = picked.size
  const deleteSelected = async () => {
    setBusy(true)
    try {
      const { message } = await apiWithMessage(`/projects/${project.id}/leads/delete`, { method: 'POST', body: { leadIds: [...picked] } })
      toast.success(message)
      invalidateLeadData(qc)
      invalidateProjects(qc)
      void qc.invalidateQueries({ queryKey: ['transfers'] })
      setDeleting(false)
      exit()
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusy(false)
    }
  }
  const filtered = !!search.trim() || status !== 'all' || owner !== 'all'
  const empty = !filtered && !list.isLoading && !list.isError && leads.length === 0
  // Only filter by owner when there is more than one to choose between.
  const ownerOptions = (members.data ?? []).filter((m) => m.isActive).map((m) => ({ value: m.userId, label: m.name }))
  const importButton = (
    <Button asChild>
      <Link to={`/projects/${project.id}/import`}>
        <Icon name="csv" size={20} />
        Add leads from a sheet
      </Link>
    </Button>
  )

  return (
    <section className="flex flex-col gap-4 expanded:max-w-[900px]">
      {/* Search and actions share one row; with no leads at all there's nothing to search or filter. */}
      {!empty && (
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput label="Search leads" placeholder="Name, business or phone" value={search} onChange={setSearch} className="flex-1 basis-64 medium:max-w-md" />
          {!closed && (
            <div className="flex gap-2">
              {leads.length > 0 && (
                <Button variant="secondary" icon={selecting ? 'multiply' : 'checkmark'} onClick={() => (selecting ? exit() : setSelecting(true))}>
                  {selecting ? 'Cancel' : 'Select'}
                </Button>
              )}
              {!selecting && importButton}
            </div>
          )}
        </div>
      )}
      {!empty && (
        <div className="flex flex-col gap-2">
          {ownerOptions.length > 1 && (
            <FilterChips
              label="Owner"
              value={owner}
              onChange={setOwner}
              options={[{ value: 'all', label: 'Everyone' }, ...ownerOptions, { value: 'unavailable', label: 'Owner left or removed' }]}
            />
          )}
          <FilterChips
            label="Status"
            value={status}
            onChange={setStatus}
            options={[{ value: 'all' as const, label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]}
          />
        </div>
      )}

      {list.isLoading ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : empty ? (
        <EmptyState
          icon="contacts"
          title="No leads yet"
          body={closed ? 'This campaign is closed.' : 'Add leads from a sheet to hand them out to your team, or wait for sales reps to add them in the field.'}
          action={!closed && importButton}
        />
      ) : leads.length === 0 ? (
        <EmptyState
          icon="search"
          title="No leads match"
          body="Try another name or phone, or clear the filters."
          action={
            <Button variant="secondary" onClick={() => (setSearch(''), setStatus('all'), setOwner('all'))}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className={cn('card card--default gap-0 overflow-hidden rounded-2xl p-0', selecting && 'mb-24 medium:mb-0')}>
          {leads.map((l) => (
            <LeadRow key={l.id} lead={l} showOwner selected={picked.has(l.id)} onToggle={selecting ? () => toggle(l.id) : undefined} />
          ))}
          <LoadMore hasNext={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
        </div>
      )}

      {selecting && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 flex items-center gap-3 border-t border-separator bg-surface/90 backdrop-blur-xl px-4 py-3 medium:bottom-0 medium:left-20 large:left-[280px]">
          <span className="flex-1 text-body-sm" aria-live="polite">
            {picked.size} selected
          </span>
          {canDelete && (
            <Button variant="danger-soft" icon="trash" disabled={n === 0} onClick={() => setDeleting(true)}>
              Delete {n || ''}
            </Button>
          )}
          <Button disabled={n === 0} onClick={() => setReassigning(true)}>
            Assign {n || ''}
          </Button>
        </div>
      )}
      <Confirm
        open={deleting}
        onOpenChange={(o) => !busy && setDeleting(o)}
        title={`Delete ${n} ${n === 1 ? 'lead' : 'leads'}?`}
        body="They disappear from every list, report and target, and any handover request for them is rejected. Their numbers can be added again as new leads. This can't be undone from the app."
        confirmLabel={`Delete ${n} ${n === 1 ? 'lead' : 'leads'}`}
        onConfirm={deleteSelected}
        loading={busy}
        danger
      />
      <ReassignForm projectId={project.id} leadIds={[...picked]} members={members.data ?? []} open={reassigning} onOpenChange={setReassigning} onDone={exit} />
    </section>
  )
}

// ---------------------------------------------------------------- settings

function SettingsTab({ project }: { project: Project }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<'close' | 'reopen' | null>(null)
  const [busy, setBusy] = useState(false)
  const closed = project.status === 'closed'

  const run = async (path: string, ok?: () => void) => {
    setBusy(true)
    try {
      const { message } = await apiWithMessage(`/projects/${project.id}/${path}`, { method: path === 'image' ? 'DELETE' : 'POST' })
      toast.success(message)
      invalidateProjects(qc)
      void qc.invalidateQueries({ queryKey: ['transfers'] })
      ok?.()
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  return (
    <section className="flex flex-col gap-6 expanded:max-w-[640px]">
      <ListGroup>
        <ListRow icon="edit" title="Edit campaign" subtitle="Name, dates, type and picture" chevron onClick={() => setEditing(true)} />
        {project.imageUrl && <ListRow icon="image" title="Remove picture" onClick={() => void run('image')} />}
        <ListRow
          icon={closed ? 'refresh' : 'lock'}
          title={closed ? 'Reopen campaign' : 'Close campaign'}
          subtitle={closed ? 'The team and targets come back as they were.' : 'Becomes view only. Nothing is deleted.'}
          destructive={!closed}
          onClick={() => setConfirm(closed ? 'reopen' : 'close')}
        />
      </ListGroup>
      <ProjectForm open={editing} onOpenChange={setEditing} project={project} />
      <Confirm
        open={confirm === 'close'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Close ${project.name}?`}
        body="No new leads, follow-ups, status changes or handovers. Handover requests are rejected, and follow-ups due here leave everyone's Due today list. Photos stay viewable."
        confirmLabel="Close campaign"
        onConfirm={() => run('close')}
        loading={busy}
      />
      <Confirm
        open={confirm === 'reopen'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Reopen ${project.name}?`}
        body="The team and targets return as they were. Handovers that were rejected on closing are not restored."
        confirmLabel="Reopen campaign"
        onConfirm={() => run('reopen')}
        loading={busy}
      />
      <p className="text-caption text-muted">{ROLE_LABEL.super_admin}s can see every campaign. A campaign can't be deleted, only closed.</p>
    </section>
  )
}

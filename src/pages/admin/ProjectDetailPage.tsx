import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useMe } from '@/auth/AuthProvider'
import { Page } from '@/components/layout/Page'
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
import { useLeadList } from '@/features/leads/queries'
import { useDebounced } from '@/hooks/useDebounced'
import { Icon } from '@/icons'
import { ApiError, apiWithMessage } from '@/lib/api'
import { formatDate, ROLE_LABEL, STATUSES, STATUS_LABEL } from '@/lib/format'
import { handleFormError } from '@/lib/forms'
import type { LeadStatus, Member, Project } from '@/lib/types'

type Tab = 'members' | 'leads' | 'settings'

export function ProjectDetailPage() {
  const { id } = useParams()
  const me = useMe()
  const isSuper = me.role === 'super_admin'
  const [params, setParams] = useSearchParams()
  const tab = (['members', 'leads', 'settings'] as const).find((t) => t === params.get('tab') && (t !== 'settings' || isSuper)) ?? 'members'
  const project = useProjectDetail(id)
  const p = project.data
  const notFound = project.error instanceof ApiError && project.error.code === 'NOT_FOUND'

  return (
    <Page title={p?.name ?? 'Project'} back="/projects" wide>
      {project.isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : notFound ? (
        <EmptyState icon="briefcase" title="Project not found" body="It may be closed for your account or you may not be assigned to it." />
      ) : project.isError ? (
        <ErrorState message={project.error.message} onRetry={() => void project.refetch()} />
      ) : p ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Tag>{p.type === 'door_to_door' ? 'Door-to-door' : 'Online'}</Tag>
            {p.status === 'closed' && <Tag>Closed · read-only</Tag>}
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
              { value: 'members', label: `Members · ${p.memberCount}` },
              { value: 'leads', label: `Leads · ${p.leadCount}` },
              ...(isSuper ? [{ value: 'settings' as Tab, label: 'Settings' }] : []),
            ]}
            className="w-full medium:w-auto medium:self-start"
          />
          {tab === 'members' && <MembersTab project={p} />}
          {tab === 'leads' && <LeadsTab project={p} />}
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
        <Button icon="add-user-male" variant="secondary" className="self-start" onClick={() => setAdding(true)}>
          Add member
        </Button>
      )}
      {q.isLoading ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : members.length === 0 ? (
        <EmptyState icon="conference-call" title="No members yet" body="Add sales persons so they can log leads here." />
      ) : (
        <ListGroup>
          {members.map((m) => (
            <ListRow
              key={m.userId}
              leading={<Avatar name={m.name} />}
              title={
                <span className="flex items-center gap-2">
                  {m.name}
                  {m.role === 'moderator' && <Tag>Moderator</Tag>}
                </span>
              }
              subtitle={targetText(m)}
              trailing={
                !closed && (
                  <ActionMenu
                    title={m.name}
                    items={[
                      { label: 'Week and month', icon: 'statistics', onSelect: () => navigate(`/people/${m.userId}`) },
                      { label: 'View their day', icon: 'timeline', onSelect: () => navigate(`/people/${m.userId}/day`) },
                      { label: 'Set target', icon: 'goal', onSelect: () => setTarget(m) },
                      { label: 'Remove from project', icon: 'trash', onSelect: () => setRemoving(m), hidden: !canRemove(m) },
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
      <Confirm
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? ''}?`}
        body="Their history stays. Their leads here are tagged “Owner removed” until you reassign them, and any pending transfer involving them is rejected."
        confirmLabel={`Remove ${removing?.name ?? ''}`.trim()}
        onConfirm={remove}
        loading={busy}
      />
    </section>
  )
}

// ---------------------------------------------------------------- leads

function LeadsTab({ project }: { project: Project }) {
  const members = useProjectMembers(project.id)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<LeadStatus | 'all'>('all')
  const [owner, setOwner] = useState('all') // 'all' | 'unavailable' | member id
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [reassigning, setReassigning] = useState(false)
  const q = useDebounced(search.trim(), 300)
  const closed = project.status === 'closed'

  const list = useLeadList(project.id, { search: q || undefined, status: status === 'all' ? null : status, ownerId: owner !== 'all' && owner !== 'unavailable' ? owner : undefined, ownerUnavailable: owner === 'unavailable' })
  const leads = list.data?.pages.flatMap((pg) => pg.items) ?? []
  const toggle = (id: string) => setPicked((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)))
  const exit = () => (setSelecting(false), setPicked(new Set()))

  return (
    <section className="flex flex-col gap-4 expanded:max-w-[900px]">
      <label className="flex h-11 items-center gap-2 rounded-pill bg-surface-strong px-4 medium:max-w-md">
        <Icon name="search" size={20} className="text-muted" />
        <span className="sr-only">Search leads</span>
        <input type="search" enterKeyHint="search" placeholder="Name, business or phone" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={120} className="h-full min-w-0 flex-1 bg-transparent text-body-md outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden" />
      </label>
      <FilterChips label="Owner" value={owner} onChange={setOwner} options={[{ value: 'all', label: 'Everyone' }, { value: 'unavailable', label: 'Owner inactive or removed' }, ...(members.data ?? []).filter((m) => m.isActive).map((m) => ({ value: m.userId, label: m.name }))]} />
      <FilterChips label="Status" value={status} onChange={setStatus} options={[{ value: 'all' as const, label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
      {!closed && (
        <div className="flex flex-wrap gap-2">
          {leads.length > 0 && (
            <Button variant="secondary" size="sm" icon={selecting ? 'multiply' : 'checkmark'} onClick={() => (selecting ? exit() : setSelecting(true))}>
              {selecting ? 'Cancel selection' : 'Select to reassign'}
            </Button>
          )}
          {!selecting && (
            <Button asChild variant="secondary" size="sm">
              <Link to={`/projects/${project.id}/import`}>
                <Icon name="csv" size={20} />
                Import from CSV
              </Link>
            </Button>
          )}
        </div>
      )}

      {list.isLoading ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : leads.length === 0 ? (
        <EmptyState icon="contacts" title="No leads match" body="Change the owner or status filter." />
      ) : (
        <div className={selecting ? '-mx-4 border-t border-hairline pb-24 medium:mx-0 medium:rounded-xl medium:border' : '-mx-4 border-t border-hairline medium:mx-0 medium:overflow-hidden medium:rounded-xl medium:border'}>
          {leads.map((l) => (
            <LeadRow key={l.id} lead={l} showOwner selected={picked.has(l.id)} onToggle={selecting ? () => toggle(l.id) : undefined} />
          ))}
          <LoadMore hasNext={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
        </div>
      )}

      {selecting && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 flex items-center gap-3 border-t border-hairline bg-canvas px-4 py-3 medium:bottom-0 medium:left-20 large:left-[280px]">
          <span className="flex-1 text-body-sm" aria-live="polite">
            {picked.size} selected
          </span>
          <Button disabled={picked.size === 0} onClick={() => setReassigning(true)}>
            Reassign {picked.size || ''}
          </Button>
        </div>
      )}
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
        <ListRow icon="edit" title="Edit project" subtitle="Name, dates, type and image" chevron onClick={() => setEditing(true)} />
        {project.imageUrl && <ListRow icon="image" title="Remove image" onClick={() => void run('image')} />}
        <ListRow
          icon={closed ? 'refresh' : 'lock'}
          title={closed ? 'Reopen project' : 'Close project'}
          subtitle={closed ? 'Members and targets come back as they were.' : 'Becomes read-only. Nothing is deleted.'}
          destructive={!closed}
          onClick={() => setConfirm(closed ? 'reopen' : 'close')}
        />
      </ListGroup>
      <ProjectForm open={editing} onOpenChange={setEditing} project={project} />
      <Confirm
        open={confirm === 'close'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Close ${project.name}?`}
        body="No new leads, follow-ups, status changes or transfers. Pending transfers are rejected, and follow-ups due here leave everyone's Due today list. Photos stay viewable."
        confirmLabel="Close project"
        onConfirm={() => run('close')}
        loading={busy}
      />
      <Confirm
        open={confirm === 'reopen'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Reopen ${project.name}?`}
        body="Members and targets return as they were. Transfers that were rejected on closing are not restored."
        confirmLabel="Reopen project"
        onConfirm={() => run('reopen')}
        loading={busy}
      />
      <p className="text-caption text-muted">Roles: {ROLE_LABEL.super_admin}s can see every project. A project can't be deleted, only closed.</p>
    </section>
  )
}

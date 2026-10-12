import { useState } from 'react'
import { Navigate, Outlet, useParams } from 'react-router'
import { useMe } from '@/auth/AuthProvider'
import { Page } from '@/components/layout/Page'
import { FilterChips } from '@/components/ui/Choice'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/Display'
import { LoadMore } from '@/components/ui/LoadMore'
import { Button } from '@/components/ui/Button'
import { JoinProject } from '@/pages/admin/ProjectsPage'
import { AddLeadForm } from '@/features/leads/AddLeadForm'
import { LeadRow } from '@/features/leads/LeadRow'
import { useLeadList } from '@/features/leads/queries'
import { useProject } from '@/features/projects/ProjectContext'
import { ProjectSwitcher } from '@/features/projects/ProjectSwitcher'
import { useDebounced } from '@/hooks/useDebounced'
import { useWindowClass } from '@/hooks/useWindowClass'
import { Icon } from '@/icons'
import { STATUSES, STATUS_LABEL } from '@/lib/format'
import type { LeadStatus } from '@/lib/types'
import { LeadDetailPage } from './LeadDetailPage'

type StatusFilter = LeadStatus | 'all'

/**
 * My leads. Phones: the list, with detail pushed as its own page.
 * Expanded and up: list-detail split (UX-COMPONENTS.md §3, "Detail view").
 */
export function LeadsPage() {
  const { id } = useParams()
  const me = useMe()
  const wc = useWindowClass()
  const split = wc === 'expanded' || wc === 'large'

  // Super Admins have no "my leads"; they open a lead from the dashboard or a project.
  if (me.role === 'super_admin') return id ? <LeadDetailPage /> : <Navigate to="/dashboard" replace />

  if (!split) return id ? <Outlet /> : <LeadList />

  return (
    <div className="grid min-h-dvh grid-cols-[380px_minmax(0,1fr)] large:grid-cols-[420px_minmax(0,1fr)]">
      <div className="h-dvh overflow-y-auto border-r border-hairline">
        <LeadList />
      </div>
      <div className="h-dvh overflow-y-auto">
        {id ? <Outlet /> : <EmptyState icon="contacts" title="Choose a lead" body="Pick a lead on the left to see its details and history." className="pt-32" />}
      </div>
    </div>
  )
}

/** /leads/:id renders inside the split pane on laptops and as a page on phones. */
export function LeadDetailRoute() {
  const wc = useWindowClass()
  return <LeadDetailPage embedded={wc === 'expanded' || wc === 'large'} />
}

function LeadList() {
  const me = useMe()
  const { project } = useProject()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [adding, setAdding] = useState(false)
  const [joining, setJoining] = useState(false)
  const q = useDebounced(search.trim(), 300)
  // Moderators also see everyone's leads as admins; "My leads" is their own work.
  const list = useLeadList(project?.id, { search: q || undefined, status: status === 'all' ? null : status, mine: me.role === 'moderator' })
  const leads = list.data?.pages.flatMap((p) => p.items) ?? []
  const total = list.data?.pages[0]?.meta.total

  // Every lead belongs to a project, so adding one starts with being in one.
  if (!project) {
    const moderator = me.role === 'moderator'
    return (
      <Page title="My leads">
        <EmptyState
          icon="briefcase"
          title="Join a project to add leads"
          body={moderator ? 'Every lead belongs to a project. Join one, then add your leads here.' : 'Every lead belongs to a project. Ask your admin to add you to one, then add your leads here.'}
          action={moderator && <Button onClick={() => setJoining(true)}>Join a project</Button>}
        />
        {moderator && <JoinProject open={joining} onOpenChange={setJoining} />}
      </Page>
    )
  }

  const closed = project.status === 'closed'
  const filtered = !!q || status !== 'all'

  return (
    <Page
      title="My leads"
      leading={<ProjectSwitcher />}
      cta={closed ? undefined : { label: 'Add lead', icon: 'plus-math', onClick: () => setAdding(true) }}
      header={
        <div className="flex flex-col gap-3">
          <label className="flex h-11 items-center gap-2 rounded-pill bg-surface-strong px-4">
            <Icon name="search" size={20} className="text-muted" />
            <span className="sr-only">Search leads</span>
            <input
              type="search"
              enterKeyHint="search"
              placeholder="Name, business or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={120}
              className="h-full min-w-0 flex-1 bg-transparent text-body-md outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
            />
            {search && (
              <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="-mr-2 flex size-9 items-center justify-center text-muted">
                <Icon name="multiply" size={16} />
              </button>
            )}
          </label>
          <FilterChips label="Status" value={status} onChange={setStatus} options={[{ value: 'all' as const, label: 'All' }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
        </div>
      }
    >
      {total !== undefined && <p className="mb-2 text-caption text-muted" aria-live="polite">{total === 1 ? '1 lead' : `${total} leads`}</p>}
      {list.isLoading ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : leads.length === 0 ? (
        filtered ? (
          <EmptyState icon="search" title="No leads match" body="Try another name or number, or clear the status filter." />
        ) : (
          <EmptyState
            icon="contacts"
            title="No leads yet"
            body={closed ? 'This project is closed.' : 'Add your first lead to start tracking follow-ups.'}
            action={!closed && <Button icon="plus-math" onClick={() => setAdding(true)}>Add lead</Button>}
          />
        )
      ) : (
        <div className="-mx-4 border-t border-hairline medium:-mx-6 expanded:-mx-8">
          {leads.map((l) => (
            <LeadRow key={l.id} lead={l} />
          ))}
          <LoadMore hasNext={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
        </div>
      )}
      {!closed && <AddLeadForm open={adding} onOpenChange={setAdding} project={project} />}
    </Page>
  )
}

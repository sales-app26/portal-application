import { useState } from 'react'
import { Navigate, Outlet, useParams, useSearchParams } from 'react-router'
import { useMe } from '@/auth/AuthProvider'
import { Page } from '@/components/layout/Page'
import { SearchInput } from '@/components/ui/SearchInput'
import { ChoiceList, FilterChips, Segmented } from '@/components/ui/Choice'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/Display'
import { LoadMore } from '@/components/ui/LoadMore'
import { Button } from '@/components/ui/Button'
import { AddLeadForm } from '@/features/leads/AddLeadForm'
import { LeadRow } from '@/features/leads/LeadRow'
import { OpenLeadsList } from '@/features/leads/OpenLeads'
import { useLeadList, useOpenLeadCount } from '@/features/leads/queries'
import { useProject } from '@/features/projects/ProjectContext'
import { ProjectSwitcher } from '@/features/projects/ProjectSwitcher'
import { useDebounced } from '@/hooks/useDebounced'
import { useWindowClass } from '@/hooks/useWindowClass'
import { Icon } from '@/icons'
import { STATUSES, STATUS_DOT, STATUS_LABEL } from '@/lib/format'
import type { LeadSort, LeadStatus } from '@/lib/types'
import { LeadDetailPage } from './LeadDetailPage'

type StatusFilter = LeadStatus | 'all'

const SORTS: { value: LeadSort; label: string; short: string }[] = [
  { value: 'next_follow_up', label: 'Next follow-up first', short: 'Next follow-up' },
  { value: 'updated', label: 'Recently active', short: 'Recently active' },
  { value: 'created', label: 'Newest first', short: 'Newest' },
  { value: 'name', label: 'Business name, A to Z', short: 'Name' },
  { value: 'value', label: 'Highest deal value', short: 'Value' },
  { value: 'activity', label: 'Untouched longest', short: 'Untouched' },
]
const SORT_KEY = 'st.leadSort'

/** The rep's last sort choice survives reloads; storage can be blocked, so every access is guarded. */
function useLeadSort(): [LeadSort, (s: LeadSort) => void] {
  const [sort, setSort] = useState<LeadSort>(() => {
    try {
      const saved = localStorage.getItem(SORT_KEY)
      if (SORTS.some((s) => s.value === saved)) return saved as LeadSort
    } catch {
      /* storage blocked */
    }
    return 'next_follow_up'
  })
  return [
    sort,
    (s) => {
      setSort(s)
      try {
        localStorage.setItem(SORT_KEY, s)
      } catch {
        /* storage blocked */
      }
    },
  ]
}

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
  // Reps also see the campaign's Open leads (unassigned ones they can take); managers hand those
  // out from the campaign page instead.
  const isRep = me.role === 'sales_person'
  const [params, setParams] = useSearchParams()
  const view = isRep && params.get('view') === 'open' ? 'open' : 'mine'
  const openCount = useOpenLeadCount(isRep ? project?.id : undefined)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [adding, setAdding] = useState(false)
  const [sort, setSort] = useLeadSort()
  const [sorting, setSorting] = useState(false)
  const q = useDebounced(search.trim(), 300)
  // Moderators also see everyone's leads as admins; "My leads" is their own work.
  const list = useLeadList(project?.id, { search: q || undefined, status: status === 'all' ? null : status, mine: me.role === 'moderator', sort })
  const leads = list.data?.pages.flatMap((p) => p.items) ?? []
  const total = list.data?.pages[0]?.meta.total

  // Every lead belongs to a project; only the Super Admin adds people to one.
  if (!project) {
    return (
      <Page title="My leads">
        <EmptyState
          icon="briefcase"
          title="You're not on a campaign yet"
          body="Every lead belongs to a campaign. Once your sales manager adds you to one, you can add your leads here."
        />
      </Page>
    )
  }

  const closed = project.status === 'closed'
  const filtered = !!q || status !== 'all'

  return (
    <Page
      title={view === 'open' ? 'Open leads' : 'My leads'}
      leading={<ProjectSwitcher />}
      cta={closed ? undefined : { label: 'Add lead', icon: 'plus-math', onClick: () => setAdding(true) }}
      header={
        <div className="flex flex-col gap-3">
          {isRep && (
            <Segmented
              label="Which leads"
              value={view}
              onChange={(v) => {
                const next = new URLSearchParams(params)
                if (v === 'open') next.set('view', 'open')
                else next.delete('view')
                setParams(next, { replace: true })
              }}
              options={[
                { value: 'mine', label: 'My leads' },
                { value: 'open', label: openCount.data ? `Open leads (${openCount.data})` : 'Open leads' },
              ]}
            />
          )}
          <SearchInput label="Search leads" placeholder={view === 'open' ? 'Business, name or area' : 'Name, business or phone'} value={search} onChange={setSearch} />
          {view === 'mine' && (
            <FilterChips
              label="Status"
              value={status}
              onChange={setStatus}
              options={[{ value: 'all' as const, label: 'All' }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], dot: STATUS_DOT[s] }))]}
            />
          )}
        </div>
      }
    >
      {view === 'open' ? (
        <OpenLeadsList project={project} search={q} />
      ) : (
        <>
          <div className="mb-1 flex min-h-9 items-center justify-between gap-2">
            <p className="text-caption text-muted" aria-live="polite">
              {total === undefined ? '' : total === 1 ? '1 lead' : `${total} leads`}
            </p>
            <button
              type="button"
              onClick={() => setSorting(true)}
              className="pressable -mr-2 flex h-9 items-center gap-1.5 rounded-pill px-3 text-body-sm font-semibold text-ink active:bg-surface-strong"
            >
              <Icon name="sort" size={18} />
              {SORTS.find((s) => s.value === sort)?.short}
            </button>
          </div>
          <ResponsiveOverlay open={sorting} onOpenChange={setSorting} title="Sort leads" variant="choice">
            <ChoiceList
              label="Sort leads"
              value={sort}
              options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
              onSelect={(v) => {
                setSort(v)
                setSorting(false)
              }}
            />
          </ResponsiveOverlay>
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
                body={closed ? 'This campaign is closed.' : 'Add your first lead to start tracking follow-ups.'}
                action={
                  !closed && (
                    <Button icon="plus-math" onClick={() => setAdding(true)}>
                      Add lead
                    </Button>
                  )
                }
              />
            )
          ) : (
            <div className="card card--default gap-0 overflow-hidden rounded-2xl p-0 expanded:-mx-2">
              {leads.map((l) => (
                <LeadRow key={l.id} lead={l} contact />
              ))}
              <LoadMore hasNext={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
            </div>
          )}
        </>
      )}
      {!closed && <AddLeadForm open={adding} onOpenChange={setAdding} project={project} />}
    </Page>
  )
}

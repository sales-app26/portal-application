import { useState } from 'react'
import { useMe } from '@/auth/AuthProvider'
import { Page } from '@/components/layout/Page'
import { EmptyState, ErrorState, ListSkeleton, SectionTitle, Skeleton, StatTile } from '@/components/ui/Display'
import { LoadMore } from '@/components/ui/LoadMore'
import { AddLeadForm } from '@/features/leads/AddLeadForm'
import { LeadRow } from '@/features/leads/LeadRow'
import { useDueToday, useHome } from '@/features/leads/queries'
import { TargetCard } from '@/features/leads/TargetCard'
import { useProject } from '@/features/projects/ProjectContext'
import { ProjectSwitcher } from '@/features/projects/ProjectSwitcher'
import { useNavigate } from 'react-router'

/** Home: target progress, today's counts and Due today (PRD §6, flow 7.2). */
export function HomePage() {
  const me = useMe()
  const navigate = useNavigate()
  const { project } = useProject()
  const [adding, setAdding] = useState(false)
  const home = useHome(project?.id)
  const due = useDueToday(project?.id)

  if (!project) {
    return (
      <Page title="Today">
        <EmptyState icon="briefcase" title={me.notice ?? 'You are not assigned to any project yet.'} body="Your admin adds you to a project. It will show up here when you sign in next." />
      </Page>
    )
  }

  const closed = project.status === 'closed'
  const target = home.data?.targets.find((t) => t.projectId === project.id)
  const dueLeads = due.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <Page title="Today" leading={<ProjectSwitcher />} cta={closed ? undefined : { label: 'Add lead', icon: 'plus-math', onClick: () => setAdding(true) }}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 expanded:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] expanded:items-start expanded:gap-8">
        <div className="flex flex-col gap-4">
          {closed && <p className="rounded-md bg-surface-strong px-4 py-3 text-body-sm">This project is closed. It's read-only.</p>}
          {home.isLoading ? (
            <Skeleton className="h-36 rounded-xl" />
          ) : target ? (
            <TargetCard t={target} />
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Due today" value={home.data ? home.data.dueToday : '–'} />
            <StatTile label="Follow-ups today" value={home.data ? home.data.followUpsToday : '–'} onClick={() => navigate('/day')} />
          </div>
        </div>

        <section aria-labelledby="due-title">
          <SectionTitle>
            <span id="due-title">Due today{home.data && home.data.overdue > 0 ? <span className="ml-2 text-body-sm font-normal text-down">{home.data.overdue} overdue</span> : null}</span>
          </SectionTitle>
          {due.isLoading ? (
            <ListSkeleton rows={4} />
          ) : due.isError ? (
            <ErrorState message={due.error.message} onRetry={() => void due.refetch()} />
          ) : dueLeads.length === 0 ? (
            <EmptyState icon="checkmark" title="Nothing due today" body="Leads with a follow-up date of today or earlier show up here." className="rounded-xl border border-hairline" />
          ) : (
            <div className="-mx-4 overflow-hidden border-y border-hairline medium:mx-0 medium:rounded-xl medium:border">
              {dueLeads.map((l) => (
                <LeadRow key={l.id} lead={l} />
              ))}
              <LoadMore hasNext={!!due.hasNextPage} loading={due.isFetchingNextPage} onLoad={() => void due.fetchNextPage()} />
            </div>
          )}
        </section>
      </div>
      {!closed && <AddLeadForm open={adding} onOpenChange={setAdding} project={project} />}
    </Page>
  )
}

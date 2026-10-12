import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMe } from '@/auth/AuthProvider'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, ListSkeleton, Skeleton, StatTile } from '@/components/ui/Display'
import { LoadMore } from '@/components/ui/LoadMore'
import { AddLeadForm } from '@/features/leads/AddLeadForm'
import { LeadRow } from '@/features/leads/LeadRow'
import { useDueToday, useHome } from '@/features/leads/queries'
import { TargetCard } from '@/features/leads/TargetCard'
import { useProject } from '@/features/projects/ProjectContext'
import { ProjectSwitcher } from '@/features/projects/ProjectSwitcher'
import type { LeadSummary } from '@/lib/types'

/** "Good morning, Ravi · Tue, 13 Oct" in India time. */
function greeting(name: string): string {
  const now = new Date()
  const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(now))
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const day = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(now)
  return `${part}, ${name.split(/\s+/)[0]} · ${day}`
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

/**
 * Home: what to do today, in the order a rep works. The target and its pace first,
 * then Overdue, Due today and Done counts, then the leads to call or visit, each with
 * Call and WhatsApp on the row (PRD §6, flow 7.2).
 */
export function HomePage() {
  const me = useMe()
  const navigate = useNavigate()
  const { project } = useProject()
  const [adding, setAdding] = useState(false)
  const home = useHome(project?.id)
  const due = useDueToday(project?.id)

  if (!project) {
    return (
      <Page title="Today" subtitle={greeting(me.name)}>
        <EmptyState icon="briefcase" title={me.notice ?? 'You are not assigned to any project yet.'} body="Your admin adds you to a project. It will show up here when you sign in next." />
      </Page>
    )
  }

  const closed = project.status === 'closed'
  const target = home.data?.targets.find((t) => t.projectId === project.id)
  const dueLeads = due.data?.pages.flatMap((p) => p.items) ?? []
  const overdueLeads = dueLeads.filter((l) => (l.overdueDays ?? 0) > 0)
  const todayLeads = dueLeads.filter((l) => !l.overdueDays)
  const overdue = home.data?.overdue ?? 0
  const dueToday = home.data ? home.data.dueToday - home.data.overdue : null

  return (
    <Page title="Today" subtitle={greeting(me.name)} leading={<ProjectSwitcher />} cta={closed ? undefined : { label: 'Add lead', icon: 'plus-math', onClick: () => setAdding(true) }}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 expanded:grid-cols-[minmax(280px,380px)_minmax(0,1fr)] expanded:items-start expanded:gap-8">
        <div className="flex flex-col gap-3">
          {closed && <p className="rounded-md bg-surface-strong px-4 py-3 text-body-sm">This project is closed. It's read-only.</p>}
          {home.isLoading ? <Skeleton className="h-36 rounded-xl" /> : target ? <TargetCard t={target} /> : null}
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Overdue" value={home.data ? overdue : '–'} tone={overdue > 0 ? 'down' : 'ink'} onClick={overdue > 0 ? () => scrollTo('due-overdue') : undefined} />
            <StatTile label="Due today" value={dueToday ?? '–'} onClick={dueToday ? () => scrollTo('due-today') : undefined} />
            <StatTile label="Done today" value={home.data ? home.data.followUpsToday : '–'} onClick={() => navigate('/day')} />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {due.isLoading ? (
            <ListSkeleton rows={4} />
          ) : due.isError ? (
            <ErrorState message={due.error.message} onRetry={() => void due.refetch()} />
          ) : dueLeads.length === 0 ? (
            <EmptyState
              icon="checkmark"
              title="All caught up"
              body="No follow-ups are due. Leads you schedule for today show up here, overdue ones first."
              action={
                <Button variant="secondary" icon="contacts" onClick={() => navigate('/leads')}>
                  Open my leads
                </Button>
              }
              className="rounded-xl border border-hairline"
            />
          ) : (
            <>
              <DueSection id="due-overdue" title="Overdue" tone="down" count={overdue} leads={overdueLeads} />
              <DueSection id="due-today" title="Due today" count={dueToday ?? todayLeads.length} leads={todayLeads} />
              <LoadMore hasNext={!!due.hasNextPage} loading={due.isFetchingNextPage} onLoad={() => void due.fetchNextPage()} />
            </>
          )}
        </div>
      </div>
      {!closed && <AddLeadForm open={adding} onOpenChange={setAdding} project={project} />}
    </Page>
  )
}

function DueSection({ id, title, count, leads, tone }: { id: string; title: string; count: number; leads: LeadSummary[]; tone?: 'down' }) {
  if (leads.length === 0) return null
  return (
    <section aria-labelledby={`${id}-title`} id={id} className="scroll-mt-20">
      <h2 id={`${id}-title`} className="mb-2 flex items-center gap-2 text-title-md">
        {title}
        <span className={tone === 'down' ? 'rounded-pill bg-down/10 px-2 text-body-sm font-semibold text-down tabular-nums' : 'rounded-pill bg-surface-strong px-2 text-body-sm font-semibold text-body tabular-nums'}>{count}</span>
      </h2>
      <div className="-mx-4 overflow-hidden border-y border-hairline medium:mx-0 medium:rounded-xl medium:border">
        {leads.map((l) => (
          <LeadRow key={l.id} lead={l} contact />
        ))}
      </div>
    </section>
  )
}

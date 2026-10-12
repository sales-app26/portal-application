import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useMe } from '@/auth/AuthProvider'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, ListSkeleton, Skeleton, StatTile } from '@/components/ui/Display'
import { LoadMore } from '@/components/ui/LoadMore'
import { AddLeadForm } from '@/features/leads/AddLeadForm'
import { LeadRow } from '@/features/leads/LeadRow'
import { useAgenda, useDueToday, useHome, useLeadList } from '@/features/leads/queries'
import { TargetCard } from '@/features/leads/TargetCard'
import { useProject } from '@/features/projects/ProjectContext'
import { ProjectSwitcher } from '@/features/projects/ProjectSwitcher'
import { ProntteraMark } from '@/components/brand/Logo'
import { cn } from '@/lib/cn'
import type { Agenda, LeadSummary } from '@/lib/types'

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
  // The app icon's "Add lead" shortcut opens Home with ?add=1.
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(() => params.get('add') === '1')
  useEffect(() => {
    if (params.get('add') === '1') setParams((p) => (p.delete('add'), p), { replace: true })
  }, [params, setParams])
  const home = useHome(project?.id)
  const due = useDueToday(project?.id)
  const agenda = useAgenda(project?.id)
  const [view, setView] = useState<AgendaView>('now')

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
    <Page title="Today" subtitle={greeting(me.name)} leading={<BrandedSwitcher />} cta={closed ? undefined : { label: 'Add lead', icon: 'plus-math', onClick: () => setAdding(true) }}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 expanded:grid-cols-[minmax(280px,380px)_minmax(0,1fr)] expanded:items-start expanded:gap-8">
        <div className="flex flex-col gap-3">
          {closed && <p className="rounded-md bg-surface-strong px-4 py-3 text-body-sm">This project is closed. It's read-only.</p>}
          {home.isLoading ? <Skeleton className="h-36 rounded-xl" /> : target ? <TargetCard t={target} to="/performance" revenue={home.data?.revenueThisMonth} /> : null}
          <div className="grid grid-cols-3 gap-3">
            <StatTile icon="high-priority" label="Overdue" value={home.data ? overdue : '–'} tone={overdue > 0 ? 'down' : 'ink'} onClick={overdue > 0 ? () => (setView('now'), setTimeout(() => scrollTo('due-overdue'), 50)) : undefined} />
            <StatTile icon="calendar" label="Due today" value={dueToday ?? '–'} tone="accent" onClick={dueToday ? () => (setView('now'), setTimeout(() => scrollTo('due-today'), 50)) : undefined} />
            <StatTile icon="checkmark" label="Done today" value={home.data ? home.data.followUpsToday : '–'} tone="up" onClick={() => navigate('/day')} />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <AgendaChips value={view} onChange={setView} agenda={agenda.data} dueNow={home.data?.dueToday} />
          {view !== 'now' ? (
            <AgendaList view={view} projectId={project.id} mine={me.role === 'moderator'} />
          ) : due.isLoading ? (
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
              className="card card--default rounded-2xl"
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

/** Phones: the Pronttera mark beside the project switcher (laptops show it in the drawer). */
function BrandedSwitcher() {
  return (
    <span className="flex items-center gap-2.5">
      <ProntteraMark size={26} className="medium:hidden" label="Pronttera" />
      <ProjectSwitcher />
    </span>
  )
}

type AgendaView = 'now' | 'tomorrow' | 'week' | 'cold' | 'untouched'

const AGENDA: { value: AgendaView; label: string; empty: { title: string; body: string } }[] = [
  { value: 'now', label: 'Due now', empty: { title: '', body: '' } },
  { value: 'tomorrow', label: 'Tomorrow', empty: { title: 'Nothing due tomorrow', body: 'Follow-ups you schedule for tomorrow show up here, so you can plan the route tonight.' } },
  { value: 'week', label: 'This week', empty: { title: 'A free week ahead', body: 'Follow-ups due in the next 7 days show up here.' } },
  { value: 'cold', label: 'Going cold', empty: { title: 'Nothing is going cold', body: 'Open leads with no follow-up for 14 days show up here, before they are forgotten.' } },
  { value: 'untouched', label: 'Not contacted', empty: { title: 'Everyone has been contacted', body: 'New leads, including imported ones, wait here until you log the first follow-up.' } },
]

/** The rep's lists for today and the days ahead, with counts from /me/agenda. */
function AgendaChips({ value, onChange, agenda, dueNow }: { value: AgendaView; onChange: (v: AgendaView) => void; agenda?: Agenda; dueNow?: number }) {
  const count: Record<AgendaView, number | undefined> = { now: dueNow, tomorrow: agenda?.tomorrow, week: agenda?.thisWeek, cold: agenda?.cold, untouched: agenda?.untouched }
  return (
    <div role="radiogroup" aria-label="Agenda" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] expanded:mx-0 expanded:flex-wrap expanded:px-0">
      {AGENDA.map((a) => {
        const on = a.value === value
        const n = count[a.value]
        return (
          <button
            key={a.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(a.value)}
            className={cn(
              'pressable inline-flex h-10 flex-none items-center gap-2 rounded-pill border px-4 text-nav font-medium whitespace-nowrap transition-colors',
              on ? 'border-transparent bg-primary text-on-primary shadow-[0_6px_16px_-8px_var(--fab-glow)]' : 'border-border bg-surface text-ink hover:bg-surface-secondary',
            )}
          >
            {a.label}
            {n !== undefined && (
              <span className={cn('min-w-5 rounded-pill px-1.5 text-center text-caption-strong tabular-nums', on ? 'bg-white/20' : a.value === 'cold' && n > 0 ? 'bg-warning-soft text-ink' : 'bg-default text-body')}>{n}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** One agenda list, from the leads list with the matching filter. */
function AgendaList({ view, projectId, mine }: { view: Exclude<AgendaView, 'now'>; projectId: string; mine: boolean }) {
  const filter = view === 'tomorrow' ? { due: 'tomorrow' as const } : view === 'week' ? { due: 'week' as const } : view === 'cold' ? { cold: true, sort: 'activity' as const } : { status: 'new' as const, sort: 'created' as const }
  const list = useLeadList(projectId, { ...filter, mine, ...(view === 'tomorrow' || view === 'week' ? { sort: 'next_follow_up' as const } : {}) })
  const leads = list.data?.pages.flatMap((p) => p.items) ?? []
  const empty = AGENDA.find((a) => a.value === view)!.empty
  if (list.isLoading) return <ListSkeleton rows={3} />
  if (list.isError) return <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
  if (leads.length === 0) return <EmptyState icon="checkmark" title={empty.title} body={empty.body} className="card card--default rounded-2xl" />
  return (
    <div className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
      {leads.map((l) => (
        <LeadRow key={l.id} lead={l} contact />
      ))}
      <LoadMore hasNext={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
    </div>
  )
}

function DueSection({ id, title, count, leads, tone }: { id: string; title: string; count: number; leads: LeadSummary[]; tone?: 'down' }) {
  if (leads.length === 0) return null
  return (
    <section aria-labelledby={`${id}-title`} id={id} className="scroll-mt-20">
      <h2 id={`${id}-title`} className="mb-2.5 flex items-center gap-2 px-1 text-title-md">
        {title}
        <span className={tone === 'down' ? 'chip chip--soft chip--danger chip--sm px-2 text-caption-strong tabular-nums' : 'chip chip--sm bg-default px-2 text-caption-strong text-body tabular-nums'}>{count}</span>
      </h2>
      <div className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
        {leads.map((l) => (
          <LeadRow key={l.id} lead={l} contact />
        ))}
      </div>
    </section>
  )
}

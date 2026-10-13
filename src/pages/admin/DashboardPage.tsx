import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Page } from '@/components/layout/Page'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Button, IconButton } from '@/components/ui/Button'
import { Avatar, Card, EmptyState, ErrorState, ProgressBar, SectionTitle, Skeleton, StatTile } from '@/components/ui/Display'
import { Segmented } from '@/components/ui/Choice'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { DashboardFilters, presetRange } from '@/features/admin/DashboardFilters'
import { useDashboard, useProjectOptions, useUserOptions, type DashboardFilter } from '@/features/admin/queries'
import { settleOverlays } from '@/hooks/useOverlayHistory'
import { useWindowClass } from '@/hooks/useWindowClass'
import { Icon, type IconName } from '@/icons'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { downloadCsv } from '@/lib/download'
import { formatDate, formatDateTime, formatPhone, plural, REASON_LABEL, rupees, rupeesShort, SOURCE_LABEL, STATUS_DOT, STATUS_LABEL, todayIST } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import type { AttentionKind, Dashboard, FunnelStage } from '@/lib/types'
import { BarList } from '@/components/charts/BarList'
import { ColumnChart } from '@/components/charts/ColumnChart'

const EXPORT_MAX_DAYS = 92

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
const rangeText = (f: DashboardFilter) => (f.from === f.to ? formatDate(f.from) : `${formatDate(f.from)} – ${formatDate(f.to)}`)

/** Numbers and lists for admins, scoped to their projects (PRD §5.12, flow 7.5). */
export function DashboardPage() {
  const [params, setParams] = useSearchParams()
  const split = ['expanded', 'large'].includes(useWindowClass())
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Phones: the filters sheet edits a draft. The sheet holds a history entry (so Back closes
  // it); writing the URL while it is open would be undone when that entry is popped.
  const [draft, setDraft] = useState<DashboardFilter | null>(null)
  const openFilters = () => (setDraft(null), setFiltersOpen(true))
  const today = todayIST()
  const filter: DashboardFilter = {
    from: params.get('from') && params.get('from')! <= today ? params.get('from')! : today,
    to: params.get('to') && params.get('to')! <= today ? params.get('to')! : today,
    projectId: params.get('projectId') ?? undefined,
    userId: params.get('userId') ?? undefined,
  }
  const setFilter = (f: DashboardFilter) => {
    const next: Record<string, string> = {}
    if (f.from !== today || f.to !== today) ((next.from = f.from), (next.to = f.to))
    if (f.projectId) next.projectId = f.projectId
    if (f.userId) next.userId = f.userId
    setParams(next, { replace: true })
  }

  const q = useDashboard(filter)
  const d = q.data
  const projects = useProjectOptions()
  const people = useUserOptions({ isActive: true })
  const activeCount = (filter.projectId ? 1 : 0) + (filter.userId ? 1 : 0) + (filter.from === presetRange('today').from && filter.to === today ? 0 : 1)

  const exportCsv = async (kind: 'leads' | 'follow-ups') => {
    if (daysBetween(filter.from, filter.to) > EXPORT_MAX_DAYS) {
      haptic.error()
      return toast.error('A report can cover at most 92 days.')
    }
    const t = toast.loading('Preparing your report…')
    try {
      const name = await downloadCsv(`/exports/${kind}`, { from: filter.from, to: filter.to, projectId: filter.projectId, userId: filter.userId })
      toast.success(`Saved ${name}`, { id: t })
    } catch (err) {
      haptic.error()
      toast.error(err instanceof ApiError ? err.message : "Couldn't prepare the report. Please try again.", { id: t })
    }
  }

  const filterSummary = [
    rangeText(filter),
    filter.projectId ? projects.data?.find((p) => p.id === filter.projectId)?.name : null,
    filter.userId ? people.data?.find((u) => u.id === filter.userId)?.name : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Page
      title="Sales overview"
      wide
      actions={
        <>
          {!split && <IconButton icon="filter" label={activeCount ? `Filters, ${activeCount} active` : 'Filters'} onClick={openFilters} />}
          <ActionMenu
            title="Download report"
            label="Download report"
            trigger={<IconButton icon="download" label="Download report" />}
            items={[
              { label: 'Leads report', icon: 'csv', onSelect: () => void exportCsv('leads') },
              { label: 'Follow-ups report', icon: 'csv', onSelect: () => void exportCsv('follow-ups') },
            ]}
          />
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {split ? (
          <Card>
            <DashboardFilters value={filter} onChange={setFilter} />
          </Card>
        ) : (
          <button type="button" onClick={openFilters} className="pressable flex min-h-11 items-center gap-2 self-start rounded-pill bg-surface-strong px-4 text-nav">
            <Icon name="calendar" size={20} />
            <span className="truncate">{filterSummary}</span>
          </button>
        )}

        {q.isLoading ? (
          <DashboardSkeleton />
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : d ? (
          <DashboardBody d={d} filter={filter} />
        ) : null}
      </div>

      {!split && (
        <ResponsiveOverlay
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          title="Filters"
          variant="short"
          footer={
            <Button
              size="lg"
              block
              onClick={async () => {
                const chosen = draft
                setFiltersOpen(false)
                await settleOverlays()
                if (chosen) setFilter(chosen)
              }}
            >
              Show results
            </Button>
          }
        >
          <div className="pt-1">
            <DashboardFilters value={draft ?? filter} onChange={setDraft} />
          </div>
        </ResponsiveOverlay>
      )}
    </Page>
  )
}

function DashboardBody({ d, filter }: { d: Dashboard; filter: DashboardFilter }) {
  const navigate = useNavigate()
  const noData = !!d.message
  const range = filter.from === filter.to ? 'today' : 'in range'

  return (
    <>
      {noData && <p className="rounded-2xl bg-accent-soft px-4 py-3 text-body-sm text-accent-soft-foreground">{d.message}</p>}
      <div className="grid grid-cols-2 gap-3 medium:grid-cols-3 expanded:grid-cols-5">
        <StatTile icon="contacts" tone="accent" label="New leads" value={d.newLeads} />
        <StatTile icon="timeline" tone="accent" label={filter.from === filter.to ? 'Follow-ups' : 'Follow-ups in range'} value={d.followUps} />
        <StatTile icon="ok" tone="up" label="Deals won" value={d.conversions} />
        <StatTile icon="goal" tone="up" label="Monthly revenue won" hint={range === 'today' ? 'today' : 'in these dates'} value={d.revenue ? rupeesShort(d.revenue) : '₹0'} />
        <StatTile
          icon="swap"
          tone={d.pendingTransfers ? 'warning' : 'ink'}
          label="Handover requests"
          value={d.pendingTransfers}
          onClick={() => navigate('/transfers')}
          className="col-span-2 medium:col-span-1"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 expanded:grid-cols-3 expanded:items-start">
        <TrendCard d={d} className="expanded:col-span-2" />
        <Card>
          <SectionTitle description="Leads added in these dates, and how far they got.">Funnel</SectionTitle>
          <Funnel funnel={d.funnel} />
        </Card>

        <div className="flex flex-col gap-4 expanded:col-span-2">
          <Leaderboard people={d.people} date={filter.to} />
          <Card>
            <SectionTitle description="Current period for each person.">Target vs achieved</SectionTitle>
            {d.targets.length === 0 ? (
              <p className="text-body-sm text-body">No one has a target in these campaigns.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-4 medium:grid-cols-2">
                {d.targets.map((t) => (
                  <li key={`${t.projectId}-${t.user.id}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <Link to={`/people/${t.user.id}`} className="min-w-0 truncate text-title-sm hover:underline">
                        {t.user.name}
                      </Link>
                      <span className="flex-none text-caption-strong tabular-nums">
                        {t.achieved}
                        {t.targetCount ? ` / ${t.targetCount}` : ''}
                      </span>
                    </div>
                    <p className="mb-1.5 truncate text-caption text-muted">
                      {t.projectName}
                      {t.targetCount ? ` · ${t.targetPeriod === 'monthly' ? 'this month' : 'this week'}` : ' · no target'}
                    </p>
                    {t.targetCount ? <ProgressBar value={t.achieved} max={t.targetCount} size="sm" label={`${t.user.name} target`} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <NeedsAttention items={d.needsAttention} />
          <Card>
            <SectionTitle>Logged nothing today</SectionTitle>
            {d.loggedNothingToday.length === 0 ? (
              <p className="flex items-center gap-2 text-body-sm text-body">
                <Icon name="checkmark" size={20} className="text-up" /> Everyone has logged something today.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {d.loggedNothingToday.map((p) => (
                  <li key={p.user.id}>
                    <Link to={`/people/${p.user.id}/day`} className="flex items-center gap-3 rounded-xl hover:opacity-80">
                      <Avatar name={p.user.name} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-title-sm">{p.user.name}</span>
                        <span className="block truncate text-caption text-muted">{p.projects.join(', ')}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card>
          <SectionTitle description="Every lead in these campaigns, now.">Leads by status</SectionTitle>
          <BarList
            title="Leads by status"
            items={d.leadsByStatus.map((s) => ({
              key: s.status,
              name: STATUS_LABEL[s.status],
              label: STATUS_LABEL[s.status],
              value: s.count,
              color: STATUS_DOT[s.status],
              dot: STATUS_DOT[s.status],
            }))}
          />
        </Card>
        <Card>
          <SectionTitle description="Not interested and lost, in these dates.">Why leads say no</SectionTitle>
          {d.lostReasons.length === 0 ? (
            <p className="text-body-sm text-body">No lost leads in these dates.</p>
          ) : (
            <BarList
              title="Lost reasons"
              items={d.lostReasons.map((r) => {
                const label = r.reason === 'unspecified' ? 'No reason given' : REASON_LABEL[r.reason]
                return { key: r.reason, name: label, label, value: r.count, color: 'bg-status-lost/80' }
              })}
            />
          )}
        </Card>
        <Card>
          <SectionTitle description="Leads added in these dates.">Where leads come from</SectionTitle>
          {d.sources.length === 0 ? (
            <p className="text-body-sm text-body">No new leads in these dates.</p>
          ) : (
            <BarList
              title="Lead sources"
              items={d.sources.map((s) => {
                const label = s.source === 'unspecified' ? 'Not recorded' : SOURCE_LABEL[s.source]
                return { key: s.source, name: label, label, value: s.count }
              })}
            />
          )}
        </Card>

        <Card className="expanded:col-span-3">
          <SectionTitle description="Call a few clients to spot-check. Undo a wrong one from its lead page.">Deals won this week</SectionTitle>
          {d.conversionsThisWeek.length === 0 ? (
            <EmptyState icon="ok" title="No deals won yet this week" className="py-6" />
          ) : (
            <ul className="-mx-2 grid grid-cols-1 expanded:grid-cols-2">
              {d.conversionsThisWeek.map((c) => (
                <li key={c.leadId}>
                  <Link to={`/leads/${c.leadId}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-secondary">
                    <Avatar name={c.leadName} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-title-sm">{c.leadName}</span>
                      <span className="block truncate text-caption text-muted">{[c.businessName, c.projectName].filter(Boolean).join(' · ')}</span>
                      <span className="block truncate text-caption text-body">
                        {c.convertedBy.name} · {formatDateTime(c.convertedAt)}
                        {c.via === 'status_change' && ' · set by hand'} · <span className="tabular-nums">{formatPhone(c.phone)}</span>
                      </span>
                    </span>
                    <Icon name="chevron-right" size={20} className="text-muted-soft" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

type TrendMeasure = 'followUps' | 'newLeads' | 'conversions' | 'revenue'
const TREND_LABEL: Record<TrendMeasure, string> = { followUps: 'Follow-ups', newLeads: 'New leads', conversions: 'Deals won', revenue: 'Revenue' }

/** Activity over the chosen dates: one measure at a time, so the chart has one axis. */
function TrendCard({ d, className }: { d: Dashboard; className?: string }) {
  const [measure, setMeasure] = useState<TrendMeasure>('followUps')
  const day = (ymd: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${ymd}T00:00:00Z`))
  const data = d.trend.map((t) => ({
    key: t.date,
    label: d.trendBucket === 'week' ? `Wk ${day(t.date)}` : day(t.date),
    value: t[measure],
    details: measure === 'conversions' && t.revenue ? `${rupees(t.revenue)} a month` : undefined,
  }))
  const total = d.trend.reduce((n, t) => n + t[measure], 0)
  return (
    <Card className={className}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-title-md">Activity</h2>
          <p className="mt-0.5 text-body-sm text-muted">
            {TREND_LABEL[measure]} per {d.trendBucket === 'week' ? 'week' : 'day'} · <span className="font-semibold text-ink">{measure === 'revenue' ? rupees(total) : total}</span>{' '}
            in total
          </p>
        </div>
        <Segmented<TrendMeasure>
          label="Measure"
          value={measure}
          onChange={setMeasure}
          options={(Object.keys(TREND_LABEL) as TrendMeasure[]).map((k) => ({ value: k, label: TREND_LABEL[k] }))}
          className="h-10 max-w-full overflow-x-auto [&>button]:px-3"
        />
      </div>
      {d.trend.length <= 1 ? (
        <p className="py-8 text-center text-body-sm text-muted">Pick a range of a few days or more to see a trend.</p>
      ) : (
        <ColumnChart title={TREND_LABEL[measure]} data={data} format={measure === 'revenue' ? rupeesShort : (n) => String(n)} />
      )}
    </Card>
  )
}

const FUNNEL_LABEL: Record<FunnelStage, string> = { created: 'Added', contacted: 'Contacted', interested: 'Interested', converted: 'Won' }

function Funnel({ funnel }: { funnel: Dashboard['funnel'] }) {
  const first = funnel[0]?.count ?? 0
  if (!first) return <p className="text-body-sm text-body">No leads added in these dates.</p>
  return (
    <BarList
      title="Funnel"
      max={first}
      items={funnel.map((f) => ({
        key: f.stage,
        name: FUNNEL_LABEL[f.stage],
        label: FUNNEL_LABEL[f.stage],
        value: f.count,
        note: f.stage === 'created' ? undefined : `${Math.round((f.count / first) * 100)}%`,
      }))}
    />
  )
}

const ATTENTION: Record<AttentionKind, { icon: IconName; tone: string; title: string }> = {
  behind_target: { icon: 'goal', tone: 'bg-warning-soft text-warning', title: 'Behind target pace' },
  overdue_pile: { icon: 'high-priority', tone: 'bg-danger-soft text-down', title: 'Overdue piling up' },
  idle: { icon: 'clock', tone: 'bg-default text-ink', title: 'Quiet for a while' },
  stale_transfer: { icon: 'swap', tone: 'bg-accent-soft text-primary', title: 'Handover waiting' },
  help_request: { icon: 'help', tone: 'bg-danger-soft text-down', title: 'Asked for help' },
}

/** Who needs a nudge or a hand right now (not the date range): the list a manager acts on. */
function NeedsAttention({ items }: { items: Dashboard['needsAttention'] }) {
  return (
    <Card>
      <SectionTitle description="Right now, most urgent first.">Needs attention</SectionTitle>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-body-sm text-body">
          <Icon name="checkmark" size={20} className="text-up" /> All on track. Nothing needs you right now.
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {items.map((a, i) => {
            const k = ATTENTION[a.kind]
            const to = a.leadId ? `/leads/${a.leadId}` : a.kind === 'stale_transfer' ? '/transfers' : a.user ? `/people/${a.user.id}` : undefined
            const body = (
              <>
                <span className={cn('flex size-9 flex-none items-center justify-center rounded-full', k.tone)}>
                  <Icon name={k.icon} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-title-sm">{a.user?.name ?? k.title}</span>
                  <span className="block text-caption text-body">{a.detail}</span>
                  <span className="block truncate text-caption text-muted">{[k.title, a.projectName].filter(Boolean).join(' · ')}</span>
                </span>
              </>
            )
            return (
              <li key={`${a.kind}-${a.user?.id ?? i}-${i}`}>
                {to ? (
                  <Link to={to} className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-secondary">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 px-2 py-2.5">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

type RankBy = 'conversions' | 'revenue' | 'followUps' | 'newLeads'
const RANK_LABEL: Record<RankBy, string> = { conversions: 'Won', revenue: 'Revenue', followUps: 'Follow-ups', newLeads: 'New leads' }
const rankValue = (by: RankBy, n: number) => (by === 'revenue' ? rupeesShort(n) : String(n))

/**
 * Who is doing what in these dates, ranked. A list rather than a table so it reads on a
 * phone without sideways scrolling; the metric to rank by is one tap away.
 */
function Leaderboard({ people, date }: { people: Dashboard['people']; date: string }) {
  const [by, setBy] = useState<RankBy>('conversions')
  const ranked = [...people].sort((a, b) => b[by] - a[by] || b.followUps - a.followUps || a.user.name.localeCompare(b.user.name))
  const top = Math.max(1, ...ranked.map((p) => p[by]))

  return (
    <Card className="p-0 expanded:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 expanded:px-6 expanded:pt-6">
        <h2 className="text-title-md">Leaderboard · {plural(people.length, 'person', 'people')}</h2>
        {people.length > 1 && (
          <Segmented
            label="Rank by"
            value={by}
            onChange={setBy}
            options={(Object.keys(RANK_LABEL) as RankBy[]).map((k) => ({ value: k, label: RANK_LABEL[k] }))}
            className="h-10 max-w-full overflow-x-auto [&>button]:px-3"
          />
        )}
      </div>
      {people.length === 0 ? (
        <p className="px-5 pt-3 pb-5 text-body-sm text-body">No activity in these dates.</p>
      ) : (
        <ol className="mt-3 pb-2">
          {ranked.map((p, i) => (
            <li key={p.user.id} className="border-t border-separator">
              <Link to={`/people/${p.user.id}?date=${date}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-secondary expanded:px-6">
                <span
                  className={cn(
                    'flex size-7 flex-none items-center justify-center rounded-full text-caption-strong tabular-nums',
                    i === 0 && p[by] > 0 ? 'bg-warning-soft text-ink' : 'text-muted',
                  )}
                >
                  {i + 1}
                </span>
                <Avatar name={p.user.name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-title-sm">{p.user.name}</span>
                  <span className="block truncate text-caption text-body">
                    {(Object.keys(RANK_LABEL) as RankBy[])
                      .filter((k) => k !== by)
                      .map((k) => `${rankValue(k, p[k])} ${RANK_LABEL[k].toLowerCase()}`)
                      .join(' · ')}
                  </span>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-pill bg-default">
                    <span className="block h-full rounded-pill bg-primary" style={{ width: `${(p[by] / top) * 100}%` }} />
                  </span>
                </span>
                <span className="flex w-20 flex-none flex-col items-end">
                  <span className="text-title-md tabular-nums">{rankValue(by, p[by])}</span>
                  <span className="text-caption text-muted">{RANK_LABEL[by].toLowerCase()}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      <Link to="/people?view=scorecard" className="flex items-center gap-1 border-t border-separator px-5 py-3 text-body-sm font-semibold text-primary hover:underline expanded:px-6">
        Team scorecard for the month
        <Icon name="chevron-right" size={16} />
      </Link>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 expanded:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
    </div>
  )
}

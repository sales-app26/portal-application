import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Avatar, Card, EmptyState, ErrorState, ListSkeleton, Tag } from '@/components/ui/Display'
import { Picker } from '@/components/ui/Picker'
import { useWindowClass } from '@/hooks/useWindowClass'
import { Icon } from '@/icons'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { downloadCsv } from '@/lib/download'
import { plural, rupees, todayIST } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import type { ScorecardNumbers, ScorecardRow } from '@/lib/types'
import { compareBy, DEFINITIONS, MEASURES, reasonLabel, show, SORT_CHOICES, type SortKey } from './measures'
import { daysIn, describePeriod, EXPORT_MAX_DAYS, periodParams, readPeriod, reviewHref, type ReviewPeriod } from './period'
import { PeriodBar } from './PeriodBar'
import { useScorecard } from './queries'
import './performance.css'

/**
 * Every sales rep side by side for a month, a quarter or any dates: what they did, what they
 * won, against target, and what is overdue now. A sortable table on a laptop, ranked cards
 * on a phone; a rep opens their review. `keep` holds the address parameters of the screen
 * it sits in (People's `view`).
 */
export function TeamScorecard({ keep = {} }: { keep?: Record<string, string> }) {
  const navigate = useNavigate()
  const today = todayIST()
  const [params, setParams] = useSearchParams()
  const period = readPeriod(params, today)
  const projectId = params.get('projectId') ?? undefined
  const wide = ['expanded', 'large'].includes(useWindowClass())
  const [sort, setSort] = useState<{ key: SortKey; dir: 'desc' | 'asc' }>({ key: 'dealsWon', dir: 'desc' })

  const go = (next: { period?: ReviewPeriod; projectId?: string | null }) => {
    const p = next.period ?? period
    const project = next.projectId === undefined ? projectId : (next.projectId ?? undefined)
    setParams({ ...keep, ...periodParams(p), ...(project ? { projectId: project } : {}) }, { replace: true })
  }

  const q = useScorecard({ from: period.from, to: period.to, projectId })
  const s = q.data
  const rows = s ? [...s.rows].sort(compareBy(sort.key, sort.dir)) : []
  const open = (r: ScorecardRow) => navigate(reviewHref(r.user.id, period))

  const download = async () => {
    if (daysIn(period.from, period.to) > EXPORT_MAX_DAYS) {
      haptic.error()
      return toast.error(`A downloaded scorecard can cover at most ${EXPORT_MAX_DAYS} days.`)
    }
    const t = toast.loading('Preparing the scorecard…')
    try {
      const name = await downloadCsv('/exports/scorecard', { from: period.from, to: period.to, projectId })
      toast.success(`Saved ${name}`, { id: t })
    } catch (err) {
      haptic.error()
      toast.error(err instanceof ApiError ? err.message : "Couldn't prepare the scorecard. Please try again.", { id: t })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PeriodBar value={period} onChange={(p) => go({ period: p })} projectId={projectId} onProjectChange={(id) => go({ projectId: id ?? null })} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-body" aria-live="polite">
          <span className="font-semibold text-ink">{describePeriod(period)}</span>
          {s && <> · {plural(s.rows.length, 'sales rep')}</>}
        </p>
        <Button variant="secondary" size="sm" icon="csv" onClick={() => void download()}>
          Download scorecard
        </Button>
      </div>

      {q.isLoading ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : !s || s.rows.length === 0 ? (
        <EmptyState
          icon="statistics"
          title="No sales reps here yet"
          body="Add sales reps to a campaign and their numbers show up here."
          className="card card--default rounded-2xl"
        />
      ) : wide ? (
        <ScorecardTable rows={rows} totals={s.totals} averages={s.averages} sort={sort} onSort={setSort} onOpen={open} period={period} />
      ) : (
        <>
          <TeamCard totals={s.totals} averages={s.averages} />
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-title-sm">Ranked by {MEASURES[sort.key].label.toLowerCase()}</h2>
            <div className="w-44 flex-none">
              <Picker<SortKey>
                label="Sort by"
                value={sort.key}
                onChange={(key) => setSort({ key, dir: MEASURES[key].lowerIsBetter ? 'asc' : 'desc' })}
                options={SORT_CHOICES.map((k) => ({ value: k, label: MEASURES[k].label }))}
              />
            </div>
          </div>
          <RankedCards rows={rows} sortKey={sort.key} period={period} />
        </>
      )}

      {s && s.rows.length > 0 && (
        <div className="flex flex-col gap-1 text-caption text-muted">
          <p>{DEFINITIONS.conversion}</p>
          <p>{DEFINITIONS.activeDays}</p>
          <p>
            {DEFINITIONS.target} {DEFINITIONS.now}
          </p>
        </div>
      )}
    </div>
  )
}

type Column = { key: SortKey; heading: string; cell: (n: ScorecardNumbers, row?: ScorecardRow) => ReactNode }

const COLUMNS: Column[] = [
  {
    key: 'dealsWon',
    heading: 'Deals won',
    cell: (n) => (
      <>
        {show('dealsWon', n.dealsWon)}
        {n.avgDaysToWin !== null && <span className="sc-sub">{formatCount(n.avgDaysToWin)} days to win</span>}
      </>
    ),
  },
  { key: 'wonRevenue', heading: 'Revenue won', cell: (n) => <span title={rupees(n.wonRevenue)}>{show('wonRevenue', n.wonRevenue)}</span> },
  {
    key: 'targetPercent',
    heading: 'Target',
    cell: (n) =>
      n.target === null ? (
        '—'
      ) : (
        <>
          {show('targetPercent', n.targetPercent)}
          <span className="sc-sub">
            {formatCount(n.achieved)} of {formatCount(n.target)}
          </span>
        </>
      ),
  },
  {
    key: 'conversionPercent',
    heading: 'Conversion',
    cell: (n, row) => (
      <>
        {show('conversionPercent', n.conversionPercent)}
        <span className="sc-sub" title={reasonLabel(row?.topLostReason ?? null) ?? undefined}>
          {formatCount(n.lostLeads)} lost
        </span>
      </>
    ),
  },
  { key: 'followUps', heading: 'Follow-ups', cell: (n) => show('followUps', n.followUps) },
  { key: 'visits', heading: 'Visits', cell: (n) => show('visits', n.visits) },
  { key: 'leadsAdded', heading: 'Leads added', cell: (n) => show('leadsAdded', n.leadsAdded) },
  {
    key: 'activeDays',
    heading: 'Active days',
    cell: (n) => (
      <>
        {formatCount(n.activeDays)} of {formatCount(n.workingDays)}
        {n.leaveDays > 0 && <span className="sc-sub">{formatCount(n.leaveDays)} on leave</span>}
      </>
    ),
  },
  {
    key: 'overdueNow',
    heading: 'Overdue now',
    cell: (n) => (
      <>
        {formatCount(n.overdueNow)}
        <span className="sc-sub">of {formatCount(n.openNow)} open</span>
      </>
    ),
  },
]

const formatCount = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** Laptop: one line per rep, every heading sorts, the team total and the average rep at the foot. */
function ScorecardTable({
  rows,
  totals,
  averages,
  sort,
  onSort,
  onOpen,
  period,
}: {
  rows: ScorecardRow[]
  totals: ScorecardNumbers
  averages: ScorecardNumbers | null
  sort: { key: SortKey; dir: 'desc' | 'asc' }
  onSort: (s: { key: SortKey; dir: 'desc' | 'asc' }) => void
  onOpen: (r: ScorecardRow) => void
  period: ReviewPeriod
}) {
  const toggle = (key: SortKey) =>
    onSort(sort.key === key ? { key, dir: sort.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: MEASURES[key].lowerIsBetter ? 'asc' : 'desc' })

  return (
    <div className="card card--default gap-0 rounded-2xl p-0">
      <div className="sc-scroll">
        <table className="sc-table">
          <caption className="sr-only">Team scorecard, {describePeriod(period)}. Select a heading to sort.</caption>
          <thead>
            <tr>
              <th scope="col" className="sc-name">
                Sales rep
              </th>
              {COLUMNS.map((c) => {
                const active = sort.key === c.key
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined}>
                    <button type="button" className="sc-sort" data-active={active || undefined} onClick={() => toggle(c.key)}>
                      {c.heading}
                      {active && <Icon name={sort.dir === 'desc' ? 'expand-arrow' : 'collapse-arrow'} size={14} />}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.user.id} onClick={() => onOpen(r)}>
                <td className="sc-name">
                  <span className="sc-rank">{i + 1}</span>
                  <Link to={reviewHref(r.user.id, period)} className="font-semibold text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                    {r.user.name}
                  </Link>
                  {!r.isActive && <Tag className="ml-2">Left the team</Tag>}
                  <span className="sc-sub">{r.campaigns.join(', ')}</span>
                </td>
                {COLUMNS.map((c) => (
                  <td key={c.key}>{c.cell(r, r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="sc-name">Team total</td>
              {COLUMNS.map((c) => (
                <td key={c.key}>{c.cell(totals)}</td>
              ))}
            </tr>
            {averages && (
              <tr>
                <td className="sc-name">Average sales rep</td>
                {COLUMNS.map((c) => (
                  <td key={c.key}>{c.cell(averages)}</td>
                ))}
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    </div>
  )
}

/** Phone: the team at a glance above the ranked list. */
function TeamCard({ totals, averages }: { totals: ScorecardNumbers; averages: ScorecardNumbers | null }) {
  const items: [string, string][] = [
    ['Deals won', show('dealsWon', totals.dealsWon)],
    ['Revenue won', show('wonRevenue', totals.wonRevenue)],
    ['Target', show('targetPercent', totals.targetPercent)],
    ['Conversion', show('conversionPercent', totals.conversionPercent)],
  ]
  return (
    <Card className="p-4">
      <h2 className="text-title-sm">Team total</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {items.map(([label, value]) => (
          <p key={label}>
            <span className="block text-title-md tabular-nums">{value}</span>
            <span className="block text-caption text-muted">{label}</span>
          </p>
        ))}
      </div>
      {averages && (
        <p className="mt-3 text-caption text-body">
          Average sales rep: {formatCount(averages.dealsWon)} won · {show('wonRevenue', averages.wonRevenue)} · {formatCount(averages.followUps)} follow-ups ·{' '}
          {formatCount(averages.visits)} visits
        </p>
      )}
    </Card>
  )
}

function RankedCards({ rows, sortKey, period }: { rows: ScorecardRow[]; sortKey: SortKey; period: ReviewPeriod }) {
  const tiles: SortKey[] = (['dealsWon', 'wonRevenue', 'targetPercent', 'followUps', 'visits', 'activeDays'] as SortKey[]).filter((k) => k !== sortKey).slice(0, 5)
  return (
    <ol className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <li key={r.user.id}>
          <Link to={reviewHref(r.user.id, period)} className="card card--default pressable gap-3 rounded-2xl p-4">
            <span className="flex items-center gap-3">
              <span className={cn('flex size-7 flex-none items-center justify-center rounded-full text-caption-strong tabular-nums', i === 0 ? 'bg-warning-soft text-ink' : 'text-muted')}>
                {i + 1}
              </span>
              <Avatar name={r.user.name} size={40} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-title-sm">{r.user.name}</span>
                  {!r.isActive && <Tag>Left the team</Tag>}
                </span>
                <span className="block truncate text-caption text-muted">{r.campaigns.join(', ')}</span>
              </span>
              <span className="flex flex-none flex-col items-end">
                <span className="text-title-md tabular-nums">{show(sortKey, r[sortKey])}</span>
                <span className="text-caption text-muted">{MEASURES[sortKey].short.toLowerCase()}</span>
              </span>
            </span>
            <span className="grid grid-cols-3 gap-2 text-center">
              {tiles.map((k) => (
                <span key={k} className="rounded-xl bg-surface-secondary px-2 py-2">
                  <span className="block text-title-sm tabular-nums">{k === 'activeDays' ? `${r.activeDays}/${r.workingDays}` : show(k, r[k])}</span>
                  <span className="block text-caption text-muted">{MEASURES[k].short}</span>
                </span>
              ))}
              <span className="rounded-xl bg-surface-secondary px-2 py-2">
                <span className={cn('block text-title-sm tabular-nums', r.overdueNow > 0 && 'text-down')}>{r.overdueNow}</span>
                <span className="block text-caption text-muted">Overdue now</span>
              </span>
            </span>
            {(r.leaveDays > 0 || r.topLostReason) && (
              <span className="text-caption text-body">
                {[r.leaveDays > 0 ? `${plural(r.leaveDays, 'day')} on leave` : null, r.topLostReason ? `Lost mostly to: ${reasonLabel(r.topLostReason)}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ol>
  )
}

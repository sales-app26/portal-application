import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useMe } from '@/auth/AuthProvider'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Choice'
import { Card, EmptyState, ErrorState, Skeleton, StatTile } from '@/components/ui/Display'
import { ColumnChart } from '@/components/charts/ColumnChart'
import { Button } from '@/components/ui/Button'
import { useSummary } from '@/features/timeline/queries'
import { cn } from '@/lib/cn'
import { plural, todayIST } from '@/lib/format'
import { periodLabel, periodOf, shiftPeriod, weekdayIndex, type PeriodKind } from '@/lib/periods'
import type { DaySummary } from '@/lib/types'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const dayTitle = (d: string) => new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))
const dayNumber = (d: string) => Number(d.slice(8))

/** What one day amounts to, for the tooltip and the screen reader. */
const describeDay = (d: DaySummary) => {
  const bits = [plural(d.followUps, 'follow-up'), d.visits ? plural(d.visits, 'visit') : null, d.newLeads ? `${d.newLeads} added` : null, d.conversions ? plural(d.conversions, 'conversion') : null, d.statusChanges ? plural(d.statusChanges, 'status change') : null].filter(Boolean)
  return d.followUps + d.statusChanges === 0 ? 'nothing logged' : bits.join(', ')
}

/**
 * One person's week or month, day by day; a day opens its timeline.
 * Admins open anyone from People; with `self`, a rep sees their own ("My performance").
 */
export function PersonSummaryPage({ self = false }: { self?: boolean }) {
  const me = useMe()
  const params0 = useParams()
  const id = self ? me.id : (params0.id ?? '')
  const dayHref = (date?: string) => (self ? `/day${date ? `?date=${date}` : ''}` : `/people/${id}/day${date ? `?date=${date}` : ''}`)
  const [params, setParams] = useSearchParams()
  const today = todayIST()
  const kind: PeriodKind = params.get('period') === 'month' ? 'month' : 'week'
  const requested = params.get('date')
  const anchor = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today
  const period = periodOf(kind, anchor)
  const hasNext = shiftPeriod(period, 1).from <= today

  const go = (next: { kind: PeriodKind; from: string }) => setParams({ period: next.kind, date: next.from > today ? today : next.from }, { replace: true })
  const q = useSummary(id, period.from, period.to)
  const s = q.data

  return (
    <Page title={self ? 'My performance' : 'Summary'} back={self ? undefined : '/people'} wide>
      <div className="flex flex-col gap-6 expanded:max-w-[900px]">
        <div className="flex flex-col gap-4">
          {s && !self && <h2 className="text-title-md">{s.user.name}</h2>}
          <div className="flex flex-wrap items-center gap-3">
            <Segmented<PeriodKind>
              label="Period"
              value={kind}
              onChange={(k) => go({ kind: k, from: anchor })}
              options={[
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
              className="w-full medium:w-auto"
            />
            <div className="flex flex-1 items-center justify-between gap-1 medium:flex-none medium:gap-3">
              <IconButton icon="back" label={kind === 'week' ? 'Previous week' : 'Previous month'} onClick={() => go(shiftPeriod(period, -1))} />
              <p className="min-w-40 text-center text-title-sm" aria-live="polite">
                {periodLabel(period)}
              </p>
              <IconButton icon="forward" label={kind === 'week' ? 'Next week' : 'Next month'} disabled={!hasNext} className="disabled:opacity-30" onClick={() => go(shiftPeriod(period, 1))} />
            </div>
          </div>
        </div>

        {q.isLoading ? (
          <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 expanded:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : s ? (
          <>
            <div className="grid grid-cols-2 gap-3 expanded:grid-cols-4">
              <StatTile label="Follow-ups" value={s.totals.followUps} />
              <StatTile label="Visits with photo" value={s.totals.visits} />
              <StatTile label="Leads added" value={s.totals.newLeads} />
              <StatTile label="Conversions" value={s.totals.conversions} />
            </div>
            <SummaryChart days={s.days} today={today} kind={kind} />
            <p className="text-body-sm text-body" aria-live="polite">
              Active on {s.totals.activeDays} of {plural(s.days.filter((d) => d.date <= today).length, 'day')}
              {s.totals.statusChanges > 0 && ` · ${plural(s.totals.statusChanges, 'status change')}`}
            </p>

            {s.totals.followUps + s.totals.statusChanges === 0 ? (
              <EmptyState icon="timeline" title={kind === 'week' ? 'Nothing logged this week' : 'Nothing logged this month'} body="Days with entries show up here as soon as there are some." className="card card--default rounded-2xl" />
            ) : kind === 'week' ? (
              <WeekRows dayHref={dayHref} days={s.days} today={today} />
            ) : (
              <MonthGrid dayHref={dayHref} days={s.days} today={today} />
            )}

            <Button asChild variant="secondary" className="self-start">
              <Link to={dayHref()}>Open today's timeline</Link>
            </Button>
          </>
        ) : null}
      </div>
    </Page>
  )
}

type Measure = 'followUps' | 'visits' | 'newLeads' | 'conversions'
const MEASURE_LABEL: Record<Measure, string> = { followUps: 'Follow-ups', visits: 'Visits', newLeads: 'New', conversions: 'Won' }
const MEASURE_DESC: Record<Measure, string> = { followUps: 'Follow-ups', visits: 'Visits with photo', newLeads: 'Leads added', conversions: 'Conversions' }

/** Day by day for the week or month: one measure at a time, so the chart keeps one axis. */
function SummaryChart({ days, today, kind }: { days: DaySummary[]; today: string; kind: PeriodKind }) {
  const [measure, setMeasure] = useState<Measure>('followUps')
  const label = (d: string) =>
    kind === 'week' ? WEEKDAYS[weekdayIndex(d)] : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))
  const shown = days.filter((d) => d.date <= today)
  const best = shown.reduce((m, d) => Math.max(m, d[measure]), 0)
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-title-md">Activity</h2>
          <p className="mt-0.5 text-body-sm text-muted">
            {MEASURE_DESC[measure]} per day{best > 0 && <> · best day <span className="font-semibold text-ink">{best}</span></>}
          </p>
        </div>
        <Segmented<Measure> label="Measure" value={measure} onChange={setMeasure} options={(Object.keys(MEASURE_LABEL) as Measure[]).map((k) => ({ value: k, label: MEASURE_LABEL[k] }))} className="h-10 max-w-full overflow-x-auto [&>button]:px-3" />
      </div>
      <ColumnChart title={MEASURE_DESC[measure]} data={days.map((d) => ({ key: d.date, label: label(d.date), value: d.date <= today ? d[measure] : 0 }))} />
    </Card>
  )
}

function WeekRows({ dayHref, days, today }: { dayHref: (date: string) => string; days: DaySummary[]; today: string }) {
  // A week still in progress lists the days so far; days to come have nothing to show.
  const shown = days.filter((d) => d.date <= today)
  const max = Math.max(1, ...shown.map((d) => d.followUps))
  return (
    <ul className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
      {shown.map((d) => (
        <li key={d.date} className="border-b border-hairline-soft last:border-b-0">
          <Link to={dayHref(d.date)} className="flex min-h-16 items-center gap-3 px-4 py-2 active:bg-surface-soft expanded:hover:bg-surface-soft">
            <span className="w-24 flex-none">
              <span className={cn('block text-title-sm', d.date === today && 'text-primary')}>{WEEKDAYS[weekdayIndex(d.date)]}</span>
              <span className="block text-caption text-muted">{new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d.date}T00:00:00Z`))}</span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span aria-hidden className="h-2 overflow-hidden rounded-pill bg-surface-strong">
                <span className="block h-full rounded-pill bg-primary" style={{ width: `${(d.followUps / max) * 100}%` }} />
              </span>
              <span className="truncate text-caption text-body">{describeDay(d)}</span>
            </span>
            <span className="w-8 flex-none text-right tabular-nums text-number">{d.followUps}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Calendar grid, Monday first; a darker cell is a busier day. */
function MonthGrid({ dayHref, days, today }: { dayHref: (date: string) => string; days: DaySummary[]; today: string }) {
  const max = Math.max(1, ...days.map((d) => d.followUps))
  const blanks = weekdayIndex(days[0].date)
  const shade = (n: number) => {
    const r = n / max
    return n === 0 ? 'bg-surface-strong text-body' : r <= 0.25 ? 'bg-ink/15 text-ink' : r <= 0.5 ? 'bg-ink/35 text-ink' : r <= 0.75 ? 'bg-ink/65 text-on-ink' : 'bg-ink text-on-ink'
  }
  return (
    <div className="card card--default gap-0 rounded-2xl p-3 medium:p-4">
      <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-caption-strong text-muted uppercase" aria-hidden>
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: blanks }, (_, i) => (
          <span key={`b${i}`} aria-hidden />
        ))}
        {days.map((d) => {
          const future = d.date > today
          return future ? (
            <span key={d.date} aria-hidden className="aspect-square rounded-md border border-dashed border-hairline" />
          ) : (
            <Link
              key={d.date}
              to={dayHref(d.date)}
              className={cn('pressable flex aspect-square flex-col items-center justify-center rounded-md', shade(d.followUps + (d.followUps === 0 ? d.statusChanges : 0)))}
            >
              <span className="sr-only">
                {dayTitle(d.date)}: {describeDay(d)}
              </span>
              <span aria-hidden className={cn('text-caption', d.date === today && 'font-semibold underline underline-offset-2')}>
                {dayNumber(d.date)}
              </span>
              <span aria-hidden className="tabular-nums text-caption-strong">
                {d.followUps === 0 ? '' : d.followUps}
              </span>
            </Link>
          )
        })}
      </div>
      <p className="mt-3 text-caption text-muted">Numbers are follow-ups logged that day. Tap a day to see its timeline.</p>
    </div>
  )
}

import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Page } from '@/components/layout/Page'
import { BarList } from '@/components/charts/BarList'
import { ColumnChart } from '@/components/charts/ColumnChart'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Choice'
import { Card, EmptyState, ErrorState, SectionTitle, Skeleton, Tag } from '@/components/ui/Display'
import { DEFINITIONS, MEASURES, money, planLabel, reasonLabel, type SortKey } from '@/features/performance/measures'
import { describePeriod, periodParams, readPeriod, type ReviewPeriod } from '@/features/performance/period'
import { PeriodBar } from '@/features/performance/PeriodBar'
import { useRepReview } from '@/features/performance/queries'
import { Icon } from '@/icons'
import { formatDate, formatDateTime, plural, ROLE_LABEL, rupees, SOURCE_LABEL, todayIST } from '@/lib/format'
import type { FunnelStage, RepReview, ScorecardNumbers } from '@/lib/types'
import '@/features/performance/performance.css'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FUNNEL_LABEL: Record<FunnelStage, string> = { created: 'Added', contacted: 'Contacted', interested: 'Interested', converted: 'Won' }
const shortDay = (ymd: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${ymd}T00:00:00Z`))
const istDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso))
const count = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/**
 * One sales rep's month (or quarter, or any dates) for a review conversation: the headline
 * numbers beside the team average, the trend, where leads came from and went, what was won,
 * and the feedback given. Prints as a one-page review.
 */
export function RepReviewPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const today = todayIST()
  const period = readPeriod(params, today)
  const q = useRepReview(id, { from: period.from, to: period.to })
  const r = q.data

  return (
    <Page title="Performance review" back="/people?view=scorecard" wide>
      <div className="review-print flex flex-col gap-6 expanded:max-w-[1100px]">
        <div className="flex flex-col gap-1">
          {r ? (
            <>
              <p className="print-only text-caption text-muted">Performance review · printed {formatDate(today, { withYear: true })} from Pronttera Sales</p>
              <h2 className="text-title-lg">{r.person.name}</h2>
              <p className="text-body-sm text-body">
                {[ROLE_LABEL[r.person.role], r.person.campaigns.join(', ') || null, describePeriod(period)].filter(Boolean).join(' · ')}
                {!r.person.isActive && (
                  <Tag className="ml-2">Left the team</Tag>
                )}
              </p>
            </>
          ) : (
            <Skeleton className="h-9 w-56" />
          )}
        </div>

        <div className="no-print flex flex-col gap-4">
          <PeriodBar value={period} onChange={(p: ReviewPeriod) => setParams(periodParams(p), { replace: true })} />
          <div className="flex flex-wrap gap-3">
            <Button variant="soft" icon="comment" onClick={() => navigate(`/people/${id}/day`)}>
              Give feedback
            </Button>
            <Button variant="secondary" icon="share" onClick={() => window.print()} disabled={!r}>
              Print / save as PDF
            </Button>
            <Button variant="tertiary" onClick={() => navigate(`/people/${id}`)}>
              Week and month
            </Button>
          </div>
        </div>

        {q.isLoading ? (
          <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 expanded:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : r ? (
          <ReviewBody r={r} />
        ) : null}
      </div>
    </Page>
  )
}

function ReviewBody({ r }: { r: RepReview }) {
  const n = r.numbers
  const avg = r.teamAverage
  const nothing = n.followUps + n.leadsAdded + n.dealsWon + n.lostLeads === 0

  return (
    <>
      {nothing && <p className="rounded-2xl bg-accent-soft px-4 py-3 text-body-sm text-accent-soft-foreground">No sales activity in these dates.</p>}

      <section aria-label="Headline numbers" className="review-tiles grid grid-cols-2 gap-3 medium:grid-cols-3 expanded:grid-cols-4">
        <Tile k="dealsWon" n={n} avg={avg} />
        <Tile k="wonRevenue" n={n} avg={avg} hint={n.wonRevenue ? `${rupees(n.wonRevenue)} a month` : undefined} />
        <Tile k="targetPercent" n={n} avg={avg} hint={n.target === null ? 'No target in these campaigns' : `${count(n.achieved)} of ${count(n.target)} deals`} />
        <Tile k="conversionPercent" n={n} avg={avg} hint={`${n.dealsWon} won, ${count(n.lostLeads)} lost`} />
        <Tile k="followUps" n={n} avg={avg} />
        <Tile k="visits" n={n} avg={avg} />
        <Tile k="leadsAdded" n={n} avg={avg} />
        <Tile
          k="activeDays"
          n={n}
          avg={avg}
          value={`${n.activeDays} of ${n.workingDays}`}
          hint={n.leaveDays ? `${plural(n.leaveDays, 'day')} on leave, not counted` : 'No leave in these dates'}
        />
        <Tile k="avgDaysToWin" n={n} avg={avg} hint="From added to won" />
        <Tile k="overdueNow" n={n} avg={avg} hint={`Of ${plural(n.openNow, 'open lead')} now`} />
        <Tile k="lostLeads" n={n} avg={avg} neutral hint={n.topLostReason ? `Mostly: ${reasonLabel(n.topLostReason)}` : undefined} />
        <HandoverTile n={n} avg={avg} />
      </section>
      <p className="-mt-3 text-caption text-muted">
        Team average: the average of the {plural(r.teamSize, 'sales rep')} in your campaigns, for the same dates.
      </p>

      <div className="review-grid grid grid-cols-1 gap-4 expanded:grid-cols-2 expanded:items-start">
        <TrendCard r={r} />
        <Card>
          <SectionTitle description="Leads added in these dates that they own or added, by how far they got.">Stages reached</SectionTitle>
          {r.funnel[0]?.count ? (
            <BarList
              title="Stages reached"
              max={r.funnel[0].count}
              items={r.funnel.map((f) => ({
                key: f.stage,
                name: FUNNEL_LABEL[f.stage],
                label: FUNNEL_LABEL[f.stage],
                value: f.count,
                note: f.stage === 'created' ? undefined : `${Math.round((f.count / r.funnel[0].count) * 100)}%`,
              }))}
            />
          ) : (
            <p className="text-body-sm text-body">No leads added in these dates.</p>
          )}
        </Card>
        <Card>
          <SectionTitle description="Follow-ups by day of the week, in these dates.">Busiest days</SectionTitle>
          <ColumnChart
            title="Follow-ups"
            height={140}
            data={r.weekdays.map((w) => ({
              key: String(w.weekday),
              label: WEEKDAYS[w.weekday],
              value: w.followUps,
              details: w.visits ? plural(w.visits, 'visit') : undefined,
            }))}
          />
        </Card>
        <Card>
          <SectionTitle description="Leads they marked Not interested or Lost.">Why leads said no</SectionTitle>
          {r.lostReasons.length === 0 ? (
            <p className="text-body-sm text-body">No lost leads in these dates.</p>
          ) : (
            <BarList
              title="Lost reasons"
              items={r.lostReasons.map((x) => {
                const label = reasonLabel(x.reason) ?? ''
                return { key: x.reason, name: label, label, value: x.count, color: 'bg-status-lost/80' }
              })}
            />
          )}
        </Card>
        <Card>
          <SectionTitle description="The same leads as the stages, by how they were found.">Where leads came from</SectionTitle>
          {r.sources.length === 0 ? (
            <p className="text-body-sm text-body">No leads added in these dates.</p>
          ) : (
            <BarList
              title="Lead sources"
              items={r.sources.map((x) => {
                const label = x.source === 'unspecified' ? 'Not recorded' : SOURCE_LABEL[x.source]
                return { key: x.source, name: label, label, value: x.count }
              })}
            />
          )}
        </Card>
        <Card>
          <SectionTitle description="Deals won in these dates, by plan.">Plans sold</SectionTitle>
          {r.planMix.length === 0 ? (
            <p className="text-body-sm text-body">No deals won in these dates.</p>
          ) : (
            <BarList
              title="Plans sold"
              items={r.planMix.map((x) => ({
                key: x.plan,
                name: planLabel(x.plan),
                label: planLabel(x.plan),
                value: x.count,
                note: x.revenue ? `${money(x.revenue)}/month` : undefined,
                color: 'bg-status-converted',
              }))}
            />
          )}
        </Card>
        <RecentWins r={r} />
        <Feedback r={r} />
      </div>

      <div className="flex flex-col gap-1 text-caption text-muted">
        <p>{DEFINITIONS.conversion}</p>
        <p>{DEFINITIONS.activeDays}</p>
        <p>
          {DEFINITIONS.target} {DEFINITIONS.now}
        </p>
      </div>
    </>
  )
}

/** A headline number with how it sits against the team average, in words as well as colour. */
function Tile({
  k,
  n,
  avg,
  value,
  hint,
  neutral,
}: {
  k: SortKey
  n: ScorecardNumbers
  avg: ScorecardNumbers | null
  value?: string
  hint?: string
  /** No better or worse (lost leads rise with effort too). */
  neutral?: boolean
}) {
  const m = MEASURES[k]
  const mine = n[k]
  const theirs = avg?.[k] ?? null
  return (
    <div className="card card--default min-w-0 items-start gap-1 rounded-2xl p-4">
      <span className="text-display-sm font-semibold tracking-tight tabular-nums">{value ?? (mine === null ? '—' : m.format(mine))}</span>
      <span className="text-body-sm leading-tight text-body">{m.label}</span>
      {hint && <span className="text-caption text-muted">{hint}</span>}
      <VsTeam mine={mine} theirs={theirs} format={m.format} lowerIsBetter={m.lowerIsBetter} neutral={neutral} />
    </div>
  )
}

function HandoverTile({ n, avg }: { n: ScorecardNumbers; avg: ScorecardNumbers | null }) {
  return (
    <div className="card card--default min-w-0 items-start gap-1 rounded-2xl p-4">
      <span className="text-display-sm font-semibold tracking-tight tabular-nums">
        {n.handoversAsked} · {n.handoversReceived}
      </span>
      <span className="text-body-sm leading-tight text-body">Handovers asked · received</span>
      <span className="vs-team" data-tone="even">
        {avg ? `Team average ${count(avg.handoversAsked)} · ${count(avg.handoversReceived)}` : 'No team average'}
      </span>
    </div>
  )
}

function VsTeam({
  mine,
  theirs,
  format,
  lowerIsBetter,
  neutral,
}: {
  mine: number | null
  theirs: number | null
  format: (n: number) => string
  lowerIsBetter?: boolean
  neutral?: boolean
}) {
  if (theirs === null) return <span className="vs-team" data-tone="even">No team average</span>
  const avgText = `team average ${format(theirs)}`
  if (mine === null || neutral) {
    return (
      <span className="vs-team" data-tone="even">
        {avgText[0].toUpperCase() + avgText.slice(1)}
      </span>
    )
  }
  // Within 5% of the average reads as level with it.
  const close = Math.abs(mine - theirs) <= Math.max(Math.abs(theirs) * 0.05, 0.05)
  if (close) {
    return (
      <span className="vs-team" data-tone="even">
        About the {avgText}
      </span>
    )
  }
  const above = mine > theirs
  const better = above !== !!lowerIsBetter
  return (
    <span className="vs-team" data-tone={better ? 'up' : 'down'}>
      <Icon name={above ? 'collapse-arrow' : 'expand-arrow'} size={14} />
      {above ? 'Above' : 'Below'} the {avgText}
    </span>
  )
}

type TrendMeasure = 'followUps' | 'visits' | 'newLeads' | 'wins'
const TREND_LABEL: Record<TrendMeasure, string> = { followUps: 'Follow-ups', visits: 'Visits', newLeads: 'Leads added', wins: 'Deals won' }

/** Day by day (week by week past a month), one measure at a time so the chart keeps one axis. */
function TrendCard({ r }: { r: RepReview }) {
  const [measure, setMeasure] = useState<TrendMeasure>('followUps')
  const weekly = r.trendBucket === 'week'
  const total = r.trend.reduce((s, p) => s + p[measure], 0)
  return (
    <Card className="review-wide expanded:col-span-2">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-title-md">Trend</h2>
          <p className="mt-0.5 text-body-sm text-muted">
            {TREND_LABEL[measure]} per {weekly ? 'week' : 'day'} · <span className="font-semibold text-ink">{total}</span> in total
          </p>
        </div>
        <Segmented<TrendMeasure>
          label="Show"
          value={measure}
          onChange={setMeasure}
          options={(Object.keys(TREND_LABEL) as TrendMeasure[]).map((k) => ({ value: k, label: TREND_LABEL[k] }))}
          className="no-print h-10 max-w-full overflow-x-auto [&>button]:px-3"
        />
      </div>
      <ColumnChart
        title={TREND_LABEL[measure]}
        data={r.trend.map((p) => ({ key: p.date, label: weekly ? `Wk ${shortDay(p.date)}` : shortDay(p.date), value: p[measure] }))}
      />
    </Card>
  )
}

function RecentWins({ r }: { r: RepReview }) {
  return (
    <Card>
      <SectionTitle description="The latest deals won in these dates.">Recent wins</SectionTitle>
      {r.recentWins.length === 0 ? (
        <EmptyState icon="ok" title="No deals won in these dates" className="py-6" />
      ) : (
        <ul className="review-wins -mx-2 flex flex-col">
          {r.recentWins.map((w) => (
            <li key={w.leadId}>
              <Link to={`/leads/${w.leadId}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-secondary">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-title-sm">{w.businessName ?? w.leadName}</span>
                  <span className="block truncate text-caption text-muted">{[w.businessName ? w.leadName : null, w.projectName].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="flex flex-none flex-col items-end">
                  <span className="text-title-sm tabular-nums">{w.dealValue === null ? '—' : rupees(w.dealValue)}</span>
                  <span className="text-caption text-muted">
                    {planLabel(w.plan)} · {formatDate(istDate(w.wonAt))}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Feedback({ r }: { r: RepReview }) {
  const { count: total, recent } = r.feedback
  return (
    <Card>
      <SectionTitle description={total ? `${plural(total, 'note')} from managers in these dates.` : 'Notes from managers on their follow-ups.'}>Feedback received</SectionTitle>
      {recent.length === 0 ? (
        <p className="text-body-sm text-body">No feedback in these dates. Open their day to give some.</p>
      ) : (
        <ul className="review-notes flex flex-col gap-3">
          {recent.map((f) => (
            <li key={f.id} className="rounded-xl bg-surface-secondary px-3 py-2.5">
              <p className="text-body-sm text-ink">{f.body}</p>
              <p className="mt-1 text-caption text-muted">
                {f.author.name} on{' '}
                <Link to={`/leads/${f.leadId}`} className="underline underline-offset-2">
                  {f.leadName}
                </Link>{' '}
                · {formatDateTime(f.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

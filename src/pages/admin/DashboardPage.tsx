import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Page } from '@/components/layout/Page'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Button, IconButton } from '@/components/ui/Button'
import { Avatar, Card, EmptyState, ErrorState, ProgressBar, SectionTitle, Skeleton, StatTile } from '@/components/ui/Display'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { DashboardFilters, presetRange } from '@/features/admin/DashboardFilters'
import { useDashboard, useProjectOptions, useUserOptions, type DashboardFilter } from '@/features/admin/queries'
import { useWindowClass } from '@/hooks/useWindowClass'
import { Icon } from '@/icons'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { downloadCsv } from '@/lib/download'
import { formatDate, formatDateTime, formatPhone, plural, STATUS_DOT, STATUS_LABEL, todayIST } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import type { Dashboard } from '@/lib/types'

const EXPORT_MAX_DAYS = 92

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
const rangeText = (f: DashboardFilter) => (f.from === f.to ? formatDate(f.from) : `${formatDate(f.from)} – ${formatDate(f.to)}`)

/** Numbers and lists for admins, scoped to their projects (PRD §5.12, flow 7.5). */
export function DashboardPage() {
  const [params, setParams] = useSearchParams()
  const split = ['expanded', 'large'].includes(useWindowClass())
  const [filtersOpen, setFiltersOpen] = useState(false)
  const today = todayIST()
  const filter: DashboardFilter = {
    from: params.get('from') && params.get('from')! <= today ? params.get('from')! : today,
    to: params.get('to') && params.get('to')! <= today ? params.get('to')! : today,
    projectId: params.get('projectId') ?? undefined,
    userId: params.get('userId') ?? undefined,
  }
  const setFilter = (f: DashboardFilter) => {
    const next: Record<string, string> = {}
    if (f.from !== today || f.to !== today) (next.from = f.from), (next.to = f.to)
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
      return toast.error('An export can cover at most 92 days.')
    }
    const t = toast.loading('Preparing export…')
    try {
      const name = await downloadCsv(`/exports/${kind}`, { from: filter.from, to: filter.to, projectId: filter.projectId, userId: filter.userId })
      toast.success(`Saved ${name}`, { id: t })
    } catch (err) {
      haptic.error()
      toast.error(err instanceof ApiError ? err.message : 'The export failed. Please try again.', { id: t })
    }
  }

  const filterSummary = [rangeText(filter), filter.projectId ? projects.data?.find((p) => p.id === filter.projectId)?.name : null, filter.userId ? people.data?.find((u) => u.id === filter.userId)?.name : null].filter(Boolean).join(' · ')

  return (
    <Page
      title="Dashboard"
      wide
      actions={
        <>
          {!split && <IconButton icon="filter" label={activeCount ? `Filters, ${activeCount} active` : 'Filters'} onClick={() => setFiltersOpen(true)} />}
          <ActionMenu
            title="Export CSV"
            label="Export"
            trigger={<IconButton icon="download" label="Export CSV" />}
            items={[
              { label: 'Export leads (CSV)', icon: 'csv', onSelect: () => void exportCsv('leads') },
              { label: 'Export follow-ups (CSV)', icon: 'csv', onSelect: () => void exportCsv('follow-ups') },
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
          <button type="button" onClick={() => setFiltersOpen(true)} className="pressable flex min-h-11 items-center gap-2 self-start rounded-pill bg-surface-strong px-4 text-nav">
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
        <ResponsiveOverlay open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters" variant="short" footer={<Button size="lg" block onClick={() => setFiltersOpen(false)}>Show results</Button>}>
          <div className="pt-1">
            <DashboardFilters value={filter} onChange={setFilter} />
          </div>
        </ResponsiveOverlay>
      )}
    </Page>
  )
}

function DashboardBody({ d, filter }: { d: Dashboard; filter: DashboardFilter }) {
  const navigate = useNavigate()
  const maxStatus = Math.max(1, ...d.leadsByStatus.map((s) => s.count))
  const noData = !!d.message

  return (
    <>
      {noData && <p className="rounded-md bg-surface-strong px-4 py-3 text-body-sm">{d.message}</p>}
      <div className="grid grid-cols-2 gap-3 expanded:grid-cols-4">
        <StatTile label="New leads" value={d.newLeads} />
        <StatTile label={filter.from === filter.to ? 'Follow-ups' : 'Follow-ups in range'} value={d.followUps} />
        <StatTile label="Follow-ups today" value={d.followUpsToday} />
        <StatTile label="Pending transfers" value={d.pendingTransfers} onClick={() => navigate('/transfers')} />
      </div>

      <div className="grid grid-cols-1 gap-6 expanded:grid-cols-2 expanded:items-start">
        <Card>
          <SectionTitle>Target vs achieved</SectionTitle>
          {d.targets.length === 0 ? (
            <p className="text-body-sm text-body">No one has a target in these projects.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {d.targets.map((t) => (
                <li key={`${t.projectId}-${t.user.id}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <Link to={`/people/${t.user.id}`} className="min-w-0 truncate text-title-sm active:underline">
                      {t.user.name}
                    </Link>
                    <span className="flex-none font-mono text-caption">
                      {t.achieved}
                      {t.targetCount ? ` / ${t.targetCount}` : ''}
                    </span>
                  </div>
                  <p className="mb-1.5 truncate text-caption text-muted">
                    {t.projectName}
                    {t.targetCount ? ` · ${t.targetPeriod === 'monthly' ? 'this month' : 'this week'}` : ' · no target'}
                  </p>
                  {t.targetCount ? <ProgressBar value={t.achieved} max={t.targetCount} label={`${t.user.name} target`} /> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

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
                  <Link to={`/people/${p.user.id}/day`} className="flex items-center gap-3 active:opacity-70">
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

        <Card>
          <SectionTitle>Leads by status</SectionTitle>
          <ul className="flex flex-col gap-3">
            {d.leadsByStatus.map((s) => (
              <li key={s.status} className="flex items-center gap-3">
                <span aria-hidden className={cn('size-2.5 flex-none rounded-full', STATUS_DOT[s.status])} />
                <span className="w-36 flex-none truncate text-body-sm">{STATUS_LABEL[s.status]}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-strong">
                  <span className="block h-full rounded-pill bg-ink" style={{ width: `${(s.count / maxStatus) * 100}%` }} />
                </span>
                <span className="w-10 flex-none text-right font-mono text-caption">{s.count}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionTitle>Conversions this week</SectionTitle>
          {d.conversionsThisWeek.length === 0 ? (
            <EmptyState icon="ok" title="No conversions yet this week" className="py-6" />
          ) : (
            <ul className="-mx-2 flex flex-col">
              {d.conversionsThisWeek.map((c) => (
                <li key={c.leadId}>
                  <Link to={`/leads/${c.leadId}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 active:bg-surface-soft">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-title-sm">{c.leadName}</span>
                      <span className="block truncate text-caption text-muted">
                        {[c.businessName, c.projectName].filter(Boolean).join(' · ')}
                      </span>
                      <span className="block truncate text-caption text-body">
                        {c.convertedBy.name} · {formatDateTime(c.convertedAt)}
                        {c.via === 'status_change' && ' · set by hand'} · <span className="font-mono">{formatPhone(c.phone)}</span>
                      </span>
                    </span>
                    <Icon name="chevron-right" size={20} className="text-muted-soft" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {d.conversionsThisWeek.length > 0 && <p className="mt-3 text-caption text-muted">Call a few clients to spot-check. Undo a wrong one from its lead page.</p>}
        </Card>
      </div>

      <section>
        <SectionTitle>People · {plural(d.people.length, 'person', 'people')}</SectionTitle>
        {d.people.length === 0 ? (
          <p className="text-body-sm text-body">No activity in these dates.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-hairline">
            <table className="w-full min-w-[480px] text-left">
              <thead className="border-b border-hairline text-caption-strong text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Person</th>
                  <th className="px-3 py-3 text-right font-semibold">New</th>
                  <th className="px-3 py-3 text-right font-semibold">Follow-ups</th>
                  <th className="px-3 py-3 text-right font-semibold">Converted</th>
                  <th className="px-4 py-3 text-right font-semibold">Today</th>
                </tr>
              </thead>
              <tbody>
                {d.people.map((p) => (
                  <tr key={p.user.id} className="border-b border-hairline-soft last:border-b-0 active:bg-surface-soft expanded:hover:bg-surface-soft">
                    <td className="px-4 py-3">
                      <Link to={`/people/${p.user.id}?date=${filter.to}`} className="text-title-sm active:underline">
                        {p.user.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-body-sm">{p.newLeads}</td>
                    <td className="px-3 py-3 text-right font-mono text-body-sm">{p.followUps}</td>
                    <td className="px-3 py-3 text-right font-mono text-body-sm">{p.conversions}</td>
                    <td className="px-4 py-3 text-right font-mono text-body-sm">{p.followUpsToday}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
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

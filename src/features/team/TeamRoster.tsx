import { useState } from 'react'
import { useNavigate } from 'react-router'
import { FilterChips } from '@/components/ui/Choice'
import { Avatar, EmptyState, ErrorState, ListSkeleton, ProgressBar, Tag } from '@/components/ui/Display'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { ChatIcon } from '@/features/leads/ContactActions'
import { Icon } from '@/icons'
import { cn } from '@/lib/cn'
import { telHref, whatsappHref } from '@/lib/contact'
import { ago, formatDate, formatTime, todayIST } from '@/lib/format'
import type { RosterRow } from '@/lib/types'
import { LeaveForm } from './LeaveForm'
import { useRoster } from './queries'

const ALL = 'all'

/** Active today, quiet today, or on leave: a dot on the avatar and a word beside it. */
function presence(r: RosterRow): { dot: string; label: string } {
  if (r.onLeave) return { dot: 'bg-muted-soft', label: `On leave until ${formatDate(r.onLeave.endsOn)}` }
  if (r.lastActivityAt && new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(r.lastActivityAt)) === todayIST())
    return { dot: 'bg-up', label: `Active today · last ${formatTime(r.lastActivityAt)}` }
  return { dot: 'bg-warning', label: r.lastActivityAt ? `Quiet today · last active ${ago(r.lastActivityAt)}` : 'No activity yet' }
}

/**
 * The live team view a manager balances work from: who is working, quiet or away, their due
 * and overdue load, target pace and backup, with Call, WhatsApp and Set leave on each row.
 */
export function TeamRoster({ projects }: { projects: { id: string; name: string }[] }) {
  const navigate = useNavigate()
  const [projectId, setProjectId] = useState<string>(projects.length === 1 ? projects[0].id : ALL)
  const roster = useRoster(projectId === ALL ? undefined : projectId)
  const [leaveFor, setLeaveFor] = useState<RosterRow | null>(null)
  const rows = roster.data ?? []
  const away = rows.filter((r) => r.onLeave).length
  const quiet = rows.filter((r) => !r.onLeave && presence(r).dot === 'bg-warning').length

  return (
    <div className="flex flex-col gap-4">
      {projects.length > 1 && (
        <FilterChips
          label="Campaign"
          value={projectId}
          onChange={setProjectId}
          options={[{ value: ALL, label: 'All my campaigns' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
        />
      )}
      {rows.length > 0 && (
        <p className="text-body-sm text-body" aria-live="polite">
          {rows.length} people · <span className="font-semibold text-ink">{rows.length - away - quiet} active today</span>
          {quiet > 0 && <> · {quiet} quiet</>}
          {away > 0 && <> · {away} on leave</>}
        </p>
      )}
      {roster.isLoading ? (
        <ListSkeleton />
      ) : roster.isError ? (
        <ErrorState message={roster.error.message} onRetry={() => void roster.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="conference-call"
          title="No one in this campaign yet"
          body="Add sales reps to a campaign and they appear here with their day."
          className="card card--default rounded-2xl"
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 expanded:grid-cols-2">
          {rows.map((r) => {
            const p = presence(r)
            return (
              <li key={r.user.id} className="card card--default gap-3 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="relative flex-none">
                    <Avatar name={r.user.name} size={44} />
                    <span className={cn('absolute right-0 bottom-0 size-3.5 rounded-full ring-2 ring-surface', p.dot)} />
                  </span>
                  <button type="button" onClick={() => navigate(`/people/${r.user.id}`)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-title-sm">{r.user.name}</span>
                      {r.role === 'moderator' && <Tag>Manager</Tag>}
                      {r.onLeave && (
                        <Tag tone="accent">
                          <Icon name="leave" size={12} className="mr-1" />
                          On leave
                        </Tag>
                      )}
                    </span>
                    <span className="block truncate text-caption text-body">{p.label}</span>
                    {r.backup && <span className="block truncate text-caption text-muted">Backup: {r.backup.name}</span>}
                  </button>
                  <div className="flex flex-none items-center gap-1">
                    {r.user.phone && (
                      <>
                        <a
                          href={telHref(r.user.phone)}
                          aria-label={`Call ${r.user.name}`}
                          className="pressable flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary"
                        >
                          <Icon name="phone" size={18} />
                        </a>
                        <a
                          href={whatsappHref(r.user.phone)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`WhatsApp ${r.user.name}`}
                          className="pressable flex size-9 items-center justify-center rounded-full bg-[#25d366]/12 text-[#128c4a] dark:text-[#3ddc84]"
                        >
                          <ChatIcon size={18} />
                        </a>
                      </>
                    )}
                    <ActionMenu
                      title={r.user.name}
                      items={[
                        { label: 'Week and month', icon: 'statistics', onSelect: () => navigate(`/people/${r.user.id}`) },
                        { label: 'View their day', icon: 'timeline', onSelect: () => navigate(`/people/${r.user.id}/day`) },
                        { label: r.onLeave || r.nextLeave ? 'Add more leave' : 'Set leave', icon: 'leave', onSelect: () => setLeaveFor(r), hidden: r.role !== 'sales_person' },
                      ]}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: 'Due today', value: r.dueToday, tone: 'text-ink' },
                    { label: 'Overdue', value: r.overdue, tone: r.overdue ? 'text-down' : 'text-ink' },
                    { label: 'Open leads', value: r.openLeads, tone: 'text-ink' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl bg-surface-secondary px-2 py-2">
                      <p className={cn('text-title-md tabular-nums', s.tone)}>{s.value}</p>
                      <p className="text-caption text-muted">{s.label}</p>
                    </div>
                  ))}
                </div>
                {r.target ? (
                  <div>
                    <p className="mb-1 flex justify-between text-caption text-body">
                      <span>Target {r.target.period === 'monthly' ? 'this month' : 'this week'}</span>
                      <span className="font-semibold text-ink tabular-nums">
                        {r.target.achieved} / {r.target.count}
                      </span>
                    </p>
                    <ProgressBar value={r.target.achieved} max={r.target.count} size="sm" label={`${r.user.name} target`} />
                  </div>
                ) : (
                  <p className="text-caption text-muted">{r.followUpsToday} follow-ups today</p>
                )}
                {r.nextLeave && !r.onLeave && (
                  <p className="text-caption text-muted">
                    Leave from {formatDate(r.nextLeave.startsOn)} to {formatDate(r.nextLeave.endsOn)}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <LeaveForm open={!!leaveFor} onOpenChange={(o) => !o && setLeaveFor(null)} person={leaveFor ? leaveFor.user : undefined} />
    </div>
  )
}

import { useState } from 'react'
import { Segmented } from '@/components/ui/Choice'
import { Avatar, Card, ErrorState, Skeleton } from '@/components/ui/Display'
import { cn } from '@/lib/cn'
import { useLeaderboard } from './queries'

/**
 * Where the rep stands in their project: the same ranking managers see (conversions, then
 * follow-ups), without revenue. Transparency both ways, and a little friendly competition.
 */
export function TeamLeaderboard({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const q = useLeaderboard(projectId, period)
  const rows = q.data?.rows ?? []
  const top = Math.max(1, ...rows.map((r) => r.conversions))
  return (
    <Card className="p-0 expanded:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 expanded:px-6 expanded:pt-6">
        <div>
          <h2 className="text-title-md">Team leaderboard</h2>
          <p className="mt-0.5 text-body-sm text-muted">{projectName}</p>
        </div>
        <Segmented
          label="Period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'week', label: 'This week' },
            { value: 'month', label: 'This month' },
          ]}
          className="h-10"
        />
      </div>
      {q.isLoading ? (
        <div className="flex flex-col gap-2 p-5">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : q.isError ? (
        <div className="p-5">
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        </div>
      ) : (
        <ol className="mt-3 pb-2">
          {rows.map((r) => (
            <li key={r.user.id} className={cn('flex items-center gap-3 border-t border-separator px-5 py-3 expanded:px-6', r.isMe && 'bg-accent-soft/50')}>
              <span
                className={cn(
                  'flex size-7 flex-none items-center justify-center rounded-full text-caption-strong tabular-nums',
                  r.rank === 1 && r.conversions > 0 ? 'bg-warning-soft text-ink' : 'text-muted',
                )}
              >
                {r.rank}
              </span>
              <Avatar name={r.user.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-title-sm">
                  {r.user.name}
                  {r.isMe && <span className="ml-1.5 text-caption-strong text-primary">You</span>}
                </span>
                <span className="block text-caption text-body tabular-nums">{r.followUps} follow-ups</span>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-pill bg-default">
                  <span className="block h-full rounded-pill bg-primary" style={{ width: `${(r.conversions / top) * 100}%` }} />
                </span>
              </span>
              <span className="flex w-16 flex-none flex-col items-end">
                <span className="text-title-md tabular-nums">{r.conversions}</span>
                <span className="text-caption text-muted">won</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

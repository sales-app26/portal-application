import { ProgressBar } from '@/components/ui/Display'
import { Icon } from '@/icons'
import { plural } from '@/lib/format'
import type { TargetProgress } from '@/lib/types'

const DAY_MS = 86_400_000

/** Days left in the period, today included. The API's periodEnd is the start of the next period. */
export function daysLeft(periodEnd: string, now = Date.now()): number {
  return Math.max(1, Math.ceil((new Date(periodEnd).getTime() - now) / DAY_MS))
}

/**
 * "12 / 20 converted this week", plus the pace to hit it: "8 to go · 5 days left · about 2 a day".
 * No target means a count and no bar (PRD §5.4).
 */
export function TargetCard({ t, showProject }: { t: TargetProgress; showProject?: boolean }) {
  const period = t.targetPeriod === 'monthly' ? 'this month' : 'this week'
  const target = t.targetCount
  const met = !!target && t.achieved >= target
  const left = daysLeft(t.periodEnd)
  const toGo = target ? Math.max(0, target - t.achieved) : 0

  return (
    <div className="flex min-w-[260px] flex-col gap-3 rounded-xl border border-hairline bg-canvas p-5">
      {showProject && <p className="truncate text-caption-strong text-muted uppercase">{t.projectName}</p>}
      {target ? (
        <>
          <div className="flex items-end justify-between gap-3">
            <p className="flex items-baseline gap-1.5">
              <span className="text-display-sm font-semibold tabular-nums">{t.achieved}</span>
              <span className="text-number text-muted">/ {target}</span>
            </p>
            <span className="text-body-sm text-body">converted {period}</span>
          </div>
          <ProgressBar value={t.achieved} max={target} label={`${t.projectName} target`} />
          {met ? (
            <p className="flex items-center gap-1.5 text-body-sm font-semibold text-up">
              <Icon name="ok" size={18} /> Target met. Every extra one counts.
            </p>
          ) : (
            <p className="text-body-sm text-body">
              <span className="font-semibold text-ink">{toGo} to go</span> · {plural(left, 'day')} left
              {left > 1 && toGo > 0 && <> · about {Math.ceil(toGo / left)} a day</>}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-display-sm font-semibold tabular-nums">{t.conversionsThisWeek}</p>
          <p className="text-body-sm text-body">converted this week · no target set</p>
        </>
      )}
    </div>
  )
}

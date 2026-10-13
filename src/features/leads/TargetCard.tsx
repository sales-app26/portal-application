import { Link } from 'react-router'
import { ProgressBar } from '@/components/ui/Display'
import { Icon } from '@/icons'
import { cn } from '@/lib/cn'
import { plural, rupees } from '@/lib/format'
import type { TargetProgress } from '@/lib/types'

const DAY_MS = 86_400_000

/** Days left in the period, today included. The API's periodEnd is the start of the next period. */
function daysLeft(periodEnd: string, now = Date.now()): number {
  return Math.max(1, Math.ceil((new Date(periodEnd).getTime() - now) / DAY_MS))
}

/**
 * The rep's target as the hero of Home: Pronttera blue, the count and the pace to hit it
 * ("8 to go · 5 days left · about 2 a day"), and revenue this month when deals carry a value.
 * No target means a count and no bar (PRD §5.4).
 */
export function TargetCard({
  t,
  showProject,
  to,
  revenue,
}: {
  t: TargetProgress
  showProject?: boolean
  /** Makes the card open this page (the rep's performance). */ to?: string
  revenue?: number | null
}) {
  const period = t.targetPeriod === 'monthly' ? 'this month' : 'this week'
  const target = t.targetCount
  const met = !!target && t.achieved >= target
  const left = daysLeft(t.periodEnd)
  const toGo = target ? Math.max(0, target - t.achieved) : 0

  const body = (
    <>
      {/* The Pronttera mark as a quiet watermark. */}
      <img src="/brand/pronttera-mark-white.svg" alt="" aria-hidden className="pointer-events-none absolute -right-6 -bottom-10 h-44 opacity-[0.09]" />
      <div className="relative flex items-center justify-between gap-3">
        <p className="text-caption-strong tracking-wide text-white/85 uppercase">{showProject ? t.projectName : target ? `Target ${period}` : `Won ${period}`}</p>
        {revenue ? <span className="rounded-pill bg-white/15 px-2.5 py-0.5 text-caption-strong text-white tabular-nums">{rupees(revenue)} this month</span> : null}
      </div>
      {target ? (
        <>
          <p className="relative flex items-baseline gap-2">
            <span className="text-[44px] leading-none font-bold tracking-tight tabular-nums">{t.achieved}</span>
            <span className="text-title-md text-white/80 tabular-nums">/ {target} won</span>
          </p>
          <ProgressBar value={t.achieved} max={target} label={`${t.projectName} target`} onAccent />
          {met ? (
            <p className="relative flex items-center gap-1.5 text-body-sm font-semibold">
              <Icon name="ok" size={18} /> Target met. Every extra one counts.
            </p>
          ) : (
            <p className="relative text-body-sm text-white/90">
              <span className="font-semibold text-white">{toGo} to go</span> · {plural(left, 'day')} left
              {left > 1 && toGo > 0 && <> · about {Math.ceil(toGo / left)} a day</>}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="relative text-[44px] leading-none font-bold tracking-tight tabular-nums">{t.conversionsThisWeek}</p>
          <p className="relative text-body-sm text-white/90">won this week · no target set</p>
        </>
      )}
      {to && (
        <span className="relative -mb-1 flex items-center gap-1 border-t border-white/15 pt-3 text-body-sm font-semibold">
          See my performance <Icon name="chevron-right" size={16} />
        </span>
      )}
    </>
  )
  const cls = cn(
    'relative isolate flex min-w-[260px] flex-col gap-3 overflow-hidden rounded-3xl p-5 text-white',
    'bg-[linear-gradient(135deg,#064f75_0%,#0a78b0_55%,#1490c9_100%)] shadow-[0_14px_34px_-14px_rgb(10_120_176/0.7)]',
  )
  return to ? (
    <Link to={to} className={cn(cls, 'pressable')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

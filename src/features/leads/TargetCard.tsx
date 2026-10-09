import { ProgressBar } from '@/components/ui/Display'
import type { TargetProgress } from '@/lib/types'

/** "12 / 20 converted · this week"; no target means a count and no bar (PRD §5.4). */
export function TargetCard({ t, showProject }: { t: TargetProgress; showProject?: boolean }) {
  const period = t.targetPeriod === 'monthly' ? 'this month' : 'this week'
  return (
    <div className="flex min-w-[260px] flex-col gap-3 rounded-xl border border-hairline bg-canvas p-5">
      {showProject && <p className="truncate text-caption-strong text-muted uppercase">{t.projectName}</p>}
      {t.targetCount ? (
        <>
          <p className="flex items-baseline gap-2">
            <span className="font-mono text-display-sm">{t.achieved}</span>
            <span className="font-mono text-number text-muted">/ {t.targetCount}</span>
          </p>
          <ProgressBar value={t.achieved} max={t.targetCount} label={`${t.projectName} target`} />
          <p className="text-body-sm text-body">
            converted {period}
            {t.achieved >= t.targetCount && <span className="font-semibold text-up"> · target met</span>}
          </p>
        </>
      ) : (
        <>
          <p className="font-mono text-display-sm">{t.conversionsThisWeek}</p>
          <p className="text-body-sm text-body">converted this week · no target set</p>
        </>
      )}
    </div>
  )
}

import { Link } from 'react-router'
import { ProgressBar } from '@/components/ui/Display'
import { Icon } from '@/icons'
import { useCampaignTraining } from './queries'

/**
 * Home's nudge until the rep is certified for the campaign: how far they've got, one tap to
 * carry on. A reminder only; nothing is blocked (the sales head can tighten this later).
 */
export function TrainingReminder({ projectId }: { projectId: string }) {
  const training = useCampaignTraining(projectId)
  const t = training.data
  if (!t || t.requiredCount === 0 || t.certifiedAt) return null
  const left = t.requiredCount - t.doneCount
  return (
    <Link to="/learn" className="pressable card card--default flex-row items-center gap-3 rounded-2xl p-4 active:bg-surface-secondary">
      <span className="flex size-10 flex-none items-center justify-center rounded-full bg-accent-soft text-primary">
        <Icon name="learn" size={20} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-title-sm">
          {t.doneCount === 0 ? 'Start your training' : `Finish your training: ${left} ${left === 1 ? 'lesson' : 'lessons'} left`}
        </span>
        <ProgressBar value={t.doneCount} max={t.requiredCount} label="Training progress" size="sm" />
      </span>
      <Icon name="chevron-right" size={18} className="flex-none text-muted" />
    </Link>
  )
}

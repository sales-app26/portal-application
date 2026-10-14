import { Link, useNavigate } from 'react-router'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, ProgressBar, Skeleton, Tag } from '@/components/ui/Display'
import { useProject } from '@/features/projects/ProjectContext'
import { ProjectSwitcher } from '@/features/projects/ProjectSwitcher'
import { allLessons, KIND_ICON, KIND_LABEL, STEPS, useCampaignTraining } from '@/features/training/queries'
import { Icon } from '@/icons'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'
import type { LearnerLesson } from '@/lib/types'

/**
 * Learn: a campaign's training as five steps (Watch, Practise, Prove, Field kit, Library),
 * with what's done ticked off and the next lesson one tap away. Reading is the last resort:
 * videos, tap-through checks, practice pitches and short cards come first.
 */
export function LearnPage() {
  const { project } = useProject()
  const navigate = useNavigate()
  const training = useCampaignTraining(project?.id)
  const t = training.data

  if (!project) {
    return (
      <Page title="Learn">
        <EmptyState icon="learn" title="You're not on any campaign yet." body="Training shows up here once your sales manager adds you to a campaign." />
      </Page>
    )
  }

  const lessons = t ? allLessons(t) : []
  // Next up follows the steps in order (watch, practise, prove, field kit), required lessons first.
  const stepOrder = (l: LearnerLesson) => STEPS.findIndex((s) => s.value === l.step)
  const open = lessons.filter((l) => !l.progress.completedAt && l.step !== 'library').sort((a, b) => stepOrder(a) - stepOrder(b))
  const next = open.find((l) => l.required) ?? open[0]

  return (
    <Page title="Learn" leading={<ProjectSwitcher />}>
      {training.isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-60 rounded-2xl" />
        </div>
      ) : training.isError ? (
        <ErrorState message={training.error.message} onRetry={() => void training.refetch()} />
      ) : !t || lessons.length === 0 ? (
        <EmptyState
          icon="learn"
          title="No training for this campaign yet"
          body="Your sales manager adds videos, practice pitches and the quiz here."
          className="card card--default rounded-2xl"
        />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 expanded:grid-cols-[minmax(280px,380px)_minmax(0,1fr)] expanded:items-start expanded:gap-8">
          <section className="card card--default gap-4 rounded-2xl bg-primary p-5 text-on-primary">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-caption-strong tracking-wide uppercase opacity-80">{t.projectName}</p>
                <p className="mt-1 text-display-sm font-semibold">
                  {t.certifiedAt ? 'Certified' : `${t.doneCount} of ${t.requiredCount} done`}
                </p>
              </div>
              <span className="flex size-12 flex-none items-center justify-center rounded-full bg-white/15">
                <Icon name={t.certifiedAt ? 'approval' : 'learn'} size={26} />
              </span>
            </div>
            <ProgressBar value={t.doneCount} max={Math.max(1, t.requiredCount)} label="Training progress" onAccent />
            <p className="text-body-sm opacity-90">
              {t.certifiedAt
                ? `You finished this campaign's training on ${formatDate(t.certifiedAt.slice(0, 10), { withYear: true })}. Keep the field kit handy on visits.`
                : 'Finish the required lessons to get certified for this campaign.'}
            </p>
            {next && (
              <Button variant="secondary" className="self-start bg-white! text-primary!" icon={KIND_ICON[next.kind]} onClick={() => navigate(`/learn/${next.id}`)}>
                {next.progress.percent > 0 ? 'Continue' : 'Next'}: {next.title}
              </Button>
            )}
          </section>

          <div className="flex flex-col gap-5">
            {STEPS.map((step) => {
              const items = lessons.filter((l) => l.step === step.value)
              if (items.length === 0) return null
              const done = items.filter((l) => l.progress.completedAt).length
              return (
                <section key={step.value} aria-labelledby={`step-${step.value}`} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3 px-1">
                    <h2 id={`step-${step.value}`} className="text-title-md">
                      {step.label}
                    </h2>
                    <span className="text-caption text-muted">{step.value === 'field' || step.value === 'library' ? step.blurb : `${done}/${items.length} · ${step.blurb}`}</span>
                  </div>
                  <ul className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
                    {items.map((l) => (
                      <LessonRow key={l.id} lesson={l} roleplayOff={l.kind === 'roleplay' && !t.roleplayEnabled} />
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        </div>
      )}
    </Page>
  )
}

function LessonRow({ lesson, roleplayOff }: { lesson: LearnerLesson; roleplayOff: boolean }) {
  const done = !!lesson.progress.completedAt
  const score = lesson.progress.bestScore
  return (
    <li className="border-b border-separator last:border-b-0">
      <Link to={`/learn/${lesson.id}`} className="pressable flex min-h-16 items-center gap-3 px-4 py-3 active:bg-default expanded:hover:bg-default">
        <span
          className={cn(
            'flex size-10 flex-none items-center justify-center rounded-full',
            done ? 'bg-success-soft text-up' : 'bg-accent-soft text-primary',
          )}
        >
          <Icon name={done ? 'checkmark' : KIND_ICON[lesson.kind]} size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-title-sm">{lesson.title}</span>
          <span className="block truncate text-body-sm text-body">
            {KIND_LABEL[lesson.kind]}
            {lesson.minutes ? ` · ${lesson.minutes} min` : ''}
            {score !== null && (lesson.kind === 'quiz' || lesson.kind === 'roleplay') ? ` · best ${score}%` : ''}
            {lesson.summary ? ` · ${lesson.summary}` : ''}
          </span>
        </span>
        {!lesson.required && lesson.step !== 'library' && lesson.step !== 'field' && <Tag>Optional</Tag>}
        {roleplayOff && <Tag tone="warning">Off</Tag>}
        <Icon name="chevron-right" size={18} className="flex-none text-muted" />
      </Link>
    </li>
  )
}

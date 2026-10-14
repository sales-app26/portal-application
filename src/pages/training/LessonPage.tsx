import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Page } from '@/components/layout/Page'
import { Button, IconButton } from '@/components/ui/Button'
import { EmptyState, ErrorState, ProgressBar, Skeleton, Tag } from '@/components/ui/Display'
import { LazyMarkdown } from '@/components/ui/LazyMarkdown'
import { isAppleTouch, useSpeech } from '@/features/leads/useSpeech'
import { useProject } from '@/features/projects/ProjectContext'
import { allLessons, invalidateTraining, KIND_LABEL, trainingKeys, useCampaignTraining, useMyPitches } from '@/features/training/queries'
import { DocumentViewer } from '@/features/training/DocumentViewer'
import { YouTubePlayer } from '@/features/training/YouTubePlayer'
import { Icon } from '@/icons'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import type {
  AttemptResult,
  CardContent,
  DocumentContent,
  LearnerLesson,
  LessonDone,
  PlaylistContent,
  QuizContent,
  QuizQuestion,
  RoleplayContent,
  RoleplaySession,
  VideoContent,
} from '@/lib/types'

/** One lesson, shown the way its kind works best: play it, tap through it, practise it. */
export function LessonPage() {
  const { lessonId } = useParams()
  const { project } = useProject()
  const training = useCampaignTraining(project?.id)
  const lesson = training.data ? allLessons(training.data).find((l) => l.id === lessonId) : undefined

  return (
    <Page title={lesson?.title ?? 'Lesson'} back="/learn">
      {training.isLoading ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : training.isError ? (
        <ErrorState message={training.error.message} onRetry={() => void training.refetch()} />
      ) : !lesson || !project ? (
        <EmptyState icon="learn" title="Lesson not found" body="It may have been removed, or it belongs to another campaign. Check the campaign in Learn." />
      ) : (
        <div className={cn('mx-auto flex w-full flex-col gap-5', lesson.kind === 'playlist' ? 'max-w-[1120px]' : 'max-w-[760px]')}>
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="accent">{KIND_LABEL[lesson.kind]}</Tag>
            {lesson.minutes && <Tag>{lesson.minutes} min</Tag>}
            {lesson.progress.completedAt && <Tag tone="up">Done</Tag>}
            {!lesson.required && <Tag>Optional</Tag>}
          </div>
          {lesson.summary && <p className="text-body-md text-body">{lesson.summary}</p>}
          {lesson.kind === 'video' && <VideoLesson lesson={lesson} projectId={project.id} />}
          {lesson.kind === 'playlist' && <PlaylistLesson lesson={lesson} projectId={project.id} />}
          {lesson.kind === 'document' && <DocumentLesson lesson={lesson} projectId={project.id} />}
          {lesson.kind === 'card' && <CardLesson lesson={lesson} projectId={project.id} />}
          {lesson.kind === 'quiz' && <QuizLesson lesson={lesson} projectId={project.id} />}
          {lesson.kind === 'roleplay' && (
            <RoleplayLesson lesson={lesson} projectId={project.id} enabled={training.data!.roleplayEnabled} leftToday={training.data!.roleplayLeftToday} />
          )}
        </div>
      )}
    </Page>
  )
}

/** The one place a finished campaign is celebrated. */
function celebrate(certifiedNow: boolean, quiet = false) {
  if (!certifiedNow) return
  if (!quiet) haptic.success()
  toast.success('You’re certified for this campaign. Well done!', { duration: 6000 })
}

function useMarkProgress(lesson: LearnerLesson, projectId: string) {
  const qc = useQueryClient()
  return async (body: { percent?: number; positionSeconds?: number; done?: boolean; moduleId?: string }, quiet = false) => {
    try {
      const res = await api<LessonDone>(`/training/items/${lesson.id}/progress`, { method: 'POST', body: { projectId, ...body } })
      if (res.progress.completedAt && !lesson.progress.completedAt) {
        // Phones only buzz after a tap; a lesson finished by reading or watching just says so.
        if (!quiet) haptic.success()
        if (!res.certifiedNow) toast.success('Lesson done.')
      }
      celebrate(res.certifiedNow, quiet)
      invalidateTraining(qc)
      return res
    } catch (err) {
      if (!quiet) handleFormError(err)
      return null
    }
  }
}

function NextButton() {
  const navigate = useNavigate()
  return (
    <Button variant="secondary" icon="back" onClick={() => navigate('/learn')}>
      Back to Learn
    </Button>
  )
}

// ---------------------------------------------------------------- video

function VideoLesson({ lesson, projectId }: { lesson: LearnerLesson; projectId: string }) {
  const c = lesson.content as unknown as VideoContent
  const mark = useMarkProgress(lesson, projectId)
  const lastSent = useRef({ at: 0, percent: lesson.progress.percent })
  const [percent, setPercent] = useState(lesson.progress.percent)
  const done = !!lesson.progress.completedAt
  const hasChecks = c.checks.length > 0

  const onProgress = (p: number, position: number) => {
    setPercent((prev) => Math.max(prev, p))
    const now = Date.now()
    const crossed = lastSent.current.percent < 90 && p >= 90
    // A post every 20 s while watching, at once when it crosses 90%, never more often.
    if (crossed || (now - lastSent.current.at > 20_000 && p > lastSent.current.percent)) {
      lastSent.current = { at: now, percent: Math.max(p, lastSent.current.percent) }
      void mark({ percent: p, positionSeconds: position }, true)
    }
  }

  return (
    <>
      <YouTubePlayer
        youtubeId={c.youtubeId}
        title={lesson.title}
        startSeconds={c.startSeconds}
        endSeconds={c.endSeconds}
        resumeAt={done ? null : lesson.progress.positionSeconds}
        onProgress={onProgress}
      />
      {!done && <ProgressBar value={percent} max={100} label="Watched" size="sm" />}
      {hasChecks ? (
        done ? (
          <DoneNote text="Watched and checked." />
        ) : (
          <QuestionSet
            title="Quick check"
            intro={percent >= 50 ? 'Answer this to finish the lesson.' : 'Watch the video, then answer this.'}
            questions={c.checks}
            lesson={lesson}
            projectId={projectId}
            passLabel="All right. Lesson done."
          />
        )
      ) : done ? (
        <DoneNote text="Watched." />
      ) : (
        <Button className="self-start" icon="checkmark" onClick={() => void mark({ done: true, percent: Math.max(percent, 90) })}>
          I’ve watched it
        </Button>
      )}
      {done && <NextButton />}
    </>
  )
}

function DoneNote({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-2xl bg-success-soft px-4 py-3 text-body-md text-ink">
      <Icon name="ok" size={20} className="text-up" />
      {text}
    </p>
  )
}

// ---------------------------------------------------------------- playlist (the app tutorial)

const MODULE_DONE = 90

/**
 * A YouTube playlist watched module by module inside the app: the player, then the modules
 * with what's watched. A module counts at 90%; the lesson is done when all of them are. When
 * one ends, the next plays. A playlist YouTube didn't list plays whole in YouTube's player.
 */
function PlaylistLesson({ lesson, projectId }: { lesson: LearnerLesson; projectId: string }) {
  const c = lesson.content as unknown as PlaylistContent
  const mark = useMarkProgress(lesson, projectId)
  const done = !!lesson.progress.completedAt
  const [watched, setWatched] = useState<Record<string, number>>(lesson.progress.watched ?? {})
  const [current, setCurrent] = useState(() =>
    Math.max(
      0,
      c.items.findIndex((m) => ((lesson.progress.watched ?? {})[m.youtubeId] ?? 0) < MODULE_DONE),
    ),
  )
  const [autoplay, setAutoplay] = useState(false)
  const lastSent = useRef({ at: 0, percent: 0 })

  if (c.items.length === 0) {
    return (
      <>
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
          <iframe
            className="absolute inset-0 size-full"
            src={`https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(c.playlistId)}&rel=0&playsinline=1`}
            title={lesson.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        {done ? (
          <DoneNote text="Watched." />
        ) : (
          <Button className="self-start" icon="checkmark" onClick={() => void mark({ done: true })}>
            I’ve watched it all
          </Button>
        )}
        {done && <NextButton />}
      </>
    )
  }

  const module = c.items[current]
  const seen = (id: string) => watched[id] ?? 0
  const count = c.items.filter((m) => seen(m.youtubeId) >= MODULE_DONE).length

  const play = (index: number, auto = true) => {
    lastSent.current = { at: 0, percent: 0 }
    setAutoplay(auto)
    setCurrent(index)
  }

  const onProgress = (p: number, position: number) => {
    const id = module.youtubeId
    const before = seen(id)
    setWatched((w) => ({ ...w, [id]: Math.max(w[id] ?? 0, p) }))
    const now = Date.now()
    const crossed = before < MODULE_DONE && p >= MODULE_DONE
    if (crossed || (now - lastSent.current.at > 20_000 && p > lastSent.current.percent && p > before)) {
      lastSent.current = { at: now, percent: p }
      void mark({ moduleId: id, percent: p, positionSeconds: position }, true)
    }
  }

  const markModule = () => {
    setWatched((w) => ({ ...w, [module.youtubeId]: 100 }))
    void mark({ moduleId: module.youtubeId, done: true })
    if (current < c.items.length - 1) play(current + 1, false)
  }

  return (
    <div className="flex flex-col gap-4 large:grid large:grid-cols-[minmax(0,1fr)_360px] large:items-start">
      <div className="flex flex-col gap-3">
        <YouTubePlayer
          key={module.youtubeId}
          youtubeId={module.youtubeId}
          title={module.title}
          startSeconds={null}
          endSeconds={null}
          autoplay={autoplay}
          onProgress={onProgress}
          onEnded={() => current < c.items.length - 1 && play(current + 1)}
        />
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-caption text-muted">
              Module {current + 1} of {c.items.length}
            </p>
            <p className="text-title-md">{module.title}</p>
          </div>
          <IconButton icon="back" label="Previous module" disabled={current === 0} onClick={() => play(current - 1, false)} />
          <IconButton icon="forward" label="Next module" disabled={current === c.items.length - 1} onClick={() => play(current + 1, false)} />
        </div>
        {seen(module.youtubeId) < MODULE_DONE && (
          <Button variant="secondary" size="sm" icon="checkmark" className="self-start" onClick={markModule}>
            I’ve watched this module
          </Button>
        )}
        {done ? <DoneNote text="Every module watched." /> : <ProgressBar value={count} max={c.items.length} label="Modules watched" size="sm" />}
        {done && <NextButton />}
      </div>

      <section aria-label="Modules" className="card card--default gap-0 overflow-hidden rounded-2xl p-0 large:max-h-[calc(100dvh-160px)] large:overflow-y-auto">
        <p className="border-b border-separator px-4 py-3 text-title-sm">
          {count} of {c.items.length} watched
        </p>
        <ol>
          {c.items.map((m, i) => {
            const pct = seen(m.youtubeId)
            const isDone = pct >= MODULE_DONE
            return (
              <li key={m.youtubeId} className="border-b border-separator last:border-b-0">
                <button
                  type="button"
                  onClick={() => play(i)}
                  aria-current={i === current ? 'true' : undefined}
                  className={cn('pressable flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-default expanded:hover:bg-default', i === current && 'bg-accent-soft')}
                >
                  <span className="relative aspect-video w-24 flex-none overflow-hidden rounded-lg bg-black">
                    <img src={m.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
                    {pct > 0 && !isDone && (
                      <span className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                        <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-caption text-muted">{i === current ? 'Now playing' : `Module ${i + 1}`}</span>
                    <span className="line-clamp-2 block text-body-md font-medium">{m.title}</span>
                  </span>
                  {isDone ? <Icon name="ok" size={20} className="flex-none text-up" aria-label="Watched" /> : null}
                </button>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- document

function DocumentLesson({ lesson, projectId }: { lesson: LearnerLesson; projectId: string }) {
  const c = lesson.content as unknown as DocumentContent
  const mark = useMarkProgress(lesson, projectId)
  const done = !!lesson.progress.completedAt

  return (
    <>
      {c.note && <p className="text-body-md text-body">{c.note}</p>}
      {!c.hasFile && !c.link ? (
        <p className="card card--default rounded-2xl p-5 text-body-md text-body">This document isn’t uploaded yet. Check back soon.</p>
      ) : (
        <DocumentViewer lessonId={lesson.id} projectId={projectId} title={lesson.title} content={c} onOpened={() => !done && void mark({ done: true }, true)} />
      )}
    </>
  )
}

// ---------------------------------------------------------------- card

function CardLesson({ lesson, projectId }: { lesson: LearnerLesson; projectId: string }) {
  const c = lesson.content as unknown as CardContent
  const mark = useMarkProgress(lesson, projectId)
  const done = !!lesson.progress.completedAt
  return (
    <>
      <article className="card card--default rounded-2xl p-5 expanded:p-6">
        <LazyMarkdown>{c.markdown}</LazyMarkdown>
      </article>
      {done ? (
        <DoneNote text="Read. It stays here for your visits." />
      ) : (
        <Button className="self-start" icon="checkmark" onClick={() => void mark({ done: true })}>
          Got it
        </Button>
      )}
    </>
  )
}

// ---------------------------------------------------------------- quiz and checks

function QuizLesson({ lesson, projectId }: { lesson: LearnerLesson; projectId: string }) {
  const c = lesson.content as unknown as QuizContent
  const best = lesson.progress.bestScore
  const passed = !!lesson.progress.completedAt
  const [started, setStarted] = useState(false)

  if (!started) {
    return (
      <section className="card card--default gap-4 rounded-2xl p-5">
        <p className="text-body-md">
          <strong>{c.questions.length} questions.</strong> Pass mark {c.passPercent}%. Every answer is explained after you submit.
        </p>
        {best !== null && (
          <p className={cn('text-body-md', passed ? 'text-up' : 'text-body')}>
            Your best: <strong>{best}%</strong>
            {passed ? ' · passed' : ''}
          </p>
        )}
        <Button className="self-start" icon="quiz" onClick={() => setStarted(true)}>
          {best === null ? 'Start the quiz' : passed ? 'Take it again' : 'Try again'}
        </Button>
      </section>
    )
  }
  return <QuestionSet title={lesson.title} questions={c.questions} lesson={lesson} projectId={projectId} passLabel="Passed." onDone={() => setStarted(false)} oneAtATime />
}

/**
 * Questions with tappable answers: one at a time for a quiz (thumb-friendly), all together
 * for the check after a video. Graded on the server; answers and explanations come back then.
 */
function QuestionSet({
  title,
  intro,
  questions,
  lesson,
  projectId,
  passLabel,
  onDone,
  oneAtATime,
}: {
  title: string
  intro?: string
  questions: QuizQuestion[]
  lesson: LearnerLesson
  projectId: string
  passLabel: string
  onDone?: () => void
  oneAtATime?: boolean
}) {
  const qc = useQueryClient()
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null))
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AttemptResult | null>(null)

  const submit = async () => {
    setBusy(true)
    try {
      const res = await api<AttemptResult>(`/training/items/${lesson.id}/attempts`, { method: 'POST', body: { projectId, answers } })
      setResult(res)
      if (res.passed) haptic.success()
      celebrate(res.certifiedNow)
      invalidateTraining(qc)
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <section className="flex flex-col gap-4">
        <div className={cn('card card--default gap-1 rounded-2xl p-5', result.passed ? 'bg-success-soft' : 'bg-warning-soft')}>
          <p className="text-display-sm font-semibold">{result.score}%</p>
          <p className="text-body-md">
            {result.passed ? passLabel : 'Not yet. Read the explanations below, then try again.'}
            {result.attemptsLeftToday !== null && !result.passed && ` ${result.attemptsLeftToday} ${result.attemptsLeftToday === 1 ? 'try' : 'tries'} left today.`}
          </p>
        </div>
        <ol className="flex flex-col gap-3">
          {questions.map((q, i) => {
            const r = result.results[i]
            return (
              <li key={q.id} className="card card--default gap-2 rounded-2xl p-4">
                <p className="text-title-sm">
                  {i + 1}. {q.text}
                </p>
                <p className={cn('flex items-start gap-2 text-body-md', r.correct ? 'text-up' : 'text-down')}>
                  <Icon name={r.correct ? 'ok' : 'cancel'} size={18} className="mt-0.5 flex-none" />
                  {r.correct ? 'Right' : `You chose “${q.options[answers[i] ?? 0]}”. The answer is “${q.options[r.answer]}”.`}
                </p>
                {r.explanation && <p className="text-body-sm text-body">{r.explanation}</p>}
              </li>
            )
          })}
        </ol>
        <div className="flex flex-wrap gap-3">
          {!result.passed && (result.attemptsLeftToday ?? 1) > 0 && (
            <Button
              icon="refresh"
              onClick={() => {
                setResult(null)
                setAnswers(questions.map(() => null))
                setIndex(0)
                void qc.invalidateQueries({ queryKey: trainingKeys.all })
              }}
            >
              Try again
            </Button>
          )}
          {onDone ? (
            <Button variant="secondary" onClick={onDone}>
              Close
            </Button>
          ) : (
            result.passed && <NextButton />
          )}
        </div>
      </section>
    )
  }

  const shown = oneAtATime ? [index] : questions.map((_, i) => i)
  const allAnswered = answers.every((a) => a !== null)
  return (
    <section className="flex flex-col gap-4" aria-label={title}>
      {!oneAtATime && <h2 className="text-title-md">{title}</h2>}
      {intro && <p className="text-body-md text-body">{intro}</p>}
      {oneAtATime && <ProgressBar value={index + 1} max={questions.length} label="Question" size="sm" />}
      {shown.map((i) => {
        const q = questions[i]
        return (
          <fieldset key={q.id} className="card card--default gap-3 rounded-2xl p-4">
            <legend className="sr-only">Question {i + 1}</legend>
            <p className="text-title-sm">
              {oneAtATime ? `${i + 1} of ${questions.length}. ` : ''}
              {q.text}
            </p>
            <div role="radiogroup" className="flex flex-col gap-2">
              {q.options.map((o, j) => {
                const on = answers[i] === j
                return (
                  <button
                    key={j}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setAnswers((a) => a.map((v, k) => (k === i ? j : v)))}
                    className={cn(
                      'pressable flex min-h-12 items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-body-md transition-colors',
                      on ? 'border-primary bg-accent-soft font-semibold text-accent-soft-foreground' : 'border-border bg-surface hover:bg-surface-secondary',
                    )}
                  >
                    <span aria-hidden className={cn('flex size-5 flex-none items-center justify-center rounded-full border-2', on ? 'border-primary bg-primary' : 'border-border')}>
                      {on && <span className="size-2 rounded-full bg-white" />}
                    </span>
                    {o}
                  </button>
                )
              })}
            </div>
          </fieldset>
        )
      })}
      <div className="flex flex-wrap gap-3">
        {oneAtATime && index > 0 && (
          <Button variant="secondary" icon="back" onClick={() => setIndex(index - 1)}>
            Back
          </Button>
        )}
        {oneAtATime && index < questions.length - 1 ? (
          <Button disabled={answers[index] === null} onClick={() => setIndex(index + 1)}>
            Next
          </Button>
        ) : (
          <Button loading={busy} disabled={!allAnswered} onClick={() => void submit()}>
            Submit
          </Button>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- practice pitch

function RoleplayLesson({ lesson, projectId, enabled, leftToday }: { lesson: LearnerLesson; projectId: string; enabled: boolean; leftToday: number }) {
  const c = lesson.content as unknown as RoleplayContent
  const qc = useQueryClient()
  const history = useMyPitches(lesson.id, projectId)
  const [session, setSession] = useState<RoleplaySession | null>(null)
  const [starting, setStarting] = useState(false)

  const start = async () => {
    setStarting(true)
    try {
      setSession(await api<RoleplaySession>(`/training/items/${lesson.id}/roleplay`, { method: 'POST', body: { projectId } }))
      void qc.invalidateQueries({ queryKey: trainingKeys.campaign(projectId) })
    } catch (err) {
      handleFormError(err)
    } finally {
      setStarting(false)
    }
  }

  if (session) {
    return (
      <PitchChat
        session={session}
        onChange={setSession}
        onClose={() => {
          setSession(null)
          void history.refetch()
        }}
      />
    )
  }

  const past = history.data ?? []
  return (
    <>
      <section className="card card--default gap-4 rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-12 flex-none items-center justify-center rounded-full bg-accent-soft text-title-md text-primary">
            {c.persona.name
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0])
              .join('')}
          </span>
          <div className="min-w-0">
            <p className="text-title-md">{c.persona.name}</p>
            <p className="text-body-sm text-body">
              {c.persona.shop}
              {c.persona.city ? `, ${c.persona.city}` : ''}
            </p>
          </div>
        </div>
        {c.persona.about && <p className="text-body-md text-body">{c.persona.about}</p>}
        <div className="rounded-xl bg-default px-4 py-3">
          <p className="text-caption-strong tracking-wide text-muted uppercase">Your goal</p>
          <p className="mt-1 text-body-md">{c.brief}</p>
        </div>
        <details className="group">
          <summary className="cursor-pointer text-title-sm text-primary">What the coach scores ({c.rubric.length})</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-body-sm text-body">
            {c.rubric.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
        <p className="text-body-sm text-muted">
          {c.language === 'hinglish' ? 'The owner speaks Hinglish. ' : ''}Pass mark {c.passScore}.{' '}
          {enabled ? `${leftToday} practice ${leftToday === 1 ? 'pitch' : 'pitches'} left today.` : ''}
        </p>
        {enabled ? (
          <Button className="self-start" icon="microphone" loading={starting} disabled={leftToday === 0} onClick={() => void start()}>
            {leftToday === 0 ? 'Come back tomorrow' : 'Start the pitch'}
          </Button>
        ) : (
          <p className="rounded-xl bg-warning-soft px-4 py-3 text-body-sm">Practice with an AI owner isn’t switched on yet. Ask your sales head.</p>
        )}
      </section>
      {past.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-title-md">Your pitches</h2>
          <ul className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
            {past.map((s) => (
              <li key={s.id} className="border-b border-separator last:border-b-0">
                <button
                  type="button"
                  onClick={() => setSession(s)}
                  className="pressable flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-default expanded:hover:bg-default"
                >
                  <span className={cn('min-w-12 text-title-md tabular-nums', s.passed ? 'text-up' : s.score === null ? 'text-muted' : 'text-ink')}>
                    {s.score === null ? '–' : s.score}
                  </span>
                  <span className="min-w-0 flex-1 text-body-sm text-body">
                    {new Date(s.startedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {s.repTurns} messages
                    {s.finished ? '' : ' · not finished'}
                  </span>
                  <Icon name="chevron-right" size={18} className="text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function PitchChat({ session, onChange, onClose }: { session: RoleplaySession; onChange: (s: RoleplaySession) => void; onClose: () => void }) {
  const qc = useQueryClient()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const speech = useSpeech((text) => setMessage((m) => (m.trim() ? `${m.trim()} ${text}` : text)))
  const canSpeak = speech.supported && !isAppleTouch()
  const full = session.repTurns >= session.maxTurns

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [session.turns.length, sending])

  const send = async () => {
    const text = message.trim()
    if (!text) return
    if (speech.listening) speech.stop()
    setSending(true)
    try {
      onChange(await api<RoleplaySession>(`/roleplay/${session.id}/turns`, { method: 'POST', body: { message: text } }))
      setMessage('')
    } catch (err) {
      handleFormError(err)
    } finally {
      setSending(false)
    }
  }

  const finish = async () => {
    setFinishing(true)
    try {
      const done = await api<RoleplaySession>(`/roleplay/${session.id}/finish`, { method: 'POST' })
      onChange(done)
      if (done.passed) haptic.success()
      celebrate(done.certifiedNow)
      invalidateTraining(qc)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFLICT') onClose()
      else handleFormError(err)
    } finally {
      setFinishing(false)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl bg-default p-3" aria-live="polite">
        {session.turns.map((t, i) => (
          <div key={i} className={cn('flex', t.role === 'rep' ? 'justify-end' : 'justify-start')}>
            <p
              className={cn(
                'max-w-[85%] rounded-2xl px-4 py-2.5 text-body-md whitespace-pre-line',
                t.role === 'rep' ? 'rounded-br-md bg-primary text-on-primary' : 'rounded-bl-md bg-surface text-ink shadow-[0_1px_2px_rgb(15_17_21/0.08)]',
              )}
            >
              {t.role === 'owner' && <span className="mb-0.5 block text-caption-strong text-muted">{session.persona.name}</span>}
              {t.text}
            </p>
          </div>
        ))}
        {sending && <p className="self-start rounded-2xl rounded-bl-md bg-surface px-4 py-2.5 text-body-sm text-muted">{session.persona.name.split(' ')[0]} is thinking…</p>}
        <div ref={bottom} />
      </div>

      {session.finished ? (
        <Scorecard session={session} onClose={onClose} />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="pitch-message" className="sr-only">
              Your reply
            </label>
            <textarea
              id="pitch-message"
              rows={3}
              maxLength={800}
              disabled={full || sending}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder={full ? 'That’s the most messages for one pitch. Finish it for your score.' : 'Say it the way you would in the shop…'}
              className="w-full rounded-2xl border border-field-border bg-field px-4 py-3 text-body-md focus:border-primary focus:ring-3 focus:ring-focus/25 focus:outline-none"
            />
            {speech.listening && <p className="text-body-sm text-body">{speech.heard ? `“${speech.heard}”` : 'Speak now…'}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button icon="send" loading={sending} disabled={!message.trim() || full} onClick={() => void send()}>
                Send
              </Button>
              {canSpeak && (
                <Button
                  variant={speech.listening ? 'danger-soft' : 'soft'}
                  icon="microphone"
                  disabled={full || sending}
                  onClick={() => (speech.listening ? speech.stop() : speech.start())}
                >
                  {speech.listening ? 'Stop' : 'Speak'}
                </Button>
              )}
              <span className="ml-auto text-caption text-muted">
                {session.repTurns}/{session.maxTurns} messages
              </span>
            </div>
          </div>
          <Button variant="outline" icon="goal" loading={finishing} disabled={session.repTurns === 0 || sending} onClick={() => void finish()}>
            Finish and get my score
          </Button>
        </>
      )}
    </section>
  )
}

function Scorecard({ session, onClose }: { session: RoleplaySession; onClose: () => void }) {
  const f = session.feedback
  return (
    <div className="flex flex-col gap-4">
      <div className={cn('card card--default gap-1 rounded-2xl p-5', session.passed ? 'bg-success-soft' : 'bg-warning-soft')}>
        <p className="text-caption-strong tracking-wide text-muted uppercase">Coach’s score</p>
        <p className="text-display-sm font-semibold tabular-nums">
          {session.score}
          <span className="text-title-md text-body"> / 100</span>
        </p>
        <p className="text-body-md">{session.passed ? 'Passed. This counts toward your training.' : `Pass mark is ${session.passScore}. Have another go.`}</p>
      </div>
      {f && (
        <>
          {f.summary && <p className="text-body-md">{f.summary}</p>}
          <ul className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
            {f.criteria.map((c) => (
              <li key={c.criterion} className="flex items-start gap-3 border-b border-separator px-4 py-3 last:border-b-0">
                <Icon name={c.met ? 'ok' : 'cancel'} size={20} className={cn('mt-0.5 flex-none', c.met ? 'text-up' : 'text-down')} />
                <span className="min-w-0">
                  <span className="block text-title-sm">{c.criterion}</span>
                  {c.note && <span className="block text-body-sm text-body">{c.note}</span>}
                </span>
              </li>
            ))}
          </ul>
          {f.improvements.length > 0 && (
            <div className="rounded-2xl bg-accent-soft px-4 py-3">
              <p className="text-title-sm text-accent-soft-foreground">Next time</p>
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-body-md">
                {f.improvements.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <Button variant="secondary" className="self-start" onClick={onClose}>
        Done
      </Button>
    </div>
  )
}

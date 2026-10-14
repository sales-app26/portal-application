import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useMe } from '@/auth/AuthProvider'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Choice'
import { Avatar, EmptyState, ErrorState, ListSkeleton, ProgressBar, StatTile, Tag } from '@/components/ui/Display'
import { Confirm, ResponsiveOverlay } from '@/components/ui/Overlay'
import { Icon } from '@/icons'
import { apiWithMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'
import { handleFormError } from '@/lib/forms'
import type { Lesson, Project, RoleplaySession } from '@/lib/types'
import { LessonForm } from './LessonForm'
import { invalidateTraining, KIND_ICON, KIND_LABEL, useCampaignCourses, useCampaignOwnLessons, useCourses, usePitch, useTrainingBoard } from './queries'

type View = 'progress' | 'content'

/** A campaign's training for its managers: who has done what, and what the campaign teaches. */
export function CampaignTrainingTab({ project }: { project: Project }) {
  const [view, setView] = useState<View>('progress')
  return (
    <section className="flex flex-col gap-5 expanded:max-w-[1000px]">
      <Segmented<View>
        label="Training view"
        value={view}
        onChange={setView}
        options={[
          { value: 'progress', label: 'Progress' },
          { value: 'content', label: 'Lessons' },
        ]}
        className="self-start"
      />
      {view === 'progress' ? <ProgressBoard project={project} /> : <Content project={project} />}
    </section>
  )
}

// ---------------------------------------------------------------- progress

function ProgressBoard({ project }: { project: Project }) {
  const board = useTrainingBoard(project.id)
  const [pitchId, setPitchId] = useState<string | null>(null)
  if (board.isLoading) return <ListSkeleton rows={4} />
  if (board.isError) return <ErrorState message={board.error.message} onRetry={() => void board.refetch()} />
  const b = board.data!
  if (b.lessons.length === 0) {
    return (
      <EmptyState
        icon="learn"
        title="No training yet"
        body="Add the Frostique course or your own lessons under Lessons. Your team then sees them in Learn."
        className="card card--default rounded-2xl"
      />
    )
  }
  const reps = b.members.filter((m) => m.role !== 'super_admin')
  const certified = reps.filter((m) => m.certifiedAt).length
  const notStarted = reps.filter((m) => m.doneCount === 0 && m.practiceCount === 0).length
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <StatTile icon="approval" label="Certified" value={`${certified}/${reps.length}`} tone="up" />
        <StatTile icon="learn" label="Still learning" value={reps.length - certified - notStarted} tone="accent" />
        <StatTile icon="high-priority" label="Not started" value={notStarted} tone={notStarted > 0 ? 'down' : 'ink'} />
      </div>
      <ul className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
        {reps.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 border-b border-separator px-4 py-3.5 last:border-b-0">
            <Avatar name={m.name} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-title-sm">{m.name}</span>
                {m.certifiedAt && <Tag tone="up">Certified</Tag>}
              </span>
              <span className="mt-1.5 block max-w-[320px]">
                <ProgressBar value={m.doneCount} max={Math.max(1, m.requiredCount)} label={`${m.name}'s training`} size="sm" />
              </span>
              <span className="mt-1 block text-caption text-body">
                {m.doneCount}/{m.requiredCount} lessons
                {m.quizBest !== null && ` · quiz ${m.quizBest}%`}
                {m.practiceCount > 0 && ` · ${m.practiceCount} ${m.practiceCount === 1 ? 'pitch' : 'pitches'}${m.practiceBest !== null ? `, best ${m.practiceBest}` : ''}`}
                {m.lastActivityAt ? ` · active ${formatDate(m.lastActivityAt.slice(0, 10))}` : ''}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {b.recentPitches.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="px-1 text-title-md">Latest practice pitches</h3>
          <ul className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
            {b.recentPitches.map((p) => (
              <li key={p.id} className="border-b border-separator last:border-b-0">
                <button
                  type="button"
                  onClick={() => setPitchId(p.id)}
                  className="pressable flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-default expanded:hover:bg-default"
                >
                  <span className="min-w-10 text-title-md tabular-nums">{p.score ?? '–'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-title-sm">{p.userName}</span>
                    <span className="block truncate text-body-sm text-body">
                      {p.lessonTitle}
                      {p.finishedAt ? '' : ' · not finished'}
                    </span>
                  </span>
                  <Icon name="chevron-right" size={18} className="text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {pitchId && <PitchReview id={pitchId} onClose={() => setPitchId(null)} />}
    </>
  )
}

/** A rep's practice pitch, read-only, so the manager can coach from it. */
function PitchReview({ id, onClose }: { id: string; onClose: () => void }) {
  const pitch = usePitch(id)
  const s: RoleplaySession | undefined = pitch.data
  return (
    <ResponsiveOverlay
      open
      onOpenChange={(o) => !o && onClose()}
      title={s ? `${s.userName} · ${s.score ?? 'not scored'}` : 'Practice pitch'}
      description={s?.lessonTitle}
      variant="form"
    >
      {pitch.isLoading ? (
        <ListSkeleton rows={3} />
      ) : pitch.isError ? (
        <ErrorState message={pitch.error.message} />
      ) : s ? (
        <div className="flex flex-col gap-3 pt-2">
          {s.turns.map((t, i) => (
            <p
              key={i}
              className={cn(
                'max-w-[88%] rounded-2xl px-4 py-2.5 text-body-md whitespace-pre-line',
                t.role === 'rep' ? 'self-end rounded-br-md bg-primary text-on-primary' : 'self-start rounded-bl-md bg-default',
              )}
            >
              <span className="mb-0.5 block text-caption-strong opacity-70">{t.role === 'rep' ? s.userName : s.persona.name}</span>
              {t.text}
            </p>
          ))}
          {s.feedback && (
            <div className="mt-2 flex flex-col gap-2 rounded-2xl bg-default p-4">
              <p className="text-title-sm">Coach</p>
              <p className="text-body-md">{s.feedback.summary}</p>
              <ul className="flex flex-col gap-1.5">
                {s.feedback.criteria.map((c) => (
                  <li key={c.criterion} className="flex items-start gap-2 text-body-sm">
                    <Icon name={c.met ? 'ok' : 'cancel'} size={16} className={cn('mt-0.5 flex-none', c.met ? 'text-up' : 'text-down')} />
                    <span>
                      <strong className="font-semibold">{c.criterion}.</strong> {c.note}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </ResponsiveOverlay>
  )
}

// ---------------------------------------------------------------- content

function Content({ project }: { project: Project }) {
  const me = useMe()
  const qc = useQueryClient()
  const canEdit = project.status === 'active'
  const courses = useCampaignCourses(project.id)
  const own = useCampaignOwnLessons(project.id)
  const [choosing, setChoosing] = useState(false)
  const [editing, setEditing] = useState<Lesson | 'new' | null>(null)
  const [removing, setRemoving] = useState<Lesson | null>(null)
  const [busy, setBusy] = useState(false)

  const remove = async () => {
    if (!removing) return
    setBusy(true)
    try {
      await apiWithMessage(`/training/items/${removing.id}`, { method: 'DELETE' })
      toast.success('Lesson removed.')
      invalidateTraining(qc)
      setRemoving(null)
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <h3 className="text-title-md">Courses</h3>
            <p className="text-body-sm text-body">From the training library. The same course can run in many campaigns.</p>
          </div>
          {canEdit && (
            <Button variant="secondary" icon="edit" onClick={() => setChoosing(true)}>
              Choose courses
            </Button>
          )}
        </div>
        {courses.isLoading ? (
          <ListSkeleton rows={1} />
        ) : courses.isError ? (
          <ErrorState message={courses.error.message} onRetry={() => void courses.refetch()} />
        ) : (courses.data ?? []).length === 0 ? (
          <EmptyState icon="book" title="No course yet" body="Choose the Frostique sales course so your team can start learning." className="card card--default rounded-2xl" />
        ) : (
          <ul className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
            {courses.data!.map((c) => (
              <li key={c.id} className="flex items-center gap-3 border-b border-separator px-4 py-3.5 last:border-b-0">
                <span className="flex size-10 flex-none items-center justify-center rounded-full bg-accent-soft text-primary">
                  <Icon name="learn" size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-title-sm">{c.title}</span>
                  <span className="block text-body-sm text-body">{c.lessonCount} lessons</span>
                </span>
                {me.role === 'super_admin' && (
                  <Link to={`/training/courses/${c.id}`} className="text-title-sm text-primary">
                    Edit
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <h3 className="text-title-md">Only in {project.name}</h3>
            <p className="text-body-sm text-body">A city briefing, a local offer, your welcome video.</p>
          </div>
          {canEdit && (
            <Button icon="plus-math" onClick={() => setEditing('new')}>
              Add lesson
            </Button>
          )}
        </div>
        {own.isLoading ? (
          <ListSkeleton rows={2} />
        ) : own.isError ? (
          <ErrorState message={own.error.message} onRetry={() => void own.refetch()} />
        ) : (own.data ?? []).length === 0 ? (
          <p className="px-1 text-body-sm text-muted">None yet.</p>
        ) : (
          <ul className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
            {own.data!.map((l) => (
              <li key={l.id} className="flex items-center gap-3 border-b border-separator px-4 py-3.5 last:border-b-0">
                <span className="flex size-10 flex-none items-center justify-center rounded-full bg-accent-soft text-primary">
                  <Icon name={KIND_ICON[l.kind]} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-title-sm">{l.title}</span>
                  <span className="block text-body-sm text-body">
                    {KIND_LABEL[l.kind]}
                    {l.required ? '' : ' · optional'}
                  </span>
                </span>
                {canEdit && (
                  <ActionMenu
                    title={l.title}
                    items={[
                      { label: 'Edit', icon: 'edit', onSelect: () => setEditing(l) },
                      { label: 'Remove', icon: 'trash', onSelect: () => setRemoving(l) },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {choosing && <ChooseCourses projectId={project.id} chosen={(courses.data ?? []).map((c) => c.id)} onClose={() => setChoosing(false)} />}
      {editing && (
        <LessonForm owner={{ projectId: project.id }} lesson={editing === 'new' ? null : editing} nextSort={(own.data?.length ?? 0) * 10} onClose={() => setEditing(null)} />
      )}
      <Confirm
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this lesson?"
        body="Your team won't see it any more. What they already did stays on their record."
        confirmLabel="Remove lesson"
        danger
        loading={busy}
        onConfirm={remove}
      />
    </>
  )
}

function ChooseCourses({ projectId, chosen, onClose }: { projectId: string; chosen: string[]; onClose: () => void }) {
  const qc = useQueryClient()
  const library = useCourses()
  const [picked, setPicked] = useState<string[]>(chosen)
  const [busy, setBusy] = useState(false)
  const published = (library.data ?? []).filter((c) => c.published)

  const save = async () => {
    setBusy(true)
    try {
      await apiWithMessage(`/projects/${projectId}/training/courses`, { method: 'PUT', body: { courseIds: picked } })
      toast.success('Campaign training updated.')
      invalidateTraining(qc)
      onClose()
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ResponsiveOverlay
      open
      onOpenChange={(o) => !o && onClose()}
      title="Courses for this campaign"
      variant="form"
      footer={
        <Button size="lg" block loading={busy} onClick={() => void save()}>
          Save
        </Button>
      }
    >
      {library.isLoading ? (
        <ListSkeleton rows={3} />
      ) : published.length === 0 ? (
        <EmptyState icon="book" title="No published courses" body="The sales head publishes courses in the training library." />
      ) : (
        <ul className="flex flex-col gap-2 pt-2">
          {published.map((c) => {
            const on = picked.includes(c.id)
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                  className={cn(
                    'pressable flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left',
                    on ? 'border-primary bg-accent-soft' : 'border-border bg-surface hover:bg-surface-secondary',
                  )}
                >
                  <span className={cn('flex size-6 flex-none items-center justify-center rounded-md border-2', on ? 'border-primary bg-primary text-white' : 'border-border')}>
                    {on && <Icon name="checkmark" size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-title-sm">{c.title}</span>
                    <span className="block text-body-sm text-body">
                      {c.lessonCount} lessons{c.description ? ` · ${c.description}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </ResponsiveOverlay>
  )
}

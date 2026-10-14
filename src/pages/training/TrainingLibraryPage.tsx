import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Page } from '@/components/layout/Page'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Button, IconButton } from '@/components/ui/Button'
import { EmptyState, ErrorState, ListSkeleton, Skeleton, Tag } from '@/components/ui/Display'
import { TextAreaField, TextField } from '@/components/ui/Field'
import { Confirm, ResponsiveOverlay } from '@/components/ui/Overlay'
import { LessonForm } from '@/features/training/LessonForm'
import { invalidateTraining, KIND_ICON, KIND_LABEL, STEPS, useCourse, useCourses } from '@/features/training/queries'
import { Icon } from '@/icons'
import { apiWithMessage } from '@/lib/api'
import { handleFormError } from '@/lib/forms'
import type { Course, Lesson } from '@/lib/types'

/** The training library: courses built once by the sales head, attached to any campaign. */
export function TrainingLibraryPage() {
  const courses = useCourses()
  const [creating, setCreating] = useState(false)
  return (
    <Page title="Training library" cta={{ label: 'New course', icon: 'plus-math', onClick: () => setCreating(true) }}>
      <div className="flex flex-col gap-4 expanded:max-w-[900px]">
        <p className="max-w-2xl text-body-md text-body">
          Build a course once: videos from YouTube, PDFs, field cards, a quiz and practice pitches. Publish it, then each campaign chooses it under{' '}
          <strong>Campaigns → Training</strong>.
        </p>
        {courses.isLoading ? (
          <ListSkeleton rows={3} />
        ) : courses.isError ? (
          <ErrorState message={courses.error.message} onRetry={() => void courses.refetch()} />
        ) : (courses.data ?? []).length === 0 ? (
          <EmptyState icon="learn" title="No courses yet" body="Start with a course for the product your team sells." className="card card--default rounded-2xl" />
        ) : (
          <ul className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
            {courses.data!.map((c) => (
              <li key={c.id} className="border-b border-separator last:border-b-0">
                <Link to={`/training/courses/${c.id}`} className="pressable flex min-h-16 items-center gap-3 px-4 py-3 active:bg-default expanded:hover:bg-default">
                  <span className="flex size-10 flex-none items-center justify-center rounded-full bg-accent-soft text-primary">
                    <Icon name="learn" size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-title-sm">{c.title}</span>
                    <span className="block text-body-sm text-body">
                      {c.lessonCount} lessons · {c.campaignCount === 1 ? '1 campaign' : `${c.campaignCount} campaigns`}
                    </span>
                  </span>
                  <Tag tone={c.published ? 'up' : 'warning'}>{c.published ? 'Published' : 'Draft'}</Tag>
                  <Icon name="chevron-right" size={18} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {creating && <CourseForm course={null} onClose={() => setCreating(false)} />}
    </Page>
  )
}

/** One course: its lessons in order, publish, edit. */
export function CourseDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const detail = useCourse(id)
  const [editingCourse, setEditingCourse] = useState(false)
  const [editing, setEditing] = useState<Lesson | 'new' | null>(null)
  const [removing, setRemoving] = useState<Lesson | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const d = detail.data

  const patchCourse = async (body: Record<string, unknown>, message: string) => {
    try {
      await apiWithMessage(`/training/courses/${id}`, { method: 'PATCH', body })
      toast.success(message)
      invalidateTraining(qc)
    } catch (err) {
      handleFormError(err)
    }
  }

  /**
   * Moves a lesson one place up or down among the lessons of its own step (what the rep sees
   * together); sorts are rewritten 10 apart so there is always room.
   */
  const move = async (lesson: Lesson, direction: -1 | 1) => {
    if (!d) return
    const sameStep = d.lessons.filter((l) => l.step === lesson.step)
    const neighbour = sameStep[sameStep.indexOf(lesson) + direction]
    if (!neighbour) return
    const order = [...d.lessons]
    const from = order.indexOf(lesson)
    const to = order.indexOf(neighbour)
    ;[order[from], order[to]] = [order[to], order[from]]
    try {
      await Promise.all(
        order.map((l, i) => (l.sort === (i + 1) * 10 ? null : apiWithMessage(`/training/items/${l.id}`, { method: 'PATCH', body: { sort: (i + 1) * 10 } }))).filter(Boolean),
      )
      invalidateTraining(qc)
    } catch (err) {
      handleFormError(err)
    }
  }

  const removeLesson = async () => {
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

  const deleteCourse = async () => {
    setBusy(true)
    try {
      await apiWithMessage(`/training/courses/${id}`, { method: 'DELETE' })
      toast.success('Course removed.')
      invalidateTraining(qc)
      navigate('/training', { replace: true })
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page
      title={d?.course.title ?? 'Course'}
      back="/training"
      actions={
        d && (
          <ActionMenu
            title={d.course.title}
            items={[
              { label: 'Rename or describe', icon: 'edit', onSelect: () => setEditingCourse(true) },
              { label: 'Remove course', icon: 'trash', onSelect: () => setDeleting(true) },
            ]}
          />
        )
      }
      cta={d ? { label: 'Add lesson', icon: 'plus-math', onClick: () => setEditing('new') } : undefined}
    >
      {detail.isLoading ? (
        <Skeleton className="h-60 rounded-2xl" />
      ) : detail.isError ? (
        <ErrorState message={detail.error.message} onRetry={() => void detail.refetch()} />
      ) : d ? (
        <div className="flex flex-col gap-5 expanded:max-w-[900px]">
          <section className="card card--default gap-3 rounded-2xl p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone={d.course.published ? 'up' : 'warning'}>{d.course.published ? 'Published' : 'Draft'}</Tag>
              <span className="text-body-sm text-body">
                {d.course.lessonCount} lessons · used by {d.course.campaignCount === 1 ? '1 campaign' : `${d.course.campaignCount} campaigns`}
              </span>
            </div>
            {d.course.description && <p className="text-body-md text-body">{d.course.description}</p>}
            <Button
              variant={d.course.published ? 'secondary' : 'primary'}
              className="self-start"
              icon={d.course.published ? 'invisible' : 'approval'}
              onClick={() =>
                void patchCourse({ published: !d.course.published }, d.course.published ? 'Course is a draft again.' : 'Course published. Campaigns can choose it now.')
              }
            >
              {d.course.published ? 'Unpublish' : 'Publish'}
            </Button>
          </section>

          {STEPS.map((step) => {
            const items = d.lessons.filter((l) => l.step === step.value).map((l, index, all) => ({ l, first: index === 0, last: index === all.length - 1 }))
            if (items.length === 0) return null
            return (
              <section key={step.value} className="flex flex-col gap-2">
                <h2 className="px-1 text-title-md">{step.label}</h2>
                <ul className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
                  {items.map(({ l, first, last }) => (
                    <li key={l.id} className="flex items-center gap-2 border-b border-separator py-2 pr-2 pl-4 last:border-b-0">
                      <span className="flex size-10 flex-none items-center justify-center rounded-full bg-accent-soft text-primary">
                        <Icon name={KIND_ICON[l.kind]} size={20} />
                      </span>
                      <button type="button" onClick={() => setEditing(l)} className="min-w-0 flex-1 py-1.5 text-left">
                        <span className="block text-title-sm">{l.title}</span>
                        <span className="block truncate text-body-sm text-body">
                          {KIND_LABEL[l.kind]}
                          {l.required ? '' : ' · optional'}
                          {l.kind === 'document' && !l.hasFile && !l.payload.link ? ' · file not uploaded' : ''}
                        </span>
                      </button>
                      <IconButton icon="collapse-arrow" label={`Move ${l.title} up`} disabled={first} onClick={() => void move(l, -1)} />
                      <IconButton icon="expand-arrow" label={`Move ${l.title} down`} disabled={last} onClick={() => void move(l, 1)} />
                      <ActionMenu
                        title={l.title}
                        items={[
                          { label: 'Edit', icon: 'edit', onSelect: () => setEditing(l) },
                          { label: 'Remove', icon: 'trash', onSelect: () => setRemoving(l) },
                        ]}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
          {d.lessons.length === 0 && (
            <EmptyState icon="play" title="No lessons yet" body="Add a video, a practice pitch, the quiz or a field card." className="card card--default rounded-2xl" />
          )}
        </div>
      ) : null}

      {editingCourse && d && <CourseForm course={d.course} onClose={() => setEditingCourse(false)} />}
      {editing && d && (
        <LessonForm owner={{ courseId: d.course.id }} lesson={editing === 'new' ? null : editing} nextSort={(d.lessons.length + 1) * 10} onClose={() => setEditing(null)} />
      )}
      <Confirm
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this lesson?"
        body="It disappears from every campaign using this course. What people already did stays on their record."
        confirmLabel="Remove lesson"
        danger
        loading={busy}
        onConfirm={removeLesson}
      />
      <Confirm
        open={deleting}
        onOpenChange={setDeleting}
        title="Remove this course?"
        body="It comes off every campaign that uses it. Progress and certificates stay."
        confirmLabel="Remove course"
        danger
        loading={busy}
        onConfirm={deleteCourse}
      />
    </Page>
  )
}

function CourseForm({ course, onClose }: { course: Course | null; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [title, setTitle] = useState(course?.title ?? '')
  const [description, setDescription] = useState(course?.description ?? '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      const res = await apiWithMessage<Course>(course ? `/training/courses/${course.id}` : '/training/courses', {
        method: course ? 'PATCH' : 'POST',
        body: { title: title.trim(), description: description.trim() || null },
      })
      toast.success(course ? 'Course saved.' : 'Course added. Add its lessons, then publish it.')
      invalidateTraining(qc)
      onClose()
      if (!course) navigate(`/training/courses/${res.data.id}`)
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
      title={course ? 'Edit course' : 'New course'}
      variant="form"
      dirty={title !== (course?.title ?? '') || description !== (course?.description ?? '')}
      footer={
        <Button size="lg" block loading={busy} disabled={!title.trim()} onClick={() => void save()}>
          Save course
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        <TextField label="Title" maxLength={120} placeholder="e.g. Frostique: core sales training" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextAreaField label="What it covers" optional maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
    </ResponsiveOverlay>
  )
}

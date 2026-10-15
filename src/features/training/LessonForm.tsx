import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button, IconButton } from '@/components/ui/Button'
import { ChoiceList, Segmented } from '@/components/ui/Choice'
import { TextAreaField, TextField } from '@/components/ui/Field'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { Picker } from '@/components/ui/Picker'
import { Icon } from '@/icons'
import { api, apiWithMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import type { Lesson, QuizQuestion, TrainingKind, TrainingStep } from '@/lib/types'
import { invalidateTraining, KIND_ICON, KIND_LABEL, STEPS } from './queries'

const DEFAULT_STEP: Record<TrainingKind, TrainingStep> = { video: 'watch', playlist: 'tutorial', document: 'library', card: 'field', quiz: 'prove', roleplay: 'practise' }

const KIND_HELP: Record<TrainingKind, string> = {
  video: 'Paste a YouTube link (unlisted is fine). Add a quick check so reps prove they watched.',
  playlist: 'Paste a YouTube playlist link. The app lists its videos as modules and reps watch them here, one by one.',
  document: 'Upload a PDF or image (up to 20 MB), or link to one. Reps read it inside the app.',
  card: 'Short text for the field kit: steps, answers, what to say.',
  quiz: 'Questions with one right answer each. Reps see the explanation after they submit.',
  roleplay: 'A shop owner the AI plays. Reps pitch them and get scored on your checklist.',
}

/** Where a new lesson goes: a library course (Super Admin) or one campaign (its admins). */
export type LessonOwner = { courseId: string } | { projectId: string }

interface Props {
  owner: LessonOwner
  lesson: Lesson | null
  nextSort: number
  onClose: () => void
}

type PlaylistModule = { youtubeId: string; title: string }

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const emptyQuestion = (): QuizQuestion => ({ id: crypto.randomUUID().slice(0, 8), text: '', options: ['', ''], answer: 0, explanation: '' })

/**
 * Add or edit one lesson. A new lesson starts with its kind, then the form shows what that kind
 * needs. Saved through the API, which checks every kind's shape and says what to fix.
 */
export function LessonForm({ owner, lesson, nextSort, onClose }: Props) {
  const qc = useQueryClient()
  const [kind, setKind] = useState<TrainingKind | null>(lesson?.kind ?? null)
  const p = lesson?.payload ?? {}
  const [title, setTitle] = useState(lesson?.title ?? '')
  const [summary, setSummary] = useState(lesson?.summary ?? '')
  const [minutes, setMinutes] = useState(lesson?.minutes ? String(lesson.minutes) : '')
  const [required, setRequired] = useState<'yes' | 'no'>(lesson ? (lesson.required ? 'yes' : 'no') : 'yes')
  const [step, setStep] = useState<TrainingStep | null>(lesson?.step ?? null)
  // video
  const [url, setUrl] = useState(lesson?.kind === 'video' ? `https://youtu.be/${str(p.youtubeId)}` : '')
  const [startSeconds, setStartSeconds] = useState(p.startSeconds ? String(p.startSeconds) : '')
  const [endSeconds, setEndSeconds] = useState(p.endSeconds ? String(p.endSeconds) : '')
  // playlist
  const [playlistUrl, setPlaylistUrl] = useState(lesson?.kind === 'playlist' ? `https://www.youtube.com/playlist?list=${str(p.playlistId)}` : '')
  const [modules, setModules] = useState<PlaylistModule[]>(Array.isArray(p.items) ? (p.items as PlaylistModule[]) : [])
  const [refreshing, setRefreshing] = useState(false)
  // document
  const [link, setLink] = useState(str(p.link))
  const [note, setNote] = useState(str(p.note))
  const [file, setFile] = useState<File | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  // card
  const [markdown, setMarkdown] = useState(str(p.markdown))
  // quiz + video checks
  const [questions, setQuestions] = useState<QuizQuestion[]>(() =>
    Array.isArray(p.questions) ? (p.questions as QuizQuestion[]) : Array.isArray(p.checks) ? (p.checks as QuizQuestion[]) : [],
  )
  const [passPercent, setPassPercent] = useState(p.passPercent ? String(p.passPercent) : '80')
  // roleplay
  const persona = (p.persona ?? {}) as Record<string, unknown>
  const [personaName, setPersonaName] = useState(str(persona.name))
  const [personaShop, setPersonaShop] = useState(str(persona.shop))
  const [personaCity, setPersonaCity] = useState(str(persona.city))
  const [personaAbout, setPersonaAbout] = useState(str(persona.about))
  const [brief, setBrief] = useState(str(p.brief))
  const [ownerInstructions, setOwnerInstructions] = useState(str(p.ownerInstructions))
  const [opener, setOpener] = useState(str(p.opener))
  const [language, setLanguage] = useState<'en' | 'hinglish'>(p.language === 'hinglish' ? 'hinglish' : 'en')
  const [rubric, setRubric] = useState(Array.isArray(p.rubric) ? (p.rubric as string[]).join('\n') : '')
  const [passScore, setPassScore] = useState(p.passScore ? String(p.passScore) : '70')
  const [busy, setBusy] = useState(false)

  const payload = (): Record<string, unknown> => {
    const int = (v: string) => (v.trim() === '' ? null : Number(v))
    const qs = questions.map((q) => ({ ...q, options: q.options.map((o) => o.trim()), explanation: q.explanation?.trim() || null }))
    switch (kind) {
      case 'video':
        return { url: url.trim(), startSeconds: int(startSeconds), endSeconds: int(endSeconds), checks: qs }
      case 'playlist':
        return { url: playlistUrl.trim(), items: modules.map((m) => ({ ...m, title: m.title.trim() })) }
      case 'document':
        return { link: link.trim() || null, note: note.trim() || null }
      case 'card':
        return { markdown }
      case 'quiz':
        return { passPercent: int(passPercent), questions: qs }
      case 'roleplay':
        return {
          persona: { name: personaName, shop: personaShop, city: personaCity, about: personaAbout },
          brief,
          ownerInstructions,
          opener: opener.trim() || null,
          language,
          rubric: rubric
            .split('\n')
            .map((r) => r.trim())
            .filter(Boolean),
          passScore: int(passScore),
        }
      default:
        return {}
    }
  }

  const save = async () => {
    if (!kind) return
    setBusy(true)
    try {
      const body = {
        title: title.trim(),
        summary: summary.trim() || null,
        minutes: minutes ? Number(minutes) : null,
        required: required === 'yes',
        step: step ?? DEFAULT_STEP[kind],
        payload: payload(),
      }
      const path = lesson ? `/training/items/${lesson.id}` : 'courseId' in owner ? `/training/courses/${owner.courseId}/items` : `/projects/${owner.projectId}/training/items`
      const saved = await apiWithMessage<Lesson>(path, { method: lesson ? 'PATCH' : 'POST', body: lesson ? body : { ...body, kind, sort: nextSort } })
      if (kind === 'document' && file) {
        const form = new FormData()
        form.append('file', file)
        await api(`/training/items/${saved.data.id}/file`, { method: 'POST', body: form })
      }
      haptic.success()
      toast.success(lesson ? 'Lesson saved.' : 'Lesson added.')
      invalidateTraining(qc)
      onClose()
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusy(false)
    }
  }

  /** Swaps a module with its neighbour; saved with the lesson. */
  const moveModule = (i: number, dir: -1 | 1) => {
    const next = [...modules]
    ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
    setModules(next)
  }

  /** Reads the playlist again from YouTube: your order stays, new videos join at the end, titles come from YouTube. */
  const refreshModules = async () => {
    if (!lesson) return
    setRefreshing(true)
    try {
      const res = await apiWithMessage<Lesson>(`/training/items/${lesson.id}`, { method: 'PATCH', body: { payload: { url: playlistUrl.trim(), refresh: true } } })
      const items = Array.isArray(res.data.payload.items) ? (res.data.payload.items as PlaylistModule[]) : []
      setModules(items)
      invalidateTraining(qc)
      if (items.length > 0) toast.success(`${items.length} modules from YouTube.`)
      else toast.error('YouTube didn’t list this playlist. Is it public or unlisted?')
    } catch (err) {
      handleFormError(err)
    } finally {
      setRefreshing(false)
    }
  }

  if (!kind) {
    return (
      <ResponsiveOverlay open onOpenChange={(o) => !o && onClose()} title="Add a lesson" variant="choice">
        <ChoiceList<TrainingKind>
          label="Kind of lesson"
          options={(['video', 'playlist', 'roleplay', 'quiz', 'card', 'document'] as TrainingKind[]).map((k) => ({
            value: k,
            label: KIND_LABEL[k],
            description: KIND_HELP[k],
            leading: (
              <span className="flex size-10 flex-none items-center justify-center rounded-full bg-accent-soft text-primary">
                <Icon name={KIND_ICON[k]} size={20} />
              </span>
            ),
          }))}
          onSelect={(k) => {
            setKind(k)
            if (k === 'quiz' && questions.length === 0) setQuestions([emptyQuestion()])
          }}
        />
      </ResponsiveOverlay>
    )
  }

  return (
    <ResponsiveOverlay
      open
      onOpenChange={(o) => !o && onClose()}
      title={lesson ? `Edit ${KIND_LABEL[kind].toLowerCase()}` : `New ${KIND_LABEL[kind].toLowerCase()}`}
      description={KIND_HELP[kind]}
      variant="form"
      dirty
      footer={
        <Button size="lg" block loading={busy} disabled={!title.trim()} onClick={() => void save()}>
          Save lesson
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        <TextField label="Title" maxLength={120} placeholder="e.g. The 25-minute visit" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField label="One line about it" optional maxLength={500} value={summary} onChange={(e) => setSummary(e.target.value)} />

        {kind === 'video' && (
          <>
            <TextField
              label="YouTube link"
              inputMode="url"
              placeholder="https://youtu.be/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              hint="Upload as Unlisted on YouTube and paste the link."
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Start at (seconds)" optional inputMode="numeric" value={startSeconds} onChange={(e) => setStartSeconds(e.target.value.replace(/\D/g, ''))} />
              <TextField
                label="Stop at (seconds)"
                optional
                inputMode="numeric"
                value={endSeconds}
                onChange={(e) => setEndSeconds(e.target.value.replace(/\D/g, ''))}
                hint="Cut one long video into short lessons."
              />
            </div>
            <QuestionsEditor title="Quick check after the video" questions={questions} onChange={setQuestions} max={5} optional />
          </>
        )}

        {kind === 'playlist' && (
          <>
            <TextField
              label="YouTube playlist link"
              inputMode="url"
              placeholder="https://www.youtube.com/playlist?list=…"
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
              hint="Public or unlisted. Its videos become the modules (up to 15); you can change their order after saving."
            />
            {lesson ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="label text-[15px] font-semibold text-ink">Modules</span>
                  <Button size="sm" variant="secondary" icon="refresh" loading={refreshing} onClick={() => void refreshModules()}>
                    Refresh from YouTube
                  </Button>
                </div>
                {modules.length === 0 ? (
                  <p className="text-body-sm text-body">YouTube didn’t list this playlist, so reps get YouTube’s own player and mark it watched.</p>
                ) : (
                  <>
                    <p className="text-body-sm text-body">Reps watch them in this order. Rename a module, or use the arrows to move it.</p>
                    <ol aria-label="Modules" className="flex flex-col gap-3">
                      {modules.map((m, i) => (
                        <li key={m.youtubeId} className="flex items-start gap-1">
                          <TextField
                            containerClassName="flex-1"
                            label={`Module ${i + 1}`}
                            maxLength={200}
                            value={m.title}
                            onChange={(e) => setModules(modules.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))}
                          />
                          <IconButton icon="collapse-arrow" label={`Move module ${i + 1} up`} disabled={i === 0} onClick={() => moveModule(i, -1)} className="mt-7" />
                          <IconButton
                            icon="expand-arrow"
                            label={`Move module ${i + 1} down`}
                            disabled={i === modules.length - 1}
                            onClick={() => moveModule(i, 1)}
                            className="mt-7"
                          />
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
            ) : (
              <p className="text-body-sm text-body">The modules are read from YouTube when you save. You can rename them after.</p>
            )}
          </>
        )}

        {kind === 'document' && (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="label text-[15px] font-semibold text-ink">File</span>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" icon="download" onClick={() => fileInput.current?.click()}>
                  {file || lesson?.hasFile ? 'Replace file' : 'Choose PDF or image'}
                </Button>
                <span className="text-body-sm text-body">
                  {file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : lesson?.hasFile ? str(p.fileName) || 'Uploaded' : 'Up to 20 MB'}
                </span>
              </div>
            </div>
            <TextField label="Or a link" optional inputMode="url" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
            <TextAreaField label="Note for reps" optional maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </>
        )}

        {kind === 'card' && (
          <TextAreaField
            label="Text"
            className="min-h-64 font-mono text-[14px]"
            maxLength={20000}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            hint="Markdown: ## for a heading, **bold**, 1. for steps, - for points."
          />
        )}

        {kind === 'quiz' && (
          <>
            <TextField label="Pass mark (%)" inputMode="numeric" value={passPercent} onChange={(e) => setPassPercent(e.target.value.replace(/\D/g, ''))} />
            <QuestionsEditor title="Questions" questions={questions} onChange={setQuestions} max={60} />
          </>
        )}

        {kind === 'roleplay' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Owner’s name" maxLength={60} value={personaName} onChange={(e) => setPersonaName(e.target.value)} />
              <TextField label="City" optional maxLength={60} value={personaCity} onChange={(e) => setPersonaCity(e.target.value)} />
            </div>
            <TextField label="Shop" maxLength={120} placeholder="e.g. Shinde Cake House" value={personaShop} onChange={(e) => setPersonaShop(e.target.value)} />
            <TextAreaField label="About the shop" optional maxLength={600} value={personaAbout} onChange={(e) => setPersonaAbout(e.target.value)} hint="Reps see this." />
            <TextAreaField label="The rep’s goal" maxLength={4000} value={brief} onChange={(e) => setBrief(e.target.value)} hint="Reps see this before they start." />
            <TextAreaField
              label="How the owner behaves (hidden)"
              maxLength={4000}
              className="min-h-40"
              value={ownerInstructions}
              onChange={(e) => setOwnerInstructions(e.target.value)}
              hint="Only the AI sees this: their numbers, worries to raise, when they agree. Include what’s true about the product so the coach can catch wrong promises."
            />
            <TextField
              label="The owner’s first line"
              optional
              maxLength={600}
              value={opener}
              onChange={(e) => setOpener(e.target.value)}
              hint="Leave empty and the AI greets the rep in character."
            />
            <Segmented<'en' | 'hinglish'>
              label="Language"
              value={language}
              onChange={setLanguage}
              options={[
                { value: 'en', label: 'English' },
                { value: 'hinglish', label: 'Hinglish' },
              ]}
              className="self-start"
            />
            <TextAreaField
              label="What the coach scores"
              className="min-h-32"
              value={rubric}
              onChange={(e) => setRubric(e.target.value)}
              hint="One per line, up to 12. e.g. Asked how orders come in today"
            />
            <TextField label="Pass score (out of 100)" inputMode="numeric" value={passScore} onChange={(e) => setPassScore(e.target.value.replace(/\D/g, ''))} />
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <TextField label="Minutes" optional inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} />
          <Picker<TrainingStep>
            label="Shows under"
            value={step ?? DEFAULT_STEP[kind]}
            onChange={setStep}
            options={STEPS.map((s) => ({ value: s.value, label: s.label, description: s.blurb }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="label text-[15px] font-semibold text-ink">Needed for the certificate?</span>
          <Segmented<'yes' | 'no'>
            label="Needed for the certificate"
            value={required}
            onChange={setRequired}
            options={[
              { value: 'yes', label: 'Required' },
              { value: 'no', label: 'Optional' },
            ]}
            className="self-start"
          />
        </div>
      </div>
    </ResponsiveOverlay>
  )
}

/** Questions with 2–6 answers each; tap the circle to mark the right one. */
function QuestionsEditor({
  title,
  questions,
  onChange,
  max,
  optional,
}: {
  title: string
  questions: QuizQuestion[]
  onChange: (q: QuizQuestion[]) => void
  max: number
  optional?: boolean
}) {
  const update = (i: number, patch: Partial<QuizQuestion>) => onChange(questions.map((q, k) => (k === i ? { ...q, ...patch } : q)))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="label text-[15px] font-semibold text-ink">
          {title}
          {optional && <span className="ml-1 text-body-sm font-normal text-muted">(optional)</span>}
        </span>
        <span className="text-caption text-muted">
          {questions.length}/{max}
        </span>
      </div>
      {questions.map((q, i) => (
        <div key={q.id} className="flex flex-col gap-3 rounded-2xl border border-border p-3">
          <div className="flex items-start gap-2">
            <TextField containerClassName="flex-1" label={`Question ${i + 1}`} maxLength={400} value={q.text} onChange={(e) => update(i, { text: e.target.value })} />
            <IconButton icon="trash" label={`Remove question ${i + 1}`} onClick={() => onChange(questions.filter((_, k) => k !== i))} className="mt-7" />
          </div>
          <div role="radiogroup" aria-label={`Right answer for question ${i + 1}`} className="flex flex-col gap-2">
            {q.options.map((o, j) => (
              <div key={j} className="flex items-center gap-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={q.answer === j}
                  aria-label={`Answer ${j + 1} is right`}
                  onClick={() => update(i, { answer: j })}
                  className={cn(
                    'flex size-8 flex-none items-center justify-center rounded-full border-2',
                    q.answer === j ? 'border-up bg-up text-white' : 'border-border text-transparent',
                  )}
                >
                  <Icon name="checkmark" size={16} />
                </button>
                <input
                  aria-label={`Answer ${j + 1}`}
                  maxLength={200}
                  value={o}
                  onChange={(e) => update(i, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })}
                  className="h-11 min-w-0 flex-1 rounded-field border border-field-border bg-field px-3 text-body-md focus:border-primary focus:outline-none"
                />
                {q.options.length > 2 && (
                  <IconButton
                    icon="multiply"
                    label={`Remove answer ${j + 1}`}
                    onClick={() =>
                      update(i, {
                        options: q.options.filter((_, k) => k !== j),
                        answer: q.answer === j ? 0 : (q.answer ?? 0) > j ? (q.answer ?? 0) - 1 : q.answer,
                      })
                    }
                  />
                )}
              </div>
            ))}
            {q.options.length < 6 && (
              <Button size="sm" variant="tertiary" icon="plus-math" className="self-start" onClick={() => update(i, { options: [...q.options, ''] })}>
                Add an answer
              </Button>
            )}
          </div>
          <TextField label="Why (shown after they answer)" optional maxLength={600} value={q.explanation ?? ''} onChange={(e) => update(i, { explanation: e.target.value })} />
        </div>
      ))}
      {questions.length < max && (
        <Button variant="secondary" icon="plus-math" className="self-start" onClick={() => onChange([...questions, emptyQuestion()])}>
          Add a question
        </Button>
      )}
    </div>
  )
}

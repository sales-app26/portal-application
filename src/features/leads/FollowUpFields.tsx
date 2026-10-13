import { Controller, useWatch, type Control, type FieldErrors, type FieldValues, type Path, type UseFormRegister } from 'react-hook-form'
import { StatusChoice } from '@/components/ui/Choice'
import { DatePicker } from '@/components/ui/DatePicker'
import { TextAreaField, TextField } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { addDays, todayIST } from '@/lib/format'
import { REASON_LABEL, REASONS } from '@/lib/format'
import type { LeadStatus, LostReason } from '@/lib/types'
import { REASON_STATUSES, type FollowUpValues } from './entrySchema'
import { LocationField } from './LocationField'
import { NEXT_DATE_MAX, NEXT_DATE_MIN, NOTE_MIN, nextDateRule } from './rules'
import { useSpeech } from './useSpeech'

interface Props<T extends FieldValues> {
  projectId: string
  statuses: LeadStatus[]
  // Shared by forms with different extra fields; only the follow-up fields are touched here.
  control: Control<T>
  register: UseFormRegister<T>
  errors: FieldErrors<T>
  showLocation?: boolean
  /** Add lead: the deal fields show for every status, as the expected value. */
  dealAlways?: boolean
}

const n = <T extends FieldValues>(name: keyof FollowUpValues) => name as Path<T>

/** What reps write most. A tap fills the note; each is long enough to pass the 5-character rule. */
const QUICK_NOTES = [
  'No answer',
  'Busy, call back later',
  'Spoke to the owner',
  'Interested, wants details',
  'Sent pricing on WhatsApp',
  'Demo given',
  'Shop was closed',
  'Not the decision maker',
]

const QUICK_DATES = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
]

const chip = 'pressable h-9 flex-none rounded-pill px-3.5 text-body-sm whitespace-nowrap'

/** Status, note, next date, location: the body of every follow-up (PRD §5.6). */
export function FollowUpFields<T extends FieldValues>({ projectId, statuses, control, register, errors: allErrors, showLocation = true, dealAlways = false }: Props<T>) {
  const errors = allErrors as FieldErrors<FollowUpValues>
  const status = useWatch({ control, name: n<T>('status') }) as LeadStatus | null
  const note = (useWatch({ control, name: n<T>('note') }) as string | undefined) ?? ''
  const rule = nextDateRule(status)

  return (
    <>
      <Controller
        control={control}
        name={n<T>('status')}
        render={({ field }) => <StatusChoice statuses={statuses} value={field.value as LeadStatus | null} onChange={field.onChange} error={errors.status?.message} />}
      />
      {status && REASON_STATUSES.includes(status) && (
        <Controller control={control} name={n<T>('reason')} render={({ field }) => <ReasonChoice value={(field.value as LostReason | null) ?? null} onChange={field.onChange} />} />
      )}
      {(status === 'converted' || dealAlways) && (
        <div className={cn('flex flex-col gap-4 rounded-2xl p-4', status === 'converted' ? 'bg-success-soft' : 'bg-surface-secondary')}>
          <p className="flex items-center gap-2 text-title-sm">
            {status === 'converted' ? (
              <>
                <span aria-hidden>🎉</span> Mark as won
              </>
            ) : (
              'Expected deal'
            )}
            <span className="text-body-sm font-normal text-muted">(optional)</span>
          </p>
          <div className="grid grid-cols-1 gap-4 medium:grid-cols-2">
            <TextField label="Monthly value" prefix="₹" inputMode="numeric" placeholder="2,499" error={errors.dealValue?.message} {...register(n<T>('dealValue'))} />
            <TextField label="Plan or package" placeholder="e.g. Growth" maxLength={80} error={errors.plan?.message} {...register(n<T>('plan'))} />
          </div>
        </div>
      )}
      <Controller
        control={control}
        name={n<T>('note')}
        render={({ field }) => (
          <NoteField
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
            onBlur={field.onBlur}
            name={field.name}
            inputRef={field.ref}
            error={errors.note?.message}
            hint={note.trim().length < NOTE_MIN ? `At least ${NOTE_MIN} characters. Tap a quick note or the mic.` : undefined}
          />
        )}
      />
      {rule !== 'hidden' && (
        <Controller
          control={control}
          name={n<T>('nextFollowUpDate')}
          render={({ field }) => (
            <div className="flex flex-col gap-2">
              <DatePicker
                label="Next follow-up"
                optional={rule === 'optional'}
                min={NEXT_DATE_MIN()}
                max={NEXT_DATE_MAX()}
                value={(field.value as string) ?? ''}
                onChange={field.onChange}
                error={errors.nextFollowUpDate?.message}
              />
              <div role="group" aria-label="Quick dates" className="flex flex-wrap gap-2">
                {QUICK_DATES.map((q) => {
                  const ymd = addDays(todayIST(), q.days)
                  const on = field.value === ymd
                  return (
                    <button
                      key={q.label}
                      type="button"
                      aria-pressed={on}
                      onClick={() => field.onChange(on ? '' : ymd)}
                      className={cn(chip, on ? 'bg-ink text-on-ink' : 'bg-surface-strong text-ink')}
                    >
                      {q.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        />
      )}
      {showLocation && (
        <Controller
          control={control}
          name={n<T>('location')}
          render={({ field }) => (
            <LocationField projectId={projectId} value={(field.value as string) ?? ''} onChange={field.onChange} onBlur={field.onBlur} error={errors.location?.message} />
          )}
        />
      )}
    </>
  )
}

/** The note textarea with a dictation mic and one-tap quick notes under it. */
function NoteField({
  value,
  onChange,
  onBlur,
  name,
  inputRef,
  error,
  hint,
}: {
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  name: string
  inputRef: React.Ref<HTMLTextAreaElement>
  error?: string
  hint?: string
}) {
  const append = (text: string) => {
    const base = value.trim()
    onChange(base ? `${base.replace(/[.\s]*$/, '')}. ${text}` : text)
  }
  const speech = useSpeech(append)

  return (
    <div className="flex flex-col gap-2">
      <TextAreaField
        ref={inputRef}
        name={name}
        label="Note"
        placeholder="What happened? What did the client say?"
        error={error}
        hint={hint}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] expanded:-mx-6 expanded:px-6">
        {speech.supported && (
          <button
            type="button"
            onClick={speech.listening ? speech.stop : speech.start}
            aria-pressed={speech.listening}
            className={cn(chip, 'inline-flex items-center gap-1.5 font-semibold', speech.listening ? 'animate-pulse bg-down text-on-primary' : 'bg-primary/10 text-primary')}
          >
            <MicIcon />
            {speech.listening ? 'Listening… tap to stop' : 'Speak'}
          </button>
        )}
        {QUICK_NOTES.map((q) => (
          <button key={q} type="button" onClick={() => append(q)} className={cn(chip, 'bg-surface-strong text-ink')}>
            {q}
          </button>
        ))}
      </div>
      {speech.listening && (
        <p aria-live="polite" className="text-body-sm text-body">
          {speech.heard ? <>“{speech.heard}”</> : 'Speak now. Your words appear in the note.'}
        </p>
      )}
    </div>
  )
}

function MicIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  )
}

/** Why the client said no, one tap. Optional, but it is what tells the team what to fix. */
function ReasonChoice({ value, onChange }: { value: LostReason | null; onChange: (r: LostReason | null) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id="reason-label" className="label text-[15px] font-semibold text-ink">
        Why? <span className="text-body-sm font-normal text-muted">(optional)</span>
      </span>
      <div role="radiogroup" aria-labelledby="reason-label" className="flex flex-wrap gap-2">
        {REASONS.map((r) => {
          const on = r === value
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(on ? null : r)}
              className={cn(chip, 'border', on ? 'border-transparent bg-ink font-semibold text-on-ink' : 'border-border bg-surface text-ink hover:bg-surface-secondary')}
            >
              {REASON_LABEL[r]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

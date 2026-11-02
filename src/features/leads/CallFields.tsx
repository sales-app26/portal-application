import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Choice'
import { Icon } from '@/icons'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { handleFormError } from '@/lib/forms'
import type { CallOutcome, FollowUpChannel } from '@/lib/types'
import { CALL_OUTCOME_LABEL, CHANNEL_LABEL } from './channels'

const MAX_RECORDING_BYTES = 25 * 1024 * 1024
const OUTCOMES: CallOutcome[] = ['spoke', 'no_answer', 'busy', 'switched_off', 'wrong_number']

/** Visit, call, or a note: shown only when there is a choice. */
export function ChannelChoice({ options, value, onChange }: { options: FollowUpChannel[]; value: FollowUpChannel; onChange: (c: FollowUpChannel) => void }) {
  if (options.length < 2) return null
  return <Segmented label="What was it?" value={value} onChange={onChange} options={options.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))} />
}

/** How the call went, and the recording once they spoke. */
export function CallFields({
  outcome,
  onOutcome,
  recording,
  onRecording,
  error,
  onError,
}: {
  outcome: CallOutcome | null
  onOutcome: (o: CallOutcome) => void
  recording: File | null
  onRecording: (f: File | null) => void
  error?: string
  onError: (message: string | undefined) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const pick = (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_RECORDING_BYTES) return onError('That recording is over 25 MB. Choose a shorter one.')
    onError(undefined)
    onRecording(file)
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span id="call-outcome-label" className="label text-[15px] font-semibold text-ink">
          How did the call go?
        </span>
        <div role="radiogroup" aria-labelledby="call-outcome-label" className="flex flex-wrap gap-2">
          {OUTCOMES.map((o) => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={o === outcome}
              onClick={() => (onError(undefined), onOutcome(o))}
              className={cn(
                'pressable h-10 rounded-pill border px-4 text-body-sm whitespace-nowrap transition-colors',
                o === outcome ? 'border-transparent bg-ink font-semibold text-on-ink' : 'border-border bg-surface text-ink hover:bg-surface-soft',
              )}
            >
              {CALL_OUTCOME_LABEL[o]}
            </button>
          ))}
        </div>
      </div>
      {outcome === 'spoke' && (
        <div className="flex flex-col gap-1.5">
          <span className="label text-[15px] font-semibold text-ink">Call recording</span>
          {/* Phones save recordings under odd types (.amr, .3gp), so "audio/*" alone would hide some. */}
          <input
            ref={input}
            type="file"
            accept="audio/*,.m4a,.mp3,.aac,.amr,.3gp,.ogg,.wav,.flac"
            aria-label="Call recording file"
            className="sr-only"
            onChange={(e) => {
              pick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {recording ? (
            <div className="flex items-center gap-3 rounded-xl bg-surface-secondary p-3">
              <Icon name="checkmark" size={20} className="flex-none text-up" />
              <span className="min-w-0 flex-1 truncate text-body-sm">{recording.name}</span>
              <Button type="button" variant="tertiary" size="sm" onClick={() => onRecording(null)}>
                Remove
              </Button>
            </div>
          ) : (
            <Button type="button" variant="secondary" icon="microphone" className="self-start" onClick={() => input.current?.click()}>
              Add recording
            </Button>
          )}
          <p className="text-caption text-muted">Your phone’s call recordings folder. Up to 25 MB. Each recording can be used once.</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-caption text-down">
          {error}
        </p>
      )}
    </div>
  )
}

/** Fetches a short-lived link only when someone asks to listen, since links expire. */
export function RecordingPlayer({ entryId, className }: { entryId: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const load = async () => {
    setLoading(true)
    try {
      setUrl((await api<{ url: string }>(`/entries/${entryId}/recording`)).url)
    } catch (err) {
      handleFormError(err)
    } finally {
      setLoading(false)
    }
  }
  if (!url) {
    return (
      <Button type="button" variant="secondary" size="sm" icon="play" loading={loading} className={cn('self-start', className)} onClick={() => void load()}>
        Play recording
      </Button>
    )
  }
  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      <audio controls autoPlay src={url} aria-label="Call recording" className="w-full max-w-sm" />
      {/* Browsers can't play some phone formats, like .amr; it can still be saved and opened. */}
      <a href={url} download className="text-caption font-semibold text-primary">
        Download
      </a>
    </div>
  )
}

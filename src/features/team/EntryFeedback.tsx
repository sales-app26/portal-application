import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { TextAreaField } from '@/components/ui/Field'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { Icon } from '@/icons'
import { apiWithMessage } from '@/lib/api'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import { ago } from '@/lib/format'
import type { Entry } from '@/lib/types'

const QUICK = ['👍 Great visit', 'Call them back today', 'Push for the demo', 'Ask for the decision maker', 'Send the pricing on WhatsApp']

/** A manager's notes under an entry: the coaching loop, visible to the rep who logged it. */
export function FeedbackList({ entry }: { entry: Pick<Entry, 'feedback'> }) {
  if (!entry.feedback?.length) return null
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {entry.feedback.map((f) => (
        <li key={f.id} className="flex gap-2 rounded-xl bg-warning-soft/70 px-3 py-2">
          <Icon name="thumbs-up" size={14} className="mt-1 flex-none text-ink" />
          <p className="text-body-sm">
            <span className="font-semibold">{f.user.name}</span> <span className="text-muted">· {ago(f.createdAt)}</span>
            <br />
            {f.body}
          </p>
        </li>
      ))}
    </ul>
  )
}

/** "Feedback" on someone else's entry, for a project admin. */
export function FeedbackButton({ entry, leadId }: { entry: Pick<Entry, 'id' | 'user'>; leadId: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async (body: string) => {
    setBusy(true)
    try {
      await apiWithMessage(`/leads/${leadId}/comments`, { method: 'POST', body: { kind: 'feedback', entryId: entry.id, body } })
      haptic.success()
      toast.success(`Feedback sent to ${entry.user.name}.`)
      setOpen(false)
      setText('')
      void qc.invalidateQueries({ queryKey: ['timeline'] })
      void qc.invalidateQueries({ queryKey: ['leads'] })
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button variant="tertiary" size="sm" icon="thumbs-up" className="-ml-2" onClick={() => setOpen(true)}>
        Feedback
      </Button>
      <ResponsiveOverlay
        open={open}
        onOpenChange={setOpen}
        title={`Feedback for ${entry.user.name}`}
        description="They see it under this follow-up and get a notification."
        variant="short"
        footer={
          <Button size="lg" block loading={busy} disabled={!text.trim()} onClick={() => void send(text.trim())}>
            Send feedback
          </Button>
        }
      >
        <div className="flex flex-col gap-4 pt-1">
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                disabled={busy}
                onClick={() => void send(q)}
                className="pressable h-9 rounded-pill border border-border bg-surface px-3.5 text-body-sm text-ink hover:bg-surface-secondary"
              >
                {q}
              </button>
            ))}
          </div>
          <TextAreaField label="Or write your own" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      </ResponsiveOverlay>
    </>
  )
}

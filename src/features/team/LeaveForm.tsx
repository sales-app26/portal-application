import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { TextField } from '@/components/ui/Field'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { apiWithMessage } from '@/lib/api'
import { addDays, formatDate, todayIST } from '@/lib/format'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import type { Leave, PersonRef } from '@/lib/types'
import { invalidateTeam } from './queries'

/**
 * Mark leave, for yourself or (managers) for someone on your team. While it runs, the person's
 * backup in each project covers their follow-ups; nobody is flagged as idle.
 */
export function LeaveForm({ open, onOpenChange, person }: { open: boolean; onOpenChange: (o: boolean) => void; /** Omit for yourself. */ person?: PersonRef }) {
  const qc = useQueryClient()
  const today = todayIST()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setFrom(today)
    setTo(today)
    setNote('')
  }, [open, today])

  const save = async () => {
    setBusy(true)
    try {
      await apiWithMessage<Leave>('/leaves', {
        method: 'POST',
        body: { ...(person ? { userId: person.id } : {}), startsOn: from, endsOn: to, ...(note.trim() ? { note: note.trim() } : {}) },
      })
      haptic.success()
      toast.success(person ? `${person.name} is on leave ${formatDate(from)}–${formatDate(to)}. Their backup has been told.` : 'Leave saved. Your backup has been told.')
      invalidateTeam(qc)
      onOpenChange(false)
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusy(false)
    }
  }

  const quick = [
    { label: 'Today', from: today, to: today },
    { label: 'Tomorrow', from: addDays(today, 1), to: addDays(today, 1) },
    { label: 'Next 3 days', from: today, to: addDays(today, 2) },
  ]

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={person ? `Leave for ${person.name}` : 'Mark leave'}
      description="Their backup covers follow-ups meanwhile."
      variant="short"
      footer={
        <Button size="lg" block loading={busy} onClick={() => void save()}>
          Save leave
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <div role="group" aria-label="Quick dates" className="flex flex-wrap gap-2">
          {quick.map((q) => {
            const on = q.from === from && q.to === to
            return (
              <button
                key={q.label}
                type="button"
                aria-pressed={on}
                onClick={() => (setFrom(q.from), setTo(q.to))}
                className={
                  on
                    ? 'pressable h-9 rounded-pill bg-ink px-3.5 text-body-sm font-semibold text-on-ink'
                    : 'pressable h-9 rounded-pill border border-border bg-surface px-3.5 text-body-sm text-ink hover:bg-surface-secondary'
                }
              >
                {q.label}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DatePicker label="From" min={today} max={addDays(today, 365)} value={from} onChange={(v) => v && (setFrom(v), v > to && setTo(v))} />
          <DatePicker label="To" min={from} max={addDays(from, 60)} value={to} onChange={(v) => v && setTo(v)} />
        </div>
        <TextField label="Note" optional maxLength={200} placeholder="e.g. Family function" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </ResponsiveOverlay>
  )
}

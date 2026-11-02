import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/icons'
import { useReminders } from '@/lib/reminders'

const DISMISSED = 'st.remindersPromptDismissed'

const wasDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED) === '1'
  } catch {
    return false
  }
}

/** Asks once on Home. The browser's own prompt only comes after this tap, so it isn't a surprise. */
export function RemindersPrompt() {
  const reminders = useReminders()
  const [hidden, setHidden] = useState(wasDismissed)
  const [busy, setBusy] = useState(false)
  if (hidden || reminders.state !== 'off') return null

  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem(DISMISSED, '1')
    } catch {
      /* storage blocked: it just asks again next time */
    }
  }
  const turnOn = async () => {
    setBusy(true)
    try {
      await reminders.turnOn()
      toast.success('Reminders are on for this phone.')
      setHidden(true)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card card--default flex-col gap-3 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 flex-none items-center justify-center rounded-full bg-accent-soft text-primary">
          <Icon name="bell" size={20} />
        </span>
        <p className="min-w-0 flex-1 text-body-sm">
          <span className="block text-title-sm">Never miss a callback</span>
          Get a reminder at each follow-up’s time, and your day’s count each morning.
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" loading={busy} onClick={() => void turnOn()}>
          Turn on
        </Button>
        <Button size="sm" variant="tertiary" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { DatePicker } from '@/components/ui/DatePicker'
import { Icon } from '@/icons'
import { cn } from '@/lib/cn'
import { addDays, todayIST } from '@/lib/format'

const DAYS = 14

/** Scrollable days ending today, plus a calendar for anything older (UX-COMPONENTS.md §9). */
export function DateStrip({ value, onChange }: { value: string; onChange: (ymd: string) => void }) {
  const today = todayIST()
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i - (DAYS - 1)))
  const inStrip = days.includes(value)
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [value])

  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" aria-label="Day" className="-mx-4 flex flex-1 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] medium:mx-0 medium:px-0">
        {days.map((d) => {
          const on = d === value
          const date = new Date(`${d}T00:00:00Z`)
          return (
            <button
              key={d}
              ref={on ? activeRef : undefined}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date)}
              onClick={() => onChange(d)}
              className={cn('pressable flex h-16 w-12 flex-none flex-col items-center justify-center rounded-lg', on ? 'bg-primary text-on-primary shadow-[0_6px_16px_-6px_var(--fab-glow)]' : 'bg-surface text-ink shadow-surface hover:bg-surface-secondary')}
            >
              <span className={cn('text-caption-strong uppercase', on ? 'text-on-primary/80' : 'text-muted')}>{new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'UTC' }).format(date)}</span>
              <span className="tabular-nums text-number">{date.getUTCDate()}</span>
            </button>
          )
        })}
      </div>
      <DatePicker
        label="Pick a date"
        value={value}
        max={today}
        onChange={(ymd) => ymd && onChange(ymd)}
        trigger={({ open }) => (
          <button
            type="button"
            onClick={open}
            className={cn('pressable flex size-12 flex-none items-center justify-center rounded-full', inStrip ? 'bg-surface text-ink shadow-surface' : 'bg-primary text-on-primary')}
          >
            <Icon name="calendar" />
            <span className="sr-only">Pick another date</span>
          </button>
        )}
      />
    </div>
  )
}

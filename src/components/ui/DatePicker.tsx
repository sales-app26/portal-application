import * as Popover from '@radix-ui/react-popover'
import { useId, useState, type ReactNode } from 'react'
import { useIsSheetLayout } from '@/hooks/useWindowClass'
import { cn } from '@/lib/cn'
import { formatDate, todayIST } from '@/lib/format'
import { Icon } from '@/icons'
import { Calendar } from './Calendar'
import { FieldShell, inputBox } from './Field'
import { ResponsiveOverlay } from './Overlay'

/** `YYYY-MM-DD` → a Date at local midnight, which is what the calendar compares. */
const parse = (ymd?: string): Date | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(ymd ?? '')
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined
}

const format = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * The month a calendar opens on when nothing is picked: today, kept inside the allowed range.
 * (Opening on the latest allowed month put a "next follow-up" calendar a year ahead.)
 */
const startMonth = (min?: Date, max?: Date): Date => {
  const [y, m, d] = todayIST().split('-').map(Number)
  const today = new Date(y, m - 1, d)
  if (min && today < min) return min
  if (max && today > max) return max
  return today
}

interface DatePickerProps {
  label: string
  /** `YYYY-MM-DD`, or '' for none — the API's date format. */
  value: string
  onChange: (ymd: string) => void
  min?: string
  max?: string
  optional?: boolean
  placeholder?: string
  error?: string
  hint?: ReactNode
  disabled?: boolean
  /** Render as a compact trigger (e.g. a calendar icon) instead of a form field. */
  trigger?: (props: { open: () => void }) => ReactNode
}

/**
 * Date picker (UX-COMPONENTS.md §4.3): shadcn's Calendar in a bottom sheet on
 * phones and small tablets, in a popover anchored to the field on laptops.
 * Picking a day applies it and closes. An optional field has a Clear row.
 */
export function DatePicker({ label, value, onChange, min, max, optional, placeholder = 'Choose a date', error, hint, disabled, trigger }: DatePickerProps) {
  const sheet = useIsSheetLayout()
  const [open, setOpen] = useState(false)
  const id = useId()
  const selected = parse(value)
  const minDate = parse(min)
  const maxDate = parse(max)

  const pick = (day: Date | undefined) => {
    // Tapping the selected day again would deselect it; only Clear does that.
    if (!day) return
    onChange(format(day))
    setOpen(false)
  }

  const calendar = (
    <div className={cn('px-1 pt-1', !sheet && 'p-3')}>
      <Calendar
        mode="single"
        selected={selected}
        onSelect={pick}
        defaultMonth={selected ?? startMonth(minDate, maxDate)}
        startMonth={minDate}
        endMonth={maxDate}
        disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
        autoFocus
      />
      {optional && value && (
        <button
          type="button"
          onClick={() => {
            onChange('')
            setOpen(false)
          }}
          className="pressable mt-2 flex h-12 w-full items-center justify-center rounded-xl text-title-sm text-ink hover:bg-default"
        >
          Clear date
        </button>
      )}
    </div>
  )

  if (trigger) {
    return (
      <>
        {trigger({ open: () => setOpen(true) })}
        <ResponsiveOverlay open={open} onOpenChange={setOpen} title={label} variant="choice">
          {calendar}
        </ResponsiveOverlay>
      </>
    )
  }

  const fieldButton = (
    <button
      id={id}
      type="button"
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-invalid={!!error}
      aria-describedby={error || hint ? `${id}-msg` : undefined}
      onClick={() => setOpen(true)}
      className={cn(inputBox, 'flex h-12 items-center gap-2 px-4 text-left aria-expanded:border-primary aria-expanded:ring-3 aria-expanded:ring-focus/25')}
    >
      <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted-soft')}>{selected ? formatDate(value, { withYear: true }) : placeholder}</span>
      <Icon name="calendar" size={20} className="text-muted" />
    </button>
  )

  if (sheet) {
    return (
      <FieldShell label={label} htmlFor={id} error={error} hint={hint} optional={optional}>
        {fieldButton}
        <ResponsiveOverlay open={open} onOpenChange={setOpen} title={label} variant="choice">
          {calendar}
        </ResponsiveOverlay>
      </FieldShell>
    )
  }

  return (
    <FieldShell label={label} htmlFor={id} error={error} hint={hint} optional={optional}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Anchor asChild>{fieldButton}</Popover.Anchor>
        <Popover.Portal>
          <Popover.Content align="start" sideOffset={6} className="z-50 w-[320px] rounded-2xl bg-overlay shadow-overlay">
            {calendar}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </FieldShell>
  )
}

import * as Popover from '@radix-ui/react-popover'
import { useId, useState, type ReactNode } from 'react'
import { useIsSheetLayout } from '@/hooks/useWindowClass'
import { cn } from '@/lib/cn'
import { Icon } from '@/icons'
import { ChoiceList, type ChoiceOption } from './Choice'
import { FieldShell, inputBox } from './Field'
import { ResponsiveOverlay } from './Overlay'

interface PickerProps<T extends string> {
  label: string
  value: T | null
  options: ChoiceOption<T>[]
  onChange: (v: T) => void
  placeholder?: string
  error?: string
  hint?: ReactNode
  /** Custom rendering of the selected value inside the field. */
  renderValue?: (v: T) => ReactNode
  /** Render as a compact trigger (top bar) instead of a form field. */
  trigger?: (props: { open: () => void; label: ReactNode }) => ReactNode
}

/**
 * Quick choice (UX-COMPONENTS.md §3): bottom sheet of 56px rows on phones,
 * a popover anchored to the field on laptops.
 */
export function Picker<T extends string>({ label, value, options, onChange, placeholder = 'Choose', error, hint, renderValue, trigger }: PickerProps<T>) {
  const sheet = useIsSheetLayout()
  const [open, setOpen] = useState(false)
  const id = useId()
  const selected = options.find((o) => o.value === value)
  const shown = value && renderValue ? renderValue(value) : (selected?.label ?? <span className="text-muted-soft">{placeholder}</span>)

  const pick = (v: T) => {
    onChange(v)
    setOpen(false)
  }

  const fieldButton = (
    <button
      id={id}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-invalid={!!error}
      onClick={() => setOpen(true)}
      className={cn(inputBox, 'flex h-12 items-center gap-2 px-4 text-left aria-expanded:border-primary aria-expanded:ring-3 aria-expanded:ring-focus/25')}
    >
      <span className="min-w-0 flex-1 truncate">{shown}</span>
      <Icon name="expand-arrow" size={20} className="text-muted" />
    </button>
  )

  const list = <ChoiceList label={label} options={options} value={value} onSelect={pick} />

  if (trigger) {
    return (
      <>
        {trigger({ open: () => setOpen(true), label: shown })}
        <ResponsiveOverlay open={open} onOpenChange={setOpen} title={label} variant="choice">
          {list}
        </ResponsiveOverlay>
      </>
    )
  }

  if (sheet) {
    return (
      <FieldShell label={label} htmlFor={id} error={error} hint={hint}>
        {fieldButton}
        <ResponsiveOverlay open={open} onOpenChange={setOpen} title={label} variant="choice">
          {list}
        </ResponsiveOverlay>
      </FieldShell>
    )
  }

  return (
    <FieldShell label={label} htmlFor={id} error={error} hint={hint}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Anchor asChild>{fieldButton}</Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="z-50 max-h-[min(400px,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] min-w-64 overflow-y-auto rounded-2xl bg-overlay py-1 shadow-overlay"
          >
            {list}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </FieldShell>
  )
}

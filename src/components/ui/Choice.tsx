import * as ToggleGroup from '@radix-ui/react-toggle-group'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from '@/icons'
import { STATUS_DOT, STATUS_LABEL, STATUS_TINT } from '@/lib/format'
import type { LeadStatus } from '@/lib/types'

export function StatusChip({ status, size = 'md', className, trailing }: { status: LeadStatus; size?: 'sm' | 'md'; className?: string; trailing?: ReactNode }) {
  return (
    <span
      className={cn(
        'chip inline-flex items-center gap-1.5 rounded-pill text-caption-strong whitespace-nowrap text-ink',
        size === 'sm' ? 'h-6 px-2.5' : 'h-7 px-3',
        STATUS_TINT[status],
        className,
      )}
    >
      <span aria-hidden className={cn('size-2 rounded-full', STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
      {trailing}
    </span>
  )
}

/**
 * One-tap status choice for forms: every allowed status visible at once, coloured like the
 * chips in lists. Replaces a dropdown, which cost two taps and a scroll for the commonest action.
 */
export function StatusChoice({
  statuses,
  value,
  onChange,
  label = 'Status',
  error,
}: {
  statuses: LeadStatus[]
  value: LeadStatus | null
  onChange: (s: LeadStatus) => void
  label?: string
  error?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id="status-choice-label" className="text-title-sm text-ink">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby="status-choice-label" aria-invalid={!!error} className="flex flex-wrap gap-2">
        {statuses.map((s) => {
          const on = s === value
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(s)}
              className={cn(
                'pressable inline-flex h-10 items-center gap-2 rounded-pill border px-3.5 text-nav whitespace-nowrap transition-colors',
                on ? cn('border-ink font-semibold text-ink', STATUS_TINT[s]) : 'border-border bg-surface text-ink hover:bg-surface-secondary',
              )}
            >
              <span aria-hidden className={cn('size-2.5 rounded-full', STATUS_DOT[s])} />
              {STATUS_LABEL[s]}
              {on && <Icon name="checkmark" size={16} />}
            </button>
          )
        })}
      </div>
      {error && (
        <p role="alert" className="flex items-center gap-1 text-caption text-down">
          <Icon name="error" size={16} />
          {error}
        </p>
      )}
    </div>
  )
}

export interface ChoiceOption<T extends string> {
  value: T
  label: string
  description?: string
  leading?: ReactNode
  disabled?: boolean
}

/** 56px option rows for quick-choice sheets and popovers (UX-COMPONENTS.md §3). */
export function ChoiceList<T extends string>({ options, value, onSelect, label }: { options: ChoiceOption<T>[]; value?: T | null; onSelect: (v: T) => void; label: string }) {
  return (
    <div role="listbox" aria-label={label} className="flex flex-col py-1">
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="option"
            aria-selected={selected}
            disabled={o.disabled}
            onClick={() => onSelect(o.value)}
            className={cn(
              'mx-2 flex min-h-13 items-center gap-3 rounded-xl px-3 text-left transition-colors active:bg-default disabled:opacity-40 expanded:hover:bg-default',
              selected && 'bg-accent-soft',
            )}
          >
            {o.leading}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn('text-body-md', selected && 'font-semibold text-accent-soft-foreground')}>{o.label}</span>
              {o.description && <span className="text-body-sm text-body">{o.description}</span>}
            </span>
            {selected && <Icon name="checkmark" size={20} className="text-primary" />}
          </button>
        )
      })}
    </div>
  )
}

/** Week / Month, Online / Door-to-door… (UX-COMPONENTS.md §4.3). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
  className?: string
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={cn('inline-flex h-11 max-w-full overflow-x-auto rounded-pill bg-default p-1 [scrollbar-width:none]', className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className="flex-1 rounded-pill px-3.5 whitespace-nowrap text-nav text-body transition-[background-color,box-shadow,color] duration-200 hover:text-ink data-[state=on]:bg-segment data-[state=on]:font-semibold data-[state=on]:text-segment-foreground data-[state=on]:shadow-[0_1px_3px_rgb(15_17_21/0.12)]"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

/** Horizontally scrolling single-select chips (status filter). */
export function FilterChips<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; dot?: string }[]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'pressable inline-flex h-9 flex-none items-center gap-2 rounded-pill border px-4 text-nav whitespace-nowrap transition-colors',
              on ? 'border-transparent bg-ink text-on-ink' : 'border-border bg-surface text-ink hover:bg-surface-secondary',
            )}
          >
            {o.dot && <span aria-hidden className={cn('size-2 rounded-full', o.dot)} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

import * as ToggleGroup from '@radix-ui/react-toggle-group'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from '@/icons'
import { STATUS_DOT, STATUS_LABEL } from '@/lib/format'
import type { LeadStatus } from '@/lib/types'

export function StatusChip({ status, className }: { status: LeadStatus; className?: string }) {
  return (
    <span className={cn('inline-flex h-7 items-center gap-1.5 rounded-pill bg-surface-strong px-3 text-caption-strong whitespace-nowrap text-ink', className)}>
      <span aria-hidden className={cn('size-2 rounded-full', STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
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
export function ChoiceList<T extends string>({
  options,
  value,
  onSelect,
  label,
}: {
  options: ChoiceOption<T>[]
  value?: T | null
  onSelect: (v: T) => void
  label: string
}) {
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
            className="flex min-h-14 items-center gap-3 px-4 text-left active:bg-surface-soft disabled:opacity-40 expanded:px-6 expanded:hover:bg-surface-soft"
          >
            {o.leading}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn('text-body-md', selected && 'font-semibold')}>{o.label}</span>
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
      className={cn('inline-flex h-11 rounded-pill bg-surface-strong p-1', className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className="flex-1 rounded-pill px-4 text-nav text-body transition-colors data-[state=on]:bg-canvas data-[state=on]:font-semibold data-[state=on]:text-ink data-[state=on]:shadow-soft"
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
  options: { value: T; label: string }[]
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
              'pressable h-9 flex-none rounded-pill px-4 text-nav whitespace-nowrap',
              on ? 'bg-ink text-on-dark' : 'bg-surface-strong text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

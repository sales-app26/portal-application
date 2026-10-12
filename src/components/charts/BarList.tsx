import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface BarItem {
  key: string
  label: ReactNode
  /** Plain text for the accessible name and tooltip. */
  name: string
  value: number
  /** Mark colour class; defaults to Pronttera blue. Text never takes the data colour. */
  color?: string
  /** Shown after the value, e.g. "62%". */
  note?: string
  /** Leading identity mark (a status dot). */
  dot?: string
}

/**
 * Horizontal labelled bars: every row names itself, so colour is never the only identity.
 * Bars <= 10px with a 4px rounded end from one baseline; the value sits at the tip.
 * Hover or focus a row to lift it. Used for status counts, the funnel and breakdowns.
 */
export function BarList({ items, format = (n) => String(n), max, title }: { items: BarItem[]; format?: (n: number) => string; max?: number; title: string }) {
  const [active, setActive] = useState<string | null>(null)
  const top = Math.max(1, max ?? Math.max(0, ...items.map((i) => i.value)))
  return (
    <ul aria-label={title} className="flex flex-col gap-3" onPointerLeave={() => setActive(null)}>
      {items.map((i) => (
        <li
          key={i.key}
          tabIndex={0}
          aria-label={`${i.name}: ${format(i.value)}${i.note ? `, ${i.note}` : ''}`}
          onPointerEnter={() => setActive(i.key)}
          onFocus={() => setActive(i.key)}
          onBlur={() => setActive(null)}
          className={cn('rounded-lg outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-focus', active && active !== i.key && 'opacity-55')}
        >
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-body-sm text-ink">
              {i.dot && <span aria-hidden className={cn('size-2.5 flex-none rounded-full', i.dot)} />}
              <span className="truncate">{i.label}</span>
            </span>
            <span className="flex-none text-body-sm font-semibold text-ink tabular-nums">
              {format(i.value)}
              {i.note && <span className="ml-1.5 font-normal text-muted">{i.note}</span>}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-r-[4px] bg-default/70">
            <div className={cn('h-full rounded-r-[4px] transition-[width] duration-500', i.color ?? 'bg-primary')} style={{ width: `${(i.value / top) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

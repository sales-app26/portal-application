import { useId, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface ColumnDatum {
  key: string
  /** Short axis label ("Mon", "12 Oct"). */
  label: string
  value: number
  /** Extra tooltip lines under the value. */
  details?: ReactNode
}

/** 0 / 5 / 10 style ticks: the top rounded up to a clean step. */
function niceMax(max: number): number {
  // Small counts: a whole, even top, so the middle tick is a whole number too.
  if (max <= 10) {
    const top = Math.max(2, Math.ceil(max))
    return top % 2 ? top + 1 : top
  }
  const pow = 10 ** Math.floor(Math.log10(max))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => max / s <= 4) ?? pow * 10
  return Math.ceil(max / step) * step
}

const compact = (n: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

/**
 * A single-series column chart (one axis, one hue): columns <= 24px with 4px rounded tops
 * and 2px gaps, hairline gridlines, sparse x labels. Every column is a focusable hit target
 * with a tooltip (value first, then the label), and the same numbers sit in a table view.
 */
export function ColumnChart({
  data,
  title,
  format = (n) => String(n),
  height = 168,
  className,
}: {
  data: ColumnDatum[]
  /** Names the series (no legend box for one series). Also labels the table view. */
  title: string
  format?: (n: number) => string
  height?: number
  className?: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const tableId = useId()
  // Headroom above the tallest column, so its label sits inside the plot.
  const top = niceMax(Math.max(0, ...data.map((d) => d.value)) * 1.15)
  const ticks = [top, top / 2, 0]
  // Label a handful of x positions, never every one.
  const every = Math.max(1, Math.ceil(data.length / 6))
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0)

  return (
    <figure className={cn('relative', className)}>
      <div className="flex gap-2">
        {/* y ticks: muted text, clean round numbers */}
        <div className="flex flex-none flex-col justify-between pb-6 text-right text-caption text-muted tabular-nums" style={{ height }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
              {compact(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {/* hairline grid */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: height - 24 }} aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="h-px w-full bg-separator" />
            ))}
          </div>
          <div role="list" aria-label={title} className="relative flex items-end gap-[2px]" style={{ height: height - 24 }} onPointerLeave={() => setActive(null)}>
            {data.map((d, i) => {
              const h = top ? (d.value / top) * 100 : 0
              return (
                <div
                  key={d.key}
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${d.label}: ${format(d.value)}`}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="group relative flex h-full min-w-0 flex-1 items-end justify-center outline-none"
                >
                  <span
                    className={cn(
                      'block w-full max-w-6 rounded-t-[4px] transition-[filter,opacity] duration-150',
                      d.value ? 'bg-primary' : 'bg-transparent',
                      active !== null && active !== i ? 'opacity-55' : 'opacity-100',
                      'group-focus-visible:ring-2 group-focus-visible:ring-focus group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-surface',
                    )}
                    style={{ height: `${Math.max(d.value ? 2 : 0, h)}%` }}
                  />
                  {/* the one direct label: the peak */}
                  {i === peak && d.value > 0 && active === null && (
                    <span className="pointer-events-none absolute -translate-y-[calc(100%+4px)] text-caption-strong text-ink tabular-nums" style={{ bottom: `${h}%` }}>
                      {format(d.value)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          {/* sparse x labels */}
          <div className="mt-1.5 flex gap-[2px] text-caption text-muted" aria-hidden>
            {data.map((d, i) => (
              <span key={d.key} className="min-w-0 flex-1 truncate text-center">
                {i % every === 0 || i === data.length - 1 ? d.label : ''}
              </span>
            ))}
          </div>
          {active !== null && data[active] && <Tooltip datum={data[active]} index={active} count={data.length} format={format} title={title} />}
        </div>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-caption font-medium text-muted hover:text-ink">Show as table</summary>
        <table id={tableId} className="mt-2 w-full text-left text-body-sm">
          <caption className="sr-only">{title}</caption>
          <thead className="text-caption text-muted">
            <tr>
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">{title}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key} className="border-t border-separator">
                <td className="py-1">{d.label}</td>
                <td className="py-1 text-right tabular-nums">{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

function Tooltip({ datum, index, count, format, title }: { datum: ColumnDatum; index: number; count: number; format: (n: number) => string; title: string }) {
  const left = ((index + 0.5) / count) * 100
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute top-0 z-10 min-w-28 -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-xl bg-overlay px-3 py-2 shadow-overlay"
      style={{ left: `clamp(56px, ${left}%, calc(100% - 56px))` }}
    >
      <p className="text-title-sm tabular-nums">{format(datum.value)}</p>
      <p className="flex items-center gap-1.5 text-caption text-muted">
        <span aria-hidden className="h-0.5 w-3 rounded-full bg-primary" />
        {title} · {datum.label}
      </p>
      {datum.details && <div className="mt-1 text-caption text-body">{datum.details}</div>}
    </div>
  )
}

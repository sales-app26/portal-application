import { cn } from '@/lib/cn'
import { SOURCE_LABEL, SOURCES } from '@/lib/format'
import type { LeadSource } from '@/lib/types'

/** Where the lead came from, one tap (optional). Feeds the dashboard's "Where leads come from". */
export function SourceChoice({ value, onChange }: { value: LeadSource | null; onChange: (s: LeadSource | null) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id="source-label" className="label text-[15px] font-semibold text-ink">
        Source <span className="text-body-sm font-normal text-muted">(optional)</span>
      </span>
      <div role="radiogroup" aria-labelledby="source-label" className="flex flex-wrap gap-2">
        {SOURCES.map((s) => {
          const on = s === value
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(on ? null : s)}
              className={cn(
                'pressable h-9 rounded-pill border px-3.5 text-body-sm whitespace-nowrap transition-colors',
                on ? 'border-transparent bg-ink font-semibold text-on-ink' : 'border-border bg-surface text-ink hover:bg-surface-secondary',
              )}
            >
              {SOURCE_LABEL[s]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

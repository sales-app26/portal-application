import { FilterChips } from '@/components/ui/Choice'
import { DatePicker } from '@/components/ui/DatePicker'
import { Picker } from '@/components/ui/Picker'
import { useProjectOptions } from '@/features/admin/queries'
import { todayIST } from '@/lib/format'
import { customFrom, presetRange, PRESETS, type PeriodPreset, type ReviewPeriod } from './period'

const ALL = 'all'

/**
 * This month, Last month, This quarter or Custom dates, and (on the scorecard) one campaign.
 * Chips scroll sideways inside themselves on a phone, never the page.
 */
export function PeriodBar({
  value,
  onChange,
  projectId,
  onProjectChange,
}: {
  value: ReviewPeriod
  onChange: (p: ReviewPeriod) => void
  projectId?: string
  /** Shows the campaign filter when there is more than one campaign to choose from. */
  onProjectChange?: (id: string | undefined) => void
}) {
  const today = todayIST()
  const projects = useProjectOptions()
  const campaigns = projects.data ?? []

  const pick = (preset: PeriodPreset) => {
    if (preset === 'custom') {
      onChange(customFrom(value, { to: value.to > today ? today : value.to }))
      return
    }
    onChange({ preset, ...presetRange(preset, today) })
  }

  return (
    <div className="flex flex-col gap-4">
      <FilterChips label="Period" value={value.preset} onChange={pick} options={PRESETS} />
      {(value.preset === 'custom' || (onProjectChange && campaigns.length > 1)) && (
        <div className="grid grid-cols-2 gap-4 large:grid-cols-4">
          {value.preset === 'custom' && (
            <>
              <DatePicker label="From" max={today} value={value.from} onChange={(from) => from && onChange(customFrom(value, { from }))} />
              <DatePicker label="To" min={value.from} max={today} value={value.to} onChange={(to) => to && onChange(customFrom(value, { to }))} />
            </>
          )}
          {onProjectChange && campaigns.length > 1 && (
            <div className="col-span-2 large:col-span-1">
              <Picker
                label="Campaign"
                value={projectId ?? ALL}
                onChange={(v) => onProjectChange(v === ALL ? undefined : v)}
                options={[{ value: ALL, label: 'All my campaigns' }, ...campaigns.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { useMemo } from 'react'
import { DatePicker } from '@/components/ui/DatePicker'
import { Picker } from '@/components/ui/Picker'
import { Button } from '@/components/ui/Button'
import { useProjectOptions, useUserOptions, type DashboardFilter } from './queries'
import { addDays, todayIST } from '@/lib/format'

const ALL = 'all'

/** Quick ranges; the API's weeks run Monday to Sunday in India time. */
export function presetRange(preset: 'today' | '7d' | '30d'): {
  from: string
  to: string
} {
  const to = todayIST()
  return {
    from: preset === 'today' ? to : addDays(to, preset === '7d' ? -6 : -29),
    to,
  }
}

const sameRange = (f: DashboardFilter, p: ReturnType<typeof presetRange>) => f.from === p.from && f.to === p.to

/** Date range, project and person filters (PRD §5.12). Inline on laptops, inside a sheet on phones. */
export function DashboardFilters({ value, onChange }: { value: DashboardFilter; onChange: (v: DashboardFilter) => void }) {
  const projects = useProjectOptions()
  const people = useUserOptions({ isActive: true })
  const presets = useMemo(
    () =>
      [
        ['today', 'Today'],
        ['7d', 'Last 7 days'],
        ['30d', 'Last 30 days'],
      ] as const,
    [],
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick ranges">
        {presets.map(([key, label]) => {
          const on = sameRange(value, presetRange(key))
          return (
            <Button key={key} size="sm" variant={on ? 'primary' : 'secondary'} aria-pressed={on} onClick={() => onChange({ ...value, ...presetRange(key) })}>
              {label}
            </Button>
          )
        })}
      </div>
      <div className="grid grid-cols-2 gap-4 large:grid-cols-4">
        <DatePicker label="From" max={todayIST()} value={value.from} onChange={(from) => from && onChange({ ...value, from, to: value.to < from ? from : value.to })} />
        <DatePicker label="To" min={value.from} max={todayIST()} value={value.to} onChange={(to) => to && onChange({ ...value, to })} />
        <div className="col-span-2 large:col-span-1">
          <Picker
            label="Campaign"
            value={value.projectId ?? ALL}
            onChange={(v) => onChange({ ...value, projectId: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: 'All my campaigns' },
              ...(projects.data ?? []).map((p) => ({
                value: p.id,
                label: p.name,
              })),
            ]}
          />
        </div>
        <div className="col-span-2 large:col-span-1">
          <Picker
            label="Person"
            value={value.userId ?? ALL}
            onChange={(v) => onChange({ ...value, userId: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: 'Everyone' },
              ...(people.data ?? []).map((u) => ({
                value: u.id,
                label: u.name,
              })),
            ]}
          />
        </div>
      </div>
    </div>
  )
}

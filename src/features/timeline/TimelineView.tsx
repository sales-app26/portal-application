import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { FilterChips } from '@/components/ui/Choice'
import { EmptyState, ErrorState, ListSkeleton, Skeleton } from '@/components/ui/Display'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { useWindowClass } from '@/hooks/useWindowClass'
import { plural, todayIST } from '@/lib/format'
import type { Entry, TimelineEntry } from '@/lib/types'
import { DateStrip } from './DateStrip'
import { EditEntryForm } from './EditEntryForm'
import { LazyMap } from './LazyMap'
import type { MapPoint } from './MapView'
import { PhotoViewer } from './PhotoViewer'
import { useTimeline } from './queries'
import { TimelineEntryCard } from './TimelineEntryCard'

const validDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && s <= todayIST() ? s : todayIST())

/** A person's day: date strip, project filter, entries oldest first, map (UX-COMPONENTS.md §9). */
export function TimelineView({ userId }: { userId?: string }) {
  const [params, setParams] = useSearchParams()
  const date = validDate(params.get('date'))
  const [projectId, setProjectId] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [photo, setPhoto] = useState<TimelineEntry | null>(null)
  const [editing, setEditing] = useState<Entry | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const wc = useWindowClass()
  const split = wc === 'expanded' || wc === 'large'

  const q = useTimeline(date, userId)
  const all = q.data?.entries ?? []
  const projects = useMemo(() => [...new Map(all.map((e) => [e.project.id, e.project.name])).entries()], [all])
  const entries = projectId === 'all' ? all : all.filter((e) => e.project.id === projectId)
  const activeFilter = projects.some(([id]) => id === projectId) ? projectId : 'all'

  const points: MapPoint[] = useMemo(
    () => entries.filter((e) => e.latitude !== null && e.longitude !== null).map((e, i) => ({ id: e.id, latitude: e.latitude!, longitude: e.longitude!, accuracy: e.gpsAccuracyM, label: String(i + 1) })),
    [entries],
  )
  const numberOf = (id: string) => points.findIndex((p) => p.id === id) + 1 || undefined

  const setDate = (d: string) => {
    setParams(d === todayIST() ? {} : { date: d }, { replace: true })
    setProjectId('all')
    setSelectedId(null)
  }
  const openMapFor = (id: string) => {
    setSelectedId(id)
    if (!split) setMapOpen(true)
  }

  const list = q.isLoading ? (
    <ListSkeleton rows={3} />
  ) : q.isError ? (
    <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
  ) : entries.length === 0 ? (
    <EmptyState icon="timeline" title={q.data?.message ?? 'Nothing logged on this day.'} className="card card--default rounded-2xl" />
  ) : (
    <ol className="card card--default gap-0 rounded-2xl px-3 py-2 expanded:px-4">
      {entries.map((e) => (
        <TimelineEntryCard
          key={e.id}
          entry={e}
          number={numberOf(e.id)}
          selected={split && selectedId === e.id}
          showProject={projects.length > 1}
          onSelect={split ? () => setSelectedId(e.id) : undefined}
          onOpenPhoto={() => setPhoto(e)}
          onOpenMap={() => openMapFor(e.id)}
          onEdit={() => setEditing(e)}
        />
      ))}
    </ol>
  )

  const controls = (
    <div className="mb-4 flex flex-col gap-3">
      {userId && q.data && <h2 className="text-title-md">{q.data.user.name}</h2>}
      <DateStrip value={date} onChange={setDate} />
      {q.data && all.length > 0 && (
        <p className="text-body-sm text-body" aria-live="polite">
          {[plural(q.data.followUps, 'follow-up'), plural(q.data.visits, 'visit'), q.data.statusChanges ? plural(q.data.statusChanges, 'status change') : null].filter(Boolean).join(' · ')}
        </p>
      )}
      {projects.length > 1 && <FilterChips label="Project" value={activeFilter} onChange={setProjectId} options={[{ value: 'all', label: 'All projects' }, ...projects.map(([id, name]) => ({ value: id, label: name }))]} />}
    </div>
  )

  return (
    <>
      {split ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-8">
          <div>
            {controls}
            {list}
          </div>
          <div className="card card--default sticky top-20 h-[calc(100dvh-176px)] overflow-hidden rounded-2xl p-0">
            {q.isLoading ? <Skeleton className="size-full rounded-none" /> : points.length ? <LazyMap points={points} selectedId={selectedId} onSelect={setSelectedId} className="size-full" /> : <EmptyState icon="marker" title="No visits with a location" body="Door-to-door visits appear here as numbered pins." className="pt-24" />}
          </div>
        </div>
      ) : (
        <>
          {controls}
          {list}
          <ResponsiveOverlay open={mapOpen} onOpenChange={setMapOpen} title="Visit map" variant="form">
            <div className="-mx-4 h-[calc(92dvh-120px)]">
              <LazyMap points={points} selectedId={selectedId} onSelect={setSelectedId} className="size-full" />
            </div>
          </ResponsiveOverlay>
        </>
      )}

      <PhotoViewer entry={photo} title={photo?.lead.name} onClose={() => setPhoto(null)} />
      {editing && <EditEntryForm entry={editing} open onOpenChange={(o) => !o && setEditing(null)} />}
    </>
  )
}

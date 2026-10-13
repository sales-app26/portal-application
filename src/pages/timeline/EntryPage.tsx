import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMe } from '@/auth/AuthProvider'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { StatusChip } from '@/components/ui/Choice'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Display'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { EditEntryForm } from '@/features/timeline/EditEntryForm'
import { LazyMap } from '@/features/timeline/LazyMap'
import { PhotoViewer } from '@/features/timeline/PhotoViewer'
import { useEntry } from '@/features/timeline/queries'
import { VisitPlace } from '@/features/visits/VisitPlace'
import { Icon } from '@/icons'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/format'

/**
 * One entry with its photo and pin. This is where the CSV export's photo links land
 * (`/entries/:id`): sign in, then see the visit proof (api-contract §5).
 */
export function EntryPage() {
  const { id } = useParams()
  const me = useMe()
  const q = useEntry(id)
  const [viewing, setViewing] = useState(false)
  const [editing, setEditing] = useState(false)
  const e = q.data
  const hasGps = !!e && e.latitude !== null && e.longitude !== null

  return (
    <Page title="Follow-up" back="/">
      {q.isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : q.error instanceof ApiError && q.error.code === 'NOT_FOUND' ? (
        <EmptyState icon="search" title="Follow-up not found" body="It may have been deleted, or it belongs to a campaign you can't see." />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : e ? (
        <div className="flex flex-col gap-6 expanded:max-w-[720px]">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={e.status} />
            <span className="text-body-sm text-body">
              {e.entryType === 'status_change' ? 'Status change' : e.hasPhoto ? 'Visit' : 'Follow-up'} by {e.user.name}
            </span>
          </div>
          <p className="text-body-sm text-muted">
            {formatDateTime(e.createdAt)}
            {e.edited && ' · Edited'}
          </p>
          {e.note && <p className="text-body-md whitespace-pre-line">{e.note}</p>}

          {e.hasPhoto && (
            <button
              type="button"
              onClick={() => setViewing(true)}
              className="pressable relative flex h-64 items-center justify-center overflow-hidden rounded-xl bg-surface-strong"
              aria-label="Open visit photo"
            >
              {e.photoUrl && <img src={e.photoUrl} alt="Visit" className="size-full object-cover" />}
              <span className="absolute right-3 bottom-3 flex size-10 items-center justify-center rounded-full bg-surface-dark text-on-dark">
                <Icon name="expand-arrow" size={20} />
              </span>
            </button>
          )}

          {hasGps && (
            <section className="flex flex-col gap-3">
              <LazyMap
                points={[{ id: e.id, latitude: e.latitude!, longitude: e.longitude!, accuracy: e.gpsAccuracyM }]}
                interactive={false}
                className="h-48 rounded-xl border border-hairline"
              />
              <VisitPlace entry={e} mapButton />
            </section>
          )}

          <ListGroup>
            {e.location && <ListRow icon="marker" title={e.location.name} subtitle="Area" />}
            <ListRow icon="contacts" title="Open the lead" to={`/leads/${e.leadId}`} chevron />
          </ListGroup>

          {e.editable && e.user.id === me.id && (
            <Button variant="secondary" icon="edit" onClick={() => setEditing(true)} className="self-start">
              Edit note
            </Button>
          )}
          {!e.hasPhoto && !hasGps && e.entryType === 'follow_up' && (
            <p className="text-caption text-muted">
              Online follow-ups carry no photo or location.{' '}
              <Link to="/day" className="underline">
                Back to My day
              </Link>
            </p>
          )}
        </div>
      ) : null}
      {e && <PhotoViewer entry={viewing ? e : null} title="Visit photo" onClose={() => setViewing(false)} />}
      {e && <EditEntryForm entry={e} open={editing} onOpenChange={setEditing} />}
    </Page>
  )
}

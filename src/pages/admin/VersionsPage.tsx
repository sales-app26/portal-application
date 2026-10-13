import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Page } from '@/components/layout/Page'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState, ErrorState, ListSkeleton, Tag } from '@/components/ui/Display'
import { Confirm, ResponsiveOverlay } from '@/components/ui/Overlay'
import { LazyMarkdown } from '@/components/ui/LazyMarkdown'
import { api } from '@/lib/api'
import { handleFormError } from '@/lib/forms'
import { formatReleaseDate, summarise } from '@/features/versions/format'
import { invalidateVersions, useAdminVersions, useVersionViews } from '@/features/versions/queries'
import { VersionForm } from '@/features/versions/VersionForm'
import { ROLE_LABEL, formatDateTime, plural } from '@/lib/format'
import type { AppVersion } from '@/lib/types'

/** Version manager (Super Admin): every release and its note, drafts included. */
export function VersionsPage() {
  const qc = useQueryClient()
  const { data: versions, isLoading, isError, refetch } = useAdminVersions()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AppVersion | undefined>()
  const [readers, setReaders] = useState<AppVersion | null>(null)
  const [preview, setPreview] = useState<AppVersion | null>(null)
  const [deleting, setDeleting] = useState<AppVersion | null>(null)
  const [busy, setBusy] = useState(false)

  // The API orders by release number, so the first published row is the one people are shown.
  const liveId = versions?.find((v) => v.isPublished)?.id

  const openForm = (v?: AppVersion) => {
    setEditing(v)
    setFormOpen(true)
  }

  const togglePublished = async (v: AppVersion) => {
    try {
      await api(`/versions/${v.id}`, { method: 'PATCH', body: { isPublished: !v.isPublished } })
      toast.success(v.isPublished ? `${v.version} is a draft again.` : `${v.version} published.`)
      await invalidateVersions(qc)
    } catch (err) {
      handleFormError(err)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await api(`/versions/${deleting.id}`, { method: 'DELETE' })
      toast.success(`Update ${deleting.version} deleted.`)
      setDeleting(null)
      await invalidateVersions(qc)
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title="What’s new" cta={{ label: 'New update', icon: 'plus-math', onClick: () => openForm() }}>
      <p className="mb-4 max-w-2xl text-body-sm text-body">
        Every update and the note that goes with it. The newest live update is shown to each person once, the next time they open the app.
      </p>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : isError ? (
        <ErrorState message="Could not load the updates." onRetry={() => void refetch()} />
      ) : !versions || versions.length === 0 ? (
        <EmptyState icon="timeline" title="No updates yet" body="Add one with its note to get started." />
      ) : (
        <ul className="grid gap-3 medium:grid-cols-2">
          {versions.map((v) => (
            <li key={v.id}>
              <Card as="article" className="flex h-full flex-col gap-3">
                <div className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <span className="text-title-md">{v.version}</span>
                    {v.id === liveId && <Tag>Live</Tag>}
                    {!v.isPublished && <Tag>Draft</Tag>}
                    {!v.notify && <Tag>Quiet</Tag>}
                  </div>
                  <ActionMenu
                    label={`Actions for ${v.version}`}
                    title={`Version ${v.version}`}
                    items={[
                      { label: 'Edit', icon: 'edit', onSelect: () => openForm(v) },
                      { label: 'Read the note', icon: 'visible', onSelect: () => setPreview(v) },
                      { label: v.isPublished ? 'Move to drafts' : 'Publish', icon: v.isPublished ? 'invisible' : 'approval', onSelect: () => void togglePublished(v) },
                      { label: 'Delete', icon: 'trash', onSelect: () => setDeleting(v) },
                    ]}
                  />
                </div>

                <div className="min-w-0">
                  <p className="text-title-sm">{v.title ?? 'Untitled update'}</p>
                  <p className="line-clamp-2 text-body-sm text-body">{summarise(v.notes)}</p>
                </div>

                {v.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {v.tags.map((tag) => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between gap-2 border-t border-hairline-soft pt-3 text-caption text-muted">
                  <span>{formatReleaseDate(v.releasedAt)}</span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-xs px-1 py-0.5 underline-offset-2 hover:text-ink hover:underline"
                    onClick={() => setReaders(v)}
                  >
                    {v.seenCount} read
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <VersionForm open={formOpen} onOpenChange={setFormOpen} version={editing} />
      <ReadersSheet version={readers} onClose={() => setReaders(null)} />

      <ResponsiveOverlay
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        title={preview ? `${preview.version}${preview.title ? ` · ${preview.title}` : ''}` : ''}
        description={preview ? `Released ${formatReleaseDate(preview.releasedAt)}` : undefined}
        variant="form"
      >
        {preview && <LazyMarkdown className="pt-2">{preview.notes}</LazyMarkdown>}
      </ResponsiveOverlay>

      <Confirm
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete update ${deleting?.version ?? ''}?`}
        body="The note and the list of who read it both go with it. If this update is live, the previous one becomes the newest again — anyone who had already read that one will not be shown it twice."
        confirmLabel="Delete update"
        loading={busy}
        onConfirm={confirmDelete}
      />
    </Page>
  )
}

/** The read log for one release — who has been shown it, and how many are still to see it. */
function ReadersSheet({ version, onClose }: { version: AppVersion | null; onClose: () => void }) {
  const { data, isLoading } = useVersionViews(version?.id)
  return (
    <ResponsiveOverlay
      open={!!version}
      onOpenChange={(o) => !o && onClose()}
      title={version ? `Who has read ${version.version}` : ''}
      description={data ? `${plural(data.seen.length, 'person', 'people')} read it, ${data.pending} still to see it.` : 'Loading who read it…'}
      variant="form"
    >
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : !data || data.seen.length === 0 ? (
        <p className="py-10 text-center text-body-sm text-body">Nobody has opened this note yet.</p>
      ) : (
        <ul className="divide-y divide-hairline-soft">
          {data.seen.map((r) => (
            <li key={r.userId} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-title-sm">{r.name}</p>
                <p className="truncate text-body-sm text-body">{ROLE_LABEL[r.role]}</p>
              </div>
              <p className="shrink-0 text-caption text-muted">{formatDateTime(r.seenAt)}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="pb-2">
        <Button variant="secondary" block className="mt-4 medium:hidden" onClick={onClose}>
          Close
        </Button>
      </div>
    </ResponsiveOverlay>
  )
}

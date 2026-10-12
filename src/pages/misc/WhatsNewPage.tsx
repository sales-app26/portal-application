import { useState } from 'react'
import { Page } from '@/components/layout/Page'
import { Card, EmptyState, ErrorState, ListSkeleton, Tag } from '@/components/ui/Display'
import { LazyMarkdown } from '@/components/ui/LazyMarkdown'
import { Icon } from '@/icons'
import { formatReleaseDate } from '@/features/versions/format'
import { useVersionHistory } from '@/features/versions/queries'
import { cn } from '@/lib/cn'

/**
 * What's new — the release history to read back through. The dialog only ever
 * shows the newest note, and only once; this answers "which version am I on, and
 * what came with the ones before it". Every role reaches it.
 */
export function WhatsNewPage() {
  const { data: versions, isLoading, isError, refetch } = useVersionHistory()
  const current = versions?.[0]
  // The newest note is open by default — that is what people came to read.
  const [open, setOpen] = useState<Set<string> | null>(null)
  const expanded = open ?? new Set(current ? [current.id] : [])

  const toggle = (id: string) => {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setOpen(next)
  }

  return (
    <Page title="What’s new">
      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : isError ? (
        <ErrorState message="Could not load the updates." onRetry={() => void refetch()} />
      ) : !versions || versions.length === 0 ? (
        <EmptyState icon="timeline" title="Nothing to read yet" body="Updates will show up here as they are released." />
      ) : (
        <div className="flex flex-col gap-4 medium:max-w-[720px]">
          {current && (
            <Card className="flex flex-col gap-0.5">
              <p className="text-title-sm">You’re on version {current.version}</p>
              <p className="text-body-sm text-body">
                Released {formatReleaseDate(current.releasedAt)}
                {current.title ? ` · ${current.title}` : ''}
              </p>
            </Card>
          )}

          <ul className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
            {versions.map((v) => {
              const isOpen = expanded.has(v.id)
              return (
                <li key={v.id} className="border-b border-hairline-soft last:border-b-0">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`note-${v.id}`}
                    onClick={() => toggle(v.id)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-soft expanded:hover:bg-surface-soft"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-title-sm">{v.version}</span>
                        {!v.seen && <Tag>New</Tag>}
                        <span className="text-caption text-muted">{formatReleaseDate(v.releasedAt)}</span>
                      </span>
                      <span className="truncate text-body-sm text-body">{v.title ?? 'Release'}</span>
                    </span>
                    <Icon name="expand-arrow" size={20} className={cn('shrink-0 text-muted-soft transition-transform', isOpen && 'rotate-180')} />
                  </button>
                  {isOpen && (
                    <div id={`note-${v.id}`} className="px-4 pb-5">
                      {v.tags.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-1.5">
                          {v.tags.map((tag) => (
                            <Tag key={tag}>{tag}</Tag>
                          ))}
                        </div>
                      )}
                      <LazyMarkdown>{v.notes}</LazyMarkdown>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Page>
  )
}

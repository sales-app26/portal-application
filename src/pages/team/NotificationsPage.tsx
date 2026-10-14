import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/Display'
import { LoadMore } from '@/components/ui/LoadMore'
import { markRead, useNotifications } from '@/features/team/queries'
import { Icon, type IconName } from '@/icons'
import { cn } from '@/lib/cn'
import { ago, formatTime } from '@/lib/format'
import type { AppNotification, NotificationKind } from '@/lib/types'

const KIND: Record<NotificationKind, { icon: IconName; tone: string }> = {
  transfer_requested: { icon: 'swap', tone: 'bg-accent-soft text-primary' },
  transfer_decided: { icon: 'swap', tone: 'bg-accent-soft text-primary' },
  lead_assigned: { icon: 'contacts', tone: 'bg-success-soft text-up' },
  mention: { icon: 'mention', tone: 'bg-accent-soft text-primary' },
  help_requested: { icon: 'help', tone: 'bg-danger-soft text-down' },
  help_resolved: { icon: 'ok', tone: 'bg-success-soft text-up' },
  comment: { icon: 'comment', tone: 'bg-default text-ink' },
  feedback: { icon: 'thumbs-up', tone: 'bg-warning-soft text-ink' },
  leave_cover: { icon: 'leave', tone: 'bg-default text-ink' },
  training: { icon: 'learn', tone: 'bg-success-soft text-up' },
}

/** Everything that needs the person: transfers, mentions, help, feedback, cover duty. */
export function NotificationsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const list = useNotifications()
  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const unread = items.some((n) => !n.readAt)

  const open = async (n: AppNotification) => {
    if (!n.readAt) void markRead(qc, { ids: [n.id] })
    if (n.link) navigate(n.link)
  }

  return (
    <Page
      title="Notifications"
      back="/"
      actions={
        unread ? (
          <Button variant="tertiary" size="sm" onClick={() => void markRead(qc, { all: true })}>
            Mark all read
          </Button>
        ) : undefined
      }
    >
      <div className="expanded:max-w-[720px]">
        {list.isLoading ? (
          <ListSkeleton rows={5} />
        ) : list.isError ? (
          <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="bell"
            title="You're all caught up"
            body="Handovers, mentions, help requests and feedback from your team show up here."
            className="card card--default rounded-2xl"
          />
        ) : (
          <ul className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
            {items.map((n) => {
              const k = KIND[n.kind] ?? KIND.comment
              return (
                <li key={n.id} className="border-b border-separator last:border-b-0">
                  <button
                    type="button"
                    onClick={() => void open(n)}
                    className={cn('flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-secondary', !n.readAt && 'bg-accent-soft/40')}
                  >
                    <span className={cn('flex size-10 flex-none items-center justify-center rounded-full', k.tone)}>
                      <Icon name={k.icon} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-body-md leading-snug', !n.readAt && 'font-semibold')}>{n.title}</span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-body-sm text-body">{n.body}</span>}
                      <span className="mt-1 block text-caption text-muted">
                        {ago(n.createdAt)}, {formatTime(n.createdAt)}
                      </span>
                    </span>
                    {!n.readAt && <span aria-label="Unread" className="mt-2 size-2.5 flex-none rounded-full bg-primary" />}
                  </button>
                </li>
              )
            })}
            <LoadMore hasNext={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
          </ul>
        )}
      </div>
    </Page>
  )
}

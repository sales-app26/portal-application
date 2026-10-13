import { Link } from 'react-router'
import { Icon } from '@/icons'
import { cn } from '@/lib/cn'
import { useUnreadCount } from './queries'

/** The header bell: unread count on a red badge, opens the inbox. */
export function NotificationBell({ className }: { className?: string }) {
  const unread = useUnreadCount()
  const n = unread.data ?? 0
  return (
    <Link
      to="/notifications"
      aria-label={n ? `Notifications, ${n} unread` : 'Notifications'}
      title="Notifications"
      className={cn('button button--ghost button--icon-only relative size-12! rounded-full! text-ink md:size-11!', className)}
    >
      <Icon name="bell" filled={n > 0} />
      {n > 0 && (
        <span className="absolute top-1.5 right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-down px-1 text-[10px] leading-none font-bold text-white tabular-nums ring-2 ring-background">
          {n > 99 ? '99+' : n}
        </span>
      )}
    </Link>
  )
}

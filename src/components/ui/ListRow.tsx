import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'
import { Icon, type IconName } from '@/icons'

interface ListRowProps {
  icon?: IconName
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  to?: string
  onClick?: () => void
  chevron?: boolean
  destructive?: boolean
  className?: string
}

/** One tap target per row; pressed state is a soft fill (UX-COMPONENTS.md §4.6). */
export function ListRow({ icon, leading, title, subtitle, trailing, to, onClick, chevron, destructive, className }: ListRowProps) {
  const content = (
    <>
      {icon && <Icon name={icon} className={destructive ? 'text-down' : 'text-ink'} />}
      {leading}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate text-title-sm', destructive && 'text-down')}>{title}</span>
        {subtitle && <span className="truncate text-body-sm text-body">{subtitle}</span>}
      </span>
      {trailing}
      {chevron && <Icon name="chevron-right" size={20} className="text-muted-soft" />}
    </>
  )
  const cls = cn(
    'flex min-h-14 w-full items-center gap-3 border-b border-hairline-soft px-4 py-3 text-left last:border-b-0',
    (to || onClick) && 'active:bg-surface-soft expanded:hover:bg-surface-soft',
    className,
  )
  if (to)
    return (
      <Link to={to} className={cls}>
        {content}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {content}
      </button>
    )
  return <div className={cls}>{content}</div>
}

export function ListGroup({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {title && <h2 className="mb-2 px-1 text-caption-strong text-muted uppercase">{title}</h2>}
      <div className="overflow-hidden rounded-xl border border-hairline bg-canvas">{children}</div>
    </section>
  )
}

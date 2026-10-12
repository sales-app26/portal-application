import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon, type IconName } from '@/icons'
import { Button } from './Button'

export function Card({ className, children, as: As = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' }) {
  return <As className={cn('rounded-xl border border-hairline bg-canvas p-5 expanded:p-6', className)}>{children}</As>
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-title-md">{children}</h2>
      {action}
    </div>
  )
}

/** Small tags: Overdue, Low accuracy, Owner inactive… (UX-COMPONENTS.md §4.5). */
export function Tag({ children, tone = 'ink', className }: { children: ReactNode; tone?: 'ink' | 'down' | 'up'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-xs bg-surface-strong px-2 text-caption-strong whitespace-nowrap',
        tone === 'down' ? 'text-down' : tone === 'up' ? 'text-up' : 'text-ink',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-sm', className)} />
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-[72px] items-center gap-3 border-b border-hairline-soft px-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-6 w-20 rounded-pill" />
        </div>
      ))}
    </div>
  )
}

interface EmptyStateProps {
  icon: IconName
  title: string
  body?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, body, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <Icon name={icon} size={48} className="text-muted" />
      <h3 className="mt-4 text-title-md">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-body-sm text-body">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="flex flex-col items-start gap-3">
      <p className="flex items-center gap-2 text-body-sm text-ink">
        <Icon name="error" size={20} className="text-down" />
        {message}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Card>
  )
}

export function Banner({ icon, children, tone = 'neutral' }: { icon: IconName; children: ReactNode; tone?: 'neutral' | 'dark' }) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 text-body-sm',
        tone === 'dark' ? 'bg-surface-dark text-on-dark' : 'bg-surface-strong text-ink',
      )}
    >
      <Icon name={icon} size={20} />
      <span>{children}</span>
    </div>
  )
}

/** Target progress (UX-COMPONENTS.md §4.6). No target: count only, no bar. */
export function ProgressBar({ value, max, label = 'Progress towards target' }: { value: number; max: number; label?: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100))
  const met = value >= max
  return (
    <div className="h-2 w-full overflow-hidden rounded-pill bg-surface-strong" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className={cn('h-full rounded-pill transition-[width] duration-300', met ? 'bg-up' : 'bg-primary')} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function StatTile({
  label,
  value,
  onClick,
  tone = 'ink',
  className,
}: {
  label: string
  value: ReactNode
  onClick?: () => void
  /** `down` paints the number red (overdue), `up` green (done). */
  tone?: 'ink' | 'down' | 'up'
  className?: string
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col items-start gap-0.5 rounded-xl border border-hairline bg-canvas p-4 text-left',
        onClick && 'pressable active:bg-surface-soft expanded:hover:bg-surface-soft',
        tone === 'down' && 'border-down/25 bg-down/5',
        className,
      )}
    >
      <span className={cn('text-display-sm font-semibold tabular-nums', tone === 'down' ? 'text-down' : tone === 'up' ? 'text-up' : 'text-ink')}>{value}</span>
      <span className="w-full text-body-sm leading-tight text-body">{label}</span>
    </Comp>
  )
}

export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  return (
    <span
      aria-hidden
      className={cn('inline-flex flex-none items-center justify-center rounded-full bg-surface-strong text-caption-strong text-ink', className)}
      style={{ width: size, height: size, fontSize: size >= 40 ? 14 : 12 }}
    >
      {initials || '?'}
    </span>
  )
}

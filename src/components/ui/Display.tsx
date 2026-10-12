import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon, type IconName } from '@/icons'
import { Button } from './Button'

/* Display pieces built on HeroUI v3 classes (card, chip, alert, skeleton, progress-bar, avatar). */

export function Card({ className, children, as: As = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' }) {
  return <As className={cn('card card--default gap-0 rounded-2xl p-5 expanded:p-6', className)}>{children}</As>
}

export function SectionTitle({ children, action, description }: { children: ReactNode; action?: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-title-md">{children}</h2>
        {description && <p className="mt-0.5 text-body-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export type Tone = 'ink' | 'down' | 'up' | 'accent' | 'warning'
const CHIP_COLOR: Record<Tone, string> = { ink: 'chip--default', down: 'chip--danger', up: 'chip--success', accent: 'chip--accent', warning: 'chip--warning' }

/** Small tags: Overdue, Low accuracy, Owner inactive… (HeroUI soft chip). */
export function Tag({ children, tone = 'ink', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn('chip chip--soft chip--sm h-6 px-2 text-caption-strong whitespace-nowrap', CHIP_COLOR[tone], tone === 'ink' && 'bg-default', className)}>{children}</span>
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton skeleton--shimmer rounded-lg', className)} />
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-[76px] items-center gap-3 border-b border-separator px-4 last:border-b-0">
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
      <span className="flex size-16 items-center justify-center rounded-full bg-accent-soft text-primary">
        <Icon name={icon} size={30} />
      </span>
      <h3 className="mt-4 text-title-md">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-body-sm text-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="alert alert--danger items-center rounded-2xl">
      <span className="alert__indicator text-down">
        <Icon name="error" size={20} />
      </span>
      <div className="alert__content">
        <p className="alert__title text-ink">Something didn't load</p>
        <p className="alert__description">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

export function Banner({ icon, children, tone = 'neutral' }: { icon: IconName; children: ReactNode; tone?: 'neutral' | 'dark' }) {
  return (
    <div
      role="status"
      className={cn('flex items-center gap-2 px-4 py-2.5 text-body-sm font-medium', tone === 'dark' ? 'bg-surface-dark text-on-dark' : 'bg-accent-soft text-accent-soft-foreground')}
    >
      <Icon name={icon} size={20} />
      <span>{children}</span>
    </div>
  )
}

/** Target progress (UX-COMPONENTS.md §4.6), HeroUI progress bar. `onAccent` for the blue hero card. */
export function ProgressBar({ value, max, label = 'Progress towards target', size = 'md', onAccent }: { value: number; max: number; label?: string; size?: 'sm' | 'md' | 'lg'; onAccent?: boolean }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100))
  const met = value >= max
  return (
    <div className={cn('progress-bar', `progress-bar--${size}`, met ? 'progress-bar--success' : 'progress-bar--accent')} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className={cn('progress-bar__track rounded-pill', onAccent && 'bg-white/25')}>
        <div className={cn('progress-bar__fill rounded-pill transition-[width] duration-500', onAccent && 'bg-white')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const TILE_TONE = {
  ink: { num: 'text-ink', icon: 'bg-default text-ink' },
  accent: { num: 'text-ink', icon: 'bg-accent-soft text-primary' },
  down: { num: 'text-down', icon: 'bg-danger-soft text-down' },
  up: { num: 'text-up', icon: 'bg-success-soft text-up' },
  warning: { num: 'text-ink', icon: 'bg-warning-soft text-warning' },
} as const

export function StatTile({
  label,
  value,
  onClick,
  tone = 'ink',
  icon,
  hint,
  className,
}: {
  label: string
  value: ReactNode
  onClick?: () => void
  /** Colours the number (overdue red, done green) and the icon disc. */
  tone?: keyof typeof TILE_TONE
  icon?: IconName
  /** A small line under the label, e.g. "↑ 12% vs last week". */
  hint?: ReactNode
  className?: string
}) {
  const Comp = onClick ? 'button' : 'div'
  const t = TILE_TONE[tone]
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'card card--default min-w-0 items-start gap-1 rounded-2xl p-4 text-left',
        onClick && 'pressable transition-shadow hover:shadow-lift active:bg-surface-secondary',
        tone === 'down' && 'ring-1 ring-down/25',
        className,
      )}
    >
      <span className="flex w-full items-start justify-between gap-2">
        <span className={cn('text-display-sm font-semibold tracking-tight', t.num)}>{value}</span>
        {icon && (
          <span className={cn('flex size-8 flex-none items-center justify-center rounded-full', t.icon)}>
            <Icon name={icon} size={16} />
          </span>
        )}
      </span>
      <span className="w-full text-body-sm leading-tight text-body">{label}</span>
      {hint && <span className="text-caption text-muted">{hint}</span>}
    </Comp>
  )
}

const AVATAR_TONES = [
  'bg-accent-soft text-accent-soft-foreground',
  'bg-success-soft text-success-soft-foreground',
  'bg-warning-soft text-warning-soft-foreground',
  'bg-[color-mix(in_oklab,var(--status-scheduled)_15%,transparent)] text-ink',
  'bg-danger-soft text-danger-soft-foreground',
  'bg-default text-ink',
]

/** A stable colour per name, so the same client looks the same everywhere. */
const toneFor = (name: string) => AVATAR_TONES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_TONES.length]

/** HeroUI avatar with initials. */
export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  const style: CSSProperties = { width: size, height: size }
  return (
    <span aria-hidden className={cn('avatar flex-none rounded-full', className)} style={style}>
      <span className={cn('avatar__fallback font-semibold', toneFor(name))} style={{ fontSize: size >= 48 ? 17 : size >= 40 ? 14 : 12 }}>
        {initials || '?'}
      </span>
    </span>
  )
}

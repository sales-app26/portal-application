import { cn } from '@/lib/cn'

/**
 * The Pronttera mark (hexagon "P"), traced from the brand artwork. Two static files, one per
 * theme (charcoal ring on light, white ring on dark), so the logo costs no JavaScript and the
 * service worker caches it. `size` is the height; the mark is 938 × 1200.
 */
export function ProntteraMark({ size = 32, className, label }: { size?: number; className?: string; label?: string }) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('inline-flex flex-none', className)}
      style={{ height: size, width: Math.round((size * 938) / 1200) }}
    >
      <img src="/brand/pronttera-mark.svg" alt="" draggable={false} className="size-full dark:hidden" />
      <img src="/brand/pronttera-mark-white.svg" alt="" draggable={false} className="hidden size-full dark:block" />
    </span>
  )
}

/** Mark + "Pronttera Sales" side by side: the drawer, sign-in and splash. */
export function ProntteraLockup({ size = 32, className, tagline }: { size?: number; className?: string; tagline?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <ProntteraMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="font-bold tracking-tight text-ink" style={{ fontSize: size * 0.56 }}>
          Pronttera <span className="text-primary">Sales</span>
        </span>
        {tagline && <span className="mt-1 text-caption text-muted">{tagline}</span>}
      </span>
    </span>
  )
}

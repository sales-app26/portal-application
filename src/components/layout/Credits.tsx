import { cn } from '@/lib/cn'

/** Required by the Icons8 free licence (UX-COMPONENTS.md §8). */
export function IconsCredit({ className }: { className?: string }) {
  return (
    <p className={cn('text-caption text-muted', className)}>
      Icons by{' '}
      <a href="https://icons8.com" target="_blank" rel="noreferrer" className="underline underline-offset-2">
        Icons8
      </a>
    </p>
  )
}

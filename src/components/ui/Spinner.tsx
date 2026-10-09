import { cn } from '@/lib/cn'

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-block animate-spin rounded-full border-2 border-current border-r-transparent', className)}
      style={{ width: size, height: size }}
    />
  )
}

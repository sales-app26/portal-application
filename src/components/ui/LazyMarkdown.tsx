import { lazy, Suspense } from 'react'
import { Skeleton } from './Display'

const Markdown = lazy(() => import('./Markdown').then((m) => ({ default: m.Markdown })))

/**
 * Release notes, with the markdown renderer split out of the first load: it is
 * a sizeable library that only a note on screen needs, and the What's new dialog
 * lives in the app shell, which every signed-in page loads.
 */
export function LazyMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-2 pt-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      }
    >
      <Markdown className={className}>{children}</Markdown>
    </Suspense>
  )
}

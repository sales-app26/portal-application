import { useEffect, useRef } from 'react'
import { Button } from './Button'
import { Spinner } from './Spinner'

/** Loads the next page when scrolled into view; a button as fallback (PRD §8: 20 at a time). */
export function LoadMore({ hasNext, loading, onLoad }: { hasNext: boolean; loading: boolean; onLoad: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !hasNext) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && !loading && onLoad(), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasNext, loading, onLoad])

  if (!hasNext) return null
  return (
    <div ref={ref} className="flex justify-center py-4">
      {loading ? <Spinner className="text-muted" /> : <Button variant="secondary" size="sm" onClick={onLoad}>Load more</Button>}
    </div>
  )
}

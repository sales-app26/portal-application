import { useEffect, useState, type ReactNode } from 'react'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

interface Props {
  title: string
  /** e.g. "Page 3 of 12". */
  status?: string
  zoom?: { percent: number; canIn: boolean; canOut: boolean; step: (dir: 1 | -1) => void }
  /** Under the frame: a hint, or a way out when a site won't show inside the app. */
  note?: ReactNode
  children: ReactNode
}

/**
 * The frame every document, page or video is read in, inside the lesson: a toolbar on top,
 * and a full-screen mode that fills the phone (Esc or the button leaves it). Full screen is
 * the app's own, not the browser's, so it works on iPhones too.
 */
export function ViewerFrame({ title, status, zoom, note, children }: Props) {
  const [full, setFull] = useState(false)

  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false)
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = before
      window.removeEventListener('keydown', onKey)
    }
  }, [full])

  return (
    <section
      aria-label={title}
      className={cn(
        'flex flex-col overflow-hidden bg-surface',
        full ? 'fixed inset-0 z-[70] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]' : 'card card--default gap-0 rounded-2xl p-0',
      )}
    >
      <div className="flex min-h-14 items-center gap-1 border-b border-separator py-1 pr-1 pl-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-title-sm">{title}</p>
          {status && <p className="truncate text-body-sm text-body">{status}</p>}
        </div>
        {zoom && (
          <>
            <IconButton icon="zoom-out" label="Zoom out" disabled={!zoom.canOut} onClick={() => zoom.step(-1)} />
            <span className="w-11 text-center text-body-sm text-body tabular-nums max-medium:hidden">{zoom.percent}%</span>
            <IconButton icon="zoom-in" label="Zoom in" disabled={!zoom.canIn} onClick={() => zoom.step(1)} />
          </>
        )}
        <IconButton icon={full ? 'collapse' : 'expand'} label={full ? 'Exit full screen' : 'Full screen'} onClick={() => setFull((f) => !f)} />
      </div>
      <div className={cn('relative min-h-0', full ? 'flex-1' : 'h-[min(72vh,780px)] min-h-[360px]')}>{children}</div>
      {note && <div className="border-t border-separator px-4 py-2.5 text-body-sm text-body">{note}</div>}
    </section>
  )
}

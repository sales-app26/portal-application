import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Button, IconButton } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import type { IconName } from '@/icons'
import { cn } from '@/lib/cn'

export interface PageCta {
  label: string
  icon?: IconName
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}

interface PageProps {
  title: string
  /** Show a back chevron. A string is the fallback path when there is no history. */
  back?: boolean | string
  /** Top-bar right slot: up to two icon buttons. */
  actions?: ReactNode
  /** Left slot on root pages, e.g. the project switcher. */
  leading?: ReactNode
  /** Primary create action: sticky pill on phones, header button on larger screens. */
  cta?: PageCta
  /** Content under the title that stays with it (search pill, filters). */
  header?: ReactNode
  /** Use the full content width instead of the 1200px cap (tables). */
  wide?: boolean
  children: ReactNode
}

/**
 * Page frame (UX-COMPONENTS.md §4.1). Compact: 56px bar + large title that collapses
 * into the bar on scroll. Medium and up: plain bar, title in the page header.
 */
export function Page({ title, back, actions, leading, cta, header, wide, children }: PageProps) {
  const navigate = useNavigate()
  const sentinel = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const { pull, refreshing } = usePullToRefresh()

  useEffect(() => {
    document.title = `${title} · Sales Tracker`
  }, [title])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { rootMargin: '-56px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const goBack = () => {
    // History-backed when we came from inside the app, else the fallback path.
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate(typeof back === 'string' ? back : '/', { replace: true })
  }

  return (
    <div className={cn('mx-auto w-full', !wide && 'max-w-[1200px]')}>
      {(pull > 0 || refreshing) && (
        <div
          role="status"
          aria-label={refreshing ? 'Refreshing' : 'Pull to refresh'}
          className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center pt-[calc(env(safe-area-inset-top)+8px)]"
          style={{ transform: `translateY(${pull - 40}px)`, opacity: Math.min(1, pull / 48) }}
        >
          <span className="flex size-10 items-center justify-center rounded-full border border-hairline bg-canvas shadow-soft">
            <Spinner size={18} className={cn('text-ink', !refreshing && 'animate-none')} />
          </span>
        </div>
      )}
      <header
        className={cn(
          'sticky top-0 z-10 bg-canvas pt-safe transition-[border-color] duration-150',
          scrolled ? 'border-b border-hairline' : 'border-b border-transparent',
        )}
      >
        <div className="flex h-14 items-center gap-1 px-2 medium:h-16 medium:px-4 expanded:px-6">
          {back ? <IconButton icon="back" label="Back" onClick={goBack} /> : leading ? <div className="min-w-0 pl-2">{leading}</div> : null}
          <h1
            aria-hidden={!scrolled}
            className={cn(
              'min-w-0 flex-1 truncate text-title-md transition-opacity duration-150 medium:hidden',
              back ? '' : 'pl-2',
              scrolled || back ? 'opacity-100' : 'opacity-0',
            )}
          >
            {title}
          </h1>
          <div className="hidden flex-1 medium:block" />
          <div className="flex items-center gap-1">
            {actions}
            {cta && (
              <Button className="ml-2 hidden medium:inline-flex" icon={cta.icon} onClick={cta.onClick} disabled={cta.disabled} loading={cta.loading}>
                {cta.label}
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="px-4 medium:px-6 expanded:px-8">
        {/* Large title: compact only when there is no back button; always on larger screens. */}
        <div className={cn('pt-1 pb-4 medium:pt-2 medium:pb-6', back && 'hidden medium:block')}>
          <h1 className={cn('text-title-lg', back && 'max-medium:sr-only')}>{title}</h1>
        </div>
        <div ref={sentinel} aria-hidden className="h-px" />
        {header && <div className="mb-4">{header}</div>}
        <div className={cn(cta && 'pb-24 medium:pb-8', !cta && 'pb-8')}>{children}</div>
      </div>

      {cta && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 border-t border-hairline bg-canvas px-4 py-3 medium:hidden">
          <Button size="lg" block icon={cta.icon} onClick={cta.onClick} disabled={cta.disabled} loading={cta.loading}>
            {cta.label}
          </Button>
        </div>
      )}
    </div>
  )
}

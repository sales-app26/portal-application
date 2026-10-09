import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

const THRESHOLD = 72
const MAX_PULL = 110

/**
 * Pull down from the top of a page to refetch what's on screen (UX-COMPONENTS.md §6.4).
 * The browser's own pull-to-refresh is off (overscroll-behavior), because on an installed
 * app it would reload the whole app and drop an open form.
 */
export function usePullToRefresh(enabled = true) {
  const qc = useQueryClient()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const start = useRef<{ y: number; x: number } | null>(null)
  const pullRef = useRef(0)
  const busy = useRef(false)

  useEffect(() => {
    if (!enabled || !('ontouchstart' in window)) return

    const setBoth = (v: number) => {
      pullRef.current = v
      setPull(v)
    }
    const onStart = (e: TouchEvent) => {
      // Only from the very top, with one finger, and never inside a sheet or the camera.
      const t = e.target as HTMLElement | null
      if (busy.current || window.scrollY > 0 || e.touches.length !== 1 || t?.closest('[role=dialog], [data-vaul-drawer], input, textarea') || document.body.style.pointerEvents === 'none') return
      start.current = { y: e.touches[0].clientY, x: e.touches[0].clientX }
    }
    const onMove = (e: TouchEvent) => {
      if (!start.current) return
      const dy = e.touches[0].clientY - start.current.y
      const dx = Math.abs(e.touches[0].clientX - start.current.x)
      if (dy <= 0 || dx > dy) return setBoth(0) // scrolling up, or a sideways swipe
      setBoth(Math.min(MAX_PULL, dy * 0.5))
    }
    const onEnd = async () => {
      const reached = pullRef.current >= THRESHOLD
      start.current = null
      if (!reached) return setBoth(0)
      busy.current = true
      setRefreshing(true)
      setBoth(THRESHOLD)
      // At least a moment on screen, so a fast refresh still reads as one.
      await Promise.all([qc.refetchQueries({ type: 'active' }).catch(() => {}), new Promise((r) => setTimeout(r, 600))])
      busy.current = false
      setRefreshing(false)
      setBoth(0)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled, qc])

  return { pull, refreshing }
}

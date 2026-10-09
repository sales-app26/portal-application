import { useEffect, useLayoutEffect, useRef } from 'react'

// Overlays whose history entry is still being unwound (see settleOverlays).
let unwinding = 0

/**
 * Resolves once every just-closed overlay has removed its history entry. Call it between
 * closing an overlay and navigating somewhere new, so the sheet's step back in history
 * can't land in the middle of (and cancel) the navigation.
 */
export async function settleOverlays() {
  await new Promise((r) => setTimeout(r, 20)) // let React run the closing overlay's cleanup
  for (let i = 0; i < 40 && unwinding > 0; i++) await new Promise((r) => setTimeout(r, 10))
}

/**
 * Makes the device back button close an open overlay (UX-COMPONENTS.md §5.3).
 * Opening pushes a history entry; Back pops it and calls onBack. If onBack returns
 * true the overlay stays open (e.g. to ask about unsaved input) and the entry is
 * pushed again. Closing any other way calls history.back() so the stack stays in step.
 */
export function useOverlayHistory(open: boolean, onBack: () => boolean | void) {
  const onBackRef = useRef(onBack)
  useLayoutEffect(() => {
    onBackRef.current = onBack
  })

  useEffect(() => {
    if (!open) return
    const marker = Math.random().toString(36).slice(2)
    const push = () => window.history.pushState({ ...window.history.state, overlay: marker }, '')
    push()
    let pushed = true

    const onPop = () => {
      // A nested overlay (a picker or the camera inside a form) popped its own entry and
      // we're on top again: that Back wasn't for us.
      if (window.history.state?.overlay === marker) return
      pushed = false
      if (onBackRef.current() === true) {
        push()
        pushed = true
      }
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (!pushed) return
      // Unwind our own entry, but only once any navigation caused by the same action
      // (a sign-out redirect) has run. If that navigation replaced or covered our entry,
      // going back would undo it.
      unwinding++
      setTimeout(() => {
        if (window.history.state?.overlay === marker) {
          const done = () => {
            window.removeEventListener('popstate', done)
            clearTimeout(fallback)
            unwinding--
          }
          const fallback = setTimeout(done, 400)
          window.addEventListener('popstate', done)
          window.history.back()
        } else unwinding--
      }, 0)
    }
  }, [open])
}

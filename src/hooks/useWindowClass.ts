import { useSyncExternalStore } from 'react'

// Material 3 window classes (UX-COMPONENTS.md §2). Width only, never user agent.
export type WindowClass = 'compact' | 'medium' | 'expanded' | 'large'

const queries = {
  large: '(min-width: 1200px)',
  expanded: '(min-width: 840px)',
  medium: '(min-width: 600px)',
} as const

function read(): WindowClass {
  if (window.matchMedia(queries.large).matches) return 'large'
  if (window.matchMedia(queries.expanded).matches) return 'expanded'
  if (window.matchMedia(queries.medium).matches) return 'medium'
  return 'compact'
}

function subscribe(onChange: () => void) {
  const lists = Object.values(queries).map((q) => window.matchMedia(q))
  lists.forEach((l) => l.addEventListener('change', onChange))
  return () => lists.forEach((l) => l.removeEventListener('change', onChange))
}

export function useWindowClass(): WindowClass {
  return useSyncExternalStore(subscribe, read, () => 'compact')
}

/** True on phone and small-tablet widths, where overlays become bottom sheets. */
export function useIsSheetLayout() {
  const wc = useWindowClass()
  return wc === 'compact' || wc === 'medium'
}

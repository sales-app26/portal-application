import { useEffect, useState } from 'react'

/** True while the on-screen keyboard covers part of the viewport (UX-COMPONENTS.md §6.6). */
export function useKeyboardOpen() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setOpen(window.innerHeight - vv.height > 150)
    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
  }, [])
  return open
}

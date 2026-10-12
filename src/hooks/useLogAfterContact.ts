import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { takeContact } from '@/lib/contactPrompt'

/** Back sooner than this: the call or chat was cancelled, not made. */
const MIN_AWAY_MS = 4_000
/** Gone longer than this: too late to ask about it. */
const MAX_AWAY_MS = 2 * 60 * 60_000

/**
 * When a rep comes back to the app after a call or WhatsApp started from it, offer to
 * log what happened with one tap. Logging right away is what keeps the history (and
 * every report built on it) true.
 */
export function useLogAfterContact(enabled: boolean) {
  const navigate = useNavigate()
  useEffect(() => {
    if (!enabled) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const c = takeContact()
      if (!c) return
      const away = Date.now() - c.at
      if (away < MIN_AWAY_MS || away > MAX_AWAY_MS) return
      toast(`How did the ${c.kind === 'call' ? 'call' : 'chat'} with ${c.name} go?`, {
        duration: 15_000,
        action: { label: 'Log it', onClick: () => navigate(`/leads/${c.leadId}?log=1`) },
      })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [enabled, navigate])
}

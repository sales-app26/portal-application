import { api } from '@/lib/api'
import type { CaptureToken } from '@/lib/types'

export interface IssuedToken extends CaptureToken {
  /** Local time (ms) by which the save must reach the server. */
  deadline: number
}

/**
 * Server-signed start of the 10-minute photo window (PRD §5.7). The phone clock may
 * be wrong, so the deadline is the window's length counted from when we received it.
 */
export async function fetchCaptureToken(): Promise<IssuedToken> {
  const t = await api<CaptureToken>('/visits/capture-token', { method: 'POST' })
  const windowMs = Date.parse(t.expiresAt) - Date.parse(t.issuedAt)
  return { ...t, deadline: Date.now() + windowMs }
}

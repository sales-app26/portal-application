// The last call or WhatsApp a rep started from the app, so that coming back can offer
// "Log it". Session storage: one tab, gone when the app closes; access is guarded
// because storage can be blocked.

const KEY = 'st.lastContact'

export interface PendingContact {
  leadId: string
  name: string
  kind: 'call' | 'whatsapp'
  at: number
}

export function rememberContact(c: Omit<PendingContact, 'at'>) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...c, at: Date.now() }))
  } catch {
    /* storage blocked: no prompt, nothing else lost */
  }
}

/** Reads and clears the pending contact. */
export function takeContact(): PendingContact | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return raw ? (JSON.parse(raw) as PendingContact) : null
  } catch {
    return null
  }
}

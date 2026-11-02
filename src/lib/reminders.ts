import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** Turned on: this phone gets reminders. Blocked: the person refused in the browser's own prompt. */
export type ReminderState = 'unavailable' | 'needs-install' | 'blocked' | 'off' | 'on'

const SW_WAIT_MS = 5_000

const keyToBytes = (key: string) => {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(key.length / 4) * 4, '=')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

const supportsPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** iPhones allow push only for an app added to the home screen. */
const isIosBrowserTab = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches

/** The running service worker, or null if there isn't one, as in development. */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), SW_WAIT_MS))])
}

async function readState(publicKey: string | null): Promise<ReminderState> {
  if (!publicKey) return 'unavailable'
  if (isIosBrowserTab()) return 'needs-install'
  if (!supportsPush()) return 'unavailable'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off'
}

export async function turnOnReminders(publicKey: string): Promise<void> {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Reminders were not allowed. You can allow them in your browser’s settings.')
  const reg = await registration()
  if (!reg) throw new Error('Reminders aren’t ready on this phone yet. Open the app again and retry.')
  const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) })
  const { endpoint, keys } = subscription.toJSON()
  await api('/notifications/push', { method: 'POST', body: { endpoint, keys } })
}

/** Also on sign-out: the next person on this phone mustn't get these reminders. Never throws. */
export async function turnOffReminders(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.getRegistration()
    const subscription = await reg?.pushManager.getSubscription()
    if (!subscription) return
    await api('/notifications/push/remove', { method: 'POST', body: { endpoint: subscription.endpoint } }).catch(() => undefined)
    await subscription.unsubscribe()
  } catch {
    // The device simply keeps its subscription until the push service drops it.
  }
}

export function useReminders() {
  const qc = useQueryClient()
  const key = useQuery({ queryKey: ['reminders', 'key'], queryFn: () => api<{ publicKey: string | null }>('/notifications/push/key'), staleTime: 60 * 60_000 })
  const publicKey = key.data?.publicKey ?? null
  const state = useQuery({ queryKey: ['reminders', 'state', publicKey], queryFn: () => readState(publicKey), enabled: key.isSuccess })
  return {
    state: state.data ?? 'unavailable',
    turnOn: async () => {
      if (publicKey) await turnOnReminders(publicKey)
      await qc.invalidateQueries({ queryKey: ['reminders', 'state'] })
    },
    turnOff: async () => {
      await turnOffReminders()
      await qc.invalidateQueries({ queryKey: ['reminders', 'state'] })
    },
  }
}

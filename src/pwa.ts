import { toast } from 'sonner'

/**
 * Registers the offline service worker (production only). A new version waits until the
 * user taps Update, so a half-filled form is never reloaded away.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      const offer = (worker: ServiceWorker) =>
        toast('A new version of Pronttera Sales is ready.', {
          duration: Infinity,
          action: {
            label: 'Update',
            onClick: () => {
              navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
              worker.postMessage('SKIP_WAITING')
            },
          },
        })
      // Only offer when an older version is already running the page.
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const w = reg.installing
        w?.addEventListener('statechange', () => w.state === 'installed' && navigator.serviceWorker.controller && offer(w))
      })
    } catch {
      // Offline caching is a bonus; the app works without it.
    }
  })
}

// ---------------------------------------------------------------- install

/** Chrome's install event (not in the TypeScript DOM lib). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/**
 * Keeps Chrome's install prompt (Android, desktop) so "Install Pronttera Sales" can offer it
 * on the person's own tap, instead of the browser's mini bar at a random moment.
 */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export const installState = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => void listeners.delete(l)
  },
  canPrompt: () => !!deferred,
  /** Shows the browser's install dialog; true when the person installed. */
  async prompt(): Promise<boolean> {
    if (!deferred) return false
    const e = deferred
    deferred = null
    notify()
    await e.prompt()
    return (await e.userChoice).outcome === 'accepted'
  },
}

/** Running as the installed app (home-screen icon), not in a browser tab. */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** iPhone or iPad Safari, where installing is "Share → Add to Home Screen". */
export const isIosBrowser = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

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
        toast('A new version is ready.', {
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

import { useSyncExternalStore } from 'react'
import { installState, isIosBrowser, isStandalone } from '@/pwa'

/**
 * What installing looks like here: a one-tap prompt (Chrome), the iPhone steps (Safari),
 * or nothing (already installed, or a browser that can't).
 */
export function useInstall(): { mode: 'prompt' | 'ios' | null; install: () => Promise<boolean> } {
  const canPrompt = useSyncExternalStore(installState.subscribe, installState.canPrompt, () => false)
  const mode = isStandalone() ? null : canPrompt ? 'prompt' : isIosBrowser() ? 'ios' : null
  return { mode, install: installState.prompt }
}

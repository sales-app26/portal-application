import { useCallback, useEffect, useRef, useState } from 'react'

export type GpsState = 'idle' | 'locating' | 'ready' | 'denied' | 'timeout' | 'unavailable'

export interface GpsFix {
  latitude: number
  longitude: number
  accuracy: number
  at: number
}

const TIMEOUT_MS = 20_000 // PRD §5.7: "Could not get your location" after 20 seconds.

/**
 * Watches position while the camera is open and keeps the most accurate recent fix.
 * Low accuracy is accepted and flagged later, never rejected (PRD §5.7).
 */
export function useGps(active: boolean) {
  const [state, setState] = useState<GpsState>('idle')
  const [fix, setFix] = useState<GpsFix | null>(null)
  const [attempt, setAttempt] = useState(0)
  const best = useRef<GpsFix | null>(null)

  useEffect(() => {
    if (!active) return
    if (!navigator.geolocation) {
      setState('unavailable')
      return
    }
    best.current = null
    setFix(null)
    setState('locating')

    const timer = setTimeout(() => {
      if (!best.current) setState('timeout')
    }, TIMEOUT_MS)

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const next: GpsFix = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, at: Date.now() }
        // Prefer a more accurate fix, but never keep one older than 30 s over a fresh one.
        const prev = best.current
        if (!prev || next.accuracy <= prev.accuracy || next.at - prev.at > 30_000) {
          best.current = next
          setFix(next)
        }
        setState('ready')
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setState('denied')
        else if (!best.current && err.code === err.POSITION_UNAVAILABLE) setState('unavailable')
        // TIMEOUT from a single reading: keep watching until our own 20 s limit.
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: TIMEOUT_MS },
    )
    return () => {
      clearTimeout(timer)
      navigator.geolocation.clearWatch(id)
    }
  }, [active, attempt])

  /** Start over: used on retry and on every retake, so GPS is read again with the new photo. */
  const restart = useCallback(() => setAttempt((a) => a + 1), [])
  return { state, fix, restart }
}

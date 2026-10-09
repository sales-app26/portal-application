import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraState = 'idle' | 'starting' | 'ready' | 'denied' | 'unavailable' | 'error'

/** Rear camera stream for the visit photo (PRD §5.7). Never a file picker, so no gallery. */
export function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<CameraState>('idle')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!active) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unavailable')
      return
    }
    let cancelled = false
    setState('starting')
    navigator.mediaDevices
      .getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } } })
      .then(async (stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop())
        streamRef.current = stream
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          await v.play().catch(() => {})
        }
        setState('ready')
      })
      .catch((err: DOMException) => {
        if (cancelled) return
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') setState('denied')
        else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') setState('unavailable')
        else setState('error')
      })
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [active, attempt])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  return { videoRef, state, retry }
}

/**
 * Grabs the current frame as a JPEG. The server resizes to 1280px and re-stamps,
 * so 1280px at 0.8 keeps uploads around 200–300 KB on mobile data (PRD §5.7).
 */
export async function captureFrame(video: HTMLVideoElement, maxEdge = 1280, quality = 0.8): Promise<Blob> {
  const { videoWidth: w, videoHeight: h } = video
  if (!w || !h) throw new Error('Camera is not ready yet.')
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not capture the photo.'))), 'image/jpeg', quality))
}

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, IconButton } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'
import { Icon, type IconName } from '@/icons'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import type { VisitProof } from '@/features/leads/VisitProof'
import { fetchCaptureToken, type IssuedToken } from './captureToken'
import { captureFrame, useCamera } from './useCamera'
import { useGps, type GpsFix } from './useGps'

const LOW_ACCURACY_M = 100

interface Props {
  open: boolean
  onClose: () => void
  onCapture: (proof: VisitProof) => void
}

interface Shot {
  blob: Blob
  url: string
  fix: GpsFix
}

/**
 * Full-screen visit camera (UX-COMPONENTS.md §4.7, PRD §5.7). Live viewfinder plus a
 * GPS fix read at the moment of capture; the shutter waits for both.
 */
export function CameraCapture({ open, onClose, onCapture }: Props) {
  const [shot, setShot] = useState<Shot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const token = useRef<Promise<IssuedToken> | null>(null)
  const viewing = open && !shot
  const camera = useCamera(viewing)
  const gps = useGps(viewing)

  useOverlayHistory(open, onClose)

  // A token per camera session and per retake (api-contract §4).
  useEffect(() => {
    if (!viewing) return
    const p = fetchCaptureToken()
    p.catch(() => {}) // retried on "Use photo"
    token.current = p
  }, [viewing])

  useEffect(() => {
    if (!open) {
      setShot((s) => {
        if (s) URL.revokeObjectURL(s.url)
        return null
      })
      setError(null)
    }
  }, [open])

  if (!open) return null

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!navigator.geolocation
  const shutterReady = camera.state === 'ready' && gps.state === 'ready' && !!gps.fix && !busy

  const takePhoto = async () => {
    const video = camera.videoRef.current
    if (!video || !gps.fix) return
    setBusy(true)
    setError(null)
    try {
      const blob = await captureFrame(video)
      haptic.success()
      setShot({ blob, url: URL.createObjectURL(blob), fix: gps.fix })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const retake = () => {
    if (shot) URL.revokeObjectURL(shot.url)
    setShot(null)
    setError(null)
    gps.restart()
  }

  const acceptPhoto = async () => {
    if (!shot) return
    setBusy(true)
    setError(null)
    try {
      let t: IssuedToken
      try {
        t = await (token.current ?? fetchCaptureToken())
      } catch {
        t = await fetchCaptureToken()
      }
      onCapture({
        photo: shot.blob,
        previewUrl: shot.url,
        latitude: shot.fix.latitude,
        longitude: shot.fix.longitude,
        gpsAccuracyM: Math.round(shot.fix.accuracy * 100) / 100,
        captureToken: t.captureToken,
        deadline: t.deadline,
      })
      // The preview URL now belongs to the form; don't revoke it on close.
      setShot(null)
      onClose()
    } catch (e) {
      haptic.error()
      setError(e instanceof ApiError ? e.message : 'Could not verify the photo. Check your internet and try again.')
    } finally {
      setBusy(false)
    }
  }

  let blocker: { icon: IconName; title: string; body: string; action?: { label: string; onClick: () => void } } | null = null
  if (!supported || camera.state === 'unavailable')
    blocker = { icon: 'camera', title: 'Use your phone to log this visit', body: "Visits need a live photo and your location, and we can't use either here." }
  else if (camera.state === 'denied') blocker = { icon: 'camera', title: 'Allow the camera', body: permissionHelp('camera'), action: { label: 'Try again', onClick: camera.retry } }
  else if (gps.state === 'denied')
    blocker = { icon: 'marker', title: 'Allow your location', body: permissionHelp('location'), action: { label: 'Try again', onClick: gps.restart } }
  else if (gps.state === 'unavailable')
    blocker = {
      icon: 'marker',
      title: 'Turn on location',
      body: 'Location is switched off on this phone. Turn it on in your phone settings, then try again.',
      action: { label: 'Try again', onClick: gps.restart },
    }
  else if (camera.state === 'error')
    blocker = {
      icon: 'error',
      title: 'The camera could not start',
      body: 'Close other apps that use the camera, then try again.',
      action: { label: 'Try again', onClick: camera.retry },
    }

  return createPortal(
    // pointer-events-auto: a sheet underneath turns taps off on <body>; data-overlay-layer keeps
    // that sheet from treating taps here as "outside" and closing.
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Visit photo"
      data-overlay-layer
      className="pointer-events-auto fixed inset-0 z-[70] flex flex-col bg-surface-dark text-on-dark select-none"
    >
      <div className="flex items-center gap-2 px-2 pt-[max(8px,env(safe-area-inset-top))] pb-2">
        <IconButton icon="multiply" label="Close camera" tone="dark" onClick={onClose} />
        <div className="flex-1" />
        {!blocker && <GpsPill state={gps.state} fix={shot?.fix ?? gps.fix} />}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {blocker ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <Icon name={blocker.icon} size={48} className="text-on-dark-soft" />
            <h2 className="mt-4 text-title-md">{blocker.title}</h2>
            <p className="mt-2 max-w-sm text-body-sm text-on-dark-soft">{blocker.body}</p>
            {blocker.action && (
              <Button variant="secondary-dark" className="mt-6" onClick={blocker.action.onClick}>
                {blocker.action.label}
              </Button>
            )}
          </div>
        ) : (
          <>
            <video ref={camera.videoRef} playsInline muted autoPlay aria-hidden className={cn('absolute inset-0 size-full object-cover', shot && 'hidden')} />
            {shot && <img src={shot.url} alt="Photo you just took" className="absolute inset-0 size-full object-contain" />}
            {camera.state === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Spinner size={28} className="text-on-dark-soft" />
              </div>
            )}
            {gps.state === 'timeout' && !shot && (
              <div role="alert" className="absolute inset-x-4 bottom-4 rounded-lg bg-surface-dark-elevated p-4">
                <p className="text-title-sm">Could not get your location</p>
                <p className="mt-1 text-body-sm text-on-dark-soft">Step outside or near a window, then retry.</p>
                <Button size="sm" variant="outline-dark" className="mt-3" onClick={gps.restart}>
                  Retry
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {!blocker && (
        <div className="flex min-h-36 flex-col items-center justify-center gap-3 px-4 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]">
          {error && (
            <p role="alert" className="text-center text-body-sm text-on-dark">
              {error}
            </p>
          )}
          {shot ? (
            <div className="flex w-full max-w-md gap-3">
              <Button variant="outline-dark" size="lg" className="flex-1" onClick={retake} disabled={busy}>
                Retake
              </Button>
              <Button size="lg" className="flex-1" onClick={() => void acceptPhoto()} loading={busy}>
                Use photo
              </Button>
            </div>
          ) : (
            <>
              <button
                type="button"
                aria-label="Take photo"
                disabled={!shutterReady}
                onClick={() => void takePhoto()}
                className="pressable flex size-[72px] items-center justify-center rounded-full border-4 border-on-dark disabled:opacity-40"
              >
                <span className="size-14 rounded-full bg-on-dark" />
              </button>
              <p className="text-caption text-on-dark-soft" aria-live="polite">
                {camera.state !== 'ready' ? 'Starting camera…' : gps.state !== 'ready' ? 'Waiting for your location…' : 'Photograph the shop front'}
              </p>
            </>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}

function GpsPill({ state, fix }: { state: string; fix: GpsFix | null }) {
  if (!fix)
    return (
      <span className="flex h-9 items-center gap-2 rounded-pill bg-surface-dark-elevated px-3 text-caption-strong" aria-live="polite">
        {state === 'timeout' ? <Icon name="high-priority" size={16} /> : <Spinner size={14} />}
        {state === 'timeout' ? 'No location' : 'Locating…'}
      </span>
    )
  const low = fix.accuracy > LOW_ACCURACY_M
  return (
    <span
      className={cn('flex h-9 items-center gap-1.5 rounded-pill bg-surface-dark-elevated px-3 tabular-nums text-caption-strong', low ? 'text-accent-yellow' : 'text-on-dark')}
      aria-live="polite"
      aria-label={`Location found, within about ${Math.round(fix.accuracy)} metres${low ? ', location is approximate' : ''}`}
    >
      <Icon name={low ? 'high-priority' : 'near-me'} size={16} />± {Math.round(fix.accuracy)} m{low && <span className="font-sans">· Approximate</span>}
    </span>
  )
}

function permissionHelp(what: 'camera' | 'location') {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  return ios
    ? `Open Settings › Safari › ${what === 'camera' ? 'Camera' : 'Location'} and choose Allow (or Ask). Then come back and try again.`
    : `Tap the icon next to the address bar › Permissions › ${what === 'camera' ? 'Camera' : 'Location'} › Allow. Then try again.`
}

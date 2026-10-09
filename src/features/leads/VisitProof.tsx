import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Tag } from '@/components/ui/Display'
import { CameraCapture } from '@/features/visits/CameraCapture'
import { Icon } from '@/icons'
import { cn } from '@/lib/cn'

/** What a door-to-door save needs (PRD §5.7). Filled in by the camera step. */
export interface VisitProof {
  photo: Blob
  previewUrl: string
  latitude: number
  longitude: number
  gpsAccuracyM: number
  captureToken: string
  /** Local ms deadline for the save (10 minutes from the server's token). */
  deadline: number
}

// Discard a little early so a save sent in the last seconds doesn't arrive late.
const SAFETY_MS = 15_000

/** "Take photo" card; once taken, a thumbnail with accuracy and the submit countdown. */
export function VisitProofField({ value, onChange, error }: { value: VisitProof | null; onChange: (p: VisitProof | null) => void; error?: string }) {
  const [cameraOpen, setCameraOpen] = useState(false)
  const remaining = useRemaining(value ? value.deadline - SAFETY_MS : null)
  const [expired, setExpired] = useState(false)

  // Past the window the photo is discarded and must be retaken (PRD §5.7).
  useEffect(() => {
    if (value && remaining !== null && remaining <= 0) {
      URL.revokeObjectURL(value.previewUrl)
      onChange(null)
      setExpired(true)
    }
  }, [remaining, value, onChange])

  // Free the preview when the form is closed with a photo still attached.
  useEffect(
    () => () => {
      if (value) URL.revokeObjectURL(value.previewUrl)
    },
    [value],
  )

  const camera = (
    <CameraCapture
      open={cameraOpen}
      onClose={() => setCameraOpen(false)}
      onCapture={(p) => {
        setExpired(false)
        onChange(p)
      }}
    />
  )

  if (!value) {
    return (
      <>
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          className={cn(
            'pressable flex w-full items-center gap-4 rounded-lg border border-dashed bg-surface-soft p-4 text-left active:bg-surface-strong',
            error ? 'border-down' : 'border-hairline',
          )}
        >
          <span className="flex size-12 flex-none items-center justify-center rounded-full bg-primary text-on-primary">
            <Icon name="camera" />
          </span>
          <span className="min-w-0">
            <span className="block text-title-sm">Take photo</span>
            <span className="block text-body-sm text-body">
              {expired ? 'The photo was taken more than 10 minutes ago. Take it again.' : 'A live photo of the shop front, with your location.'}
            </span>
          </span>
        </button>
        {camera}
      </>
    )
  }

  const low = value.gpsAccuracyM > 100
  const mins = Math.floor((remaining ?? 0) / 60_000)
  const secs = Math.floor(((remaining ?? 0) % 60_000) / 1000)

  return (
    <>
      <div className="flex items-center gap-4 rounded-lg border border-hairline p-3">
        <img src={value.previewUrl} alt="Visit photo" className="size-20 flex-none rounded-md bg-surface-strong object-cover" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-title-sm">
            <Icon name="checkmark" size={20} className="text-up" /> Photo taken
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-caption text-body">
            ± {Math.round(value.gpsAccuracyM)} m{low && <Tag className="font-sans">Low accuracy</Tag>}
          </p>
          <p className={cn('mt-1 text-caption', (remaining ?? 0) < 120_000 ? 'text-down' : 'text-muted')} aria-live="off">
            Save within {mins}:{String(secs).padStart(2, '0')}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setCameraOpen(true)}>
          Retake
        </Button>
      </div>
      {camera}
    </>
  )
}

function useRemaining(deadline: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (deadline === null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [deadline])
  return deadline === null ? null : deadline - now
}

/** JSON for online projects; multipart with the photo for door-to-door (api-contract §4). */
export function entryBody(fields: Record<string, string | undefined>, proof: VisitProof | null): Record<string, string> | FormData {
  const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== '')) as Record<string, string>
  if (!proof) return clean
  const fd = new FormData()
  for (const [k, v] of Object.entries(clean)) fd.append(k, v)
  fd.append('latitude', String(proof.latitude))
  fd.append('longitude', String(proof.longitude))
  fd.append('gpsAccuracyM', String(proof.gpsAccuracyM))
  fd.append('captureToken', proof.captureToken)
  fd.append('photo', proof.photo, 'visit.jpg')
  return fd
}

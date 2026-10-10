import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Tag } from '@/components/ui/Display'
import { LazyMarkdown } from '@/components/ui/LazyMarkdown'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { settleOverlays } from '@/hooks/useOverlayHistory'
import { formatReleaseDate } from './format'
import { useLatestVersion, useMarkVersionSeen } from './queries'

/**
 * "What's new" — shown once per person per release.
 *
 * Whether it has been seen is a server-side record, not browser storage: the
 * same person opens the tracker on a phone and a laptop, and local storage
 * would raise it on each. A release published quietly (`notify` off, as 1.0.0
 * is) shows its number in the app but never this dialog.
 */
export function WhatsNewDialog() {
  const navigate = useNavigate()
  const { data } = useLatestVersion()
  const markSeen = useMarkVersionSeen()
  // Only "this tab already closed it": open is derived, so the dialog appears the
  // moment the query resolves, and cannot flash back in the gap before the write lands.
  const [dismissedId, setDismissedId] = useState<string | null>(null)

  const open = Boolean(data && data.notify && !data.seen && data.id !== dismissedId)

  const close = () => {
    if (!data) return
    setDismissedId(data.id)
    markSeen.mutate(data.id)
  }

  if (!data) return null

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(next) => !next && close()}
      title={data.title ?? 'What’s new'}
      description={`Version ${data.version} · ${formatReleaseDate(data.releasedAt)}`}
      variant="form"
      footer={
        <div className="flex flex-col gap-2 medium:flex-row-reverse">
          <Button size="lg" block onClick={close}>
            Got it
          </Button>
          <Button
            size="lg"
            block
            variant="secondary"
            onClick={async () => {
              // Opening the history counts as having read this one.
              close()
              await settleOverlays()
              navigate('/whats-new')
            }}
          >
            See all updates
          </Button>
        </div>
      }
    >
      {data.tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5 pt-1">
          {data.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      )}
      <LazyMarkdown>{data.notes}</LazyMarkdown>
    </ResponsiveOverlay>
  )
}

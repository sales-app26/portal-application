import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Tag } from '@/components/ui/Display'
import { TextAreaField } from '@/components/ui/Field'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { Icon } from '@/icons'
import { ApiError, apiWithMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import type { Transfer } from '@/lib/types'
import { invalidateTransfers } from './queries'

/** One transfer request (PRD §5.10). Approve and Reject only when the API says canDecide. */
export function TransferCard({ t }: { t: Transfer }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<'approve' | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [rejectBusy, setRejectBusy] = useState(false)

  const decide = async (action: 'approve' | 'reject', body: { note?: string }) => {
    try {
      const { message } = await apiWithMessage(`/transfers/${t.id}/${action}`, { method: 'POST', body })
      haptic.success()
      toast.success(message)
      invalidateTransfers(qc)
      return true
    } catch (err) {
      // "Already decided by Asha." and similar: show it verbatim and refresh the row (PRD §5.10).
      if (err instanceof ApiError && err.code === 'TRANSFER_ALREADY_DECIDED') {
        haptic.error()
        toast.error(err.message)
        invalidateTransfers(qc)
        return true
      }
      handleFormError(err)
      return false
    }
  }

  const pending = t.status === 'pending'
  return (
    <li className="rounded-xl border border-hairline bg-canvas p-4">
      <div className="flex items-start justify-between gap-3">
        <Link to={`/leads/${t.lead.id}`} className="min-w-0 active:underline">
          <p className="truncate text-title-sm">{t.lead.name}</p>
          <p className="truncate text-body-sm text-body">{[t.lead.businessName, t.lead.projectName].filter(Boolean).join(' · ')}</p>
        </Link>
        <Tag tone={t.status === 'approved' ? 'up' : t.status === 'rejected' ? 'down' : 'ink'} className="flex-none capitalize">
          {t.status}
        </Tag>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-md">
        <span className="font-semibold">{t.fromUser.name}</span>
        <Icon name="forward" size={16} className="text-muted" />
        <span className="font-semibold">{t.toUser.name}</span>
      </p>
      <p className="mt-1 text-body-sm whitespace-pre-line text-body">“{t.reason}”</p>
      <p className="mt-2 text-caption text-muted">
        Requested by {t.requestedBy.name} · {formatDateTime(t.createdAt)}
        {t.decidedBy && ` · ${t.status === 'approved' ? 'Approved' : 'Rejected'} by ${t.decidedBy.name}`}
        {!t.decidedBy && t.decisionNote && ` · ${t.decisionNote}`}
      </p>
      {t.decidedBy && t.decisionNote && <p className="mt-1 text-caption text-muted">Note: {t.decisionNote}</p>}

      {pending &&
        (t.canDecide ? (
          <div className="mt-4 flex gap-3">
            <Button
              className="flex-1"
              loading={busy === 'approve'}
              onClick={async () => {
                setBusy('approve')
                await decide('approve', {})
                setBusy(null)
              }}
            >
              Approve
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setRejecting(true)}>
              Reject
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-caption-strong text-muted">Needs another admin</p>
        ))}

      <ResponsiveOverlay
        open={rejecting}
        onOpenChange={setRejecting}
        title="Reject transfer"
        description={`${t.lead.name}: ${t.fromUser.name} → ${t.toUser.name}`}
        variant="short"
        dirty={note.length > 0 && !rejectBusy}
        footer={
          <Button
            size="lg"
            block
            loading={rejectBusy}
            onClick={async () => {
              setRejectBusy(true)
              const done = await decide('reject', note.trim() ? { note: note.trim() } : {})
              setRejectBusy(false)
              if (done) {
                setRejecting(false)
                setNote('')
              }
            }}
          >
            Reject transfer
          </Button>
        }
      >
        <div className="pt-1">
          <TextAreaField label="Reason" optional placeholder="The owner will see this." value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </div>
      </ResponsiveOverlay>
    </li>
  )
}

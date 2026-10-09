import { useState } from 'react'
import { Page } from '@/components/layout/Page'
import { Segmented } from '@/components/ui/Choice'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/Display'
import { LoadMore } from '@/components/ui/LoadMore'
import { TransferCard } from '@/features/admin/TransferCard'
import { useTransferList } from '@/features/admin/queries'
import type { TransferStatus } from '@/lib/types'

const COPY: Record<TransferStatus, { title: string; body: string }> = {
  pending: { title: 'No transfers waiting', body: 'When someone asks to move a lead, it shows up here for approval.' },
  approved: { title: 'No approved transfers yet', body: '' },
  rejected: { title: 'No rejected transfers', body: '' },
}

/** Pending requests to approve or reject, and past decisions (PRD §6). */
export function TransfersPage() {
  const [status, setStatus] = useState<TransferStatus>('pending')
  const q = useTransferList(status)
  const items = q.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <Page
      title="Transfers"
      header={
        <Segmented
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'pending', label: 'Pending' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
          ]}
          className="w-full medium:w-auto"
        />
      }
    >
      <div className="expanded:max-w-[720px]">
        {q.isLoading ? (
          <ListSkeleton rows={3} />
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon="swap" title={COPY[status].title} body={COPY[status].body} />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {items.map((t) => (
                <TransferCard key={t.id} t={t} />
              ))}
            </ul>
            <LoadMore hasNext={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoad={() => void q.fetchNextPage()} />
          </>
        )}
      </div>
    </Page>
  )
}

import { useState } from 'react'
import { useMe } from '@/auth/AuthProvider'
import { Page } from '@/components/layout/Page'
import { Segmented } from '@/components/ui/Choice'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/Display'
import { LoadMore } from '@/components/ui/LoadMore'
import { TransferCard } from '@/features/admin/TransferCard'
import { useTransferList } from '@/features/admin/queries'
import type { TransferStatus } from '@/lib/types'

const COPY: Record<TransferStatus, { title: string; body: string }> = {
  pending: { title: 'No handover requests', body: 'Requests to move a lead show up here until a sales manager decides.' },
  approved: { title: 'No approved handovers yet', body: '' },
  rejected: { title: 'No rejected handovers', body: '' },
}

/** Pending requests to approve or reject, and past decisions (PRD §6). */
export function TransfersPage() {
  const me = useMe()
  const rep = me.role === 'sales_person'
  const [status, setStatus] = useState<TransferStatus>('pending')
  const q = useTransferList(status)
  const items = q.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <Page
      title={rep ? 'My handovers' : 'Handovers'}
      back={rep ? '/profile' : undefined}
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

import { useQuery } from '@tanstack/react-query'
import { isAdmin, useAuth } from '@/auth/AuthProvider'
import { api } from '@/lib/api'

export const PENDING_TRANSFERS_KEY = ['transfers', 'pending-count'] as const

/** Count badge on the Transfers nav item (PRD §5.12). Admins only. */
export function usePendingTransfers() {
  const { me } = useAuth()
  const q = useQuery({
    queryKey: PENDING_TRANSFERS_KEY,
    queryFn: () => api<{ pending: number }>('/transfers/pending-count'),
    enabled: !!me && isAdmin(me),
    staleTime: 60_000,
  })
  return q.data?.pending ?? 0
}

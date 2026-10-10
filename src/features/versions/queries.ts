import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AppVersion, LatestVersion, VersionHistoryItem, VersionViews } from '@/lib/types'

export const LATEST_VERSION_KEY = ['versions', 'latest'] as const
const HISTORY_KEY = ['versions', 'history'] as const
const ADMIN_KEY = ['versions', 'admin'] as const

/** `null` until a release has been published. */
export const useLatestVersion = () =>
  useQuery({ queryKey: LATEST_VERSION_KEY, staleTime: 5 * 60_000, queryFn: () => api<LatestVersion | null>('/versions/latest') })

export const useVersionHistory = () => useQuery({ queryKey: HISTORY_KEY, queryFn: () => api<VersionHistoryItem[]>('/versions') })

/** Super Admin: every release, drafts included. */
export const useAdminVersions = () => useQuery({ queryKey: ADMIN_KEY, queryFn: () => api<AppVersion[]>('/versions/admin') })

export const useVersionViews = (id: string | undefined) =>
  useQuery({ queryKey: ['versions', 'views', id], enabled: !!id, queryFn: () => api<VersionViews>(`/versions/${id}/views`) })

/** Everything a write can change: the manager, the history, and what the dialog shows. */
export const invalidateVersions = (qc: QueryClient) => qc.invalidateQueries({ queryKey: ['versions'] })

/**
 * Marks the note read. Updates the cached `latest` in place rather than
 * refetching it: the dialog is closing anyway, and a refetch only to watch
 * `seen` flip would repaint the screen behind it for nothing.
 */
export function useMarkVersionSeen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/versions/${id}/seen`, { method: 'POST' }),
    onMutate: (id) => {
      qc.setQueryData<LatestVersion | null>(LATEST_VERSION_KEY, (v) => (v && v.id === id ? { ...v, seen: true } : v))
      qc.setQueryData<VersionHistoryItem[]>(HISTORY_KEY, (list) => list?.map((v) => (v.id === id ? { ...v, seen: true } : v)))
    },
  })
}

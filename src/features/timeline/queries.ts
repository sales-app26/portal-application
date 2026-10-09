import { useQuery, type QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Entry, Summary, Timeline } from '@/lib/types'

export const timelineKey = (date: string, userId?: string, projectId?: string) => ['timeline', date, userId ?? 'me', projectId ?? 'all'] as const

/** One person's day, entries oldest first (PRD §5.11). `userId` omitted = the caller. */
export function useTimeline(date: string, userId?: string, projectId?: string) {
  return useQuery({
    queryKey: timelineKey(date, userId, projectId),
    queryFn: () => api<Timeline>('/timeline', { query: { date, userId, projectId } }),
  })
}

export function useEntry(id: string | undefined) {
  return useQuery({ queryKey: ['entries', id], enabled: !!id, queryFn: () => api<Entry>(`/entries/${id}`) })
}

/** Signed photo links expire (10 min by default), so a fresh one is fetched when the viewer opens. */
export const fetchPhotoUrl = (entryId: string) => api<{ url: string; expiresInSeconds: number }>(`/entries/${entryId}/photo`)

export function invalidateTimelines(qc: QueryClient, entryId?: string) {
  void qc.invalidateQueries({ queryKey: ['timeline'] })
  void qc.invalidateQueries({ queryKey: ['leads'] })
  if (entryId) void qc.invalidateQueries({ queryKey: ['entries', entryId] })
}

/** One person's week or month, counted day by day (admins; PRD addendum). */
export function useSummary(userId: string, from: string, to: string) {
  return useQuery({
    queryKey: ['timeline', 'summary', userId, from, to],
    queryFn: () => api<Summary>('/timeline/summary', { query: { userId, from, to } }),
  })
}

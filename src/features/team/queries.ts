import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AppNotification, Covering, Leaderboard, LeadComment, Leave, MessageTemplate, Paginated, PersonRef, RosterRow } from '@/lib/types'

export const teamKeys = {
  unread: ['notifications', 'unread'] as const,
  notifications: ['notifications', 'list'] as const,
  comments: (leadId: string) => ['leads', 'comments', leadId] as const,
  mentionable: (leadId: string) => ['leads', 'mentionable', leadId] as const,
  covering: (projectId?: string) => ['me', 'covering', projectId ?? 'all'] as const,
  leaves: (userId?: string) => ['leaves', userId ?? 'scope'] as const,
  leaderboard: (projectId: string, period: string) => ['projects', projectId, 'leaderboard', period] as const,
  roster: (projectId?: string) => ['team', 'roster', projectId ?? 'all'] as const,
  templates: (projectId: string) => ['projects', projectId, 'templates'] as const,
}

/** The bell's number. Polled once a minute and on return to the app, so it stays fresh without push. */
export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: teamKeys.unread,
    enabled,
    queryFn: () => api<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    select: (d) => d.count,
  })
}

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: teamKeys.notifications,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<Paginated<AppNotification>>('/notifications', { query: { page: pageParam, limit: 30 } }),
    getNextPageParam: (last) => (last.meta.hasNextPage ? last.meta.page + 1 : undefined),
  })
}

export async function markRead(qc: QueryClient, body: { ids?: string[]; all?: boolean }) {
  await api('/notifications/read', { method: 'POST', body })
  void qc.invalidateQueries({ queryKey: ['notifications'] })
}

export function useComments(leadId: string) {
  return useQuery({ queryKey: teamKeys.comments(leadId), queryFn: () => api<LeadComment[]>(`/leads/${leadId}/comments`) })
}

export function useMentionable(leadId: string, enabled: boolean) {
  return useQuery({ queryKey: teamKeys.mentionable(leadId), enabled, queryFn: () => api<PersonRef[]>(`/leads/${leadId}/mentionable`), staleTime: 5 * 60_000 })
}

export function useCovering(projectId?: string, enabled = true) {
  return useQuery({ queryKey: teamKeys.covering(projectId), enabled, queryFn: () => api<Covering[]>('/me/covering', { query: { projectId } }) })
}

export function useLeaves(userId?: string) {
  return useQuery({ queryKey: teamKeys.leaves(userId), queryFn: () => api<Leave[]>('/leaves', { query: { userId } }) })
}

export function useLeaderboard(projectId: string | undefined, period: 'week' | 'month') {
  return useQuery({
    queryKey: teamKeys.leaderboard(projectId ?? '-', period),
    enabled: !!projectId,
    queryFn: () => api<Leaderboard>(`/projects/${projectId}/leaderboard`, { query: { period } }),
  })
}

export function useRoster(projectId?: string) {
  return useQuery({ queryKey: teamKeys.roster(projectId), queryFn: () => api<RosterRow[]>('/team/roster', { query: { projectId } }) })
}

export function useTemplates(projectId: string | undefined) {
  return useQuery({
    queryKey: teamKeys.templates(projectId ?? '-'),
    enabled: !!projectId,
    queryFn: () => api<MessageTemplate[]>(`/projects/${projectId}/templates`),
    staleTime: 10 * 60_000,
  })
}

/** After any team change: who is on leave, who covers whom, the roster. */
export function invalidateTeam(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['leaves'] })
  void qc.invalidateQueries({ queryKey: ['team'] })
  void qc.invalidateQueries({ queryKey: ['me'] })
  void qc.invalidateQueries({ queryKey: ['projects'] })
  void qc.invalidateQueries({ queryKey: ['users'] })
}

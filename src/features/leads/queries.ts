import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Entry, LeadDetail, LeadSort, LeadStatus, LeadSummary, MeHome, Member, Paginated } from '@/lib/types'

export interface LeadListFilter {
  search?: string
  status?: LeadStatus | null
  mine?: boolean
  sort?: LeadSort
  /** Admins: one owner, or leads whose owner is inactive or removed. */
  ownerId?: string
  ownerUnavailable?: boolean
}

export const leadKeys = {
  all: ['leads'] as const,
  list: (projectId: string, f: LeadListFilter) => ['leads', 'list', projectId, f] as const,
  detail: (id: string) => ['leads', 'detail', id] as const,
  entries: (id: string) => ['leads', 'entries', id] as const,
}
export const homeKeys = {
  home: (projectId?: string) => ['me', 'home', projectId ?? 'all'] as const,
  due: (projectId?: string) => ['me', 'due', projectId ?? 'all'] as const,
}

const PAGE = 20

export function useLeadList(projectId: string | undefined, f: LeadListFilter) {
  return useInfiniteQuery({
    queryKey: leadKeys.list(projectId ?? '-', f),
    enabled: !!projectId,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api<Paginated<LeadSummary>>(`/projects/${projectId}/leads`, {
        signal,
        query: { page: pageParam, limit: PAGE, search: f.search, status: f.status ?? undefined, mine: f.mine ? 'true' : undefined, sort: f.sort, ownerId: f.ownerId, ownerUnavailable: f.ownerUnavailable ? 'true' : undefined },
      }),
    getNextPageParam: (last) => (last.meta.hasNextPage ? last.meta.page + 1 : undefined),
  })
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: leadKeys.detail(id ?? '-'),
    enabled: !!id,
    queryFn: () => api<LeadDetail>(`/leads/${id}`),
  })
}

/** Older history beyond the 20 entries embedded in the lead. */
export function useLeadEntries(id: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: leadKeys.entries(id),
    enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<Paginated<Entry>>(`/leads/${id}/entries`, { query: { page: pageParam, limit: PAGE } }),
    getNextPageParam: (last) => (last.meta.hasNextPage ? last.meta.page + 1 : undefined),
  })
}

export function useHome(projectId?: string) {
  return useQuery({
    queryKey: homeKeys.home(projectId),
    queryFn: () => api<MeHome>('/me/home', { query: { projectId } }),
  })
}

export function useDueToday(projectId?: string) {
  return useInfiniteQuery({
    queryKey: homeKeys.due(projectId),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<Paginated<LeadSummary>>('/me/due-today', { query: { page: pageParam, limit: PAGE, projectId } }),
    getNextPageParam: (last) => (last.meta.hasNextPage ? last.meta.page + 1 : undefined),
  })
}

export function useMembers(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['projects', projectId, 'members'],
    enabled,
    queryFn: () => api<Member[]>(`/projects/${projectId}/members`),
    staleTime: 5 * 60_000,
  })
}

/** After any save that touches a lead: refresh lists, home counts and the detail. */
export function invalidateLeadData(qc: QueryClient, leadId?: string) {
  void qc.invalidateQueries({ queryKey: leadKeys.all })
  void qc.invalidateQueries({ queryKey: ['me'], predicate: (q) => q.queryKey[1] !== undefined })
  if (leadId) void qc.invalidateQueries({ queryKey: leadKeys.detail(leadId) })
}

import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query'
import { ME_KEY } from '@/auth/AuthProvider'
import { api } from '@/lib/api'
import type { Dashboard, Member, Paginated, Project, ProjectStatus, Transfer, TransferStatus, User, UserRole } from '@/lib/types'
import { PENDING_TRANSFERS_KEY } from '@/hooks/usePendingTransfers'

const PAGE = 20
const next = <T>(last: Paginated<T>) => (last.meta.hasNextPage ? last.meta.page + 1 : undefined)

// ---------------------------------------------------------------- users

export interface UserFilter {
  role?: UserRole
  isActive?: boolean
  search?: string
}

export function useUserList(f: UserFilter) {
  return useInfiniteQuery({
    queryKey: ['users', 'list', f],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api<Paginated<User>>('/users', { signal, query: { page: pageParam, limit: PAGE, role: f.role, isActive: f.isActive === undefined ? undefined : String(f.isActive), search: f.search } }),
    getNextPageParam: next,
  })
}

/** One page of up to 100 people, for pickers and filters. */
export function useUserOptions(f: { role?: UserRole; isActive?: boolean } = {}, enabled = true) {
  return useQuery({
    queryKey: ['users', 'options', f],
    enabled,
    staleTime: 60_000,
    queryFn: () => api<Paginated<User>>('/users', { query: { limit: 100, role: f.role, isActive: f.isActive === undefined ? undefined : String(f.isActive) } }).then((p) => p.items),
  })
}

// ---------------------------------------------------------------- projects

export function useProjectList(f: { status?: ProjectStatus; search?: string }) {
  return useInfiniteQuery({
    queryKey: ['projects', 'list', f],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api<Paginated<Project>>('/projects', { signal, query: { page: pageParam, limit: PAGE, status: f.status, search: f.search } }),
    getNextPageParam: next,
  })
}

export function useProjectOptions() {
  return useQuery({
    queryKey: ['projects', 'options'],
    staleTime: 60_000,
    queryFn: () => api<Paginated<Project>>('/projects', { query: { limit: 100 } }).then((p) => p.items),
  })
}

export const useProjectDetail = (id: string | undefined) => useQuery({ queryKey: ['projects', 'detail', id], enabled: !!id, queryFn: () => api<Project>(`/projects/${id}`) })

export const projectMembersKey = (projectId: string) => ['projects', projectId, 'members', 'admin'] as const
export function useProjectMembers(projectId: string) {
  return useQuery({ queryKey: projectMembersKey(projectId), queryFn: () => api<Member[]>(`/projects/${projectId}/members`, { query: { includeRemoved: 'false' } }) })
}

// ---------------------------------------------------------------- transfers

export function useTransferList(status: TransferStatus) {
  return useInfiniteQuery({
    queryKey: ['transfers', 'list', status],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<Paginated<Transfer>>('/transfers', { query: { page: pageParam, limit: PAGE, status } }),
    getNextPageParam: next,
  })
}

// ---------------------------------------------------------------- dashboard

export interface DashboardFilter {
  from: string
  to: string
  projectId?: string
  userId?: string
}

export const useDashboard = (f: DashboardFilter) => useQuery({ queryKey: ['dashboard', f], queryFn: () => api<Dashboard>('/dashboard', { query: { ...f } }) })

// ---------------------------------------------------------------- invalidation

export function invalidateTransfers(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['transfers'] })
  void qc.invalidateQueries({ queryKey: PENDING_TRANSFERS_KEY })
  void qc.invalidateQueries({ queryKey: ['leads'] })
  void qc.invalidateQueries({ queryKey: ['dashboard'] })
}

export function invalidateProjects(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['projects'] })
  void qc.invalidateQueries({ queryKey: ['dashboard'] })
  // The user's own project list (switcher, targets) lives on /auth/me.
  void qc.invalidateQueries({ queryKey: ME_KEY })
}

export const invalidateUsers = (qc: QueryClient) => void qc.invalidateQueries({ queryKey: ['users'] })

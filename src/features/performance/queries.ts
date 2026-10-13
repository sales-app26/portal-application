import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { RepReview, Scorecard } from '@/lib/types'

export interface ScorecardFilter {
  from: string
  to: string
  projectId?: string
}

/** Every sales rep in the caller's campaigns (or one), for the dates. Keeps the last table on screen while the next loads. */
export const useScorecard = (f: ScorecardFilter) =>
  useQuery({
    queryKey: ['dashboard', 'scorecard', f],
    queryFn: ({ signal }) => api<Scorecard>('/reports/scorecard', { signal, query: { ...f } }),
    placeholderData: keepPreviousData,
  })

/** One rep's numbers next to the team average, with the detail behind them. */
export const useRepReview = (id: string, f: ScorecardFilter) =>
  useQuery({
    queryKey: ['dashboard', 'review', id, f],
    queryFn: ({ signal }) => api<RepReview>(`/reports/people/${id}/review`, { signal, query: { ...f } }),
    // Keep the last dates on screen while new ones load, but never another person's numbers.
    placeholderData: (previous, query) => (query?.queryKey[2] === id ? previous : undefined),
  })

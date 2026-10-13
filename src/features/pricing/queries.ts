import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Offer, PlanPrice } from '@/lib/types'

export const pricingKeys = {
  all: ['pricing'] as const,
  prices: ['pricing', 'plan-prices'] as const,
  offers: (scope: 'live' | 'all') => ['pricing', 'offers', scope] as const,
}

/** The sales head's list price per plan; prefills the Won price. */
export function usePlanPrices(enabled = true) {
  return useQuery({
    queryKey: pricingKeys.prices,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => api<PlanPrice[]>('/settings/plan-prices', { signal }),
  })
}

/** `live`: offers a rep can pick today. `all`: every offer, for the sales head's settings. */
export function useOffers(scope: 'live' | 'all', enabled = true) {
  return useQuery({
    queryKey: pricingKeys.offers(scope),
    enabled,
    staleTime: scope === 'live' ? 60_000 : 0,
    queryFn: ({ signal }) => api<Offer[]>('/offers', { signal, query: scope === 'live' ? { active: 'true' } : undefined }),
  })
}

import { apiRequest } from './api'

export type GlobalSearchModule =
  | 'clients'
  | 'projects'
  | 'materials'
  | 'suppliers'
  | 'purchase-orders'
  | 'production-orders'

export interface GlobalSearchResult {
  id: string
  entity: string
  label: string
  detail: string
  module: GlobalSearchModule
}

export function takeGlobalSearchQuery(): string {
  const query = sessionStorage.getItem('global_search_query') ?? ''
  sessionStorage.removeItem('global_search_query')
  return query
}

export function searchGlobally(query: string): Promise<GlobalSearchResult[]> {
  const params = new URLSearchParams({ query })
  return apiRequest<GlobalSearchResult[]>(`/search?${params.toString()}`)
}

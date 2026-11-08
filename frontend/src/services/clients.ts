import { apiRequest } from './api'

export interface Client {
  id: string
  name: string
  email: string | null
  phone: string | null
  companyName: string | null
  notes: string | null
  createdAt: string
}

export interface ClientInput {
  name: string
  email?: string
  phone?: string
  companyName?: string
  notes?: string
}

export interface ClientListItem extends Client {
  projects: Array<{ id: string; name: string }>
  _count: { projects: number }
}

export interface PaginatedClients {
  items: ClientListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function getClients(): Promise<Client[]> {
  return apiRequest<Client[]>('/clients')
}

export function getPaginatedClients(input: {
  query: string
  page: number
  pageSize: number
}): Promise<PaginatedClients> {
  const params = new URLSearchParams({
    query: input.query,
    page: String(input.page),
    pageSize: String(input.pageSize),
  })
  return apiRequest<PaginatedClients>(`/clients/paginated?${params.toString()}`)
}

export function createClient(input: ClientInput): Promise<Client> {
  return apiRequest<Client>('/clients', {
    method: 'POST',
    body: input,
  })
}

export function updateClient(id: string, input: Partial<ClientInput>): Promise<Client> {
  return apiRequest<Client>(`/clients/${id}`, { method: 'PATCH', body: input })
}

export function deleteClient(id: string): Promise<Client> {
  return apiRequest<Client>(`/clients/${id}`, { method: 'DELETE' })
}

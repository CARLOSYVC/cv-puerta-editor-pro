import { apiRequest } from './api'

export interface Material {
  id: string
  name: string
  description: string | null
  unit: string
  unitCost: number | string
  minimumStock: number | string
  createdAt: string
  updatedAt: string
}

export interface MaterialInput {
  name: string
  description?: string | null
  unit: string
  unitCost: number
  minimumStock: number
}

export type MaterialUpdateInput = Omit<Partial<MaterialInput>, 'unitCost'>

export interface PaginatedMaterials {
  items: Material[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function getMaterials(): Promise<Material[]> {
  return apiRequest<Material[]>('/materials')
}

export function getPaginatedMaterials(input: {
  query: string
  page: number
  pageSize: number
}): Promise<PaginatedMaterials> {
  const params = new URLSearchParams({
    query: input.query,
    page: String(input.page),
    pageSize: String(input.pageSize),
  })
  return apiRequest<PaginatedMaterials>(`/materials/paginated?${params.toString()}`)
}

export function createMaterial(input: MaterialInput): Promise<Material> {
  return apiRequest<Material>('/materials', {
    method: 'POST',
    body: input,
  })
}

export function updateMaterial(id: string, input: MaterialUpdateInput): Promise<Material> {
  return apiRequest<Material>(`/materials/${id}`, {
    method: 'PATCH',
    body: input,
  })
}

export function deleteMaterial(id: string): Promise<Material> {
  return apiRequest<Material>(`/materials/${id}`, {
    method: 'DELETE',
  })
}

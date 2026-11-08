import { apiRequest } from './api'
import type { Client } from './clients'

export type ProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD'

export interface Project {
  id: string
  name: string
  description: string | null
  status: ProjectStatus
  estimatedRevenue: number | string
  clientId: string
  client: Client
  createdAt: string
  updatedAt: string
}

export interface ProjectInput {
  name: string
  description?: string | null
  status: ProjectStatus
  clientId: string
  estimatedRevenue: number
}

export interface PaginatedProjects {
  items: Project[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function getProjects(): Promise<Project[]> {
  return apiRequest<Project[]>('/projects')
}

export function getProject(id: string): Promise<Project> {
  return apiRequest<Project>(`/projects/${id}`)
}

export function getPaginatedProjects(input: {
  query: string
  page: number
  pageSize: number
  clientId?: string
}): Promise<PaginatedProjects> {
  const params = new URLSearchParams({
    query: input.query,
    page: String(input.page),
    pageSize: String(input.pageSize),
  })
  if (input.clientId) params.set('clientId', input.clientId)
  return apiRequest<PaginatedProjects>(`/projects/paginated?${params.toString()}`)
}

export function createProject(input: ProjectInput): Promise<Project> {
  return apiRequest<Project>('/projects', {
    method: 'POST',
    body: input,
  })
}

export function updateProject(
  id: string,
  input: ProjectInput,
): Promise<Project> {
  return apiRequest<Project>(`/projects/${id}`, {
    method: 'PATCH',
    body: input,
  })
}

export function deleteProject(id: string): Promise<Project> {
  return apiRequest<Project>(`/projects/${id}`, {
    method: 'DELETE',
  })
}

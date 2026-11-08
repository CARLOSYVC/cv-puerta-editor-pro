import axios from 'axios'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

export const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('access_token')

  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }

  return config
})

export class ApiError extends Error {
  readonly status: number
  readonly requestId?: string

  constructor(message: string, status: number, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.requestId = requestId
  }
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload !== 'object' || payload === null || !('message' in payload)) {
    return fallback
  }

  const message = payload.message
  if (typeof message === 'string') return message
  if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
    return message.join(', ')
  }
  return fallback
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    body?: unknown
    responseType?: 'json' | 'blob'
  } = {},
): Promise<T> {
  try {
    const response = await api.request<T>({
      url: path,
      method: options.method ?? 'GET',
      data: options.body,
      responseType: options.responseType,
    })
    return response.data
  } catch (error) {
    if (!axios.isAxiosError(error)) throw error

    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('The API request timed out. Check that the backend is responding.')
      }
      throw new Error(
        `Unable to connect to the API at ${apiBaseUrl}. Check that the backend is running.`,
      )
    }

    if (error.response.status === 401) {
      sessionStorage.removeItem('access_token')
      sessionStorage.removeItem('user_role')
      sessionStorage.removeItem('user_id')
      window.dispatchEvent(new Event('auth-changed'))
    }

    throw new ApiError(
      getErrorMessage(
        error.response.data,
        `The API request failed (${error.response.status}).`,
      ),
      error.response.status,
      typeof error.response.headers['x-request-id'] === 'string'
        ? error.response.headers['x-request-id']
        : undefined,
    )
  }
}

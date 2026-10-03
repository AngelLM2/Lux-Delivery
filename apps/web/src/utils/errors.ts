import type { AxiosError } from 'axios'

export const getApiErrorMessage = (error: AxiosError | unknown) => {
  if (!error || typeof error !== 'object') return 'Unexpected error.'
  const axiosError = error as AxiosError
  const data = axiosError.response?.data as any
  if (!data) return 'Unexpected error.'
  if (typeof data === 'string') return data
  if (typeof data.detail === 'string') return data.detail
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((item: any) => (typeof item === 'string' ? item : item?.msg))
      .filter(Boolean)
      .join(' | ')
  }
  if (typeof data.message === 'string') return data.message
  return 'Unexpected error.'
}

export const getFieldErrors = (error: AxiosError | unknown) => {
  const axiosError = error as AxiosError
  const data = axiosError.response?.data as any
  const result: Record<string, string> = {}
  if (!data || !Array.isArray(data.detail)) return result

  data.detail.forEach((item: any) => {
    const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : item.loc
    if (field && item.msg) {
      result[String(field)] = item.msg
    }
  })
  return result
}

export const getRetryAfterSeconds = (error: AxiosError | unknown) => {
  const axiosError = error as AxiosError
  const header = axiosError.response?.headers?.['retry-after']
  if (!header) return null
  const parsed = Number(header)
  return Number.isFinite(parsed) ? parsed : null
}

export const getErrorMessage = (error: unknown, fallback = 'Unexpected error') => {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: string }).message || fallback)
  }
  return fallback
}

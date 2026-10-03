import { isAxiosError } from 'axios'
import type { ApiErrorBody, ApiValidationError } from '../api/types'

const FALLBACK_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.'

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Requisição inválida.',
  401: 'Sua sessão expirou. Entre novamente.',
  403: 'Você não tem permissão para esta ação.',
  404: 'Recurso não encontrado.',
  409: 'O recurso foi alterado por outra operação. Atualize e tente novamente.',
  413: 'Arquivo muito grande.',
  415: 'Formato de arquivo não suportado.',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isValidationItem = (value: unknown): value is ApiValidationError =>
  isRecord(value) && Array.isArray(value.loc) && typeof value.msg === 'string'

/** The `{ detail, code, request_id }` body of an API error, when there is one. */
export const getErrorBody = (error: unknown): Partial<ApiErrorBody> | undefined => {
  if (!isAxiosError(error)) return undefined
  const data: unknown = error.response?.data
  if (!isRecord(data)) return undefined

  const body: Partial<ApiErrorBody> = {}
  if (typeof data.detail === 'string') body.detail = data.detail
  else if (Array.isArray(data.detail)) body.detail = data.detail.filter(isValidationItem)
  if (typeof data.code === 'string') body.code = data.code
  if (typeof data.request_id === 'string') body.request_id = data.request_id
  return body
}

export const getErrorStatus = (error: unknown): number | undefined =>
  isAxiosError(error) ? error.response?.status : undefined

/** Stable machine-readable reason (`invalid_transition`, `refresh_token_rotated`, ...). */
export const getErrorCode = (error: unknown): string | undefined => getErrorBody(error)?.code

/** Correlation id to quote to support; falls back to the `X-Request-ID` response header. */
export const getRequestId = (error: unknown): string | undefined => {
  const fromBody = getErrorBody(error)?.request_id
  if (fromBody) return fromBody
  if (!isAxiosError(error)) return undefined
  const header: unknown = error.response?.headers?.['x-request-id']
  return typeof header === 'string' && header ? header : undefined
}

export const shortRequestId = (requestId: string) => requestId.replace(/-/g, '').slice(0, 8)

export const getRetryAfterSeconds = (error: unknown): number | null => {
  if (!isAxiosError(error)) return null
  const header: unknown = error.response?.headers?.['retry-after']
  const parsed = Number(header)
  return header != null && Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

/**
 * Pydantic messages come in English; translate the common ones so forms read in pt-BR.
 * Unknown messages are returned as-is (minus Pydantic's "Value error, " prefix).
 */
export const translateValidationMessage = ({ type, msg }: Pick<ApiValidationError, 'type' | 'msg'>) => {
  const number = msg.match(/(\d+(?:\.\d+)?)/)?.[1]
  switch (type) {
    case 'missing':
      return 'Campo obrigatório.'
    case 'string_too_short':
      return number ? `Deve ter pelo menos ${number} caracteres.` : 'Texto muito curto.'
    case 'string_too_long':
      return number ? `Deve ter no máximo ${number} caracteres.` : 'Texto muito longo.'
    case 'greater_than':
      return number ? `Deve ser maior que ${number}.` : 'Valor muito baixo.'
    case 'greater_than_equal':
      return number ? `Deve ser no mínimo ${number}.` : 'Valor muito baixo.'
    case 'less_than_equal':
      return number ? `Deve ser no máximo ${number}.` : 'Valor muito alto.'
    case 'int_parsing':
    case 'float_parsing':
    case 'decimal_parsing':
      return 'Informe um número válido.'
    default:
      if (/email/i.test(msg)) return 'E-mail inválido.'
      return msg.replace(/^Value error,\s*/i, '')
  }
}

const LOCATION_PREFIXES = new Set(['body', 'query', 'path', 'header', 'cookie'])

/** Key used by `getFieldErrors` for errors that do not belong to a single field. */
export const FORM_ERROR_KEY = '_form'

/**
 * Maps a 422 `detail` array to `{ field: message }` (first message per field wins).
 * `loc: ["body", "items", 0, "quantity"]` becomes `"items.0.quantity"`; model-level errors
 * (`loc: ["body"]`) are reported under `FORM_ERROR_KEY`.
 */
export const getFieldErrors = (error: unknown): Record<string, string> => {
  const detail = getErrorBody(error)?.detail
  const result: Record<string, string> = {}
  if (!Array.isArray(detail)) return result

  for (const item of detail) {
    const path = item.loc.filter((part, index) => !(index === 0 && LOCATION_PREFIXES.has(String(part))))
    const key = path.length > 0 ? path.join('.') : FORM_ERROR_KEY
    result[key] ??= translateValidationMessage(item)
  }
  return result
}

/** Human-readable pt-BR message for any error thrown by the API client (or anything else). */
export const getApiErrorMessage = (error: unknown, fallback = FALLBACK_MESSAGE): string => {
  if (!isAxiosError(error)) return fallback

  if (!error.response) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return 'O servidor demorou para responder. Tente novamente.'
    }
    if (error.code === 'ERR_CANCELED') return 'Requisição cancelada.'
    return 'Não foi possível conectar ao servidor. Verifique sua conexão.'
  }

  const { status } = error.response
  if (status >= 500) {
    const requestId = getRequestId(error)
    return requestId ? `Erro interno (ref: ${shortRequestId(requestId)})` : 'Erro interno. Tente novamente.'
  }

  if (status === 429) {
    const seconds = getRetryAfterSeconds(error)
    return seconds
      ? `Muitas tentativas. Aguarde ${seconds} segundos.`
      : 'Muitas tentativas. Aguarde um instante.'
  }

  const detail = getErrorBody(error)?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail) && detail.length > 0) {
    return Array.from(new Set(detail.map(translateValidationMessage))).join(' ')
  }

  return STATUS_MESSAGES[status] ?? fallback
}

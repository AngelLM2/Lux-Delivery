import { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'
import { makeApiError } from '../../test/fixtures'
import {
  FORM_ERROR_KEY,
  getApiErrorMessage,
  getErrorCode,
  getFieldErrors,
  getRequestId,
  translateValidationMessage,
} from './errors'

describe('errors', () => {
  it('uses a string `detail` as the message and exposes the machine-readable code', () => {
    const error = makeApiError(409, {
      detail: 'Transicao invalida: delivered -> confirmed.',
      code: 'invalid_transition',
      request_id: 'req-1',
    })
    expect(getApiErrorMessage(error)).toBe('Transicao invalida: delivered -> confirmed.')
    expect(getErrorCode(error)).toBe('invalid_transition')
  })

  it('maps a validation `detail` array to per-field messages in pt-BR', () => {
    const error = makeApiError(422, {
      code: 'validation_error',
      request_id: 'req-2',
      detail: [
        { loc: ['body', 'password'], msg: 'String should have at least 10 characters', type: 'string_too_short' },
        { loc: ['body', 'email'], msg: 'value is not a valid email address', type: 'value_error' },
        { loc: ['body', 'items', 0, 'quantity'], msg: 'Field required', type: 'missing' },
        { loc: ['body'], msg: 'Value error, As senhas nao conferem.', type: 'value_error' },
      ],
    })

    expect(getFieldErrors(error)).toEqual({
      password: 'Deve ter pelo menos 10 caracteres.',
      email: 'E-mail inválido.',
      'items.0.quantity': 'Campo obrigatório.',
      [FORM_ERROR_KEY]: 'As senhas nao conferem.',
    })
    expect(getApiErrorMessage(error)).toContain('Deve ter pelo menos 10 caracteres.')
  })

  it('shows a short request id for server errors so users can quote it to support', () => {
    const error = makeApiError(500, {
      detail: 'Erro interno. Tente novamente.',
      code: 'internal_error',
      request_id: '3f2a9c1b-77de-4c1e-9a55-0b1c2d3e4f50',
    })
    expect(getRequestId(error)).toBe('3f2a9c1b-77de-4c1e-9a55-0b1c2d3e4f50')
    expect(getApiErrorMessage(error)).toBe('Erro interno (ref: 3f2a9c1b)')
  })

  it('falls back to the X-Request-ID header when the body is not JSON', () => {
    const error = makeApiError(502, '<html>Bad gateway</html>', { 'x-request-id': 'abcdef1234567890' })
    expect(getRequestId(error)).toBe('abcdef1234567890')
    expect(getApiErrorMessage(error)).toBe('Erro interno (ref: abcdef12)')
  })

  it('explains rate limiting and network failures', () => {
    const limited = makeApiError(429, { detail: 'Too many', code: 'rate_limited' }, { 'retry-after': '30' })
    expect(getApiErrorMessage(limited)).toBe('Muitas tentativas. Aguarde 30 segundos.')

    const offline = new AxiosError('Network Error', AxiosError.ERR_NETWORK)
    expect(getApiErrorMessage(offline)).toBe('Não foi possível conectar ao servidor. Verifique sua conexão.')
    expect(getApiErrorMessage(new Error('boom'), 'Falhou.')).toBe('Falhou.')
  })

  it('keeps unknown validation messages readable', () => {
    expect(translateValidationMessage({ type: 'value_error', msg: 'Value error, Telefone invalido.' })).toBe(
      'Telefone invalido.',
    )
    expect(getFieldErrors(new Error('not an api error'))).toEqual({})
  })
})

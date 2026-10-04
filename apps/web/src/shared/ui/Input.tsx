import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
  /** Leading icon shown inside the field. */
  icon?: ReactNode
  /** Keeps the label for screen readers only (toolbars, where the placeholder says it all). */
  hideLabel?: boolean
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  error?: string
}

export const FieldError = ({ id, message }: { id: string; message?: string }) =>
  message ? (
    <div id={id} className="helper-text is-error">
      <AlertCircle size={14} aria-hidden="true" />
      {message}
    </div>
  ) : null

export const InputField = ({ label, error, icon, hideLabel, id, type, className = '', ...props }: InputProps) => {
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = `${inputId}-error`
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'

  return (
    <div className="input-group">
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </label>
      <div className={`input-control ${icon ? 'has-icon' : ''} ${isPassword ? 'has-action' : ''}`}>
        {icon && (
          <span className="input-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          type={isPassword && showPassword ? 'text' : type}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          {...props}
          className={`${error ? 'input-error' : ''} ${className}`}
        />
        {isPassword && (
          <button
            type="button"
            className="input-action"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={showPassword}
            disabled={props.disabled}
          >
            {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
          </button>
        )}
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  )
}

/** Past this height the text scrolls inside the field instead of growing further. */
const TEXTAREA_MAX_HEIGHT = 280

/** Sets the textarea height to its content (between its `rows` and the max height). */
const fitToContent = (node: HTMLTextAreaElement) => {
  node.style.height = 'auto'
  // Not laid out (hidden container): keep the natural `rows` height instead of collapsing to 0.
  if (node.scrollHeight === 0) return
  const border = node.offsetHeight - node.clientHeight
  const height = node.scrollHeight + border
  node.style.height = `${Math.min(height, TEXTAREA_MAX_HEIGHT)}px`
  node.style.overflowY = height > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden'
}

/** Multi-line field that grows with its content (no browser resize handle) and counts characters. */
export const TextareaField = ({ label, error, id, className = '', rows = 3, value, maxLength, ...props }: TextareaProps) => {
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = `${inputId}-error`
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    if (ref.current) fitToContent(ref.current)
  }, [value])

  // Line wrapping also changes when the web font arrives or the field gets wider/narrower.
  useEffect(() => {
    const node = ref.current
    if (!node) return
    let width = node.clientWidth
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (node.clientWidth === width) return
            width = node.clientWidth
            fitToContent(node)
          })
    observer?.observe(node)
    void document.fonts?.ready.then(() => fitToContent(node))
    return () => observer?.disconnect()
  }, [])

  const length = typeof value === 'string' ? value.length : 0

  return (
    <div className="input-group">
      <label htmlFor={inputId}>{label}</label>
      <textarea
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        rows={rows}
        value={value}
        maxLength={maxLength}
        {...props}
        className={`${error ? 'input-error' : ''} ${className}`}
      />
      {(error || maxLength) && (
        <div className="field-foot">
          <FieldError id={errorId} message={error} />
          {maxLength && (
            <span className="field-count" aria-hidden="true">
              {length}/{maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

import { useId } from 'react'
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  error?: string
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  error?: string
  children: ReactNode
}

export const InputField = ({ label, error, id, className = '', ...props }: InputProps) => {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className="input-group">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        aria-invalid={!!error}
        {...props}
        className={`${error ? 'input-error' : ''} ${className}`}
      />
      {error && (
        <div className="helper-text" style={{ color: 'var(--color-error)' }}>
          {error}
        </div>
      )}
    </div>
  )
}

export const TextareaField = ({ label, error, id, className = '', ...props }: TextareaProps) => {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className="input-group">
      <label htmlFor={inputId}>{label}</label>
      <textarea
        id={inputId}
        aria-invalid={!!error}
        rows={4}
        {...props}
        className={`${error ? 'input-error' : ''} ${className}`}
      />
      {error && (
        <div className="helper-text" style={{ color: 'var(--color-error)' }}>
          {error}
        </div>
      )}
    </div>
  )
}

export const SelectField = ({ label, error, id, children, className = '', ...props }: SelectProps) => {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className="input-group">
      <label htmlFor={inputId}>{label}</label>
      <select
        id={inputId}
        aria-invalid={!!error}
        {...props}
        className={`${error ? 'input-error' : ''} ${className}`}
      >
        {children}
      </select>
      {error && (
        <div className="helper-text" style={{ color: 'var(--color-error)' }}>
          {error}
        </div>
      )}
    </div>
  )
}

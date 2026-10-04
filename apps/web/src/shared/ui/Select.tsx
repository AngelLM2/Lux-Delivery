import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { FieldError } from './Input'

export type SelectOption = { value: string; label: string }

type SelectFieldProps = {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  error?: string
  /** Keeps the label for screen readers only (toolbars). */
  hideLabel?: boolean
  placeholder?: string
  disabled?: boolean
  id?: string
}

/** Below this much free space under the field, the list opens upwards. */
const LIST_SPACE = 280

/** Dropdown styled like the other fields (a native `<select>` list can't be styled). Select-only combobox:
 * arrows/Home/End move, Enter/Space choose, Esc closes, typing jumps to a label. */
export const SelectField = ({
  label,
  value,
  options,
  onChange,
  error,
  hideLabel,
  placeholder = 'Selecione',
  disabled,
  id,
}: SelectFieldProps) => {
  const autoId = useId()
  const buttonId = id ?? autoId
  const labelId = `${buttonId}-label`
  const listId = `${buttonId}-list`
  const errorId = `${buttonId}-error`
  const optionId = (index: number) => `${buttonId}-option-${index}`

  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [openUp, setOpenUp] = useState(false)

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  const openList = () => {
    if (disabled || options.length === 0) return
    const rect = buttonRef.current?.getBoundingClientRect()
    const below = rect ? window.innerHeight - rect.bottom : LIST_SPACE
    setOpenUp(rect !== undefined && below < LIST_SPACE && rect.top > below)
    setActiveIndex(Math.max(selectedIndex, 0))
    setOpen(true)
  }

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  const choose = (index: number) => {
    const option = options[index]
    if (option && option.value !== value) onChange(option.value)
    close()
  }

  // Click/tap anywhere else closes the list.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // Keep the highlighted option visible in long lists.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, activeIndex])

  /** Next option whose label starts with `key`, after the current one (like a native select). */
  const findByLetter = (key: string, from: number) => {
    const letter = key.toLocaleLowerCase('pt-BR')
    for (let step = 1; step <= options.length; step += 1) {
      const index = (from + step) % options.length
      if (options[index].label.toLocaleLowerCase('pt-BR').startsWith(letter)) return index
    }
    return -1
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault()
        if (!open) openList()
        else setActiveIndex((index) => (event.key === 'ArrowDown' ? Math.min(index + 1, last) : Math.max(index - 1, 0)))
        return
      case 'Home':
      case 'End':
        if (!open) return
        event.preventDefault()
        setActiveIndex(event.key === 'Home' ? 0 : last)
        return
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (open) choose(activeIndex)
        else openList()
        return
      case 'Escape':
        if (!open) return
        // Don't let a surrounding panel/modal treat this Escape as "close me".
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      case 'Tab':
        setOpen(false)
        return
      default:
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return
        {
          const match = findByLetter(event.key, open ? activeIndex : selectedIndex)
          if (match < 0) return
          if (open) setActiveIndex(match)
          else onChange(options[match].value)
        }
    }
  }

  return (
    <div className="input-group">
      <label id={labelId} htmlFor={buttonId} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </label>
      <div ref={rootRef} className={`select ${open ? 'is-open' : ''}`}>
        <button
          ref={buttonRef}
          id={buttonId}
          type="button"
          role="combobox"
          className={`select-trigger ${error ? 'input-error' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={labelId}
          aria-activedescendant={open ? optionId(activeIndex) : undefined}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={onKeyDown}
        >
          <span className={selected ? undefined : 'select-placeholder'}>{selected?.label ?? placeholder}</span>
          <ChevronDown size={16} className="select-chevron" aria-hidden="true" />
        </button>

        {open && (
          <ul ref={listRef} id={listId} role="listbox" aria-labelledby={labelId} className={`select-list ${openUp ? 'is-up' : ''}`}>
            {options.map((option, index) => (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={option.value === value}
                data-index={index}
                className={`select-option ${index === activeIndex ? 'is-active' : ''}`}
                // Keep focus on the trigger, so the keyboard keeps working after a click.
                onPointerDown={(event) => event.preventDefault()}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {option.value === value && <Check size={15} aria-hidden="true" />}
              </li>
            ))}
          </ul>
        )}
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  )
}

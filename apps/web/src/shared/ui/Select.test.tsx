import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SelectField } from './Select'

const OPTIONS = [
  { value: '', label: 'Sem categoria' },
  { value: '1', label: 'Entradas' },
  { value: '2', label: 'Massas' },
  { value: '3', label: 'Sobremesas' },
]

const Harness = ({ onChange }: { onChange?: (value: string) => void }) => {
  const [value, setValue] = useState('')
  return (
    <SelectField
      label="Categoria"
      value={value}
      options={OPTIONS}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
    />
  )
}

describe('SelectField', () => {
  it('is labelled, shows the current option and opens a listbox on click', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const trigger = screen.getByRole('combobox', { name: 'Categoria' })
    expect(trigger).toHaveTextContent('Sem categoria')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('option')).toHaveLength(4)
    expect(screen.getByRole('option', { name: 'Sem categoria' })).toHaveAttribute('aria-selected', 'true')
  })

  it('picks an option with the mouse and closes', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onChange={onChange} />)

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'Massas' }))

    expect(onChange).toHaveBeenCalledWith('2')
    expect(screen.getByRole('combobox')).toHaveTextContent('Massas')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('works with the keyboard: arrows move, Enter chooses, Escape closes without choosing', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onChange={onChange} />)
    const trigger = screen.getByRole('combobox')

    trigger.focus()
    await user.keyboard('{ArrowDown}') // opens on the selected option
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(trigger).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Massas' }).id)
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('2')
    expect(trigger).toHaveFocus()

    await user.keyboard('{ArrowDown}{End}{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('jumps to an option by its first letter, like a native select', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onChange={onChange} />)

    screen.getByRole('combobox').focus()
    await user.keyboard('s')
    // "Sem categoria" is already selected, so the next "s" is "Sobremesas".
    expect(onChange).toHaveBeenCalledWith('3')
  })
})

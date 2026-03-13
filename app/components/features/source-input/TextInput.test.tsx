import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TextInput from './TextInput'

describe('TextInput', () => {
  it('renders the textarea with the given value', () => {
    render(<TextInput value="hello" onChange={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('hello')
  })

  it('shows placeholder text', () => {
    render(<TextInput value="" onChange={() => {}} />)
    expect(screen.getByPlaceholderText('Paste or type your source material here...')).toBeInTheDocument()
  })

  it('shows helper text', () => {
    render(<TextInput value="" onChange={() => {}} />)
    expect(screen.getByText(/Enter source information/)).toBeInTheDocument()
  })

  it('calls onChange when user types', async () => {
    const onChange = vi.fn()
    render(<TextInput value="" onChange={onChange} />)
    await userEvent.type(screen.getByRole('textbox'), 'a')
    expect(onChange).toHaveBeenCalledWith('a')
  })
})

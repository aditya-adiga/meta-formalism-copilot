import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WholeTextEditBar from './WholeTextEditBar'

describe('WholeTextEditBar', () => {
  it('renders the input and submit button', () => {
    render(<WholeTextEditBar onApply={() => {}} />)
    expect(screen.getByLabelText('Edit entire output instruction')).toBeInTheDocument()
    expect(screen.getByLabelText('Apply edit to entire output')).toBeInTheDocument()
  })

  it('has the send button disabled when input is empty', () => {
    render(<WholeTextEditBar onApply={() => {}} />)
    expect(screen.getByLabelText('Apply edit to entire output')).toBeDisabled()
  })

  it('enables the send button when input has content', async () => {
    render(<WholeTextEditBar onApply={() => {}} />)
    await userEvent.type(screen.getByLabelText('Edit entire output instruction'), 'make concise')
    expect(screen.getByLabelText('Apply edit to entire output')).toBeEnabled()
  })

  it('calls onApply and clears the input on Enter', async () => {
    const onApply = vi.fn()
    render(<WholeTextEditBar onApply={onApply} />)

    const input = screen.getByLabelText('Edit entire output instruction')
    await userEvent.type(input, 'add examples{Enter}')

    expect(onApply).toHaveBeenCalledWith('add examples')
    expect(input).toHaveValue('')
  })

  it('calls onApply when the send button is clicked', async () => {
    const onApply = vi.fn()
    render(<WholeTextEditBar onApply={onApply} />)

    await userEvent.type(screen.getByLabelText('Edit entire output instruction'), 'expand')
    await userEvent.click(screen.getByLabelText('Apply edit to entire output'))

    expect(onApply).toHaveBeenCalledWith('expand')
  })

  it('does not call onApply when input is only whitespace', async () => {
    const onApply = vi.fn()
    render(<WholeTextEditBar onApply={onApply} />)

    await userEvent.type(screen.getByLabelText('Edit entire output instruction'), '   {Enter}')

    expect(onApply).not.toHaveBeenCalled()
  })
})

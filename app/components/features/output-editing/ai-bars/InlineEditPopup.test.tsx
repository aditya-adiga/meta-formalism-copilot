import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InlineEditPopup from './InlineEditPopup'

describe('InlineEditPopup', () => {
  const defaultProps = {
    onApply: vi.fn(),
    onClose: vi.fn(),
    selectedText: 'selected text',
  }

  it('renders with an input and submit button', () => {
    render(<InlineEditPopup {...defaultProps} />)
    expect(screen.getByLabelText('Edit instruction')).toBeInTheDocument()
    expect(screen.getByLabelText('Apply edit')).toBeInTheDocument()
  })

  it('auto-focuses the input on mount', () => {
    render(<InlineEditPopup {...defaultProps} />)
    expect(screen.getByLabelText('Edit instruction')).toHaveFocus()
  })

  it('calls onApply and onClose when submitted via Enter', async () => {
    const onApply = vi.fn()
    const onClose = vi.fn()
    render(<InlineEditPopup {...defaultProps} onApply={onApply} onClose={onClose} />)

    await userEvent.type(screen.getByLabelText('Edit instruction'), 'make it bold{Enter}')

    expect(onApply).toHaveBeenCalledWith('make it bold')
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onApply and onClose when the send button is clicked', async () => {
    const onApply = vi.fn()
    const onClose = vi.fn()
    render(<InlineEditPopup {...defaultProps} onApply={onApply} onClose={onClose} />)

    await userEvent.type(screen.getByLabelText('Edit instruction'), 'simplify')
    await userEvent.click(screen.getByLabelText('Apply edit'))

    expect(onApply).toHaveBeenCalledWith('simplify')
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    render(<InlineEditPopup {...defaultProps} onClose={onClose} />)

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('has the dialog role with accessible label', () => {
    render(<InlineEditPopup {...defaultProps} />)
    expect(screen.getByRole('dialog', { name: 'Edit selection with AI' })).toBeInTheDocument()
  })
})

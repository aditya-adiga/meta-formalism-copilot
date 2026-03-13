import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RefinementPreview from './RefinementPreview'

describe('RefinementPreview', () => {
  const defaultProps = {
    originalText: 'Original context text',
    refinedText: 'Refined context text',
    onInsert: vi.fn(),
    onCancel: vi.fn(),
  }

  it('displays the original and refined text', () => {
    render(<RefinementPreview {...defaultProps} />)
    expect(screen.getByText('Original context text')).toBeInTheDocument()
    expect(screen.getByText('Refined context text')).toBeInTheDocument()
  })

  it('shows Original and Refined labels', () => {
    render(<RefinementPreview {...defaultProps} />)
    expect(screen.getByText('Original')).toBeInTheDocument()
    expect(screen.getByText('Refined')).toBeInTheDocument()
  })

  it('calls onInsert when Insert is clicked', async () => {
    const onInsert = vi.fn()
    render(<RefinementPreview {...defaultProps} onInsert={onInsert} />)
    await userEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledOnce()
  })

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn()
    render(<RefinementPreview {...defaultProps} onCancel={onCancel} />)
    await userEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LeanCodeDisplay from './LeanCodeDisplay'

describe('LeanCodeDisplay', () => {
  const defaultProps = {
    code: 'theorem hello : True := trivial',
    verificationStatus: 'none' as const,
    verificationErrors: '',
    onCodeChange: vi.fn(),
    onReVerify: vi.fn(),
    onIterate: vi.fn(),
    iterating: false,
  }

  it('renders code in a pre element in rendered mode', () => {
    render(<LeanCodeDisplay {...defaultProps} />)
    expect(screen.getByText('theorem hello : True := trivial')).toBeInTheDocument()
  })

  it('shows the Edit button when code is present', () => {
    render(<LeanCodeDisplay {...defaultProps} />)
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('does not show Edit button when code is empty', () => {
    render(<LeanCodeDisplay {...defaultProps} code="" />)
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
  })

  it('switches to raw editing mode when Edit is clicked', async () => {
    render(<LeanCodeDisplay {...defaultProps} />)
    await userEvent.click(screen.getByText('Edit'))
    expect(screen.getByLabelText('Lean4 code')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('calls onCodeChange with local edits when Done is clicked', async () => {
    const onCodeChange = vi.fn()
    render(<LeanCodeDisplay {...defaultProps} onCodeChange={onCodeChange} />)

    await userEvent.click(screen.getByText('Edit'))
    const textarea = screen.getByLabelText('Lean4 code')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'new code')
    await userEvent.click(screen.getByText('Done'))

    expect(onCodeChange).toHaveBeenCalledWith('new code')
  })

  it('shows verification errors when status is invalid', () => {
    render(
      <LeanCodeDisplay
        {...defaultProps}
        verificationStatus="invalid"
        verificationErrors="type mismatch"
      />
    )
    expect(screen.getByText('type mismatch')).toBeInTheDocument()
    expect(screen.getByText('lake build output')).toBeInTheDocument()
  })

  it('shows code metrics when verification is invalid', () => {
    const code = 'line1\nline2\nline3'
    render(
      <LeanCodeDisplay
        {...defaultProps}
        code={code}
        verificationStatus="invalid"
        verificationErrors="error"
      />
    )
    expect(screen.getByText(`${code.length} chars · 3 lines submitted to verifier`)).toBeInTheDocument()
  })

  it('shows Re-verify button on invalid status', () => {
    render(
      <LeanCodeDisplay
        {...defaultProps}
        verificationStatus="invalid"
        verificationErrors="error"
      />
    )
    expect(screen.getByText('Re-verify ↺')).toBeInTheDocument()
  })

  it('calls onReVerify when Re-verify is clicked', async () => {
    const onReVerify = vi.fn()
    render(
      <LeanCodeDisplay
        {...defaultProps}
        onReVerify={onReVerify}
        verificationStatus="invalid"
        verificationErrors="error"
      />
    )
    await userEvent.click(screen.getByText('Re-verify ↺'))
    expect(onReVerify).toHaveBeenCalledOnce()
  })

  it('disables Re-verify when iterating', () => {
    render(
      <LeanCodeDisplay
        {...defaultProps}
        iterating={true}
        verificationStatus="invalid"
        verificationErrors="error"
      />
    )
    expect(screen.getByText('Re-verify ↺')).toBeDisabled()
  })

  it('shows the iteration bar when code is present', () => {
    render(<LeanCodeDisplay {...defaultProps} />)
    expect(screen.getByLabelText('Lean4 iteration instruction')).toBeInTheDocument()
  })

  it('calls onIterate when instruction is submitted', async () => {
    const onIterate = vi.fn()
    render(<LeanCodeDisplay {...defaultProps} onIterate={onIterate} />)

    await userEvent.type(screen.getByLabelText('Lean4 iteration instruction'), 'fix the proof{Enter}')
    expect(onIterate).toHaveBeenCalledWith('fix the proof')
  })

  it('disables iteration input when iterating', () => {
    render(<LeanCodeDisplay {...defaultProps} iterating={true} />)
    expect(screen.getByLabelText('Lean4 iteration instruction')).toBeDisabled()
  })

  it('shows "Iterating…" placeholder when iterating', () => {
    render(<LeanCodeDisplay {...defaultProps} iterating={true} />)
    expect(screen.getByPlaceholderText('Iterating…')).toBeInTheDocument()
  })
})

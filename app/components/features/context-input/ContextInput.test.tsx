import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContextInput from './ContextInput'

describe('ContextInput', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    onFormalise: vi.fn(),
    loading: false,
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the textarea with the given value', () => {
    render(<ContextInput {...defaultProps} value="some context" />)
    expect(screen.getByRole('textbox')).toHaveValue('some context')
  })

  it('calls onChange when user types', async () => {
    const onChange = vi.fn()
    render(<ContextInput {...defaultProps} onChange={onChange} />)
    await userEvent.type(screen.getByRole('textbox'), 'x')
    expect(onChange).toHaveBeenCalledWith('x')
  })

  it('shows the Formalise button', () => {
    render(<ContextInput {...defaultProps} />)
    expect(screen.getByText('Formalise')).toBeInTheDocument()
  })

  it('disables the Formalise button when loading', () => {
    render(<ContextInput {...defaultProps} loading={true} />)
    expect(screen.getByRole('button', { name: /formalising/i })).toBeDisabled()
  })

  it('calls onFormalise when the button is clicked', async () => {
    const onFormalise = vi.fn()
    render(<ContextInput {...defaultProps} onFormalise={onFormalise} />)
    await userEvent.click(screen.getByText('Formalise'))
    expect(onFormalise).toHaveBeenCalledOnce()
  })

  it('shows refinement buttons when value is non-empty', () => {
    render(<ContextInput {...defaultProps} value="has content" />)
    expect(screen.getByText('Elaborate')).toBeInTheDocument()
  })

  it('hides refinement buttons when value is empty', () => {
    render(<ContextInput {...defaultProps} value="" />)
    expect(screen.queryByText('Elaborate')).not.toBeInTheDocument()
  })

  it('shows refinement preview after successful API call', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ text: 'Refined version' }), { status: 200 })
    )

    render(<ContextInput {...defaultProps} value="original text" />)
    await userEvent.click(screen.getByText('Elaborate'))

    await waitFor(() => {
      expect(screen.getByText('Refined version')).toBeInTheDocument()
    })
    // Should be in preview mode now
    expect(screen.getByText('Original')).toBeInTheDocument()
    expect(screen.getByText('Insert')).toBeInTheDocument()
  })

  it('calls onChange with refined text when Insert is clicked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ text: 'Better text' }), { status: 200 })
    )
    const onChange = vi.fn()

    render(<ContextInput {...defaultProps} value="original" onChange={onChange} />)
    await userEvent.click(screen.getByText('Elaborate'))

    await waitFor(() => {
      expect(screen.getByText('Insert')).toBeInTheDocument()
    })
    await userEvent.click(screen.getByText('Insert'))

    expect(onChange).toHaveBeenCalledWith('Better text')
    // Should return to input view
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('returns to input view when Cancel is clicked in preview', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ text: 'Refined' }), { status: 200 })
    )

    render(<ContextInput {...defaultProps} value="original" />)
    await userEvent.click(screen.getByText('Elaborate'))

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })
    await userEvent.click(screen.getByText('Cancel'))

    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('shows "Refining..." while the API call is in progress', async () => {
    let resolvePromise: (value: Response) => void
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(
      new Promise((resolve) => { resolvePromise = resolve })
    )

    render(<ContextInput {...defaultProps} value="text" />)
    await userEvent.click(screen.getByText('Elaborate'))

    expect(screen.getByText('Refining...')).toBeInTheDocument()
    // Refinement buttons should be hidden while refining
    expect(screen.queryByText('Elaborate')).not.toBeInTheDocument()

    // Resolve to clean up
    resolvePromise!(new Response(JSON.stringify({ text: 'done' }), { status: 200 }))
    await waitFor(() => {
      expect(screen.queryByText('Refining...')).not.toBeInTheDocument()
    })
  })
})

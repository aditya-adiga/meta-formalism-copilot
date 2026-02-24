import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditableOutput from './EditableOutput'

// Mock LatexRenderer to avoid KaTeX complexity in these tests
vi.mock('./LatexRenderer', () => ({
  default: ({ value }: { value: string }) => (
    <div data-testid="latex-renderer">{value || 'Processed output will appear here.'}</div>
  ),
}))

describe('EditableOutput', () => {
  const defaultProps = {
    value: 'Some output text',
    onChange: vi.fn(),
    onInlineEdit: vi.fn(),
    renderMode: 'rendered' as const,
    onToggleEdit: vi.fn(),
  }

  it('shows the rendered view by default', () => {
    render(<EditableOutput {...defaultProps} />)
    expect(screen.getByTestId('latex-renderer')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('shows the Edit button when there is content in rendered mode', () => {
    render(<EditableOutput {...defaultProps} />)
    expect(screen.getByLabelText('Edit raw text')).toBeInTheDocument()
  })

  it('does not show the Edit button when value is empty in rendered mode', () => {
    render(<EditableOutput {...defaultProps} value="" />)
    expect(screen.queryByLabelText('Edit raw text')).not.toBeInTheDocument()
  })

  it('shows textarea in raw mode', () => {
    render(<EditableOutput {...defaultProps} renderMode="raw" />)
    expect(screen.getByLabelText('Output content')).toBeInTheDocument()
    expect(screen.getByLabelText('Output content')).toHaveValue('Some output text')
  })

  it('shows "Done editing" button in raw mode', () => {
    render(<EditableOutput {...defaultProps} renderMode="raw" />)
    expect(screen.getByLabelText('Show rendered view')).toBeInTheDocument()
    expect(screen.getByText('Done editing')).toBeInTheDocument()
  })

  it('calls onToggleEdit when the toggle button is clicked', async () => {
    const onToggleEdit = vi.fn()
    render(<EditableOutput {...defaultProps} onToggleEdit={onToggleEdit} />)
    await userEvent.click(screen.getByText('Edit'))
    expect(onToggleEdit).toHaveBeenCalledOnce()
  })

  it('calls onChange when text is typed in raw mode', async () => {
    const onChange = vi.fn()
    render(<EditableOutput {...defaultProps} renderMode="raw" onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Output content'), 'x')
    expect(onChange).toHaveBeenCalled()
  })

  it('shows placeholder text in the textarea', () => {
    render(<EditableOutput {...defaultProps} value="" renderMode="raw" />)
    expect(screen.getByPlaceholderText('Processed output will appear here.')).toBeInTheDocument()
  })
})

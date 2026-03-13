import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import InputPanel from './InputPanel'

// Mock child components to isolate panel rendering
vi.mock('@/app/components/features/source-input/TextInput', () => ({
  default: ({ value }: { value: string }) => <textarea data-testid="text-input" defaultValue={value} />,
}))
vi.mock('@/app/components/features/source-input/FileUpload', () => ({
  default: () => <div data-testid="file-upload" />,
}))
vi.mock('@/app/components/features/context-input/ContextInput', () => ({
  default: ({ value }: { value: string }) => <textarea data-testid="context-input" defaultValue={value} />,
}))

describe('InputPanel', () => {
  const defaultProps = {
    sourceText: 'source',
    onSourceTextChange: vi.fn(),
    contextText: 'context',
    onContextTextChange: vi.fn(),
    onFormalise: vi.fn(),
    loading: false,
  }

  it('renders the Source Inputs heading', () => {
    render(<InputPanel {...defaultProps} />)
    expect(screen.getByText('Source Inputs')).toBeInTheDocument()
  })

  it('renders the Formalism Context heading', () => {
    render(<InputPanel {...defaultProps} />)
    expect(screen.getByText('Formalism Context')).toBeInTheDocument()
  })

  it('renders TextInput, FileUpload, and ContextInput', () => {
    render(<InputPanel {...defaultProps} />)
    expect(screen.getByTestId('text-input')).toBeInTheDocument()
    expect(screen.getByTestId('file-upload')).toBeInTheDocument()
    expect(screen.getByTestId('context-input')).toBeInTheDocument()
  })
})

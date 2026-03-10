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
vi.mock('@/app/components/features/formalization-controls/FormalizationControls', () => ({
  default: () => <div data-testid="formalization-controls" />,
}))

describe('InputPanel', () => {
  const defaultProps = {
    sourceText: 'source',
    onSourceTextChange: vi.fn(),
    onFilesChanged: vi.fn(),
    contextText: 'context',
    onContextTextChange: vi.fn(),
    onFormalise: vi.fn(),
    loading: false,
    selectedArtifactTypes: ['semiformal'] as import('@/app/lib/types/session').ArtifactType[],
    onArtifactTypesChange: vi.fn(),
  }

  it('renders the Source Inputs heading', () => {
    render(<InputPanel {...defaultProps} />)
    expect(screen.getByText('Source Inputs')).toBeInTheDocument()
  })

  it('renders the Direct Formalization heading', () => {
    render(<InputPanel {...defaultProps} />)
    expect(screen.getByText('Direct Formalization')).toBeInTheDocument()
  })

  it('renders TextInput, FileUpload, and FormalizationControls', () => {
    render(<InputPanel {...defaultProps} />)
    expect(screen.getByTestId('text-input')).toBeInTheDocument()
    expect(screen.getByTestId('file-upload')).toBeInTheDocument()
    expect(screen.getByTestId('formalization-controls')).toBeInTheDocument()
  })
})

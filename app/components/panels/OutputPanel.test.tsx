import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OutputPanel from './OutputPanel'

// Mock child components to isolate panel logic
vi.mock('@/app/components/features/output-editing/EditableOutput', () => ({
  default: ({ value, renderMode, onToggleEdit }: { value: string; renderMode: string; onToggleEdit: () => void }) => (
    <div data-testid="editable-output">
      <span>{value}</span>
      <span data-testid="render-mode">{renderMode}</span>
      <button onClick={onToggleEdit}>Toggle</button>
    </div>
  ),
}))
vi.mock('@/app/components/features/output-editing/ai-bars/WholeTextEditBar', () => ({
  default: ({ onApply }: { onApply: (s: string) => void }) => (
    <div data-testid="whole-text-bar">
      <button onClick={() => onApply('edit instruction')}>Apply Whole</button>
    </div>
  ),
}))
vi.mock('@/app/components/features/lean-display/LeanCodeDisplay', () => ({
  default: ({ code }: { code: string }) => <div data-testid="lean-display">{code}</div>,
}))

describe('OutputPanel', () => {
  const defaultProps = {
    semiformalText: '',
    onSemiformalTextChange: vi.fn(),
    semiformalDirty: false,
    onRegenerateLean: vi.fn(),
    leanCode: '',
    onLeanCodeChange: vi.fn(),
    loadingPhase: 'idle' as const,
    verificationStatus: 'none' as const,
    verificationErrors: '',
    onReVerify: vi.fn(),
    onLeanIterate: vi.fn(),
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the Semiformal Proof heading', () => {
    render(<OutputPanel {...defaultProps} />)
    expect(screen.getByText('Semiformal Proof')).toBeInTheDocument()
  })

  it('does not show the Lean4 section when there is no lean code and phase is idle', () => {
    render(<OutputPanel {...defaultProps} />)
    expect(screen.queryByText('Lean4 Code')).not.toBeInTheDocument()
  })

  it('shows the Lean4 section when lean code is present', () => {
    render(<OutputPanel {...defaultProps} leanCode="theorem : True := trivial" />)
    expect(screen.getByText('Lean4 Code')).toBeInTheDocument()
    expect(screen.getByTestId('lean-display')).toBeInTheDocument()
  })

  it('shows the Lean4 section during lean loading phase even without code', () => {
    render(<OutputPanel {...defaultProps} loadingPhase="lean" />)
    expect(screen.getByText('Lean4 Code')).toBeInTheDocument()
    expect(screen.getByText('Generating Lean4 code...')).toBeInTheDocument()
  })

  it('shows WholeTextEditBar when semiformal text exists', () => {
    render(<OutputPanel {...defaultProps} semiformalText="some proof" />)
    expect(screen.getByTestId('whole-text-bar')).toBeInTheDocument()
  })

  it('hides WholeTextEditBar when semiformal text is empty', () => {
    render(<OutputPanel {...defaultProps} semiformalText="" />)
    expect(screen.queryByTestId('whole-text-bar')).not.toBeInTheDocument()
  })

  it('shows "Applying edit..." during an edit operation', async () => {
    let resolvePromise: (value: Response) => void
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(
      new Promise((resolve) => { resolvePromise = resolve })
    )

    render(<OutputPanel {...defaultProps} semiformalText="text" />)
    await userEvent.click(screen.getByText('Apply Whole'))

    expect(screen.getByText(/Applying edit\.\.\./)).toBeInTheDocument()

    // Resolve to clean up
    resolvePromise!(new Response(JSON.stringify({ text: 'edited' }), { status: 200 }))
    await waitFor(() => {
      expect(screen.queryByText(/Applying edit\.\.\./)).not.toBeInTheDocument()
    })
  })

  describe('VerificationBadge', () => {
    it('shows "Verifying..." for verifying status', () => {
      render(<OutputPanel {...defaultProps} leanCode="code" verificationStatus="verifying" />)
      expect(screen.getByText('Verifying...')).toBeInTheDocument()
    })

    it('shows "Verified" for valid status', () => {
      render(<OutputPanel {...defaultProps} leanCode="code" verificationStatus="valid" />)
      expect(screen.getByText('Verified')).toBeInTheDocument()
    })

    it('shows "Verification Failed" for invalid status', () => {
      render(<OutputPanel {...defaultProps} leanCode="code" verificationStatus="invalid" />)
      expect(screen.getByText('Verification Failed')).toBeInTheDocument()
    })

    it('shows "Verifier offline" for unavailable status (not a passing badge)', () => {
      render(<OutputPanel {...defaultProps} leanCode="code" verificationStatus="unavailable" />)
      expect(screen.getByText(/Verifier offline/)).toBeInTheDocument()
      expect(screen.queryByText('Verified')).not.toBeInTheDocument()
    })

    it('shows nothing for none status', () => {
      render(<OutputPanel {...defaultProps} leanCode="code" verificationStatus="none" />)
      expect(screen.queryByText('Verifying...')).not.toBeInTheDocument()
      expect(screen.queryByText('Verified')).not.toBeInTheDocument()
      expect(screen.queryByText('Verification Failed')).not.toBeInTheDocument()
    })
  })
})

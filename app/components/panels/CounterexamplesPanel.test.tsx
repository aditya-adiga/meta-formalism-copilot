import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CounterexamplesPanel from './CounterexamplesPanel'
import type { CounterexamplesResponse } from '@/app/lib/types/artifacts'

// Mock child components to isolate panel logic
vi.mock('@/app/components/features/output-editing/EditableSection', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/app/components/features/evidence-search/FindEvidenceButton', () => ({
  default: () => <div data-testid="find-evidence" />,
}))
vi.mock('./ArtifactPanelShell', () => ({
  default: ({ children, hasData }: { children: React.ReactNode; hasData: boolean }) =>
    hasData ? <div>{children}</div> : <div>empty</div>,
}))

function makeCx(overrides: Partial<NonNullable<CounterexamplesResponse["counterexamples"]["scenarios"]>[0]> = {}) {
  return {
    id: "cx-1",
    scenario: "A test scenario",
    targetAssumption: "Some assumption",
    explanation: "Why it works",
    plausibility: "medium" as const,
    ...overrides,
  };
}

function makeData(
  cxOverrides: Partial<NonNullable<CounterexamplesResponse["counterexamples"]["scenarios"]>[0]> = {},
): CounterexamplesResponse["counterexamples"] {
  return {
    claim: "Test claim",
    scenarios: [makeCx(cxOverrides)],
    robustnessAssessment: "Moderate",
    summary: "Test summary",
  };
}

describe('CounterexamplesPanel', () => {
  const baseProps = {
    counterexamples: null as CounterexamplesResponse["counterexamples"] | null,
    loading: false,
    onContentChange: vi.fn(),
  };

  it('renders empty state when counterexamples is null', () => {
    render(<CounterexamplesPanel {...baseProps} />)
    expect(screen.getByText('empty')).toBeInTheDocument()
  })

  it('renders counterexample content when data is provided', () => {
    render(<CounterexamplesPanel {...baseProps} counterexamples={makeData()} />)
    expect(screen.getByText('Test claim')).toBeInTheDocument()
    expect(screen.getByText('A test scenario')).toBeInTheDocument()
  })

  describe('isEmpirical badges', () => {
    it('shows "Hypothetical" badge when isEmpirical is true', () => {
      render(<CounterexamplesPanel {...baseProps} counterexamples={makeData({ isEmpirical: true })} />)
      expect(screen.getByText('Hypothetical')).toBeInTheDocument()
      expect(screen.queryByText('Logical')).not.toBeInTheDocument()
    })

    it('shows "Logical" badge when isEmpirical is false', () => {
      render(<CounterexamplesPanel {...baseProps} counterexamples={makeData({ isEmpirical: false })} />)
      expect(screen.getByText('Logical')).toBeInTheDocument()
      expect(screen.queryByText('Hypothetical')).not.toBeInTheDocument()
    })

    it('shows no badge when isEmpirical is undefined (old artifacts)', () => {
      render(<CounterexamplesPanel {...baseProps} counterexamples={makeData()} />)
      expect(screen.queryByText('Hypothetical')).not.toBeInTheDocument()
      expect(screen.queryByText('Logical')).not.toBeInTheDocument()
    })

    it('shows guidance text only for empirical counterexamples', () => {
      const guidance = /Use Find Evidence to search for real papers/

      const { rerender } = render(
        <CounterexamplesPanel {...baseProps} counterexamples={makeData({ isEmpirical: true })} />,
      )
      expect(screen.getByText(guidance)).toBeInTheDocument()

      rerender(<CounterexamplesPanel {...baseProps} counterexamples={makeData({ isEmpirical: false })} />)
      expect(screen.queryByText(guidance)).not.toBeInTheDocument()

      rerender(<CounterexamplesPanel {...baseProps} counterexamples={makeData()} />)
      expect(screen.queryByText(guidance)).not.toBeInTheDocument()
    })
  })
})

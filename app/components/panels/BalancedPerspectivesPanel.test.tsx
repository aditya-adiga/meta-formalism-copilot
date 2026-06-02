import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import BalancedPerspectivesPanel from './BalancedPerspectivesPanel'
import type { BalancedPerspectivesResponse } from '@/app/lib/types/artifacts'

// Mock child components to isolate panel logic
vi.mock('@/app/components/features/output-editing/EditableSection', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('./ArtifactPanelShell', () => ({
  default: ({ children, hasData }: { children: React.ReactNode; hasData: boolean }) =>
    hasData ? <div>{children}</div> : <div>empty</div>,
}))

type BalancedPerspectives = BalancedPerspectivesResponse["balancedPerspectives"]
type Tension = BalancedPerspectives["tensions"][number]

function makeData(tensions: Tension[]): BalancedPerspectives {
  return {
    topic: "Test topic",
    perspectives: [],
    tensions,
    synthesis: { equilibrium: "", howAddressed: [] },
    summary: "",
  }
}

describe('BalancedPerspectivesPanel', () => {
  const baseProps = {
    balancedPerspectives: null as BalancedPerspectives | null,
    loading: false,
    onContentChange: vi.fn(),
  }

  it('renders both endpoints when a tension has a complete between tuple', () => {
    const data = makeData([{ between: ["A", "B"], description: "They conflict" }])
    render(<BalancedPerspectivesPanel {...baseProps} balancedPerspectives={data} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('They conflict')).toBeInTheDocument()
  })

  // Regression: partial-JSON streaming can yield a tension object before its
  // `between` tuple has arrived. Indexing `between[0]` on undefined threw a
  // runtime TypeError that crashed the whole panel.
  it('does not crash when a streamed tension is missing its between tuple', () => {
    // `between` absent mid-stream — the static type marks it required, so cast.
    const partialTension = { description: "Half-streamed tension" } as unknown as Tension
    const data = makeData([partialTension])
    expect(() =>
      render(<BalancedPerspectivesPanel {...baseProps} balancedPerspectives={data} />),
    ).not.toThrow()
    // The description still renders even though the endpoints aren't ready.
    expect(screen.getByText('Half-streamed tension')).toBeInTheDocument()
  })
})

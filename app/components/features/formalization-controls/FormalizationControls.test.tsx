import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import FormalizationControls from './FormalizationControls'

// Stub the chip selector so this test is about the wrapper layout only.
vi.mock('@/app/components/features/artifact-selector/ArtifactChipSelector', () => ({
  default: () => <div data-testid="chip-selector" />,
}))
vi.mock('@/app/components/ui/CostTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

function baseProps() {
  return {
    contextText: '',
    onContextChange: vi.fn(),
    selectedArtifactTypes: [] as never[],
    onArtifactTypesChange: vi.fn(),
    onGenerate: vi.fn(),
    loading: false,
  }
}

describe('FormalizationControls', () => {
  it('defaults to shrink-0 (docked) layout so callers like NodeDetailPanel keep their dock', () => {
    const { container } = render(<FormalizationControls {...baseProps()} />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.className).toContain('shrink-0')
    expect(wrapper.className).not.toContain('flex-1')
    // The inner content area should NOT scroll in docked mode.
    expect(wrapper.firstElementChild?.className).not.toContain('overflow-auto')
  })

  it('uses fill-height + scrollable inner area when fillHeight is set', () => {
    // Regression: PR #95 dropped the overflow handling and the Direct
    // Formalization section in InputPanel lost its scrollbar. fillHeight
    // restores it while keeping the docked behavior for NodeDetailPanel.
    const { container } = render(<FormalizationControls {...baseProps()} fillHeight />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.className).toContain('flex-1')
    expect(wrapper.className).toContain('min-h-0')
    expect(wrapper.className).toContain('overflow-hidden')

    const inner = wrapper.firstElementChild as HTMLElement
    expect(inner.className).toContain('overflow-auto')
    expect(inner.className).toContain('flex-1')
    expect(inner.className).toContain('min-h-0')
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import OutputTypesSection from './OutputTypesSection'
import type { CustomArtifactTypeDefinition } from '@/app/lib/types/customArtifact'

// Capture what the underlying chip selector receives so we can verify the
// abstraction forwards every prop. This is the regression guard for the
// "one site forgot to thread custom types" failure mode.
const chipSelectorPropsLog: Record<string, unknown>[] = []
vi.mock('./ArtifactChipSelector', () => ({
  default: (props: Record<string, unknown>) => {
    chipSelectorPropsLog.push(props)
    return <div data-testid="chip-selector" />
  },
}))

function makeCustomType(): CustomArtifactTypeDefinition {
  return {
    id: 'custom-x',
    name: 'X',
    chipLabel: 'X',
    description: 'desc',
    whenToUse: 'when',
    systemPrompt: 'prompt',
    outputFormat: 'text',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  }
}

describe('OutputTypesSection', () => {
  beforeEach(() => {
    chipSelectorPropsLog.length = 0
  })

  it('renders the default "Output Types" heading', () => {
    render(<OutputTypesSection selected={[]} onChange={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Output Types' })).toBeInTheDocument()
  })

  it('allows overriding the heading', () => {
    render(<OutputTypesSection selected={[]} onChange={vi.fn()} heading="Pick types" />)
    expect(screen.getByRole('heading', { name: 'Pick types' })).toBeInTheDocument()
  })

  it('forwards selection, custom-type defs, handlers, and designer source/context to the chip selector', () => {
    const customTypes = [makeCustomType()]
    const onChange = vi.fn()
    const onCreate = vi.fn()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(
      <OutputTypesSection
        selected={['semiformal']}
        onChange={onChange}
        loading={{ semiformal: true }}
        disabled
        customArtifactTypes={customTypes}
        onCreateCustomType={onCreate}
        onEditCustomType={onEdit}
        onDeleteCustomType={onDelete}
        sourceText="src"
        contextText="ctx"
      />
    )

    const props = chipSelectorPropsLog.at(-1)
    expect(props?.selected).toEqual(['semiformal'])
    expect(props?.onChange).toBe(onChange)
    expect(props?.loading).toEqual({ semiformal: true })
    expect(props?.disabled).toBe(true)
    // Note the property rename: outer customArtifactTypes → inner customTypes.
    expect(props?.customTypes).toBe(customTypes)
    expect(props?.onCreateCustomType).toBe(onCreate)
    expect(props?.onEditCustomType).toBe(onEdit)
    expect(props?.onDeleteCustomType).toBe(onDelete)
    expect(props?.sourceText).toBe('src')
    expect(props?.contextText).toBe('ctx')
  })
})

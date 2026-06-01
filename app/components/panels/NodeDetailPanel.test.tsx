import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import NodeDetailPanel from './NodeDetailPanel'
import type { PropositionNode } from '@/app/lib/types/decomposition'
import type { CustomArtifactTypeDefinition } from '@/app/lib/types/customArtifact'

// Capture props handed to FormalizationControls so we can assert that the
// custom-type wiring actually reaches it. Regression guard for the bug where
// NodeDetailPanel silently dropped customArtifactTypes & handlers.
const formalizationControlsPropsLog: Record<string, unknown>[] = []
vi.mock('@/app/components/features/formalization-controls/FormalizationControls', () => ({
  default: (props: Record<string, unknown>) => {
    formalizationControlsPropsLog.push(props)
    return <div data-testid="formalization-controls" />
  },
}))

function makeNode(overrides: Partial<PropositionNode> = {}): PropositionNode {
  return {
    id: 'n-1',
    label: 'Node 1',
    kind: 'assumption',
    statement: 'The cat is on the mat.',
    proofText: '',
    dependsOn: [],
    sourceId: '',
    sourceLabel: '',
    semiformalProof: '',
    leanCode: '',
    verificationStatus: 'unverified',
    verificationErrors: '',
    context: '',
    selectedArtifactTypes: [],
    artifacts: [],
    ...overrides,
  }
}

function makeCustomType(): CustomArtifactTypeDefinition {
  return {
    id: 'custom-ethics',
    name: 'Ethical Analysis',
    chipLabel: 'Ethics',
    description: 'Surfaces ethical considerations',
    whenToUse: 'Use when stakes are normative',
    systemPrompt: 'Analyze ethically.',
    outputFormat: 'text',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  }
}

describe('NodeDetailPanel', () => {
  beforeEach(() => {
    formalizationControlsPropsLog.length = 0
  })

  const defaultProps = {
    node: makeNode(),
    dependencies: [],
    onFormalise: vi.fn(),
    onGenerateLean: vi.fn(),
    loading: false,
    globalContextText: '',
    onNodeContextChange: vi.fn(),
    onNodeArtifactTypesChange: vi.fn(),
  }

  it('renders the node label and FormalizationControls', () => {
    render(<NodeDetailPanel {...defaultProps} />)
    expect(screen.getByText('Node 1')).toBeInTheDocument()
    expect(screen.getByTestId('formalization-controls')).toBeInTheDocument()
  })

  it('threads custom artifact types and handlers to FormalizationControls', () => {
    const customTypes = [makeCustomType()]
    const onCreate = vi.fn()
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    render(
      <NodeDetailPanel
        {...defaultProps}
        customArtifactTypes={customTypes}
        onCreateCustomType={onCreate}
        onEditCustomType={onEdit}
        onDeleteCustomType={onDelete}
      />
    )

    const props = formalizationControlsPropsLog.at(-1)
    expect(props?.customArtifactTypes).toBe(customTypes)
    expect(props?.onCreateCustomType).toBe(onCreate)
    expect(props?.onEditCustomType).toBe(onEdit)
    expect(props?.onDeleteCustomType).toBe(onDelete)
  })

  it('passes the node statement as the test-preview source and includes proofText in cost length', () => {
    const node = makeNode({ statement: 'A claim.', proofText: 'Because reasons.' })
    render(<NodeDetailPanel {...defaultProps} node={node} />)

    const props = formalizationControlsPropsLog.at(-1)
    expect(props?.sourceText).toBe('A claim.')
    expect(props?.sourceCharLength).toBe('A claim.'.length + 'Because reasons.'.length)
  })
})

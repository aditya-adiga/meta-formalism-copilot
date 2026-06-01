import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formalizeNode } from './formalizeNode'
import type { PropositionNode } from '@/app/lib/types/decomposition'
import type { CustomArtifactTypeDefinition } from '@/app/lib/types/customArtifact'

// Mock the API layer. We're testing dispatch logic, not network behavior.
const fetchApi = vi.fn()
vi.mock('@/app/lib/formalization/api', () => ({
  fetchApi: (...args: unknown[]) => fetchApi(...args),
  generateSemiformal: vi.fn(),
}))
vi.mock('@/app/lib/formalization/leanRetryLoop', () => ({
  leanRetryLoop: vi.fn(),
}))

function makeNode(overrides: Partial<PropositionNode> = {}): PropositionNode {
  return {
    id: 'n-1',
    label: 'Node',
    kind: 'assumption',
    statement: 'The thing is true.',
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

function makeCustomDef(overrides: Partial<CustomArtifactTypeDefinition> = {}): CustomArtifactTypeDefinition {
  return {
    id: 'custom-ethics',
    name: 'Ethical Analysis',
    chipLabel: 'Ethics',
    description: 'desc',
    whenToUse: 'when',
    systemPrompt: 'Analyze ethically.',
    outputFormat: 'text',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('formalizeNode — custom type dispatch (Generate All path)', () => {
  beforeEach(() => {
    fetchApi.mockReset()
  })

  it('dispatches a custom type to /api/formalization/custom with the system prompt and writes the result onto the node', async () => {
    fetchApi.mockResolvedValueOnce({ result: 'Ethical assessment output.' })
    const def = makeCustomDef()
    const node = makeNode()
    const updates: Array<Partial<PropositionNode>> = []
    const updateNode = (_id: string, patch: Partial<PropositionNode>) => { updates.push(patch) }

    const status = await formalizeNode(
      node, [node], updateNode, undefined,
      [def.id], 'global ctx', [def],
    )

    expect(status).toBe('verified')
    // Exactly one call — to the custom route — with the system prompt in body.
    expect(fetchApi).toHaveBeenCalledTimes(1)
    const [route, body] = fetchApi.mock.calls[0] as [string, Record<string, unknown>]
    expect(route).toBe('/api/formalization/custom')
    expect(body.customSystemPrompt).toBe('Analyze ethically.')
    expect(body.customOutputFormat).toBe('text')
    expect(body.sourceText).toContain('The thing is true.')

    // The generated artifact ends up on the node.
    const artifactPatch = updates.find((p) => Array.isArray(p.artifacts))
    expect(artifactPatch?.artifacts).toEqual([
      expect.objectContaining({ type: def.id, content: 'Ethical assessment output.' }),
    ])
  })

  it('silently skips custom types whose definitions are not in the workspace (defensive against stale selections)', async () => {
    const node = makeNode()
    const updates: Array<Partial<PropositionNode>> = []
    const updateNode = (_id: string, patch: Partial<PropositionNode>) => { updates.push(patch) }

    const status = await formalizeNode(
      node, [node], updateNode, undefined,
      ['custom-missing'], '', [],
    )

    expect(status).toBe('verified')
    expect(fetchApi).not.toHaveBeenCalled()
    expect(updates.some((p) => Array.isArray(p.artifacts))).toBe(false)
  })
})

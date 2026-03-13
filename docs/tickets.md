Formalization Team Tickets
FORM-1: DeepSeek Prover v2 - Informal Math Generation
Team: Formalization
Time Budget: 3-4 hours
Dependencies: SETUP-1

Description: Get DeepSeek Prover v2 working with 1-2 prompt templates. Focus on:

Accept conversation text as input
Generate basic mathematical reasoning
Return structured output

Resources:

DeepSeek Prover v2:
open router: [https://openrouter.ai/deepseek/deepseek-prover-v2]
hugging face: [https://huggingface.co/deepseek-ai/DeepSeek-Prover-V2-671B]
paper(if interested to know more, I think the hugging face has info enough to get started): https://arxiv.org/abs/2504.21801
Test with sample conversation data (will be provided, or made available from current interface)
there are prompts in the LCT project which can be used for inspiration: here

Todo:

1-2 prompt templates tested (not 3+)
Basic API endpoint working
Returns structured output
1-2 example outputs documented

Technical Notes (most of these are suggestions):

Create /api/formalization/informal endpoint
Input: { text: string }
Output: { proof: string }
Save 1-2 examples in /experiments/deepseek

Deliverables:

Working API endpoint
Brief notes on what prompt worked and what did not.
1-2 example outputs


FORM-2: Kimina Prover - Lean4 Formalization
Team: Formalization
Time Budget: 3-4 hours
Dependencies: FORM-1 (soft dependency - can work in parallel)

Description: Get Kimina Prover working to convert informal proof to Lean4 code. Use 1-2 simple prompt templates.

Resources:

Kimina Prover:
hugging face: [https://huggingface.co/AI-MO/Kimina-Prover-72B]
there is a nice workflow described in the faqs of this demo which might be useful: https://demo.projectnumina.ai/ (i am a little unsure what model are they using here)
this is their newest repo (and what the demo says is using, there is confusion if they are tbh, I have only skimmed the blog) which has some prompts which I think might be useful: https://github.com/project-numina/numina-lean-agent/tree/main

Todo:

1-2 prompt templates tested
API endpoint returns Lean4 code
1-2 example outputs saved

Technical Notes (most of these are suggestions):

Create /api/formalization/lean endpoint
Input: { informalProof: string }
Output: { leanCode: string }
Save 1-2 examples in /experiments/kimina/

Deliverables:

Working API endpoint
Brief notes on prompt used
1-2 example Lean4 outputs


FORM-3: Lean4 Verification
Team: Formalization
Time Budget: 2-3 hours
Dependencies: FORM-2

Description: Simple endpoint that checks if Lean4 code is valid. Basic verification only - don't worry about edge cases for alpha.

Resources:

This repo has some sort of validation mechanism which could be useful: https://github.com/project-numina/numina-lean-agent/tree/main Todo:

API endpoint that verifies Lean4 code/ Someway to integrate this.

Returns valid/invalid status

Basic error handling

Technical Notes (most of these are suggestions):

Create /api/verification/lean endpoint
Input: { leanCode: string }
Output: { valid: boolean, errors?: string }
Can use simple approach (no Docker needed for alpha if complex)
Timeout: 10 seconds max

Deliverables:

Verification endpoint
1-2 test cases

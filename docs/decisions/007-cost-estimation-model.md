# 007: Cost Estimation Model for CostTooltip

## Context

The in-progress latency/cost estimation feature (`CostTooltip`, `estimateCost` in `lib/llm/costs.ts`) shows users an estimated cost before they trigger an LLM call. The current implementation uses a single flat estimate of 2500 output tokens regardless of endpoint. We ran a regression analysis on 179 analytics entries to determine whether we can do better.

## Question

Which request-time variables (endpoint, model, inputTokens) are predictive of output cost, and should we use per-endpoint estimates instead of a flat number?

## Analysis

We fit an OLS regression on `log(outputTokens) ~ endpoint + model + log(inputTokens)`, excluding deepseek (8 entries, all `edit/whole`, too sparse to estimate separately).

### Key findings

1. **Endpoint is the strongest predictor of output tokens.** Adding endpoint to a model with only inputTokens nearly triples R² (0.14 → 0.41). Partial eta-squared = 0.317 — endpoint explains ~32% of remaining variance after controlling for inputTokens.

2. **inputTokens is significant but secondary.** The log-log relationship (elasticity ~0.41) means a 10x increase in input predicts roughly 2.6x more output. Log-log fits better than raw or mixed transforms.

3. **Model has a small additional effect** (p=0.005, delta R²=0.037). Sonnet produces ~1.4-1.6x more output than Opus for the same endpoint and input. But with only 28 Sonnet observations this is imprecise.

4. **Latency is driven by model choice, not input size.** inputTokens has zero predictive power for latency (p=0.99). Model is the dominant latency predictor (partial eta-squared for model in the latency regression is large, p=1.3e-11).

### Endpoint effect sizes (vs decomposition/extract, controlling for inputTokens)

These are multiplicative factors on output tokens:

- lean: ~1.3x (terse code output)
- causal-graph: ~1.8x
- dialectical-map, statistical-model: ~2.1x
- property-tests, counterexamples: ~2.8x
- semiformal: ~3.1x (verbose prose output)

The direction is intuitive — structured prose endpoints generate more tokens than code-output endpoints.

### Data limitations

- 179 total entries, heavily skewed toward Opus (143 vs 28 Sonnet, 8 deepseek)
- statistical-model has only 3 observations; dialectical-map has 7
- Model residuals show excess kurtosis (fat tails), meaning occasional outlier calls produce much more or less output than predicted

## Decision

**Use per-endpoint output token estimates instead of a flat 2500.** The current flat estimate under-predicts for verbose endpoints (semiformal, property-tests, counterexamples) and over-predicts for lean and decomposition. Since endpoint is known at request time and is the single strongest predictor, this is the highest-value improvement.

**Do not hardcode regression coefficients yet.** The dataset is too small and model-skewed to commit to specific numbers. The plan is to collect more Sonnet data, especially for underrepresented endpoints, and then derive stable per-endpoint estimates.

**Defer latency estimation.** Latency depends on model and output length (which we're predicting, not observing at request time). A two-stage estimate (predict output tokens → predict latency from output tokens + model) would be needed, but the practical value is low since users primarily care about cost.

## Implementation guidance (once data collection is complete)

- Replace the flat `EXPECTED_OUTPUT_TOKENS = 2500` in `estimateCost` with a lookup table keyed by endpoint
- The `estimateCost` function signature should accept endpoint as a parameter
- Consider grouping endpoints into tiers (low/medium/high output) rather than fitting exact per-endpoint numbers, since some endpoints have very few observations
- Model effect is small enough to ignore for estimates unless the app starts offering model selection to users

## Status

Waiting on additional data collection before finalizing coefficients. Analysis notebook: `data/analytics_regression.ipynb`.

# Dependency Upgrade Review: `feat/zustand-wire-page`

Reviewed relative to `main` on 2026-04-03. Branch adds 1 new production dependency.

---

## Dependency Evaluation: zustand (new) ^5.0.12

### Summary

| Aspect | Assessment |
|--------|-----------|
| **Recommendation** | Add the dependency |
| **Breaking change impact** | None (new dependency, not an upgrade of an existing one) |
| **Estimated effort** | Already implemented (~1300 lines added, with tests) |
| **Risk** | Low |

### Motivation

The app's root `page.tsx` had ~20+ `useState` calls with manual debounced localStorage persistence, ref-based accessor hacks to avoid stale closures, and no undo/redo capability. Zustand replaces this with a centralized store using `persist` middleware. The decision is documented in `docs/decisions/005-zustand-state-management.md` and validated via a prior spike (`docs/spikes/zustand-state-management.md`).

### Breaking Changes That Affect This Project

None -- this is a new dependency addition.

However, zustand v5 vs v4 differences are relevant because **ReactFlow 11.x bundles zustand v4 internally**:

| v5 change | Impact on this project |
|-----------|----------------------|
| Named `create` import required (default export removed) | Store already uses `import { create } from "zustand"` -- correct |
| Dropped `use-sync-external-store` runtime dep (uses React's built-in `useSyncExternalStore`) | Requires React >=18; project uses React 19.2.4 -- no issue |
| `setState` second-arg `replace` boolean removed | Store uses `set()` with partial state objects throughout -- unaffected |
| `persist` middleware `merge` function signature updated | Store implements `merge` correctly for v5 |

### Breaking Changes That Don't Affect This Project

- v5 removed `destroy()` method on stores (replaced by `store.subscribe` cleanup). The codebase does not call `destroy()`.
- v5 changed TypeScript generics ordering. The store definition follows the v5 pattern.
- v5 removed `getServerState` from `useStore`. Not used in this codebase.

### Transitive Effects

- **Dual zustand versions in bundle:** ReactFlow 11.x depends on `zustand ^4.4.1`. npm correctly resolves this by nesting `zustand@4.5.7` under each `@reactflow/*` package (6 nested copies in the lockfile) while the top-level resolves to `zustand@5.0.12`. These are separate module instances with no shared state or conflicts between them. The bundle size increase is minimal (~3KB gzipped for zustand v5) since zustand v4 was already present as a transitive dependency.
- **No new peer dependency requirements:** Zustand v5 has optional peers for `@types/react`, `immer`, and `use-sync-external-store`, none of which are required.
- **React 19 compatibility:** Zustand v5 peer requires `react >=18.0.0`. React 19.2.4 satisfies this.
- **Minor lockfile churn:** `minimatch` 3.1.3 -> 3.1.5 and `flatted` 3.3.3 -> 3.4.2 were also updated (dev dependencies, likely from npm resolving slightly newer patch versions during `npm install`). These are innocuous patch bumps.

### Risk Factors

- **Low risk:** Zustand is a mature, widely-adopted library (46k+ GitHub stars, ~40M weekly npm downloads). The v5 API surface used here (`create`, `persist`, `createJSONStorage`, `skipHydration`) is stable and well-documented.
- **SSR handled correctly:** Store uses `skipHydration: true` with explicit rehydration in `useEffect`, which is the documented approach for Next.js.
- **Migration path from old format included:** `migrateFromV2()` handles the transition from the previous `workspace-v2` localStorage format, reducing data-loss risk for existing users.
- **Debounced storage adapter:** Custom `createDebouncedStorage` prevents performance issues from JSON serialization on every keystroke.
- **Future consideration:** When ReactFlow upgrades to v12+ (which uses zustand v5 natively), the nested v4 copies will disappear, simplifying the dependency tree. No action needed now.

### Migration Plan

Already implemented on this branch:

1. Store created at `app/lib/stores/workspaceStore.ts`
2. `app/page.tsx` wired to use store selectors instead of local `useState`
3. Old `useWorkspacePersistence` hook removed
4. Automatic migration from `workspace-v2` localStorage format on first load
5. Tests cover store operations and hydration behavior

---

## Overall Assessment

**Zustand addition is well-justified and well-implemented.** The decision record, spike, tests, and migration logic all demonstrate due diligence. The dual-version situation with ReactFlow's zustand@4 is handled correctly by npm's nested resolution and poses no runtime risk. No unused dependencies remain in this diff.

---

## Loop 2 Re-check (2026-04-03)

Fix commit `3ed18f8` changed only `.ts`/`.tsx` files (`workspaceStore.ts`, `artifactStore.ts`, `workspacePersistence.ts`, `page.tsx`). No changes to `package.json` or `package-lock.json`. The dependency profile is identical to Loop 1.

**Prior assessment still holds. No new dependency concerns.**

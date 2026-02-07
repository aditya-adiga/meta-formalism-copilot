import Lake
open Lake DSL

package «verify» where
  leanOptions := #[
    ⟨`autoImplicit, false⟩
  ]

@[default_target]
lean_lib «Verify» where
  srcDir := "."

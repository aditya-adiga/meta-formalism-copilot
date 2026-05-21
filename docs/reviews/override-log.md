# Code Review Override Log

Append-only record of human overrides on `code-review` output. Read on every run
(Step 3.5); never overwrite, date-stamp, or delete rows. Mark stale rows with `~`
strikethrough in the `Finding` cell but keep them for audit.

Rows are newest-first.

| Date | PR ref | Finding | Original verdict | Override verdict | Reason |
|---|---|---|---|---|---|
| — | — | _No overrides recorded yet._ | — | — | — |

## 1. Encoder

- [x] 1.1 `regionless` recipe flag; `card_steps` skips the region step without a region. Verify: unit test in `tests/test_forms.py` that a regionless build has no region and `card_steps` has no region step.

## 2. Live

- [x] 2.1 ga, cc, aad, edgesec, ucs through the matrix. Verify: stored = Edit = rating (passed 2026-10-22).
- [x] 2.2 Add to `VERIFIED`, update docs. Verify: `mkdocs build --strict`, `openspec validate --specs --strict`.

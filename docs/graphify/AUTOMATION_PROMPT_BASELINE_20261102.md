# Graphify / agent automation prompt baseline — 2026-11-02

This records **saved instruction text length**, not API tokens, Codex credits, execution cost, or verified runtime improvement. The account's usage telemetry was not available through these tools.

| Automation | Before chars | After chars | Enabled at edit |
| --- | ---: | ---: | --- |
| REN | 4,240 | 2,085 | yes |
| SHIN | 4,212 | 2,065 | no |
| HARU | 4,226 | 2,057 | no |
| SORA | 4,191 | 2,082 | no |
| KENJI | 4,385 | 2,080 | no |
| Daily Avalon quality review | 2,417 | 1,016 | yes |
| **Total** | **23,671** | **11,385** | |

Saved **12,286 characters (51.9%)** across six automation prompts. This is *not* a measured 51.9% reduction in execution tokens or costs. Schedules and on/off states were preserved. The separate paused `Avalon OS checkpoints` automation was already concise and left unchanged.

## What to measure next

For 3–5 comparable real coding tasks, capture only if source telemetry is exposed: actual input/output tokens or paid credits, elapsed time, code-discovery tool calls, repeated file reads, tests run and passed, and useful changes delivered. Compare matched tasks (e.g. auth bug vs auth bug), excluding staging/unrelated deployment costs. If no telemetry is available, report **not measured** rather than infer token savings from text length.

## Operational rules

1. Fetch live Git commit/PR diff and confirm owner/branch before working; Graphify's indexed snapshot may differ.
2. Use one relevant Graphify location query and one compact memory query **only when useful**; avoid repeated work across 5 managers.
3. Keep automation state/schedule unchanged unless owner expressly requests changes; paused does not mean failed.
4. Send only changed findings with evidence to issue #23. Do not rewrite entire project status each hour.
5. No secret/customer data in memory or telemetry. Functional regression and security testing are never skipped to meet a context budget.

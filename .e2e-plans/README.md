# E2E Test Plans

_Last indexed: 2026-05-15_

This directory contains End-to-End (E2E) test plans for this project.

## Summary

- **Total plans**: 1
- **Total workflows**: 7
- **Generated**: 2026-05-15

## Structure

```
.e2e-plans/
├── README.md              # This file — index of all plans
├── *.md                   # Individual plan files
├── results/               # Test execution reports
├── scripts/               # Generated Playwright test scripts
└── screenshots/           # Screenshots captured during execution
```

## Plans

- [admin](admin.md) — v`1.1.0`, 7 workflow(s), 1365 lines

## Usage

```bash
# List all plans
npx tsx ~/.agents/skills/agent-builder/scripts/e2e-plan-manager.ts list

# Show details of a specific plan
npx tsx ~/.agents/skills/agent-builder/scripts/e2e-plan-manager.ts show <plan-name>

# Re-generate this index
npx tsx ~/.agents/skills/agent-builder/scripts/e2e-plan-manager.ts index
```

# @bee-epic/shared

Shared TypeScript types and Zod schemas for the Bee Epic Apiary monorepo
(services, admin, web).

Every cross-workspace type or schema lives here — products, orders, settings,
staff/auth, notifications, email payloads, and the worker's API response
envelope. Consumers import from `@bee-epic/shared` rather than copy-pasting
shapes between projects.

## Build

```bash
npm run build      # tsc -p tsconfig.build.json  -> dist/
npm run dev        # tsc --watch
npm run clean      # rm -rf dist
```

`prepare` runs `build` automatically when the package is installed, so a fresh
`npm install` in admin/web/services always has a populated `dist/`.

## Build artifacts

This package ships both `dist/` (compiled JS + `.d.ts` + `.d.ts.map`) **and**
`src/` (TypeScript sources) inside its published `files` array. That is
deliberate: with `declarationMap: true` in `tsconfig.build.json`, the generated
`.d.ts.map` files point editors at the original `.ts` sources so consumers get
**go-to-definition** straight into the real implementation instead of bouncing
off a stripped-down `.d.ts`.

If you ever want to slim the package by removing `src/` from `files`, also turn
off `declarationMap` in `tsconfig.build.json` — otherwise IDEs will print
warnings about missing source maps every time a consumer Ctrl-clicks into a
shared type. The two settings are paired.

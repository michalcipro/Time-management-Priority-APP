<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Priority Agent – notes for coding agents

- Stack: Next.js 16 (App Router, `src/proxy.ts`), React 19, TypeScript, Tailwind CSS 4, Prisma 7 (`prisma-client` generator → `src/generated/prisma`, driver adapter `@prisma/adapter-pg`), Auth.js v5, Anthropic SDK, BullMQ.
- `src/lib/*` is isomorphic (safe for client components); `src/server/*` is server-only.
- **Every business query runs inside `withActor(user, db => …)` or `withSystem(db => …)`** (`src/server/db.ts`). They set the PostgreSQL session variables used by Row-Level Security. Keep network calls (AI, provider APIs) outside these callbacks and do not run queries in parallel inside them (one connection per transaction).
- Side effects (notifications, realtime events, jobs) go through `withActorEffects` / `fx.add(...)` so they run after commit.
- Services in `src/server/services/*` apply the same RBAC scopes as the RLS policies (`scopes.ts`); route handlers use `apiRoute()` from `src/server/api.ts`.
- Priority math lives in `src/lib/priority.ts` (pure, unit-tested). Lower number = more urgent.
- Run `npm run typecheck && npm run lint && npm test` before committing; `npm run build` for a production check.

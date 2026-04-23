# Agent instructions

## Dev server: restart and verify

When verification depends on a **fresh Next.js dev process** or an up-to-date **Prisma Client**, **restart `npm run dev` yourself** (stop the existing dev process, then run it again from the repo root). Do not only instruct the user to restart.

Restart when relevant after: `npx prisma generate` / migrations, changes to `.env*`, `next.config.*`, middleware, or when fixing errors that look like a **stale bundle** (e.g. Prisma rejecting a field that exists in `schema.prisma`).

After restart, **verify** the change: terminal shows a clean startup, then exercise the affected route or API (e.g. `curl`). Do not mark server-side fixes complete without verification when it is feasible.

Skip restart when no dev server is involved or a trivial client-only change does not require it.

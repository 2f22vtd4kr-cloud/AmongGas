---
name: Colyseus 0.17 on Replit setup
description: Environment quirks for installing/running this project's Colyseus 0.17 server on Replit
---

- The server `colyseus` package must live only in `server/` (its own package.json), never hoisted into the root project — mixing it into the root breaks the Vite/rollup client build.
- The browser/client side uses `@colyseus/sdk`, not the `colyseus` server package.
- `colyseus@0.17` lists `@colyseus/uwebsockets-transport` as a (non-optional-in-metadata) peerDependency. npm 7+'s auto-install-peers tries to fetch it, and Replit's package firewall blocks that GitHub-hosted transport package with a 403, which aborts the whole `npm install` in `server/`.
  **Fix:** install with `legacy-peer-deps=true` (an `.npmrc` in `server/` with that line makes it permanent) so npm doesn't try to auto-install that peer. The app only needs `@colyseus/ws-transport`, which installs fine as a direct dependency.
- The Replit workflow system's `waitForPort` task option does not support port 5001 (the Colyseus server) — don't rely on it; the workflow still starts fine, just confirm via logs instead of waitForPort.

---
name: Colyseus 0.17 on Replit — setup constraints
description: Colyseus 0.17 package split, Replit security policy blocks, and correct install commands for Among Gas server + browser client.
---

## The rule

Server and browser client are **separate packages** in Colyseus 0.17. Never install the server package in the Vite/browser root.

| Role | Package | Install location |
|---|---|---|
| Game server (Node.js) | `colyseus` + `@colyseus/schema@^4` | `server/` only |
| Browser client (Vite) | `@colyseus/sdk` | root `package.json` |

**Why:** `colyseus` (server) pulls in `@colyseus/uwebsockets-transport` which is blocked by Replit's security policy (403 Forbidden). Installing it in root also corrupts rollup's native binary (breaks Vite) via `--omit=optional` side effects.

## Install commands

```bash
# Server
cd server && npm install colyseus @colyseus/schema@^4.0.0 express cors --legacy-peer-deps

# Browser client (root)
npm install @colyseus/sdk
```

## API differences from 0.15/0.16

- Room class: `extends Room { state = new GameRoomState(); }` — no generic, no `this.setState()`
- `@filter()` decorator **removed** — use `client.send('YOU_ARE_IMPOSTOR', {})` for per-client secrets
- `@colyseus/schema` **v4** required (not v3)
- Browser: `import { Client, Room } from '@colyseus/sdk'`
- `room.roomId` (not `room.id`)
- Workflow system cannot `waitForPort: 5001` — only specific ports supported. Run Colyseus workflow without `waitForPort`.

**How to apply:** Any future work adding multiplayer rooms, schema fields, or client networking must follow this split.

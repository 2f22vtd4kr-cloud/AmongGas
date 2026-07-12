---
name: Phaser scene + Colyseus listener cleanup
description: room.onMessage handlers registered in a Phaser scene's create() must be unsubscribed in shutdown(), or they stack across repeated scene.launch/stop cycles.
---

## The Rule
`NetworkManager.room` (a Colyseus `Room` instance) lives for the whole multiplayer session and is
NOT tied to any one Phaser scene's lifecycle. A scene that is started/stopped repeatedly within the
same session (e.g. `MeetingScene`, launched fresh for every emergency meeting or body report) will
re-run `create()` each time it's launched — and every `room.onMessage(type, cb)` call inside
`create()` registers a brand-new listener on the room's shared emitter.

`room.onMessage` returns an unsubscribe function (`() => void`). Capture it and call it from the
scene's `shutdown()` lifecycle method (a built-in Phaser callback invoked when `scene.stop()` runs):

```ts
const off = NetworkManager.room?.onMessage('CHAT_MESSAGE', msg => this.onChatMessage(msg));
this.chatUnsub = () => off?.();

shutdown() {
  this.chatUnsub?.();
  this.chatUnsub = undefined;
}
```

**Why:** without this, the second meeting in a game gets its `CHAT_MESSAGE`/`VOTE_RESULT` handler
fired twice (once per still-alive old listener from the first meeting), duplicating chat messages
or double-processing vote results. This class of bug is easy to miss because a single meeting per
manual playtest never surfaces it — it only shows up once a game has 2+ meetings.

## How to Apply
Any time a Phaser scene that can be launched more than once per session registers a
`room.onMessage` listener, store the returned unsubscribe function and call it in that scene's
`shutdown()`. Also remove any DOM elements created for HTML `<input>` overlays in the same
`shutdown()` (existing pattern in `MenuScene.cleanupInput()` / `LobbyScene.cleanupInput()`).

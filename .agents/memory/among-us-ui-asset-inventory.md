---
name: Among Us UI asset inventory
description: Which HUD icon assets exist as real art under Assets/ vs which are missing; never fabricate the missing ones without asking.
---

## Exists as real art (safe to wire into code)
- `Assets/Images/UI/`: kill_icon(+_dim), emergency_icon(+_dim), sabotage_icon(+_dim), light_bulb_icon(+_dim), map_button, close.
- `Assets/Images/Items/`: highlight ("glow when nearby") variants exist for far more task objects than were originally wired into `TASK_SPRITE_VARIANTS` in GameScene.ts — e.g. reactor_btn_highlight, generator_highlight, garbage_liver_highlight, upper_engine_highlight, lower_engine_highlight, fuel_engine_highlighted, security_monitor_highlight, admin_control1/2_highlight. Check this map before assuming a glow effect needs new art — it usually already exists, just unused.
- `Assets/Images/Meeting/`: chat.png / chat_dead.png — exists, but is meeting-scene chat UI art, not a top-right HUD chat-bubble icon equivalent to real Among Us's persistent HUD chat button.

## Missing entirely (must report as a gap, never draw a replacement)
- No settings/gear/cog icon anywhere under Assets/.
- No dedicated USE / REPORT button icon art (large translucent circular icon+caption buttons in the reference are recreated with Phaser-drawn circles + emoji glyph + caption text, not image assets — this is UI chrome drawn with primitives, which is fine; it is not "fabricating an asset" the same way generating a new PNG would be).
- No ping-display, chat-bubble-for-HUD, or arrow/compass image asset — the task-direction compass is a small triangle drawn with Phaser graphics primitives (`Triangle` game object), not an image, for the same reason.

## Known data gaps for further "Room: Task" list work
- Task world objects: `electricity_wires`, `nav`, `wifi`, `engines`, `reactor_btn`, `generator_circuit`, `garbage_liver`, `laptop` (TMX object names in `buildTasks()`/GameScene.ts).
- Room name for a task list row can be derived without inventing data: find the nearest entry in `AMBIENT_CENTRES` (settings.ts) to the task's world x/y and use that room's display name. No per-task room field exists in the data model — compute it, don't add a new field.
- Two task types have no glow-on-approach because their world sprite isn't tracked in `taskSprites` at all: `engines` (fuel_engine task — `placeItemSprites`'s imgMap has no `engines` key, only an unrelated `fuel_engine_item` key) and `laptop` (clear_asteroids — maps to `cafeteria_comp` texture, no highlight variant exists for it). Fixing requires deeper TMX/sprite-placement changes, not just a variants-map edit.

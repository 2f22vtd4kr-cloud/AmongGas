---
    name: Among Us clone known pre-existing bugs
    description: Pre-existing issues noted but not part of any fix — flagged so future work doesn't re-investigate.
    ---

        **Red visor renders green**: The Red player sprite has a bright-green visor (caused by the same copy-paste asset bug that also gave it a blue-shaded lower body). Only the blue-shading bug was fixed; visor remains green. Fixing the visor requires a separate recolor pass on the Red assets.

    **Walk animation overrides dead texture**: Phaser's AnimationManager runs independently of a sprite's custom update() — calling setTexture('dead_X') without anims.stop() first means the walk animation continues to override the dead frame on every tick. Fixed in Bot.die() and Player.die() by adding anims.stop() before setTexture().
    
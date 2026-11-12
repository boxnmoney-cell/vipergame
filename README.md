# Canvas snake arena

Open `index.html` in a modern browser. No build or runtime dependencies are required.
For a local server, run `python3 -m http.server 8000` in this directory.

- Steer with the mouse, one finger, arrow keys, or A/S/D.
- Boost by holding the primary mouse button or Space. On touch screens, hold a second finger while steering with the first. Boost spends collected points.
- Escape pauses; tap the pause overlay or press Escape to resume.
- The score bar fills toward an exit target of 5 × the entry bet. Cross the green line with enough current points to cash out the full collected score.
- At 10,000 current points, the player evolves: crystalline fins, an aura and orbiting sparks remain until the next round. Evolution is visual and does not change collisions or speed.
- W is the recording shortcut to the exit, available after reaching the cashout target.

Edit `Config` at the top of `game.js` to change the entry bets, food rewards, target multiplier, `evolutionScore`, colors, bot count, or seed. `mapSeed: null` creates a new arena each round; a fixed number or string makes the layout reproducible. The default population is 49 bots plus the player.

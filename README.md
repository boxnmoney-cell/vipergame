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

## Game Studio

Open `studio.html`, or choose **GAME STUDIO** in the lobby or pause screen.
The studio offers a live preview, three backgrounds, three snake designs, a background tone, a player color, glow strength, score-label and minimap toggles, bot count, and evolution threshold. Appearance changes apply live to an already-open arena on the same origin; population and evolution changes apply next round. Labels show each snake's collected points after boost spending, with no names or currency signs. Bots start at zero and use the round's pickup multiplier.

Preferences are stored in this browser. Export/import a JSON preset to move a look between browsers. Play also includes the validated preset in the game URL, so the selected look works when browser storage is unavailable. Serve the folder over HTTP for reliable shared storage across tabs; opening the files directly is also supported.

**Your games → Add a game** stores a named link to another playable game, including a relative path such as `./games/my-game/index.html`. Linked games open in a separate tab and keep their own settings. Adding a link does not copy, host, or automatically customize that game's source code. Only Snake Arena is bundled; `pickaxemulti` can be integrated once its game files are available.

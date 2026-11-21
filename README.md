# Canvas snake arena

Open `index.html` in a modern browser. No build or runtime dependencies are required.
For a local server, run `python3 -m http.server 8000` in this directory.

- Steer with the mouse, one finger, arrow keys, or A/S/D.
- Snake length and thickness increase with current points, including bots' random starting scores. Boost spending reduces that score-based size smoothly. The entry bet still sets the player's starting size; `Config.massPerSqrtScore` controls additional growth.
- Boost by holding the primary mouse button or Space. On touch screens, hold a second finger while steering with the first. Boost spends collected points.
- Escape pauses; tap the pause overlay or press Escape to resume.
- The score bar fills toward an exit target of 5 × the entry bet. Cross the green line with enough current points to cash out the full collected score.
- At 10,000 current points, the player evolves: crystalline fins, an aura and orbiting sparks remain until the next round. Evolution is visual and does not change collisions or speed.
- W is the recording shortcut to the exit, available after reaching the cashout target.

Edit `Config` at the top of `game.js` to change the entry bets, food rewards, target multiplier, `evolutionScore`, colors, bot count, or seed. `mapSeed: null` creates a new arena each round; a fixed number or string makes the layout reproducible. The default population is 49 bots plus the player.

## Game Studio

Open `studio.html`, or choose **GAME STUDIO** in the lobby or pause screen.
The studio offers a live preview, five classic backgrounds, three original snake designs plus country flags, a background tone, a player color, glow strength, score-label and minimap toggles, bot count, and evolution threshold. Appearance changes apply live to an already-open arena on the same origin; population and evolution changes apply next round. Labels show each snake's collected points after boost spending, with no names or currency signs. Bots start with a random score from 0 to 15,000 (also on respawn), then gain points from food using the round's pickup multiplier. Change `Config.botStartingScore` to adjust this range. The player still starts at zero.

Preferences are stored in this browser. Export/import a JSON preset to move a look between browsers. Play also includes the validated preset in the game URL, so the selected look works when browser storage is unavailable. Serve the folder over HTTP for reliable shared storage across tabs; opening the files directly is also supported.

**Your games → Add a game** stores a named link to another playable game, including a relative path such as `./games/my-game/index.html`. Linked games open in a separate tab and keep their own settings. Adding a link does not copy, host, or automatically customize that game's source code. Only Snake Arena is bundled; `pickaxemulti` can be integrated once its game files are available.

## Maps and visual effects

Choose **Game Studio → Arena map**. The original Classic Arena is joined by four seeded maps:

- **Aurora Reef:** luminous coral, rising bubbles and winding food streams.
- **Ember Rift:** molten fissures, embers and long food veins.
- **Crystal Garden:** faceted crystal formations and clustered food gardens.
- **Orbital Ruins:** broken orbital structures and concentric food routes.

Each map changes the food layout and palette. Scenery is decorative; snake/body and arena-edge collisions keep the same rules. Map changes apply next round in the game and immediately in the studio preview. Classic Arena retains its five background choices; background tone works on every map. A fixed `Config.mapSeed` reproduces a layout, while the default generates a new one each round. `Config.map` sets the default map when no studio preset is saved.

**Visual effects** offers Off, Balanced and Cinematic modes. The added effects include boost trails, gold-pickup sparkles, death bursts, exit-unlock waves, moving exit particles and evolution rings. Effects use a separate random generator, so their quality does not affect bot behavior, food rewards or collisions. Transient particles and waves have fixed limits; reduced-motion mode suppresses animated ambient and burst effects. Map and effect settings are included in exported presets; older presets still import with Classic Arena and Balanced effects.

Country skins are available under **Game Studio → Snake design**: 30 countries, or a mixed set across snakes. Flag patterns appear on both heads and bodies, with an upright 4:3 flag badge beside each score for readability. Choose **Classic Arena → Classic background → Desert sand / Ocean water** for dunes or animated sea ripples. Ocean animation respects the effects and reduced-motion settings. Flag SVGs are bundled in `assets/flags` and cached as Canvas textures; no internet connection is required. Attribution and the MIT license for flag-icons are included in that directory.

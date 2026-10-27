/* Standalone Canvas game.
 * Open index.html directly or serve this directory with python3 -m http.server 8000.
 * W = director win; Space / boost button = boost; Esc = pause; arrows / ASD = steer
 * (W is reserved for director mode, so use ↑ to travel upward).
 */
const Config = {
  playerSkinColor: ["#b5ff44", "#47f5d2", "#b48aff", "#ff75c9"],
  botCount: 23,
  mapSeed: null, // null: fresh seed every round; number/string: reproducible world
  bet: 300, // Default entry cost; selectable before each round
  betOptions: [50, 100, 300, 500, 1000],
  currencySymbol: "₴",
  baseStartingMass: 30,
  startingMassPerSqrtBet: 3, // Starting mass = base + this value × sqrt(entry bet)
  foodValue: 5, // Payout per unit of ordinary food; independent of the entry bet
  goldValue: 18, // Payout per unit of gold dropped by a defeated snake
  initialBalance: 15000,
  mapSize: 4800,
  foodCount: 1350,
  finishDistance: [1150, 1850],
  playerSpeed: 128,
  boostSpeed: 215,
  speedAcceleration: 300, // World units/second², for smooth boost transitions
  boostDrainPerSecond: 30, // Deducted from the snake's collected balance while boosting
  directorMode: true,
  sound: false,
};
window.Config = Config;

(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const canvas = $("game"),
    ctx = canvas.getContext("2d", { alpha: false });
  const mini = $("minimap"),
    mctx = mini.getContext("2d");
  const TAU = Math.PI * 2,
    STEP = 1 / 60,
    GAP = 7;
  const palette = [
    "#a67bff",
    "#ff739e",
    "#46dbf2",
    "#ffb34f",
    "#57efbe",
    "#748bff",
  ];
  const names = [
    "NOVA",
    "KAI",
    "GHOST",
    "VIPER",
    "LUNA",
    "ACE",
    "MIKA",
    "NEON",
    "RUSH",
    "BLAZE",
    "KIRA",
    "ZEN",
    "SORA",
    "ECHO",
    "ONYX",
    "LUCKY",
  ];
  const flags = ["fr", "de", "br", "jp", "us", "ua"];
  const money = (n, fixedDecimals = false) =>
    Config.currencySymbol +
    n.toLocaleString("en-US", {
      minimumFractionDigits: fixedDecimals || !Number.isInteger(n) ? 2 : 0,
      maximumFractionDigits: 2,
    });
  const roundMoney = (n) => Math.round(n * 100) / 100;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  let width = 450,
    height = 800,
    scale = 0.8,
    dpr = 1;
  let random,
    seed,
    world,
    player,
    finish,
    foods = [],
    snakes = [],
    particles = [];
  let bodyGrid = new Map(),
    foodGrid = new Map(),
    state = "lobby",
    paused = false;
  let wallet = Config.initialBalance,
    roundBet = Config.bet,
    collected = 0,
    foodEarnings = 0,
    boostSpent = 0,
    boostRemainder = 0,
    elapsed = 0,
    hue = 165;
  let camera = { x: 0, y: 0 },
    pointer = null;
  let pointerId = null,
    boosting = false,
    boostBlocked = false,
    boostPointerId = null,
    keys = new Set();
  let previousTime = 0,
    accumulator = 0,
    uiClock = 0,
    foodClock = 0;
  let audioContext,
    soundEnabled = Config.sound,
    roundSerial = 0;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Seeded randomness drives layout, skins, AI choices and finish placement.
  function makeRandom(value) {
    let h = 2166136261;
    for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return () => {
      h += 0x6d2b79f5;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const between = (a, b) => a + random() * (b - a);
  const pick = (list) => list[Math.floor(random() * list.length)];

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    scale = width / 490;
  }
  new ResizeObserver(resize).observe($("arena"));

  function newSnake(id, x, y, mass, color, isPlayer = false) {
    const angle = between(-Math.PI, Math.PI);
    const snake = {
      id,
      x,
      y,
      oldX: x,
      oldY: y,
      angle,
      oldAngle: angle,
      targetAngle: angle,
      mass,
      oldMass: mass,
      color,
      isPlayer,
      alive: true,
      grace: 2,
      path: [],
      sampleX: x,
      sampleY: y,
      name: isPlayer ? "YOU" : pick(names),
      flag: pick(flags),
      think: 0,
      speed: isPlayer ? Config.playerSpeed : between(84, 119),
      bold: random() < 0.28,
      boost: false,
      respawn: 0,
      personality: between(-1, 1),
      age: 0,
    };
    snake.currentSpeed = snake.speed;
    snake.visualLength = lengthOf(snake);
    snake.oldVisualLength = snake.visualLength;
    for (let i = 0; i < lengthOf(snake) / GAP + 2; i++) {
      snake.path.push({
        x: x - Math.cos(angle) * GAP * i,
        y: y - Math.sin(angle) * GAP * i,
      });
    }
    return snake;
  }
  const radiusOf = (snake) => 9 + Math.min(9, Math.sqrt(snake.mass) * 0.37);
  const lengthOf = (snake) => Math.min(2350, 100 + snake.mass * 2.05);

  function addFood(
    x = between(50, world - 50),
    y = between(50, world - 50),
    gold = false,
    value = 1,
  ) {
    const food = {
      x,
      y,
      gold,
      value,
      radius: gold ? between(3.5, 6.5) : between(1.8, 3.4),
      color: gold
        ? "#ffd968"
        : pick(["#8be6ff", "#b4ff6a", "#d38aff", "#f982c4"]),
      phase: between(0, TAU),
      alive: true,
    };
    foods.push(food);
    const key = cellKey(x, y, 80);
    if (!foodGrid.has(key)) foodGrid.set(key, []);
    foodGrid.get(key).push(food);
  }
  const cellKey = (x, y, size) =>
    `${Math.floor(x / size)},${Math.floor(y / size)}`;

  function reset(nextState = "playing") {
    roundSerial++;
    seed = Config.mapSeed ?? crypto.getRandomValues(new Uint32Array(1))[0];
    random = makeRandom(seed);
    world = Math.max(3000, Config.mapSize);
    hue = between(145, 235);
    elapsed = 0;
    collected = 0;
    foodEarnings = 0;
    boostSpent = 0;
    boostRemainder = 0;
    particles = [];
    foods = [];
    snakes = [];
    foodGrid.clear();
    bodyGrid.clear();
    pointer = null;
    pointerId = null;
    keys.clear();
    boosting = false;
    boostBlocked = false;
    boostPointerId = null;
    paused = false;
    accumulator = 0;
    $("pausePanel").classList.add("hidden");
    $("boostButton").classList.remove("active");
    document.querySelectorAll(".coin").forEach((c) => c.remove());
    const colors = Array.isArray(Config.playerSkinColor)
      ? Config.playerSkinColor
      : [Config.playerSkinColor];
    const entryBet = nextState === "playing" ? roundBet : Config.bet;
    const startingMass =
      Config.baseStartingMass +
      Config.startingMassPerSqrtBet * Math.sqrt(Math.max(1, entryBet));
    player = newSnake(
      0,
      world / 2,
      world / 2,
      startingMass,
      pick(colors),
      true,
    );
    const vertical = random() > 0.5,
      sign = random() > 0.5 ? 1 : -1;
    const dist = clamp(between(...Config.finishDistance), 650, world / 2 - 180);
    finish = {
      vertical,
      coordinate: world / 2 + sign * dist,
      center: world / 2 + between(-180, 180),
      half: 650,
      sign,
    };
    player.angle =
      (vertical
        ? sign > 0
          ? 0
          : Math.PI
        : sign > 0
          ? Math.PI / 2
          : -Math.PI / 2) + between(-0.35, 0.35);
    player.targetAngle = player.angle;
    player.oldAngle = player.angle;
    player.path = player.path.map((_, i) => ({
      x: player.x - Math.cos(player.angle) * i * GAP,
      y: player.y - Math.sin(player.angle) * i * GAP,
    }));
    snakes.push(player);
    for (let i = 1; i <= clamp(Config.botCount, 0, 80); i++) {
      // Several rivals begin near the camera; the rest populate the wider arena.
      let x, y;
      if (i <= 7) {
        const a = between(0, TAU),
          r = between(280, 650);
        x = player.x + Math.cos(a) * r;
        y = player.y + Math.sin(a) * r;
      } else {
        x = between(300, world - 300);
        y = between(300, world - 300);
      }
      snakes.push(newSnake(i, x, y, between(45, 290), pick(palette)));
    }
    for (let i = 0; i < Config.foodCount; i++) addFood();
    // Food constellations create routes and visually distinct opening shots.
    for (let i = 0; i < 130; i++) {
      const a = between(0, TAU),
        r = between(45, 430);
      addFood(player.x + Math.cos(a) * r, player.y + Math.sin(a) * r);
    }
    camera = { x: player.x, y: player.y };
    state = nextState;
    $("lobby").classList.toggle("hidden", state !== "lobby");
    $("result").classList.add("hidden");
    $("route").classList.toggle("hidden", state !== "playing");
    updateUI();
    rebuildBodyGrid();
  }

  function rebuildBodyGrid() {
    bodyGrid.clear();
    for (const s of snakes) {
      if (!s.alive) continue;
      // Body begins just behind the head; head-on contact is handled separately.
      const bodyCount = Math.min(s.path.length, Math.ceil(lengthOf(s) / GAP));
      for (let i = 3; i < bodyCount; i += 2) {
        const point = s.path[i],
          key = cellKey(point.x, point.y, 64);
        if (!bodyGrid.has(key)) bodyGrid.set(key, []);
        bodyGrid.get(key).push({ x: point.x, y: point.y, snake: s });
      }
    }
  }
  function nearby(grid, x, y, size, range = 1) {
    const entries = [],
      cx = Math.floor(x / size),
      cy = Math.floor(y / size);
    for (let dx = -range; dx <= range; dx++)
      for (let dy = -range; dy <= range; dy++) {
        const bucket = grid.get(`${cx + dx},${cy + dy}`);
        if (bucket) entries.push(...bucket);
      }
    return entries;
  }

  function think(s, dt) {
    s.think -= dt;
    if (s.think > 0) return;
    s.think = between(0.12, 0.35);
    let target = null,
      best = Infinity;
    for (const f of nearby(foodGrid, s.x, s.y, 80, 3)) {
      if (!f.alive) continue;
      const score = distance2(s, f) / (f.gold ? 3.5 : 1);
      if (score < best) {
        best = score;
        target = f;
      }
    }
    let desired = target
      ? Math.atan2(target.y - s.y, target.x - s.x)
      : s.angle + between(-0.65, 0.65);
    if (s.x < 180 || s.y < 180 || s.x > world - 180 || s.y > world - 180) {
      desired = Math.atan2(world / 2 - s.y, world / 2 - s.x);
    } else {
      const ahead = {
        x: s.x + Math.cos(s.angle) * 72,
        y: s.y + Math.sin(s.angle) * 72,
      };
      let obstacle,
        closest = (s.bold ? 31 : 61) ** 2;
      for (const point of nearby(bodyGrid, ahead.x, ahead.y, 64)) {
        if (point.snake === s || !point.snake.alive) continue;
        const d = distance2(ahead, point);
        if (d < closest) {
          closest = d;
          obstacle = point;
        }
      }
      if (obstacle)
        desired =
          Math.atan2(s.y - obstacle.y, s.x - obstacle.x) + s.personality * 0.4;
    }
    s.targetAngle = desired;
    s.boost = s.bold && best < 40000 && target?.gold && s.mass > 70;
  }

  function move(s, dt) {
    s.oldX = s.x;
    s.oldY = s.y;
    s.oldAngle = s.angle;
    s.oldMass = s.mass;
    s.oldVisualLength = s.visualLength;
    s.age += dt;
    s.grace = Math.max(0, s.grace - dt);
    const turn = angleDelta(s.angle, s.targetAngle);
    s.angle += clamp(turn * 7.5, -3.4, 3.4) * dt;
    const activeBoost = s.isPlayer ? boosting || keys.has(" ") : s.boost;
    if (s.isPlayer) {
      if (!activeBoost) boostBlocked = false;
      else if (collected <= 0 || s.mass <= 28) boostBlocked = true;
    }
    const canAffordBoost =
      !s.isPlayer || (state === "playing" && collected > 0 && !boostBlocked);
    s.boost = Boolean(activeBoost && s.mass > 28 && canAffordBoost);
    const targetSpeed = s.boost ? Config.boostSpeed : s.speed;
    const speedStep = Config.speedAcceleration * dt;
    s.currentSpeed += clamp(
      targetSpeed - s.currentSpeed,
      -speedStep,
      speedStep,
    );
    if (s.boost) {
      if (s.isPlayer) {
        // Accumulate fractional cents so the drain does not depend on frame rate.
        const cents =
          Math.max(0, Config.boostDrainPerSecond) * 100 * dt + boostRemainder;
        const wholeCents = Math.floor(cents + 1e-8);
        boostRemainder = cents - wholeCents;
        const spent = Math.min(Math.round(collected * 100), wholeCents) / 100;
        collected = roundMoney(collected - spent);
        boostSpent = roundMoney(boostSpent + spent);
        // A held key must not repeatedly re-engage boost as new food is collected.
        if (collected <= 0) boostBlocked = true;
      }
      s.mass = Math.max(28, s.mass - 4 * dt);
      if (random() < dt * 7) {
        const tail = s.path[s.path.length - 1];
        if (tail) addFood(tail.x, tail.y);
      }
    }
    s.x += Math.cos(s.angle) * s.currentSpeed * dt;
    s.y += Math.sin(s.angle) * s.currentSpeed * dt;
    // Fixed-distance path sampling keeps tail length independent of frame rate.
    let distance = Math.hypot(s.x - s.sampleX, s.y - s.sampleY);
    while (distance >= GAP) {
      const ratio = GAP / distance;
      s.sampleX += (s.x - s.sampleX) * ratio;
      s.sampleY += (s.y - s.sampleY) * ratio;
      s.path.unshift({ x: s.sampleX, y: s.sampleY });
      distance = Math.hypot(s.x - s.sampleX, s.y - s.sampleY);
    }
    s.path.length = Math.min(
      s.path.length,
      Math.ceil(Math.max(lengthOf(s), s.visualLength) / GAP) + 2,
    );
    const eatRadius = radiusOf(s) + 10;
    for (const f of nearby(foodGrid, s.x, s.y, 80)) {
      if (!f.alive || distance2(s, f) > eatRadius * eatRadius) continue;
      f.alive = false;
      s.mass += f.value;
      if (s.isPlayer && state === "playing") {
        const earned = roundMoney(
          f.value * (f.gold ? Config.goldValue : Config.foodValue),
        );
        collected = roundMoney(collected + earned);
        foodEarnings = roundMoney(foodEarnings + earned);
        if (particles.length < 150) burst(f.x, f.y, f.color, 3);
        if (f.gold) tone(700 + random() * 400, 0.045, 0.025);
      }
    }
    s.visualLength += (lengthOf(s) - s.visualLength) * (1 - Math.exp(-10 * dt));
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = between(0, TAU),
        v = between(20, 150);
      particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: between(0.3, 0.8),
        color,
      });
    }
  }
  function die(s) {
    if (!s.alive) return;
    s.alive = false;
    s.respawn = between(3, 7);
    const bodyCount = Math.min(s.path.length, Math.ceil(lengthOf(s) / GAP));
    for (let i = 0; i < bodyCount; i++) {
      const p = s.path[i];
      addFood(
        clamp(p.x + between(-12, 12), 12, world - 12),
        clamp(p.y + between(-12, 12), 12, world - 12),
        true,
        3,
      );
      if (i % 2 === 0)
        addFood(
          clamp(p.x + between(-18, 18), 12, world - 12),
          clamp(p.y + between(-18, 18), 12, world - 12),
          true,
          2,
        );
    }
    if (distance2(s, camera) < 500 ** 2) {
      burst(s.x, s.y, "#ffe481", 22);
    }
    if (s.isPlayer && state === "playing") endRound(false);
  }

  function collisions() {
    const victims = new Set();
    for (const s of snakes) {
      if (!s.alive || s.grace > 0) continue;
      const r = radiusOf(s);
      if (s.x < r || s.y < r || s.x > world - r || s.y > world - r) {
        victims.add(s);
        continue;
      }
      for (const p of nearby(bodyGrid, s.x, s.y, 64)) {
        if (p.snake === s || !p.snake.alive || p.snake.grace > 0) continue;
        const hit = radiusOf(p.snake) + r * 0.66;
        if (distance2(s, p) < hit * hit) {
          victims.add(s);
          break;
        }
      }
    }
    for (let i = 0; i < snakes.length; i++)
      for (let j = i + 1; j < snakes.length; j++) {
        const a = snakes[i],
          b = snakes[j];
        if (!a.alive || !b.alive || a.grace > 0 || b.grace > 0) continue;
        if (distance2(a, b) < ((radiusOf(a) + radiusOf(b)) * 0.85) ** 2) {
          victims.add(a);
          victims.add(b);
        }
      }
    victims.forEach(die);
  }

  function crossedFinish() {
    const before = finish.vertical ? player.oldX : player.oldY;
    const after = finish.vertical ? player.x : player.y;
    if (
      before === after ||
      (before - finish.coordinate) * (after - finish.coordinate) > 0
    )
      return false;
    const t = (finish.coordinate - before) / (after - before);
    const across = finish.vertical
      ? player.oldY + (player.y - player.oldY) * t
      : player.oldX + (player.x - player.oldX) * t;
    return t >= 0 && t <= 1 && Math.abs(across - finish.center) <= finish.half;
  }
  function tick(dt) {
    if (paused || state === "won" || state === "lost") return;
    elapsed += dt;
    const isPlaying = state === "playing";
    if (isPlaying) {
      const dx =
        Number(keys.has("ArrowRight") || keys.has("d")) -
        Number(keys.has("ArrowLeft") || keys.has("a"));
      const dy =
        Number(keys.has("ArrowDown") || keys.has("s")) -
        Number(keys.has("ArrowUp"));
      if (dx || dy) player.targetAngle = Math.atan2(dy, dx);
      else if (pointer) {
        const px = pointer.x - width / 2,
          py = pointer.y - height / 2;
        if (px * px + py * py > 100) player.targetAngle = Math.atan2(py, px);
      }
    }
    for (let i = 0; i < snakes.length; i++) {
      const s = snakes[i];
      if (!s.alive) {
        if (s.isPlayer) continue;
        s.respawn -= dt;
        if (s.respawn <= 0) {
          let x,
            y,
            attempts = 0;
          do {
            x = between(200, world - 200);
            y = between(200, world - 200);
            attempts++;
          } while (distance2({ x, y }, camera) < 650 ** 2 && attempts < 20);
          snakes[i] = newSnake(s.id, x, y, between(45, 240), pick(palette));
        }
        continue;
      }
      if (!s.isPlayer || !isPlaying) think(s, dt);
      move(s, dt);
    }
    rebuildBodyGrid();
    if (isPlaying) {
      collisions();
      if (state === "playing" && player.alive && crossedFinish())
        endRound(true);
    } else {
      // Lobby is a live attract screen; renew it if its guide reaches an edge.
      if (
        player.x < 200 ||
        player.y < 200 ||
        player.x > world - 200 ||
        player.y > world - 200
      )
        player.targetAngle = Math.atan2(
          world / 2 - player.y,
          world / 2 - player.x,
        );
    }
    foodClock += dt;
    if (foodClock > 1) {
      foodClock = 0;
      // Retain valuable drops, cap long sessions, and refresh the spatial index.
      foods = foods.filter((f) => f.alive);
      if (foods.length > 5500) foods = foods.slice(-5500);
      foodGrid.clear();
      for (const f of foods) {
        const k = cellKey(f.x, f.y, 80);
        if (!foodGrid.has(k)) foodGrid.set(k, []);
        foodGrid.get(k).push(f);
      }
      for (
        let i = 0, n = Math.min(40, Config.foodCount - foods.length);
        i < n;
        i++
      )
        addFood();
    }
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
    uiClock += dt;
    if (uiClock > 0.12) {
      updateUI();
      uiClock = 0;
    }
  }

  function updateCollectedUI() {
    const value = money(collected, true);
    if ($("collectedAmount").textContent !== value) {
      $("collectedAmount").textContent = value;
      $("routePrize").textContent = value;
    }
  }

  function updateUI() {
    const [units, cents] = wallet
      .toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      .split(".");
    $("wallet").replaceChildren(
      document.createTextNode(Config.currencySymbol + units),
    );
    const fraction = document.createElement("span");
    fraction.textContent = `.${cents}`;
    $("wallet").append(fraction);
    $("roundBet").textContent = money(
      state === "lobby" ? Config.bet : roundBet,
    );
    updateCollectedUI();
    $("aliveCount").textContent =
      `${snakes.filter((s) => s.alive).length} IN ARENA`;
    if (state === "lobby") updateBetControls();
    const target = finish.vertical
      ? {
          x: finish.coordinate,
          y: clamp(
            player.y,
            finish.center - finish.half,
            finish.center + finish.half,
          ),
        }
      : {
          x: clamp(
            player.x,
            finish.center - finish.half,
            finish.center + finish.half,
          ),
          y: finish.coordinate,
        };
    $("routeDistance").textContent =
      Math.ceil(
        Math.hypot(target.x - player.x, target.y - player.y),
      ).toLocaleString("en-US") + " m";
    $("routeArrow").style.transform =
      `rotate(${Math.atan2(target.y - player.y, target.x - player.x) + Math.PI / 2}rad)`;
    updateBoostUI();
  }

  function updateBoostUI() {
    // Keep pointer capture intact throughout a hold, including balance depletion.
    $("boostButton").disabled = state !== "playing";
    const unavailable = collected <= 0 || player.mass <= 28 || boostBlocked;
    $("boostButton").classList.toggle("unavailable", unavailable);
    $("boostButton").setAttribute(
      "aria-disabled",
      String(state !== "playing" || unavailable),
    );
    $("boostButton").classList.toggle(
      "active",
      state === "playing" && player.boost,
    );
  }

  function updateBetControls() {
    const input = $("betInput");
    const amount = Number(input.value);
    const valid =
      input.value !== "" && Number.isSafeInteger(amount) && amount >= 1;
    const affordable = valid && amount <= wallet;
    input.max = String(Math.max(1, Math.floor(wallet)));
    input.setAttribute("aria-invalid", String(!affordable));
    $("availableBalance").textContent = money(wallet);
    $("betError").textContent = !valid
      ? `Enter a whole-number bet of at least ${money(1)}.`
      : !affordable
        ? "Not enough balance. Choose a smaller bet."
        : "";
    $("playButton").disabled = !affordable;
    for (const button of $("betOptions").children) {
      const value = Number(button.dataset.bet);
      button.setAttribute("aria-pressed", String(value === amount));
      button.disabled = value > wallet;
    }
    if (valid) Config.bet = amount;
    return affordable;
  }

  function startRound() {
    if (state === "playing") return;
    if (!updateBetControls()) {
      reset("lobby");
      $("betInput").focus();
      return;
    }
    unlockAudio();
    roundBet = Config.bet;
    wallet = roundMoney(wallet - roundBet);
    reset("playing");
    $("playButton").blur();
    $("againButton").blur();
  }
  function endRound(won) {
    if (state !== "playing") return;
    state = won ? "won" : "lost";
    boosting = false;
    keys.clear();
    pointer = null;
    $("route").classList.add("hidden");
    $("result").classList.remove("hidden");
    $("result").classList.toggle("loss", !won);
    $("resultKicker").textContent = won
      ? "GREEN LINE REACHED"
      : "THE HUNT IS NOT OVER";
    $("resultIcon").textContent = won ? "♛" : "ϟ";
    const prize = collected;
    $("resultTitle").innerHTML = won
      ? prize >= 10000
        ? "MEGA<br><em>WIN!</em>"
        : prize >= 1000
          ? "BIG<br><em>WIN!</em>"
          : "CASH<br><em>OUT!</em>"
      : "ROUND<br><em>OVER</em>";
    $("resultAmount").textContent = money(won ? prize : collected, true);
    $("resultDetail").textContent = won
      ? "BALANCE CASHED OUT"
      : "COLLECTED · NOT CASHED OUT";
    $("resultMessage").textContent = won
      ? prize > 0
        ? "Every pickup paid off."
        : "Collect food next round to earn a payout."
      : "You collided. A new arena awaits.";
    if (won) {
      wallet = roundMoney(wallet + prize);
      if (prize > 0) coinShower();
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => tone(f, 0.3, 0.08), i * 110),
      );
    } else tone(120, 0.3, 0.07);
    updateUI();
    $("againButton").focus({ preventScroll: true });
  }
  function coinShower() {
    if (reducedMotion) return;
    for (let i = 0; i < 48; i++) {
      const coin = document.createElement("span");
      coin.className = "coin";
      coin.textContent = Config.currencySymbol;
      coin.setAttribute("aria-hidden", "true");
      coin.style.left = between(-5, 100) + "%";
      coin.style.setProperty("--duration", between(1.7, 3.1) + "s");
      coin.style.setProperty("--delay", between(0, 1.9) + "s");
      coin.style.setProperty("--drift", between(-70, 70) + "px");
      coin.addEventListener("animationend", () => coin.remove());
      $("arena").append(coin);
    }
  }
  function directorWin() {
    if (!Config.directorMode || state !== "playing" || paused) return;
    // Move the complete snake beside the real finish, then cross through physics.
    const goalX = finish.vertical
      ? finish.coordinate - finish.sign * 26
      : finish.center;
    const goalY = finish.vertical
      ? finish.center
      : finish.coordinate - finish.sign * 26;
    const dx = goalX - player.x,
      dy = goalY - player.y;
    player.x += dx;
    player.y += dy;
    player.oldX = player.x;
    player.oldY = player.y;
    player.sampleX += dx;
    player.sampleY += dy;
    player.angle = finish.vertical
      ? finish.sign > 0
        ? 0
        : Math.PI
      : finish.sign > 0
        ? Math.PI / 2
        : -Math.PI / 2;
    player.targetAngle = player.angle;
    player.oldAngle = player.angle;
    player.path = player.path.map((_, i) => ({
      x: player.x - Math.cos(player.angle) * GAP * i,
      y: player.y - Math.sin(player.angle) * GAP * i,
    }));
    player.sampleX = player.x;
    player.sampleY = player.y;
    player.grace = 1.5;
    pointer = null;
    keys.clear();
    camera.x = player.x;
    camera.y = player.y;
  }

  // Canvas rendering: world-space geometry, then screen-space floating UI.
  function visible(x, y, margin = 40) {
    return (
      Math.abs(x - camera.x) < width / scale / 2 + margin &&
      Math.abs(y - camera.y) < height / scale / 2 + margin
    );
  }
  function drawBackground() {
    ctx.fillStyle = `hsl(${hue},30%,5.5%)`;
    ctx.fillRect(0, 0, width, height);
    const r = 34,
      stepX = r * 1.5,
      stepY = r * Math.sqrt(3);
    const left = camera.x - width / scale / 2,
      top = camera.y - height / scale / 2;
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-camera.x, -camera.y);
    ctx.beginPath();
    for (
      let col = Math.floor(left / stepX) - 1;
      col < (left + width / scale) / stepX + 1;
      col++
    ) {
      for (
        let row = Math.floor(top / stepY) - 1;
        row < (top + height / scale) / stepY + 1;
        row++
      ) {
        const x = col * stepX,
          y = row * stepY + ((col % 2) * stepY) / 2;
        for (let k = 0; k < 6; k++) {
          const px = x + r * Math.cos((k * TAU) / 6),
            py = y + r * Math.sin((k * TAU) / 6);
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
      }
    }
    ctx.strokeStyle = `hsla(${hue},30%,30%,.17)`;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.strokeStyle = "#ff547a";
    ctx.lineWidth = 5;
    ctx.shadowBlur = 25;
    ctx.shadowColor = "#ff547a";
    ctx.strokeRect(0, 0, world, world);
    ctx.restore();
  }
  function drawFinish() {
    ctx.save();
    const x = finish.vertical ? finish.coordinate : finish.center;
    const y = finish.vertical ? finish.center : finish.coordinate;
    ctx.translate(x, y);
    if (!finish.vertical) ctx.rotate(Math.PI / 2);
    const glow = ctx.createLinearGradient(-55, 0, 55, 0);
    glow.addColorStop(0, "#aaff0000");
    glow.addColorStop(0.5, "#aaff0033");
    glow.addColorStop(1, "#aaff0000");
    ctx.fillStyle = glow;
    ctx.fillRect(-55, -finish.half, 110, finish.half * 2);
    ctx.shadowColor = "#aaff33";
    ctx.shadowBlur = 25;
    ctx.strokeStyle = "#adff40";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, -finish.half);
    ctx.lineTo(0, finish.half);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#e7ffc3";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([8, 13]);
    ctx.lineDashOffset = -elapsed * 25;
    ctx.strokeStyle = "#b5ff4466";
    ctx.beginPath();
    ctx.moveTo(-15, -finish.half);
    ctx.lineTo(-15, finish.half);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#c3ff6c";
    ctx.textAlign = "center";
    ctx.font = "bold 13px Arial";
    ctx.fillText("C A S H   O U T   Z O N E", 0, -25);
    ctx.restore();
  }
  function drawFood() {
    // Batch a soft halo and a sharp core; avoid thousands of shadow-blur passes.
    const time = elapsed * 2;
    for (const f of foods) {
      if (!f.alive || !visible(f.x, f.y)) continue;
      const pulse = 1 + 0.12 * Math.sin(time + f.phase),
        r = f.radius * pulse;
      ctx.globalAlpha = f.gold ? 0.12 : 0.09;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r * 3.6, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, TAU);
      ctx.fill();
      if (f.gold) {
        ctx.fillStyle = "#fff4c6";
        ctx.beginPath();
        ctx.arc(f.x - r * 0.2, f.y - r * 0.2, r * 0.4, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawFlag(s, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.76, 0, TAU);
    ctx.clip();
    const colors = {
      fr: ["#305dcd", "#f5f7fa", "#ec4b64"],
      de: ["#1c2130", "#e55254", "#f5ca55"],
      ua: ["#4185ef", "#f4db59"],
      us: ["#f2f0e9", "#ef6b73", "#f2f0e9", "#ef6b73", "#f2f0e9"],
      br: ["#3ac178"],
      jp: ["#f4eeee"],
    }[s.flag];
    colors.forEach((color, i) => {
      ctx.fillStyle = color;
      if (s.flag === "fr")
        ctx.fillRect(
          -r + (2 * r * i) / colors.length,
          -r,
          (2 * r) / colors.length + 1,
          r * 2,
        );
      else
        ctx.fillRect(
          -r,
          -r + (2 * r * i) / colors.length,
          r * 2,
          (2 * r) / colors.length + 1,
        );
    });
    if (s.flag === "jp") {
      ctx.fillStyle = "#e94c65";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.35, 0, TAU);
      ctx.fill();
    }
    if (s.flag === "br") {
      ctx.fillStyle = "#ffe26b";
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.6);
      ctx.lineTo(r * 0.65, 0);
      ctx.lineTo(0, r * 0.6);
      ctx.lineTo(-r * 0.65, 0);
      ctx.fill();
      ctx.fillStyle = "#4572db";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, TAU);
      ctx.fill();
    }
    if (s.flag === "us") {
      ctx.fillStyle = "#4268b6";
      ctx.fillRect(-r, -r, r, r);
    }
    ctx.restore();
  }
  // Sample the visible body at fixed distances behind the interpolated head.
  // Ring placement no longer jumps when a new physics path point is inserted.
  function renderTrail(s, headX, headY, targetLength) {
    const points = [{ x: headX, y: headY, distance: 0 }];
    let x = headX,
      y = headY,
      travelled = 0,
      nextSample = GAP;
    let start = 0;
    const dx = s.x - s.oldX,
      dy = s.y - s.oldY;
    while (
      start < s.path.length &&
      (s.path[start].x - headX) * dx + (s.path[start].y - headY) * dy > 0.0001
    )
      start++;
    for (let i = start; i < s.path.length; i++) {
      const p = s.path[i];
      const segment = Math.hypot(p.x - x, p.y - y);
      if (segment < 0.0001) continue;
      while (nextSample <= travelled + segment) {
        const sampleDistance = Math.min(nextSample, targetLength);
        const ratio = (sampleDistance - travelled) / segment;
        points.push({
          x: x + (p.x - x) * ratio,
          y: y + (p.y - y) * ratio,
          distance: sampleDistance,
        });
        if (sampleDistance >= targetLength) return points;
        nextSample = Math.min(nextSample + GAP, targetLength);
      }
      travelled += segment;
      x = p.x;
      y = p.y;
    }
    return points;
  }

  function drawSnake(s, alpha) {
    if (!s.alive || !s.path.some((p) => visible(p.x, p.y, 55))) return;
    const r = radiusOf({ mass: s.oldMass + (s.mass - s.oldMass) * alpha });
    const headX = s.oldX + (s.x - s.oldX) * alpha,
      headY = s.oldY + (s.y - s.oldY) * alpha;
    const headAngle = s.oldAngle + angleDelta(s.oldAngle, s.angle) * alpha;
    const visualLength =
      s.oldVisualLength + (s.visualLength - s.oldVisualLength) * alpha;
    const trail = renderTrail(s, headX, headY, visualLength);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(headX, headY);
    for (const p of trail) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = r * 2;
    ctx.shadowColor = s.color;
    const boostBlend = clamp(
      (s.currentSpeed - s.speed) / Math.max(1, Config.boostSpeed - s.speed),
      0,
      1,
    );
    ctx.shadowBlur = 15 + boostBlend * 13;
    ctx.globalAlpha = s.grace > 0 ? 0.72 : 1;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = r * 1.65;
    ctx.strokeStyle = "#06171555";
    ctx.stroke();
    for (let i = Math.floor((trail.length - 1) / 3) * 3; i > 1; i -= 3) {
      const p = trail[i];
      if (!visible(p.x, p.y)) continue;
      const taper = Math.min(
        1,
        (visualLength - p.distance + GAP * 7) / (GAP * 13),
      );
      ctx.fillStyle = i % 6 ? s.color : "#ffffff36";
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.78 * taper, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ffffff40";
      ctx.beginPath();
      ctx.arc(p.x - r * 0.25, p.y - r * 0.3, r * 0.24, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.translate(headX, headY);
    ctx.rotate(headAngle);
    ctx.fillStyle = s.color;
    ctx.shadowBlur = 15;
    ctx.shadowColor = s.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.12, r, 0, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (!s.isPlayer) drawFlag(s, r);
    for (const side of [-1, 1]) {
      ctx.fillStyle = "#f5fff2";
      ctx.beginPath();
      ctx.ellipse(
        r * 0.48,
        side * r * 0.5,
        r * 0.35,
        r * 0.29,
        -0.15 * side,
        0,
        TAU,
      );
      ctx.fill();
      ctx.fillStyle = "#12231d";
      ctx.beginPath();
      ctx.arc(r * 0.65, side * r * 0.5, r * 0.16, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    if (!s.isPlayer && visible(s.x, s.y)) {
      ctx.fillStyle = "#c6d7d0aa";
      ctx.textAlign = "center";
      ctx.font = "bold 9px Arial";
      ctx.fillText(s.name, s.x, s.y - r - 13);
    }
  }
  function drawLabel() {
    // The camera keeps the head centered; anchor its balance in that same space.
    const x = width / 2,
      y = height / 2 - 56 * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(width / 450, width / 450);
    ctx.font = "bold 15px monospace";
    const text = money(collected, true),
      w = Math.max(150, ctx.measureText(text).width + 30);
    ctx.fillStyle = "#13231eef";
    ctx.strokeStyle = player.color + "88";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -18, w, 34, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = player.color;
    ctx.textAlign = "center";
    ctx.fillText(text, 0, 4);
    ctx.beginPath();
    ctx.moveTo(-4, 17);
    ctx.lineTo(4, 17);
    ctx.lineTo(0, 22);
    ctx.fill();
    ctx.restore();
  }
  function drawMinimap() {
    mctx.clearRect(0, 0, 100, 100);
    const k = 88 / world;
    mctx.save();
    mctx.translate(6, 6);
    mctx.strokeStyle = "#86a29022";
    mctx.strokeRect(0, 0, 88, 88);
    mctx.strokeStyle = "#b5ff44";
    mctx.lineWidth = 2;
    mctx.beginPath();
    if (finish.vertical) {
      mctx.moveTo(finish.coordinate * k, (finish.center - finish.half) * k);
      mctx.lineTo(finish.coordinate * k, (finish.center + finish.half) * k);
    } else {
      mctx.moveTo((finish.center - finish.half) * k, finish.coordinate * k);
      mctx.lineTo((finish.center + finish.half) * k, finish.coordinate * k);
    }
    mctx.stroke();
    for (const s of snakes) {
      if (!s.alive) continue;
      mctx.fillStyle = s.isPlayer ? "#fff" : s.color + "99";
      mctx.beginPath();
      mctx.arc(s.x * k, s.y * k, s.isPlayer ? 2.5 : 1.1, 0, TAU);
      mctx.fill();
    }
    mctx.strokeStyle = "#ffffff33";
    mctx.strokeRect(
      (camera.x - width / scale / 2) * k,
      (camera.y - height / scale / 2) * k,
      (width / scale) * k,
      (height / scale) * k,
    );
    mctx.restore();
  }
  function render() {
    // Interpolate the camera and head identically: the head stays screen-centered.
    const alpha =
      paused || state === "won" || state === "lost"
        ? 1
        : clamp(accumulator / STEP, 0, 1);
    camera.x = player.oldX + (player.x - player.oldX) * alpha;
    camera.y = player.oldY + (player.y - player.oldY) * alpha;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground();
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-camera.x, -camera.y);
    drawFinish();
    drawFood();
    for (const s of snakes) if (!s.isPlayer) drawSnake(s, alpha);
    drawSnake(player, alpha);
    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (player.alive && state !== "lobby") drawLabel();
    updateCollectedUI();
    updateBoostUI();
    drawMinimap();
  }
  function frame(time) {
    const dt = Math.min((time - (previousTime || time)) / 1000, 0.1);
    previousTime = time;
    accumulator += dt;
    while (accumulator >= STEP) {
      tick(STEP);
      accumulator -= STEP;
    }
    render();
    requestAnimationFrame(frame);
  }

  function unlockAudio() {
    if (!soundEnabled) return;
    try {
      audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
      audioContext.resume().catch(() => {});
    } catch {
      soundEnabled = false;
    }
  }
  function tone(frequency, duration, volume) {
    if (!soundEnabled || !audioContext || audioContext.state !== "running")
      return;
    const osc = audioContext.createOscillator(),
      gain = audioContext.createGain(),
      now = audioContext.currentTime;
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start();
    osc.stop(now + duration);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  function setPause(value) {
    if (state !== "playing") return;
    paused = value;
    keys.clear();
    boosting = false;
    pointer = null;
    $("pausePanel").classList.toggle("hidden", !value);
  }
  function setPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing" || pointerId !== null) return;
    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);
    setPointer(event);
    unlockAudio();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (
      state === "playing" &&
      (event.pointerType === "mouse" || event.pointerId === pointerId)
    )
      setPointer(event);
  });
  function releasePointer(event) {
    if (event.pointerId === pointerId) {
      pointerId = null;
      pointer = null;
    }
  }
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);
  canvas.addEventListener("lostpointercapture", releasePointer);
  canvas.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse" && pointerId === null) pointer = null;
  });
  $("boostButton").addEventListener("pointerdown", (event) => {
    if (state !== "playing" || paused || boostPointerId !== null) return;
    event.preventDefault();
    boostPointerId = event.pointerId;
    boosting = true;
    boostBlocked = collected <= 0 || player.mass <= 28;
    $("boostButton").setPointerCapture(event.pointerId);
  });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"])
    $("boostButton").addEventListener(eventName, (event) => {
      if (event.pointerId === boostPointerId) {
        boosting = false;
        if (!keys.has(" ")) boostBlocked = false;
        boostPointerId = null;
      }
    });
  window.addEventListener("keydown", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(key) &&
      state === "playing"
    )
      event.preventDefault();
    if (key === "Escape" && !event.repeat) setPause(!paused);
    if (key === "w" && !event.repeat) directorWin();
    if (key === " " && !event.repeat && !boosting) boostBlocked = false;
    if (!paused && state === "playing") keys.add(key);
  });
  window.addEventListener("keyup", (event) => {
    keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
    if (event.key === " " && !boosting) boostBlocked = false;
  });
  window.addEventListener("blur", () => {
    if (state === "playing") setPause(true);
  });
  document.addEventListener("visibilitychange", () => {
    previousTime = 0;
    if (document.hidden) setPause(true);
  });
  $("pausePanel").addEventListener("click", () => setPause(false));
  $("playButton").addEventListener("click", startRound);
  $("againButton").addEventListener("click", startRound);
  $("lobbyButton").addEventListener("click", () => {
    reset("lobby");
    $("playButton").focus({ preventScroll: true });
  });
  $("betInput").value = String(Config.bet);
  $("betCurrency").textContent = Config.currencySymbol;
  $("betInput").addEventListener("input", updateBetControls);
  for (const amount of Config.betOptions) {
    if (!Number.isSafeInteger(amount) || amount < 1) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bet-option";
    button.dataset.bet = String(amount);
    button.textContent = money(amount);
    button.addEventListener("click", () => {
      $("betInput").value = String(amount);
      updateBetControls();
      updateUI();
    });
    $("betOptions").append(button);
  }
  $("soundButton").addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    $("soundMark").textContent = soundEnabled ? "" : "×";
    $("soundButton").setAttribute(
      "aria-label",
      soundEnabled ? "Disable sound" : "Enable sound",
    );
    unlockAudio();
    if (soundEnabled) tone(660, 0.12, 0.06);
  });

  // Read-only diagnostics for recordings and smoke checks; no live state mutation.
  window.ViperRoyale = Object.freeze({
    snapshot: () => ({
      state,
      paused,
      seed,
      round: roundSerial,
      wallet,
      bet: roundBet,
      collected,
      foodEarnings,
      boostSpent,
      elapsed,
      player: {
        x: player.x,
        y: player.y,
        angle: player.angle,
        mass: player.mass,
        length: lengthOf(player),
        radius: radiusOf(player),
        speed: player.currentSpeed,
        alive: player.alive,
        color: player.color,
        boosting: player.boost,
      },
      finish: { ...finish },
      aliveBots: snakes.filter((s) => !s.isPlayer && s.alive).length,
      goldCount: foods.filter((f) => f.alive && f.gold).length,
      foodCount: foods.filter((f) => f.alive).length,
    }),
  });
  resize();
  reset("lobby");
  requestAnimationFrame(frame);
})();

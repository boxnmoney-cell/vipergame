/* Standalone Canvas game.
 * Open index.html directly or serve this directory with python3 -m http.server 8000.
 * W = director win; Space / held mouse / second touch = boost; Esc = pause
 * (W is reserved for director mode, so use ↑ to travel upward).
 */
const Config = {
  playerSkinColor: ["#74ffe0", "#b3a0ff", "#ffa6d4", "#a6eeff"],
  botCount: 49, // 49 bots + the player = 50 snakes at the start
  botSpeedRange: [100, 142],
  botAttackRadius: 650,
  botBoostDuration: [0.6, 1.3],
  botBoostCooldown: [2.5, 5],
  mapSeed: null, // null: fresh seed every round; number/string: reproducible world
  bet: 300, // Default entry cost; selectable before each round
  betOptions: [50, 100, 300, 500, 1000],
  evolutionScore: 10000, // Permanent visual evolution for the rest of this round
  baseStartingMass: 30,
  startingMassPerSqrtBet: 3, // Starting mass = base + this value × sqrt(entry bet)
  cashoutBetMultiplier: 5, // Cash out requires a current collected balance of entry bet × 5
  foodMultiplierBetUnit: 100, // Food multiplier = 1 + entry bet / this value
  foodValue: 2.5, // Base payout per unit, before the round's food multiplier
  goldValue: 9, // Payout per unit of gold dropped by a defeated snake
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
  const studioPreview =
    new URLSearchParams(location.search).get("preview") === "1";
  if (studioPreview) document.documentElement.classList.add("studio-preview");
  const gameDefaults = {
    ...ArenaPreferences.defaults,
    botCount: Config.botCount,
    evolutionScore: Config.evolutionScore,
  };
  let appearance =
    ArenaPreferences.fromQuery() || ArenaPreferences.read(gameDefaults);
  Config.botCount = appearance.botCount;
  Config.evolutionScore = appearance.evolutionScore;
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
  const money = (n, fixedDecimals = false) =>
    n.toLocaleString("en-US", {
      minimumFractionDigits: fixedDecimals || !Number.isInteger(n) ? 2 : 0,
      maximumFractionDigits: 2,
    });
  const roundMoney = (n) => Math.round(n * 100) / 100;
  const foodMultiplierForBet = (bet) =>
    roundMoney(1 + bet / Math.max(1, Config.foodMultiplierBetUnit));
  const cashoutTargetForBet = (bet) =>
    Math.max(1, roundMoney(bet * Config.cashoutBetMultiplier));
  const multiplierText = (value) =>
    `×${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
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
    roundFoodMultiplier = foodMultiplierForBet(Config.bet),
    roundCashoutTarget = cashoutTargetForBet(Config.bet),
    roundEvolutionScore = Config.evolutionScore,
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
      path: [],
      sampleX: x,
      sampleY: y,
      skin: id % 3,
      score: 0,
      scoreDrainRemainder: 0,
      evolved: false,
      evolvedAt: 0,
      think: 0,
      speed: isPlayer ? Config.playerSpeed : between(...Config.botSpeedRange),
      bold: random() < 0.65,
      boost: false,
      respawn: 0,
      personality: between(-1, 1),
      age: 0,
      navigation: {
        food: null,
        foodUntil: 0,
        waypoint: null,
        waypointUntil: 0,
        recoverUntil: 0,
        probeAt: 0,
        probeX: x,
        probeY: y,
        lastAngle: angle,
        turning: 0,
        opponent: null,
        attackPoint: null,
        attackPhase: null,
        attackUntil: 0,
        nextAttack: between(1, 4),
        burstUntil: 0,
        nextBurst: between(1, 4),
        mode: "roam",
      },
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

  function placeSnake(s, x, y, angle) {
    s.x = s.oldX = s.sampleX = x;
    s.y = s.oldY = s.sampleY = y;
    s.angle = s.oldAngle = s.targetAngle = angle;
    s.path = Array.from(
      { length: Math.ceil(lengthOf(s) / GAP) + 2 },
      (_, i) => ({
        x: x - Math.cos(angle) * i * GAP,
        y: y - Math.sin(angle) * i * GAP,
      }),
    );
    Object.assign(s.navigation, {
      food: null,
      waypoint: null,
      probeAt: s.age,
      probeX: x,
      probeY: y,
      lastAngle: angle,
      turning: 0,
    });
  }

  function placementClear(s, outsideView = false, runway = 180) {
    const radius = radiusOf(s),
      edge = radius + 40;
    const points = [...s.path];
    for (let distance = 28; distance <= runway; distance += 28) {
      points.push({
        x: s.x + Math.cos(s.angle) * distance,
        y: s.y + Math.sin(s.angle) * distance,
      });
    }
    for (const p of points) {
      if (p.x < edge || p.y < edge || p.x > world - edge || p.y > world - edge)
        return false;
      if (outsideView && visible(p.x, p.y, 120)) return false;
      for (const occupied of nearby(bodyGrid, p.x, p.y, 64, 2)) {
        if (!occupied.snake.alive || occupied.snake.id === s.id) continue;
        const clearance = radius + radiusOf(occupied.snake) + 36;
        if (distance2(p, occupied) < clearance * clearance) return false;
      }
    }
    return true;
  }

  function spawnBot(id, opening = false, outsideView = false) {
    const s = newSnake(id, 0, 0, between(45, 240), pick(palette));
    for (let attempt = 0; attempt < 120; attempt++) {
      let x, y;
      if (opening && attempt < 35) {
        const bearing = between(0, TAU),
          distance = between(380, 950);
        x = player.x + Math.cos(bearing) * distance;
        y = player.y + Math.sin(bearing) * distance;
      } else {
        x = between(180, world - 180);
        y = between(180, world - 180);
      }
      placeSnake(s, x, y, between(-Math.PI, Math.PI));
      if (placementClear(s, outsideView)) return s;
    }
    // A crowded area is retried later, never solved with an overlapping spawn.
    s.alive = false;
    s.path = [];
    s.respawn = 0.5;
    return s;
  }

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
    document.querySelectorAll(".coin").forEach((c) => c.remove());
    const colors = Array.isArray(Config.playerSkinColor)
      ? Config.playerSkinColor
      : [Config.playerSkinColor];
    const entryBet = nextState === "playing" ? roundBet : Config.bet;
    roundFoodMultiplier = foodMultiplierForBet(entryBet);
    roundCashoutTarget = cashoutTargetForBet(entryBet);
    roundEvolutionScore = Math.max(1, Config.evolutionScore);
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
    placeSnake(player, player.x, player.y, player.angle);
    snakes.push(player);
    indexSnakeBody(player);
    for (let i = 1; i <= clamp(Config.botCount, 0, 80); i++) {
      const bot = spawnBot(i, i <= 8);
      snakes.push(bot);
      indexSnakeBody(bot);
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
    $("hud").classList.toggle("hidden", state !== "playing");
    updateUI();
    rebuildBodyGrid();
  }

  function rebuildBodyGrid() {
    bodyGrid.clear();
    for (const s of snakes) indexSnakeBody(s);
  }
  function indexSnakeBody(s) {
    if (!s.alive) return;
    const add = (p, index) => {
      const key = cellKey(p.x, p.y, 64);
      if (!bodyGrid.has(key)) bodyGrid.set(key, []);
      bodyGrid.get(key).push({ x: p.x, y: p.y, snake: s, index });
    };
    add(s, 0);
    const bodyCount = Math.min(s.path.length, Math.ceil(lengthOf(s) / GAP));
    for (let i = 0; i < bodyCount; i += 2) {
      add(s.path[i], i);
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

  function chooseWaypoint(s) {
    const n = s.navigation;
    const nearWall = Math.min(s.x, s.y, world - s.x, world - s.y) < 300;
    const heading = nearWall
      ? Math.atan2(world / 2 - s.y, world / 2 - s.x)
      : s.angle + between(-0.75, 0.75);
    const distance = between(550, 950);
    n.waypoint = {
      x: clamp(s.x + Math.cos(heading) * distance, 220, world - 220),
      y: clamp(s.y + Math.sin(heading) * distance, 220, world - 220),
    };
    n.waypointUntil = s.age + 10;
  }

  function foodReachable(s, food) {
    if (!food?.alive) return false;
    const distance = Math.hypot(food.x - s.x, food.y - s.y);
    const turn = Math.abs(
      angleDelta(s.angle, Math.atan2(food.y - s.y, food.x - s.x)),
    );
    // Ignore pellets inside the turning circle or behind the snake.
    return turn < 1.2 && !(distance < 95 && turn > 0.45);
  }

  function endAttack(s) {
    const n = s.navigation;
    n.opponent = null;
    n.attackPoint = null;
    n.attackPhase = null;
    n.nextAttack = s.age + between(2, s.bold ? 4 : 7);
  }

  function huntTarget(s) {
    const n = s.navigation;
    const atWall = Math.min(s.x, s.y, world - s.x, world - s.y) < 260;
    if (s.isPlayer || s.age < n.recoverUntil || atWall) {
      if (n.opponent) endAttack(s);
      return null;
    }
    if (
      n.opponent &&
      (!n.opponent.alive ||
        s.age > n.attackUntil ||
        distance2(s, n.opponent) > 950 ** 2)
    )
      endAttack(s);
    if (!n.opponent && s.age >= n.nextAttack && s.mass > 45) {
      let bestScore = Infinity;
      for (const other of snakes) {
        // Bots hunt each other; the human does not become a pack-wide target.
        if (other === s || other.isPlayer || !other.alive) continue;
        const dx = s.x - other.x,
          dy = s.y - other.y;
        const distance = Math.hypot(dx, dy);
        const lateral = Math.abs(
          dx * Math.sin(other.angle) - dy * Math.cos(other.angle),
        );
        const ahead = dx * Math.cos(other.angle) + dy * Math.sin(other.angle);
        if (
          distance < 120 ||
          distance > Config.botAttackRadius ||
          lateral < 65 ||
          ahead < -distance * 0.6
        )
          continue;
        const turn = Math.abs(angleDelta(s.angle, Math.atan2(-dy, -dx)));
        if (turn > 1.9) continue;
        const score = distance + turn * 100;
        if (score < bestScore) {
          bestScore = score;
          n.opponent = other;
        }
      }
      if (n.opponent) {
        n.attackPhase = "approach";
        n.attackUntil = s.age + between(4, 6);
      } else n.nextAttack = s.age + between(0.8, 1.8);
    }
    if (!n.opponent) return null;
    const other = n.opponent;
    if (n.attackPhase === "approach") {
      // Race to a point ahead of the victim, then continue across its path.
      const lead = clamp(
        (Math.sqrt(distance2(s, other)) / Config.boostSpeed) *
          other.currentSpeed +
          100,
        140,
        340,
      );
      n.attackPoint = {
        x: other.x + Math.cos(other.angle) * lead,
        y: other.y + Math.sin(other.angle) * lead,
      };
      if (distance2(s, n.attackPoint) < 170 ** 2) n.attackPhase = "intercept";
    }
    if (
      n.attackPhase === "intercept" &&
      distance2(s, n.attackPoint) < 45 ** 2
    ) {
      n.attackPhase = "cross";
      n.attackUntil = s.age + 1.8;
      n.attackPoint = {
        x: s.x + Math.cos(s.angle) * 240,
        y: s.y + Math.sin(s.angle) * 240,
      };
    }
    const p = n.attackPoint;
    if (
      !p ||
      p.x < 180 ||
      p.y < 180 ||
      p.x > world - 180 ||
      p.y > world - 180 ||
      (distance2(s, p) < 95 ** 2 &&
        Math.abs(angleDelta(s.angle, Math.atan2(p.y - s.y, p.x - s.x))) > 0.7)
    ) {
      endAttack(s);
      return null;
    }
    return p;
  }

  function steeringRisk(s, heading, obstacles, heads, boosting = false) {
    let x = s.x,
      y = s.y,
      angle = s.angle,
      speed = s.currentSpeed,
      risk = 0;
    const caution = s.navigation.opponent && s.bold ? 25 : 45;
    for (let step = 1; step <= 5; step++) {
      angle += clamp(angleDelta(angle, heading) * 7.5, -3.4, 3.4) * 0.18;
      const targetSpeed = boosting ? Config.boostSpeed : s.speed;
      speed += clamp(
        targetSpeed - speed,
        -Config.speedAcceleration * 0.18,
        Config.speedAcceleration * 0.18,
      );
      x += Math.cos(angle) * speed * 0.18;
      y += Math.sin(angle) * speed * 0.18;
      let clearance = Math.min(x, y, world - x, world - y) - radiusOf(s) - 35;
      for (const p of obstacles)
        clearance = Math.min(
          clearance,
          Math.hypot(x - p.x, y - p.y) - radiusOf(s) - radiusOf(p.snake) - 10,
        );
      for (const other of heads) {
        const t = step * 0.18;
        const hx = other.x + Math.cos(other.angle) * other.currentSpeed * t;
        const hy = other.y + Math.sin(other.angle) * other.currentSpeed * t;
        clearance = Math.min(
          clearance,
          Math.hypot(x - hx, y - hy) - radiusOf(s) - radiusOf(other) - 10,
        );
      }
      risk +=
        clearance < 0
          ? 35 - clearance * 2
          : Math.max(0, caution - clearance) ** 2 / 450;
    }
    return risk;
  }

  function think(s, dt) {
    s.think -= dt;
    if (s.think > 0) return;
    s.think = between(0.14, 0.24);
    const n = s.navigation;
    n.turning += Math.abs(angleDelta(n.lastAngle, s.angle));
    n.lastAngle = s.angle;
    if (s.age - n.probeAt >= 3) {
      const progress = Math.hypot(s.x - n.probeX, s.y - n.probeY);
      if (n.turning > TAU || (progress < 85 && n.turning > Math.PI)) {
        n.food = null;
        n.recoverUntil = s.age + 3.5;
        endAttack(s);
        chooseWaypoint(s);
      }
      n.probeAt = s.age;
      n.probeX = s.x;
      n.probeY = s.y;
      n.turning = 0;
    }
    if (s.age >= n.foodUntil || !foodReachable(s, n.food)) n.food = null;
    if (!n.food && s.age >= n.recoverUntil) {
      let best = Infinity;
      for (const f of nearby(foodGrid, s.x, s.y, 80, 4)) {
        if (!foodReachable(s, f)) continue;
        const turn = Math.abs(
          angleDelta(s.angle, Math.atan2(f.y - s.y, f.x - s.x)),
        );
        const score =
          (Math.hypot(f.x - s.x, f.y - s.y) + turn * 120) / (f.gold ? 2 : 1);
        if (score < best) {
          best = score;
          n.food = f;
        }
      }
      n.foodUntil = s.age + between(2.5, 4);
    }
    if (
      !n.waypoint ||
      s.age > n.waypointUntil ||
      distance2(s, n.waypoint) < 120 ** 2
    )
      chooseWaypoint(s);
    const attackPoint = huntTarget(s);
    const target = attackPoint || n.food || n.waypoint;
    n.mode = attackPoint ? n.attackPhase : n.food?.gold ? "gold" : "roam";
    let desired = Math.atan2(target.y - s.y, target.x - s.x);
    if (Math.min(s.x, s.y, world - s.x, world - s.y) < 200) {
      n.food = null;
      desired = Math.atan2(world / 2 - s.y, world / 2 - s.x);
    }

    // Score short, physically possible arcs instead of turning directly away
    // from the closest body point (which can trap a bot in a repeated U-turn).
    const obstacles = nearby(bodyGrid, s.x, s.y, 64, 4).filter(
      (p) => p.snake.alive && (p.snake !== s || p.index > 18),
    );
    const heads = snakes.filter(
      (other) => other !== s && other.alive && distance2(s, other) < 400 ** 2,
    );
    const offsets = [
      -1.5,
      -1,
      -0.6,
      -0.3,
      0,
      0.3,
      0.6,
      1,
      1.5,
      clamp(angleDelta(s.angle, desired), -1.5, 1.5),
    ];
    let bestScore = Infinity,
      bestHeading = s.angle,
      bestRisk = Infinity;
    for (const offset of offsets) {
      const heading = s.angle + offset;
      const risk = steeringRisk(s, heading, obstacles, heads);
      const score =
        risk +
        Math.abs(angleDelta(heading, desired)) * 2 +
        Math.abs(angleDelta(s.targetAngle, heading)) * 0.3 +
        offset * s.personality * 0.04;
      if (score < bestScore) {
        bestScore = score;
        bestHeading = heading;
        bestRisk = risk;
      }
    }
    s.targetAngle = bestHeading;
    const threat = heads.some((other) => {
      const dx = s.x - other.x,
        dy = s.y - other.y;
      const distance = Math.hypot(dx, dy);
      return (
        distance < 160 &&
        (dx * Math.cos(other.angle) + dy * Math.sin(other.angle)) /
          Math.max(1, distance) >
          0.4
      );
    });
    const aligned = Math.abs(angleDelta(s.angle, bestHeading)) < 0.5;
    const boostSafe =
      aligned &&
      bestRisk < 3 &&
      steeringRisk(s, bestHeading, obstacles, heads, true) < 3;
    if (!boostSafe || s.mass <= 40 || s.age < n.recoverUntil) n.burstUntil = 0;
    if (
      boostSafe &&
      s.mass > 45 &&
      s.age >= n.recoverUntil &&
      s.age >= n.nextBurst &&
      s.age >= n.burstUntil
    ) {
      const wantsBurst = Boolean(
        attackPoint || threat || n.food?.gold || random() < 0.18,
      );
      if (wantsBurst) {
        n.burstUntil = s.age + between(...Config.botBoostDuration);
        n.nextBurst = n.burstUntil + between(...Config.botBoostCooldown);
        if (threat && !attackPoint) n.mode = "escape";
      }
    }
    s.boost = s.age < n.burstUntil && boostSafe && s.mass > 40;
  }

  function move(s, dt) {
    s.oldX = s.x;
    s.oldY = s.y;
    s.oldAngle = s.angle;
    s.oldMass = s.mass;
    s.oldVisualLength = s.visualLength;
    s.age += dt;
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
      } else {
        const cents =
          Math.max(0, Config.boostDrainPerSecond) * 100 * dt +
          s.scoreDrainRemainder;
        const whole = Math.floor(cents + 1e-8);
        s.scoreDrainRemainder = cents - whole;
        s.score = roundMoney(Math.max(0, s.score - whole / 100));
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
      const earned = roundMoney(
        f.value *
          (f.gold ? Config.goldValue : Config.foodValue) *
          roundFoodMultiplier,
      );
      if (!s.isPlayer) s.score = roundMoney(s.score + earned);
      if (s.isPlayer && state === "playing") {
        collected = roundMoney(collected + earned);
        foodEarnings = roundMoney(foodEarnings + earned);
        if (!s.evolved && collected >= roundEvolutionScore) {
          s.evolved = true;
          s.evolvedAt = s.age;
          if (!reducedMotion) burst(s.x, s.y, "#c9fff5", 32);
          tone(1047, 0.25, 0.06);
        }
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
    s.respawn = between(1.5, 3);
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
      if (!s.alive) continue;
      const r = radiusOf(s);
      if (s.x < r || s.y < r || s.x > world - r || s.y > world - r) {
        victims.add(s);
        continue;
      }
      for (const p of nearby(bodyGrid, s.x, s.y, 64)) {
        if (p.snake === s || !p.snake.alive) continue;
        const hit = radiusOf(p.snake) + r;
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
        if (!a.alive || !b.alive) continue;
        if (distance2(a, b) < ((radiusOf(a) + radiusOf(b)) * 0.85) ** 2) {
          victims.add(a);
          victims.add(b);
        }
      }
    victims.forEach(die);
  }

  function canCashout() {
    return collected >= roundCashoutTarget;
  }

  function crossedFinish() {
    if (!canCashout()) return false;
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
          snakes[i] = spawnBot(s.id, false, true);
          indexSnakeBody(snakes[i]);
        }
        continue;
      }
      if (!s.isPlayer || !isPlaying) think(s, dt);
      move(s, dt);
    }
    rebuildBodyGrid();
    collisions();
    if (isPlaying) {
      if (state === "playing" && player.alive && crossedFinish())
        endRound(true);
    } else if (!player.alive) {
      reset("lobby");
      return;
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
    const ready = canCashout();
    const progress = Math.min(collected, roundCashoutTarget);
    const text = `${money(collected, true)} / ${money(roundCashoutTarget)}`;
    const bar = $("cashoutProgressBar");
    if (
      $("cashoutProgressAmount").textContent !== text ||
      !bar.hasAttribute("aria-valuetext")
    ) {
      $("cashoutProgressAmount").textContent = text;
      $("cashoutProgressFill").style.transform =
        `scaleX(${progress / roundCashoutTarget})`;
      bar.setAttribute("aria-valuemax", String(roundCashoutTarget));
      bar.setAttribute("aria-valuenow", String(progress));
      bar.setAttribute(
        "aria-valuetext",
        `${text}. ${ready ? "Exit ready" : "Exit locked"}`,
      );
    }
    $("cashoutProgress").classList.toggle("ready", ready);
    $("cashoutProgress").classList.toggle("evolved", player.evolved);
  }

  function updateUI() {
    updateCollectedUI();
    if (state === "lobby") updateBetControls();
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
    $("betMultiplier").textContent = valid
      ? `${multiplierText(foodMultiplierForBet(amount))} FOOD + GOLD`
      : "—";
    $("betCashoutTarget").textContent = valid
      ? money(cashoutTargetForBet(amount))
      : "—";
    if (valid) {
      Config.bet = amount;
      if (state === "lobby") {
        roundFoodMultiplier = foodMultiplierForBet(amount);
        roundCashoutTarget = cashoutTargetForBet(amount);
        updateCollectedUI();
      }
    }
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
    if (state !== "playing" || (won && !canCashout())) return;
    state = won ? "won" : "lost";
    boosting = false;
    keys.clear();
    pointer = null;
    $("hud").classList.add("hidden");
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
      coin.textContent = "";
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
    if (!Config.directorMode || state !== "playing" || paused || !canCashout())
      return;
    // Find an empty landing corridor; recording mode never grants ghost bodies.
    const angle = finish.vertical
      ? finish.sign > 0
        ? 0
        : Math.PI
      : finish.sign > 0
        ? Math.PI / 2
        : -Math.PI / 2;
    for (const offset of [
      0, -100, 100, -200, 200, -300, 300, -400, 400, -500, 500,
    ]) {
      const x = finish.vertical
        ? finish.coordinate - finish.sign * 26
        : finish.center + offset;
      const y = finish.vertical
        ? finish.center + offset
        : finish.coordinate - finish.sign * 26;
      const candidate = { ...player, navigation: { ...player.navigation } };
      placeSnake(candidate, x, y, angle);
      if (!placementClear(candidate, false, 120)) continue;
      placeSnake(player, x, y, angle);
      pointer = null;
      keys.clear();
      boosting = false;
      boostBlocked = false;
      camera.x = player.x;
      camera.y = player.y;
      rebuildBodyGrid();
      return;
    }
    // If all lanes are occupied, complete the director cash-out without teleporting.
    endRound(true);
  }

  // Canvas rendering: world-space geometry, then screen-space floating UI.
  function visible(x, y, margin = 40) {
    return (
      Math.abs(x - camera.x) < width / scale / 2 + margin &&
      Math.abs(y - camera.y) < height / scale / 2 + margin
    );
  }
  function drawBackground() {
    const fieldHue =
      { ocean: 185, violet: 260, ember: 15 }[appearance.tint] ?? hue;
    // Flowing mineral contours are anchored in world space, with a seeded tint.
    ctx.fillStyle = `hsl(${fieldHue + 35}, 38%, 6%)`;
    ctx.fillRect(0, 0, width, height);
    const haze = ctx.createRadialGradient(
      width * 0.18,
      height * 0.35,
      0,
      width * 0.5,
      height * 0.4,
      height * 0.8,
    );
    haze.addColorStop(0, `hsla(${fieldHue}, 70%, 22%, .22)`);
    haze.addColorStop(0.55, `hsla(${fieldHue + 70}, 65%, 14%, .12)`);
    haze.addColorStop(1, "#02050c00");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, height);
    const left = camera.x - width / scale / 2,
      top = camera.y - height / scale / 2,
      right = left + width / scale,
      bottom = top + height / scale;
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-camera.x, -camera.y);
    if (appearance.background === "contours")
      for (
        let row = Math.floor((top - 80) / 42);
        row * 42 < bottom + 80;
        row++
      ) {
        ctx.beginPath();
        for (let x = Math.floor(left / 24) * 24 - 24; x < right + 48; x += 24) {
          const y =
            row * 42 +
            36 * Math.sin(x / 230 + row * 0.13 + fieldHue) +
            14 * Math.cos(x / 95 - row * 0.19);
          if (x < left - 1) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `hsla(${fieldHue + (row % 3) * 18}, 55%, 60%, ${row % 5 === 0 ? 0.13 : 0.055})`;
        ctx.lineWidth = row % 5 === 0 ? 1.4 : 0.7;
        ctx.stroke();
      }
    if (appearance.background === "hex") {
      const r = 34,
        stepY = r * Math.sqrt(3);
      ctx.beginPath();
      for (let col = Math.floor(left / 51) - 1; col * 51 < right + 51; col++) {
        for (
          let row = Math.floor(top / stepY) - 1;
          row * stepY < bottom + stepY;
          row++
        ) {
          const x = col * 51,
            y = row * stepY + ((col % 2) * stepY) / 2;
          for (let i = 0; i < 6; i++) {
            const px = x + Math.cos((i * TAU) / 6) * r,
              py = y + Math.sin((i * TAU) / 6) * r;
            if (i) ctx.lineTo(px, py);
            else ctx.moveTo(px, py);
          }
          ctx.closePath();
        }
      }
      ctx.strokeStyle = `hsla(${fieldHue}, 50%, 60%, .14)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Sparse mineral slivers or stars remain anchored to the world.
    for (let col = Math.floor(left / 150) - 1; col * 150 < right + 150; col++) {
      for (
        let row = Math.floor(top / 150) - 1;
        row * 150 < bottom + 150;
        row++
      ) {
        const noise =
          Math.sin(col * 127.1 + row * 311.7 + fieldHue) * 43758.5453;
        const f = noise - Math.floor(noise);
        const x = col * 150 + f * 115,
          y = row * 150 + (1 - f) * 115;
        ctx.fillStyle = `hsla(${fieldHue + 30}, 40%, 62%, .1)`;
        ctx.beginPath();
        if (appearance.background === "stars") {
          ctx.fillStyle = `hsla(${fieldHue + 30}, 50%, 85%, ${0.2 + f * 0.4})`;
          ctx.arc(x, y, 0.7 + f, 0, TAU);
        } else {
          ctx.moveTo(x - 4, y + 10);
          ctx.lineTo(x + 2, y - 8);
          ctx.lineTo(x + 5, y + 5);
          ctx.closePath();
        }
        ctx.fill();
      }
    }
    ctx.strokeStyle = "#ff688c";
    ctx.lineWidth = 5;
    ctx.shadowBlur = 25;
    ctx.shadowColor = "#ff547a";
    ctx.strokeRect(0, 0, world, world);
    ctx.restore();
  }
  function drawFinish() {
    ctx.save();
    const ready = canCashout();
    ctx.globalAlpha = ready ? 1 : 0.4;
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
    if (!s.alive || !s.path.some((p) => visible(p.x, p.y, 90))) return;
    const r = radiusOf({ mass: s.oldMass + (s.mass - s.oldMass) * alpha });
    const headX = s.oldX + (s.x - s.oldX) * alpha,
      headY = s.oldY + (s.y - s.oldY) * alpha,
      headAngle = s.oldAngle + angleDelta(s.oldAngle, s.angle) * alpha;
    const visualLength =
      s.oldVisualLength + (s.visualLength - s.oldVisualLength) * alpha;
    const trail = renderTrail(s, headX, headY, visualLength);
    const evolved = s.evolved;
    const color =
      s.isPlayer && appearance.color !== "random" ? appearance.color : s.color;
    const glow = appearance.glow / 100;
    const boostBlend = clamp(
      (s.currentSpeed - s.speed) / Math.max(1, Config.boostSpeed - s.speed),
      0,
      1,
    );
    const phase = reducedMotion ? 0 : elapsed * 2.2;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(headX, headY);
    for (const p of trail) ctx.lineTo(p.x, p.y);
    if (evolved) {
      ctx.strokeStyle = "#88fff3";
      ctx.lineWidth = r * 4.2;
      ctx.globalAlpha = 0.1 + 0.025 * Math.sin(phase);
      ctx.shadowColor = "#a5fff4";
      ctx.shadowBlur = 30 * glow;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = r * 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = (10 + boostBlend * 14) * glow;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#081b32";
    ctx.lineWidth = r * 1.76;
    ctx.stroke();
    ctx.strokeStyle = color + "60";
    ctx.lineWidth = r * 1.3;
    ctx.stroke();

    // Overlapping faceted scales follow the tangent of the smooth body trail.
    for (let i = Math.floor((trail.length - 1) / 3) * 3; i >= 3; i -= 3) {
      const p = trail[i],
        ahead = trail[i - 2];
      if (!visible(p.x, p.y, 60)) continue;
      const taper = clamp((visualLength - p.distance + 28) / 80, 0.3, 1);
      const a = Math.atan2(ahead.y - p.y, ahead.x - p.x);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(a);
      if (evolved && i % 6 === 0) {
        ctx.fillStyle = "#adfff0aa";
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(7, side * r * 0.55);
          ctx.lineTo(
            -8,
            side * r * (1.8 + Math.sin(phase - i * 0.12) * 0.15) * taper,
          );
          ctx.lineTo(-13, side * r * 0.55);
          ctx.fill();
        }
      }
      if (appearance.skin === "smooth") {
        ctx.restore();
        continue;
      }
      if (appearance.skin === "rings") {
        ctx.strokeStyle = color + "bb";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, 4, r * 0.8 * taper, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      const sheen = ctx.createLinearGradient(0, -r, 0, r);
      sheen.addColorStop(0, "#f3ffffa0");
      sheen.addColorStop(0.27, color);
      sheen.addColorStop(1, "#0a243c");
      ctx.fillStyle = sheen;
      ctx.beginPath();
      const tip = s.skin === 1 ? 15 : 11;
      ctx.moveTo(tip, 0);
      ctx.lineTo(s.skin === 2 ? -2 : 1, -r * 0.79 * taper);
      ctx.lineTo(-12, -r * 0.48 * taper);
      ctx.lineTo(-7, 0);
      ctx.lineTo(-12, r * 0.48 * taper);
      ctx.lineTo(s.skin === 2 ? -2 : 1, r * 0.79 * taper);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = evolved ? "#d8fff9aa" : color + "90";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = evolved ? "#f2fff9" : "#d7fff0aa";
      ctx.beginPath();
      ctx.ellipse(1, -r * 0.12, s.skin === 2 ? 3 : 1.5, 1.2, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Orbiting motes are computed from the trail, never added to the physics RNG.
    if (evolved || boostBlend > 0.2) {
      ctx.fillStyle = evolved ? "#cffff5" : color;
      for (let i = 6; i < trail.length; i += evolved ? 9 : 18) {
        const p = trail[i];
        if (!visible(p.x, p.y, 55)) continue;
        const a = phase + i * 1.73;
        const orbit = r * (evolved ? 2.1 : 1.6);
        ctx.globalAlpha = evolved ? 0.6 : boostBlend * 0.5;
        ctx.beginPath();
        ctx.arc(
          p.x + Math.cos(a) * orbit,
          p.y + Math.sin(a) * orbit,
          evolved ? 1.7 : 1.1,
          0,
          TAU,
        );
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.translate(headX, headY);
    ctx.rotate(headAngle);
    if (evolved) {
      ctx.strokeStyle = "#bcfff49c";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(-4, 0, r * 2.15, r * 1.65, 0, -1.15, 1.15);
      ctx.stroke();
      ctx.fillStyle = "#b5fff1";
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.2, side * r * 0.7);
        ctx.lineTo(-r * 1.85, side * r * 1.65);
        ctx.lineTo(-r, side * r * 0.15);
        ctx.fill();
      }
    }
    const face = ctx.createLinearGradient(0, -r, 0, r);
    face.addColorStop(0, "#e9fff6");
    face.addColorStop(0.35, color);
    face.addColorStop(1, "#164259");
    ctx.fillStyle = face;
    ctx.shadowColor = color;
    ctx.shadowBlur = (evolved ? 24 : 10) * glow;
    ctx.beginPath();
    ctx.moveTo(r * 1.25, 0);
    ctx.bezierCurveTo(r * 1.15, -r * 0.7, -r * 0.45, -r * 1.15, -r, -r * 0.5);
    ctx.quadraticCurveTo(-r * 1.3, 0, -r, r * 0.5);
    ctx.bezierCurveTo(-r * 0.45, r * 1.15, r * 1.15, r * 0.7, r * 1.25, 0);
    ctx.fill();
    ctx.shadowBlur = 0;
    for (const side of [-1, 1]) {
      ctx.fillStyle = "#071522";
      ctx.beginPath();
      ctx.ellipse(
        r * 0.4,
        side * r * 0.48,
        r * 0.37,
        r * 0.18,
        side * -0.35,
        0,
        TAU,
      );
      ctx.fill();
      ctx.fillStyle = evolved ? "#ffffff" : "#caffed";
      ctx.beginPath();
      ctx.ellipse(
        r * 0.48,
        side * r * 0.48,
        r * 0.07,
        r * 0.13,
        side * -0.35,
        0,
        TAU,
      );
      ctx.fill();
    }
    ctx.strokeStyle = "#e4fff8a0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, 0);
    ctx.lineTo(r * 0.1, 0);
    ctx.stroke();
    if (evolved && !reducedMotion) {
      const age = s.age - s.evolvedAt;
      if (age < 1.3) {
        ctx.globalAlpha = Math.max(0, 1 - age / 1.3) * 0.6;
        ctx.strokeStyle = "#d1fff4";
        ctx.beginPath();
        ctx.arc(0, 0, r * 2 + age * 65, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  function drawScores(alpha) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 13px monospace";
    for (const s of snakes) {
      if (!s.alive) continue;
      const x = s.oldX + (s.x - s.oldX) * alpha;
      const y = s.oldY + (s.y - s.oldY) * alpha - radiusOf(s) - 23;
      if (!visible(x, y, 60)) continue;
      const text = money(s.isPlayer ? collected : s.score, true);
      const w = Math.max(
        s.isPlayer ? 80 : 58,
        ctx.measureText(text).width + 20,
      );
      const color =
        s.isPlayer && appearance.color !== "random"
          ? appearance.color
          : s.color;
      ctx.fillStyle = "#07131ee8";
      ctx.strokeStyle = color + "88";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - 12, w, 24, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = s.isPlayer ? "#effffb" : color;
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  }

  function drawMinimap() {
    const shown =
      appearance.showMinimap && (state === "playing" || studioPreview);
    mini.classList.toggle("hidden", !shown);
    if (!shown) return;
    mctx.setTransform(2, 0, 0, 2, 0, 0);
    mctx.clearRect(0, 0, 100, 100);
    const k = 88 / world;
    mctx.save();
    mctx.translate(6, 6);
    mctx.strokeStyle = "#9dbdd744";
    mctx.strokeRect(0, 0, 88, 88);
    mctx.strokeStyle = canCashout() ? "#b5ff44" : "#6c8e55";
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
      if (!s.alive || s.isPlayer) continue;
      mctx.fillStyle = s.color + "bb";
      mctx.beginPath();
      mctx.arc(s.x * k, s.y * k, 1.2, 0, TAU);
      mctx.fill();
    }
    mctx.strokeStyle = "#ffffff55";
    mctx.lineWidth = 0.6;
    mctx.strokeRect(
      (camera.x - width / scale / 2) * k,
      (camera.y - height / scale / 2) * k,
      (width / scale) * k,
      (height / scale) * k,
    );
    mctx.fillStyle = "#fff";
    mctx.beginPath();
    mctx.arc(camera.x * k, camera.y * k, 2.5, 0, TAU);
    mctx.fill();
    mctx.restore();
  }

  function applyAppearance(value) {
    const previousBots = appearance.botCount;
    appearance = ArenaPreferences.normalize(value);
    // Economy and population changes take effect on the next round.
    Config.botCount = appearance.botCount;
    Config.evolutionScore = appearance.evolutionScore;
    if (studioPreview && previousBots !== appearance.botCount) reset("lobby");
  }
  window.addEventListener("storage", (event) => {
    if (event.key === ArenaPreferences.key || event.key === null)
      applyAppearance(ArenaPreferences.read(gameDefaults));
  });
  window.addEventListener("message", (event) => {
    // Only the studio that owns this preview frame can update it.
    if (
      studioPreview &&
      event.source === window.parent &&
      event.data?.type === "arena:preferences"
    ) {
      applyAppearance(event.data.profile);
    }
  });

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
    if (appearance.showScores) drawScores(alpha);
    ctx.restore();
    ctx.globalAlpha = 1;
    drawMinimap();
    updateCollectedUI();
  }
  function frame(time) {
    const dt = Math.min((time - (previousTime || time)) / 1000, 0.1);
    previousTime = time;
    accumulator += dt;
    while (accumulator >= STEP) {
      const roundBeforeTick = roundSerial;
      tick(STEP);
      if (roundSerial !== roundBeforeTick) {
        accumulator = 0;
        break;
      }
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
    pointerId = null;
    boostPointerId = null;
    keys.clear();
    boosting = false;
    pointer = null;
    $("pausePanel").classList.toggle("hidden", !value);
  }
  function setPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  // A second finger boosts while the first keeps steering; mouse hold boosts.
  // Capture each pointer on the canvas so releasing outside cannot leave boost on.
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing" || paused) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (pointerId === null) {
      pointerId = event.pointerId;
      setPointer(event);
      if (event.pointerType === "mouse") beginPointerBoost(event.pointerId);
    } else if (event.pointerId !== pointerId && boostPointerId === null) {
      beginPointerBoost(event.pointerId);
    } else return;
    canvas.setPointerCapture(event.pointerId);
    unlockAudio();
  });
  function beginPointerBoost(id) {
    boostPointerId = id;
    boosting = true;
    boostBlocked = collected <= 0 || player.mass <= 28;
  }
  canvas.addEventListener("pointermove", (event) => {
    if (
      state === "playing" &&
      !paused &&
      (event.pointerType === "mouse" || event.pointerId === pointerId)
    )
      setPointer(event);
  });
  function releasePointer(event) {
    if (event.pointerId === boostPointerId) {
      boostPointerId = null;
      boosting = false;
      if (!keys.has(" ")) boostBlocked = false;
    }
    if (event.pointerId === pointerId) {
      // The remaining finger can keep steering without starting a new gesture.
      pointerId = boostPointerId;
      pointer = null;
      boostPointerId = null;
      boosting = false;
      if (!keys.has(" ")) boostBlocked = false;
    }
  }
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);
  canvas.addEventListener("lostpointercapture", releasePointer);
  canvas.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse" && pointerId === null) pointer = null;
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
  $("pausePanel").addEventListener("click", (event) => {
    if (!event.target.closest("a")) setPause(false);
  });
  $("playButton").addEventListener("click", startRound);
  $("againButton").addEventListener("click", startRound);
  $("lobbyButton").addEventListener("click", () => {
    reset("lobby");
    $("playButton").focus({ preventScroll: true });
  });
  $("betInput").value = String(Config.bet);
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
  // Read-only diagnostics for recordings and smoke checks; no live state mutation.
  window.ViperRoyale = Object.freeze({
    snapshot: () => ({
      state,
      paused,
      seed,
      appearance: { ...appearance },
      round: roundSerial,
      wallet,
      bet: roundBet,
      foodMultiplier: roundFoodMultiplier,
      cashoutTarget: roundCashoutTarget,
      cashoutReady: canCashout(),
      evolutionScore: roundEvolutionScore,
      collected,
      foodEarnings,
      boostSpent,
      elapsed,
      player: {
        x: player.x,
        y: player.y,
        angle: player.angle,
        score: collected,
        mass: player.mass,
        length: lengthOf(player),
        radius: radiusOf(player),
        speed: player.currentSpeed,
        alive: player.alive,
        color: player.color,
        boosting: player.boost,
        evolved: player.evolved,
      },
      bots: snakes
        .filter((s) => !s.isPlayer && s.alive)
        .map((s) => ({ id: s.id, score: s.score })),
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

/* Decorative arena biomes plus seeded food routes. Scenery has no collision bodies. */
(() => {
  "use strict";
  const TAU = Math.PI * 2;
  const themes = Object.freeze({
    ...Object.fromEntries(
      Object.keys(ArenaPreferences.terrains).map((id) => [
        id,
        { hue: 180, food: ["#76ffcc"] },
      ]),
    ),
    classic: { hue: null, food: ["#8be6ff", "#b4ff6a", "#d38aff", "#f982c4"] },
    reef: { hue: 180, food: ["#7affdc", "#69d9ff", "#f29ac7"] },
    ember: { hue: 5, food: ["#ffba6b", "#ff776e", "#ffd793"] },
    crystal: { hue: 255, food: ["#c4a2ff", "#86efff", "#f7baff"] },
    orbital: { hue: 210, food: ["#8ecaff", "#ffe7a2", "#8af6dc"] },
  });
  function rng(seed) {
    let h = 2166136261;
    for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return () => {
      h += 0x6d2b79f5;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function create(id, seed, size) {
    if (!themes[id]) id = "classic";
    const random = rng(`${seed}:scenery:${id}`);
    const nodes = [];
    for (let x = 260; x < size - 100; x += 460)
      for (let y = 260; y < size - 100; y += 460) {
        nodes.push({
          x: x + (random() - 0.5) * 150,
          y: y + (random() - 0.5) * 150,
          r: 55 + random() * 80,
          angle: random() * TAU,
          phase: random() * TAU,
        });
      }
    return { id, size, nodes, phase: random() * TAU, ...themes[id] };
  }
  function foodPosition(scene, random) {
    const { size } = scene;
    const id =
      {
        sea: "reef",
        canyon: "ember",
        glacier: "crystal",
        lagoon: "orbital",
        basalt: "ember",
        marsh: "crystal",
      }[scene.id] || scene.id;
    let x = 50 + random() * (size - 100),
      y = 50 + random() * (size - 100);
    if (id !== "classic" && random() < 0.72) {
      const lane = 1 + Math.floor(random() * 7);
      if (id === "reef")
        x =
          (lane * size) / 8 +
          Math.sin(y / 280 + scene.phase) * 160 +
          (random() - 0.5) * 70;
      if (id === "ember")
        y =
          ((x * 0.62 +
            (lane * size) / 8 +
            Math.sin(x / 95 + scene.phase) * 30) %
            size) +
          (random() - 0.5) * 55;
      if (id === "crystal") {
        const node = scene.nodes[Math.floor(random() * scene.nodes.length)],
          a = random() * TAU,
          r = Math.sqrt(random()) * 100;
        x = node.x + Math.cos(a) * r;
        y = node.y + Math.sin(a) * r;
      }
      if (id === "orbital") {
        const a = random() * TAU,
          r =
            ((1 + Math.floor(random() * 5)) * size) / 13 +
            (random() - 0.5) * 45;
        x = size / 2 + Math.cos(a) * r;
        y = size / 2 + Math.sin(a) * r;
      }
    }
    return {
      x: Math.max(50, Math.min(size - 50, x)),
      y: Math.max(50, Math.min(size - 50, y)),
    };
  }
  function draw(ctx, scene, bounds, time, animated, hue) {
    const { left, right, top, bottom } = bounds,
      { id, size } = scene;
    if (id === "classic") return;
    const color = `hsl(${hue}, 80%, 64%)`;
    ctx.save();
    if (id === "reef" || id === "ember") {
      for (let lane = 1; lane <= (id === "reef" ? 7 : 12); lane++) {
        ctx.beginPath();
        if (id === "reef") {
          for (
            let y = Math.floor(top / 24) * 24 - 24;
            y < bottom + 24;
            y += 24
          ) {
            const x = (lane * size) / 8 + Math.sin(y / 280 + scene.phase) * 160;
            if (y < top) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        } else {
          for (
            let x = Math.floor(left / 24) * 24 - 24;
            x < right + 24;
            x += 24
          ) {
            const y =
              x * 0.62 +
              ((lane - 6) * size) / 8 +
              Math.sin(x / 95 + scene.phase) * 30;
            if (x < left) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        }
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.045;
        ctx.lineWidth = id === "reef" ? 55 : 24;
        ctx.stroke();
        ctx.globalAlpha = id === "reef" ? 0.15 : 0.32;
        ctx.lineWidth = id === "reef" ? 1.5 : 2.5;
        ctx.stroke();
      }
    }
    if (id === "orbital") {
      ctx.strokeStyle = color;
      for (let ring = 1; ring <= 5; ring++) {
        const r = (ring * size) / 13;
        ctx.globalAlpha = 0.1;
        ctx.lineWidth = 22;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, r, 0, TAU);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.25;
        ctx.stroke();
        ctx.setLineDash([8, 22]);
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, r + 18, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    for (const n of scene.nodes) {
      if (
        n.x + 200 < left ||
        n.x - 200 > right ||
        n.y + 200 < top ||
        n.y - 200 > bottom
      )
        continue;
      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.rotate(n.angle);
      ctx.globalAlpha = 1;
      if (id === "reef") {
        ctx.strokeStyle = color;
        ctx.lineCap = "round";
        for (let branch = -2; branch <= 2; branch++) {
          ctx.beginPath();
          ctx.moveTo(0, n.r * 0.5);
          ctx.quadraticCurveTo(
            branch * 10,
            -n.r * 0.1,
            branch * 22,
            -n.r * 0.65 + Math.abs(branch) * 12,
          );
          ctx.globalAlpha = 0.08;
          ctx.lineWidth = 13;
          ctx.stroke();
          ctx.globalAlpha = 0.3;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.strokeStyle = "#bcfff0";
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const rise = animated
            ? (time * 12 + k * 47 + n.phase * 20) % 150
            : k * 47;
          ctx.beginPath();
          ctx.arc(k * 19 - 25, -rise, 3 + k, 0, TAU);
          ctx.stroke();
        }
      } else if (id === "ember") {
        ctx.fillStyle = "#29121e";
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.moveTo(-n.r, 6);
        ctx.lineTo(-n.r * 0.3, -24);
        ctx.lineTo(n.r, -8);
        ctx.lineTo(n.r * 0.2, 22);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "#ffc57c";
        ctx.globalAlpha = 0.4;
        for (let k = 0; k < 4; k++) {
          const rise = animated
            ? (time * 18 + k * 29 + n.phase * 10) % 120
            : k * 29;
          ctx.fillRect(k * 17 - 28, -rise, 1.5, 3);
        }
      } else if (id === "crystal") {
        for (let shard = -1; shard <= 1; shard++) {
          ctx.save();
          ctx.translate(shard * 24, Math.abs(shard) * 15);
          ctx.rotate(shard * 0.3);
          const h = n.r * (shard === 0 ? 1 : 0.65);
          const fill = ctx.createLinearGradient(-20, 0, 20, -h);
          fill.addColorStop(0, `hsla(${hue},60%,25%,.12)`);
          fill.addColorStop(1, `hsla(${hue + 35},85%,75%,.32)`);
          ctx.fillStyle = fill;
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.65;
          ctx.beginPath();
          ctx.moveTo(0, -h);
          ctx.lineTo(18, -h * 0.4);
          ctx.lineTo(10, 10);
          ctx.lineTo(-16, 0);
          ctx.lineTo(-20, -h * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, -h);
          ctx.lineTo(3, 8);
          ctx.stroke();
          ctx.restore();
        }
      } else {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.17;
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.arc(0, 0, n.r * 0.65, 0.2, 4.9);
        ctx.stroke();
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-n.r, -n.r * 0.3);
        ctx.lineTo(n.r, -n.r * 0.3);
        ctx.stroke();
        ctx.strokeRect(-12, -12, 24, 24);
        ctx.fillStyle = "#b3ebff";
        ctx.globalAlpha = 0.45;
        ctx.fillRect(-3, -3, 6, 6);
      }
      ctx.restore();
    }
    if (animated) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.3;
      for (let i = 0; i < 24; i++) {
        const x =
          left +
          ((i * 137.7 + scene.phase * 51 + time * (id === "orbital" ? 12 : 3)) %
            (right - left));
        const y =
          top +
          ((((i * 219.3 + scene.phase * 71 - time * 7) % (bottom - top)) +
            (bottom - top)) %
            (bottom - top));
        ctx.beginPath();
        ctx.arc(x, y, i % 3 === 0 ? 1.4 : 0.7, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  window.ArenaWorlds = Object.freeze({ create, foodPosition, draw });
})();

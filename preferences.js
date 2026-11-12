/* Shared, validated settings for the game and its standalone studio. */
(() => {
  "use strict";
  const key = "snake-arena.profile.v1";
  const defaults = Object.freeze({
    background: "contours",
    skin: "scales",
    tint: "random",
    color: "random",
    glow: 100,
    showScores: true,
    showMinimap: true,
    botCount: 49,
    evolutionScore: 10000,
  });
  function normalize(input) {
    const value = input && typeof input === "object" ? input : {};
    const choice = (name, choices) =>
      choices.includes(value[name]) ? value[name] : defaults[name];
    const number = (name, min, max) =>
      typeof value[name] === "number" && Number.isFinite(value[name])
        ? Math.min(max, Math.max(min, Math.round(value[name])))
        : defaults[name];
    return {
      background: choice("background", ["contours", "hex", "stars"]),
      skin: choice("skin", ["scales", "smooth", "rings"]),
      tint: choice("tint", ["random", "ocean", "violet", "ember"]),
      color:
        typeof value.color === "string" && /^#[0-9a-f]{6}$/i.test(value.color)
          ? value.color
          : "random",
      glow: number("glow", 0, 150),
      showScores:
        typeof value.showScores === "boolean"
          ? value.showScores
          : defaults.showScores,
      showMinimap:
        typeof value.showMinimap === "boolean"
          ? value.showMinimap
          : defaults.showMinimap,
      botCount: number("botCount", 0, 80),
      evolutionScore: number("evolutionScore", 100, 1000000),
    };
  }
  let memory = null;
  function read(fallback = defaults) {
    try {
      const saved = localStorage.getItem(key);
      memory = saved ? normalize(JSON.parse(saved)) : normalize(fallback);
    } catch {
      memory ??= normalize(fallback);
    }
    return { ...memory };
  }
  function write(input) {
    memory = normalize(input);
    try {
      localStorage.setItem(key, JSON.stringify(memory));
      return true;
    } catch {
      return false;
    }
  }
  function fromQuery() {
    try {
      const raw = new URLSearchParams(location.search).get("preset");
      return raw && raw.length < 4096 ? normalize(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }
  window.ArenaPreferences = Object.freeze({
    key,
    defaults,
    normalize,
    read,
    write,
    fromQuery,
  });
})();

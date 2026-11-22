/* Shared, validated settings for the game and its standalone studio. */
(() => {
  "use strict";
  const englishNames = new Intl.DisplayNames(["en"], { type: "region" });
  const countries = Object.freeze({
    nz: englishNames.of("NZ"),
    za: englishNames.of("ZA"),
    eg: englishNames.of("EG"),
    ma: englishNames.of("MA"),
    tn: englishNames.of("TN"),
    dz: englishNames.of("DZ"),
    ke: englishNames.of("KE"),
    ng: englishNames.of("NG"),
    gh: englishNames.of("GH"),
    sn: englishNames.of("SN"),
    cm: englishNames.of("CM"),
    ug: englishNames.of("UG"),
    et: englishNames.of("ET"),
    tz: englishNames.of("TZ"),
    il: englishNames.of("IL"),
    sa: englishNames.of("SA"),
    ae: englishNames.of("AE"),
    qa: englishNames.of("QA"),
    kz: englishNames.of("KZ"),
    uz: englishNames.of("UZ"),
    ge: englishNames.of("GE"),
    am: englishNames.of("AM"),
    az: englishNames.of("AZ"),
    th: englishNames.of("TH"),
    vn: englishNames.of("VN"),
    my: englishNames.of("MY"),
    sg: englishNames.of("SG"),
    id: englishNames.of("ID"),
    ph: englishNames.of("PH"),
    pk: englishNames.of("PK"),
    bd: englishNames.of("BD"),
    np: englishNames.of("NP"),
    lk: englishNames.of("LK"),
    is: englishNames.of("IS"),
    cz: englishNames.of("CZ"),
    sk: englishNames.of("SK"),
    hu: englishNames.of("HU"),
    ro: englishNames.of("RO"),
    bg: englishNames.of("BG"),
    hr: englishNames.of("HR"),
    si: englishNames.of("SI"),
    rs: englishNames.of("RS"),
    ee: englishNames.of("EE"),
    lv: englishNames.of("LV"),
    lt: englishNames.of("LT"),
    lu: englishNames.of("LU"),
    mt: englishNames.of("MT"),
    cy: englishNames.of("CY"),
    cl: englishNames.of("CL"),
    co: englishNames.of("CO"),
    pe: englishNames.of("PE"),
    uy: englishNames.of("UY"),
    ec: englishNames.of("EC"),
    fr: "France",
    de: "Germany",
    it: "Italy",
    ua: "Ukraine",
    jp: "Japan",
    br: "Brazil",
    us: "United States",
    gb: "United Kingdom",
    ca: "Canada",
    ru: "Russia",
    pl: "Poland",
    es: "Spain",
    pt: "Portugal",
    nl: "Netherlands",
    be: "Belgium",
    ch: "Switzerland",
    se: "Sweden",
    no: "Norway",
    dk: "Denmark",
    fi: "Finland",
    tr: "Turkey",
    cn: "China",
    kr: "South Korea",
    in: "India",
    ar: "Argentina",
    mx: "Mexico",
    au: "Australia",
    gr: "Greece",
    at: "Austria",
    ie: "Ireland",
  });
  const terrains = {
    desert: "Песчаные дюны",
    sea: "Открытое море",
    glacier: "Ледник",
    basalt: "Вулканический базальт",
    marsh: "Мангровая заводь",
    canyon: "Красный каньон",
    lagoon: "Коралловая лагуна",
  };
  const key = "snake-arena.profile.v1";
  const defaults = Object.freeze({
    background: "contours",
    map: "desert",
    language: "pt",
    foodColor: "#76ffcc",
    dropColor: "#ffd968",
    effects: "balanced",
    skin: "flag-br",
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
      background: choice("background", [
        "contours",
        "hex",
        "stars",
        "sand",
        "sea",
      ]),
      map:
        {
          classic: value.background === "sea" ? "sea" : "desert",
          reef: "sea",
          ember: "basalt",
          crystal: "glacier",
          orbital: "lagoon",
        }[value.map] || choice("map", Object.keys(terrains)),
      language: choice("language", ["pt", "ru", "en"]),
      foodColor: /^#[a-f0-9]{6}$/i.test(value.foodColor)
        ? value.foodColor
        : defaults.foodColor,
      dropColor: /^#[a-f0-9]{6}$/i.test(value.dropColor)
        ? value.dropColor
        : defaults.dropColor,
      effects: choice("effects", ["off", "balanced", "cinematic"]),
      skin: choice("skin", [
        ...Object.keys(countries).map((code) => `flag-${code}`),
      ]),
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
    countries,
    terrains,
    defaults,
    normalize,
    read,
    write,
    fromQuery,
  });
})();

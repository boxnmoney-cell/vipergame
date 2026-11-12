(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const store = ArenaPreferences;
  const libraryKey = "snake-arena.library.v1";
  let profile = store.read();
  let selected = "snake";
  let games = [];
  const builtin = { id: "snake", name: "Snake Arena", url: "index.html" };
  function validURL(value) {
    if (typeof value !== "string" || !value.trim() || value.length > 2048)
      return null;
    try {
      const url = new URL(value.trim(), location.href);
      if (url.username || url.password) return null;
      if (["http:", "https:"].includes(url.protocol)) return url.href;
      if (
        url.protocol === "file:" &&
        location.protocol === "file:" &&
        !/^[a-z][a-z\d+.-]*:/i.test(value.trim())
      )
        return value.trim();
    } catch {}
    return null;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(libraryKey));
    if (Array.isArray(saved)) {
      const ids = new Set(["snake"]);
      games = saved
        .filter(
          (g) =>
            g &&
            typeof g.id === "string" &&
            g.id.length <= 100 &&
            !ids.has(g.id) &&
            ids.add(g.id) &&
            typeof g.name === "string" &&
            g.name.trim() &&
            g.name.length <= 60 &&
            validURL(g.url),
        )
        .slice(0, 50)
        .map((g) => ({ id: g.id, name: g.name, url: validURL(g.url) }));
    }
  } catch {}
  const status = (text, error = false) => {
    $("saveStatus").textContent = text;
    $("saveStatus").classList.toggle("error", error);
  };
  function saveLibrary() {
    try {
      localStorage.setItem(libraryKey, JSON.stringify(games));
      $("libraryError").textContent = "";
      return true;
    } catch {
      $("libraryError").textContent =
        "Storage is unavailable. This library will last only for this tab.";
      return false;
    }
  }
  function gameURL(preview = false) {
    const url = new URL("index.html", location.href);
    if (preview) url.searchParams.set("preview", "1");
    url.searchParams.set("preset", JSON.stringify(profile));
    return url.href;
  }
  function updatePreview() {
    $("launchGame").href = gameURL();
    if (!$("preview").dataset.loaded) {
      $("preview").src = gameURL(true);
      $("preview").dataset.loaded = "true";
    } else {
      $("preview").contentWindow.postMessage(
        { type: "arena:preferences", profile },
        location.protocol === "file:" ? "*" : location.origin,
      );
    }
  }
  $("preview").addEventListener("load", () => {
    if (selected === "snake" && $("preview").dataset.loaded) updatePreview();
  });
  function renderLibrary() {
    $("gameList").replaceChildren();
    $("gameCount").textContent = games.length + 1;
    for (const game of [builtin, ...games]) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "game-card";
      card.setAttribute("aria-current", String(game.id === selected));
      const icon = document.createElement("span");
      icon.className = "game-icon";
      icon.textContent = game.id === "snake" ? "≈" : "+";
      icon.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span"),
        title = document.createElement("strong"),
        note = document.createElement("small");
      title.textContent = game.name;
      note.textContent =
        game.id === "snake" ? "Built-in · customizable" : "Linked game";
      copy.append(title, note);
      card.append(icon, copy);
      card.addEventListener("click", () => selectGame(game.id));
      $("gameList").append(card);
    }
  }
  function selectGame(id) {
    const game = [builtin, ...games].find((g) => g.id === id);
    if (!game) return;
    selected = id;
    const internal = id === "snake";
    $("selectedTitle").textContent = game.name;
    $("gameType").textContent = internal
      ? "PERSONALIZE & PLAY"
      : "YOUR LIBRARY";
    $("snakeSettings").hidden = !internal;
    $("externalSettings").hidden = internal;
    $("previewPane").hidden = !internal;
    $("launchGame").textContent = internal ? "Play" : "Open game";
    if (internal) {
      $("launchGame").removeAttribute("target");
      $("launchGame").removeAttribute("rel");
      updatePreview();
    } else {
      $("launchGame").href = game.url;
      $("launchGame").target = "_blank";
      $("launchGame").rel = "noopener noreferrer";
      $("externalAddress").textContent = game.url;
      delete $("preview").dataset.loaded;
      $("preview").src = "about:blank";
    }
    renderLibrary();
  }
  function fillForm() {
    for (const key of [
      "background",
      "skin",
      "tint",
      "glow",
      "botCount",
      "evolutionScore",
    ])
      $(key).value = profile[key];
    for (const key of ["showScores", "showMinimap"])
      $(key).checked = profile[key];
    $("randomColor").checked = profile.color === "random";
    $("playerColor").value =
      profile.color === "random" ? "#74ffe0" : profile.color;
    $("glowValue").value = profile.glow + "%";
  }
  function commit() {
    profile = store.normalize(profile);
    const saved = store.write(profile);
    status(
      saved
        ? "Saved in this browser."
        : "Browser storage is unavailable. Export a preset to keep it; Play still uses these settings.",
      !saved,
    );
    updatePreview();
  }
  $("settingsForm").addEventListener("submit", (e) => e.preventDefault());
  $("launchGame").addEventListener("click", (event) => {
    if (selected === "snake" && !$("settingsForm").reportValidity())
      event.preventDefault();
  });
  $("settingsForm").addEventListener("input", (event) => {
    if (event.target.id === "playerColor") $("randomColor").checked = false;
    if (!$("settingsForm").checkValidity()) {
      status(
        "Enter a whole bot count from 0 to 80 and an evolution score from 100 to 1,000,000.",
        true,
      );
      return;
    }
    profile = {
      background: $("background").value,
      skin: $("skin").value,
      tint: $("tint").value,
      color: $("randomColor").checked ? "random" : $("playerColor").value,
      glow: Number($("glow").value),
      showScores: $("showScores").checked,
      showMinimap: $("showMinimap").checked,
      botCount: Number($("botCount").value),
      evolutionScore: Number($("evolutionScore").value),
    };
    $("glowValue").value = profile.glow + "%";
    commit();
  });
  $("resetPreset").addEventListener("click", () => {
    profile = { ...store.defaults };
    fillForm();
    commit();
  });
  $("exportPreset").addEventListener("click", () => {
    const data = JSON.stringify(
      { version: 1, game: "snake", profile },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([data], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "snake-arena-preset.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $("importPreset").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 16384) throw Error("Preset is too large.");
      const data = JSON.parse(await file.text());
      if (
        data?.version !== 1 ||
        data.game !== "snake" ||
        !data.profile ||
        typeof data.profile !== "object" ||
        Array.isArray(data.profile)
      )
        throw Error("Choose a Snake Arena preset exported by this studio.");
      profile = store.normalize(data.profile);
      fillForm();
      commit();
    } catch (error) {
      status(
        error instanceof SyntaxError
          ? "This file is not valid JSON."
          : error.message,
        true,
      );
    }
    event.target.value = "";
  });
  $("addGameForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("gameName").value.trim(),
      url = validURL($("gameUrl").value);
    if (!name || !url) {
      $("libraryError").textContent =
        "Enter a name and a valid HTTP(S) address or local relative path.";
      return;
    }
    if (games.length >= 50) {
      $("libraryError").textContent =
        "Your library holds up to 50 linked games.";
      return;
    }
    if (games.some((g) => g.url === url)) {
      $("libraryError").textContent =
        "This game link is already in your library.";
      return;
    }
    const game = {
      id:
        crypto.randomUUID?.() ||
        `game-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      url,
    };
    games.push(game);
    const saved = saveLibrary();
    $("addGameForm").reset();
    $("addGameDetails").open = !saved;
    selectGame(game.id);
  });
  $("removeGame").addEventListener("click", () => {
    games = games.filter((g) => g.id !== selected);
    if (!saveLibrary()) $("addGameDetails").open = true;
    selectGame("snake");
  });
  fillForm();
  selectGame("snake");
})();

// The game frame drives the finale clock so a new round never inherits an animation.
window.DeathFinale = (() => {
  const panel = document.getElementById("deathFinale");
  const sky = document.getElementById("fireworks");
  const paint = sky.getContext("2d");
  const digits = document.getElementById("deathScore");
  const button = document.getElementById("deathMenu");
  const colors = ["#8de6ff", "#ffcc80", "#ffa4c3", "#b5f0ab", "#c6afff", "#ffb69c"];
  let elapsed, duration, finalCents, lastCents, lastTier, nextLaunch, bursts, motion, format, jump;

  function start(score, locale, currency, menuLabel, animated) {
    elapsed = 0;
    finalCents = Math.round(score * 100);
    duration = animated ? Math.min(8, 1.25 + Math.sqrt(score) * 0.09) : 0;
    lastTier = 0;
    lastCents = -1;
    nextLaunch = 0;
    bursts = [];
    motion = animated;
    format = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById("deathCurrency").textContent = currency;
    button.textContent = menuLabel;
    button.classList.add("hidden");
    panel.classList.remove("hidden");
    panel.focus({ preventScroll: true });
    frame(0);
  }

  function launch() {
    const random = Math.random;
    const rays = [];
    const count = 52 + Math.floor(random() * 25);
    const rotation = random() * Math.PI;
    for (let i = 0; i < count; i++) {
      const a = rotation + (i + random() * .55) * 2 * Math.PI / count;
      const speed = (.12 + random() * .14) * (i % 3 ? 1 : .59);
      rays.push({ dx: Math.cos(a) * speed, dy: Math.sin(a) * speed, life: .75 + random() * .65 });
    }
    bursts.push({ x: .13 + random() * .74, y: .13 + random() * .48, born: elapsed,
      color: colors[Math.floor(random()*colors.length)], rays });
  }

  function fireworks() {
    const w = panel.clientWidth, h = panel.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (sky.width !== Math.round(w*dpr) || sky.height !== Math.round(h*dpr)) {
      sky.width = Math.round(w*dpr);
      sky.height = Math.round(h*dpr);
    }
    paint.setTransform(dpr,0,0,dpr,0,0);
    paint.clearRect(0,0,w,h);
    if (elapsed >= nextLaunch) {
      launch();
      nextLaunch = elapsed + .5 + Math.random() * .55;
    }
    bursts = bursts.filter(b => elapsed-b.born < 2.15);
    paint.globalCompositeOperation = "lighter";
    paint.lineCap = "round";
    for (const b of bursts) {
      const age = elapsed-b.born, t = age-.65, x = b.x*w, y = b.y*h;
      paint.strokeStyle = b.color;
      if (t < 0) {
        const rise = (1-age/.65)**2;
        paint.globalAlpha = .9;
        paint.lineWidth = 1.8;
        paint.beginPath();
        paint.moveTo(x, y+rise*h*.45);
        paint.lineTo(x, y+rise*h*.45+4+rise*14);
        paint.stroke();
        continue;
      }
      if (t < .32) {
        const glow = paint.createRadialGradient(x,y,0,x,y,w*.12);
        glow.addColorStop(0,"#fff5d5"); glow.addColorStop(.18,b.color); glow.addColorStop(1,b.color+"00");
        paint.fillStyle = glow; paint.globalAlpha = (1-t/.32)*.6;
        paint.fillRect(x-w*.12,y-w*.12,w*.24,w*.24);
      }
      const distance = 1-Math.exp(-2*t);
      const trailTime = Math.max(0,t-.055);
      const behind = 1-Math.exp(-2*trailTime);
      for (const ray of b.rays) {
        if (t >= ray.life) continue;
        paint.globalAlpha = (1-t/ray.life)**.7;
        paint.lineWidth = .8+paint.globalAlpha;
        paint.beginPath();
        paint.moveTo(x+w*ray.dx*behind,y+w*(ray.dy*behind+.055*trailTime**2));
        paint.lineTo(x+w*ray.dx*distance,y+w*(ray.dy*distance+.055*t*t));
        paint.stroke();
      }
    }
    paint.globalAlpha = 1;
  }

  function frame(dt) {
    elapsed += dt;
    const progress = duration ? Math.min(1,elapsed/duration) : 1;
    const cents = Math.round(finalCents*(1-(1-progress)**1.5));
    if (cents !== lastCents) {
      const tier = Math.floor(cents/10000);
      digits.textContent = format.format(cents/100);
      digits.style.color = colors[tier % colors.length];
      if (motion && tier !== lastTier) {
        jump?.cancel();
        jump = digits.animate([{ transform:"translateY(0) scale(1)" },
          { transform:"translateY(-.14em) scale(1.12)", offset:.38 },
          { transform:"translateY(0) scale(1)" }], { duration:280, easing:"ease-out" });
      }
      lastCents = cents; lastTier = tier;
    }
    if (motion) fireworks();
  }

  function close() {
    panel.classList.add("hidden");
    jump?.cancel();
    paint.clearRect(0,0,sky.width,sky.height);
    bursts = [];
  }
  function reveal() {
    button.classList.remove("hidden");
    button.focus({preventScroll:true});
  }
  panel.addEventListener("click", event => {
    if (event.target !== button) reveal();
  });
  panel.addEventListener("keydown", event => {
    if (event.target === panel && !event.repeat && ["Enter"," "].includes(event.key)) {
      event.preventDefault(); reveal();
    }
  });
  return { start, frame, close };
})();

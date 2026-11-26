/* Illustrated scenery in world coordinates. SVG paths are compiled once for Canvas. */
window.CartoonArena = (() => {
  const biomes = {
    desert: ["#f4cf8d", "#e8b97e", "#fff0bc", "#669c73", "cactus"],
    sea: ["#70c7d7", "#59b4ca", "#b9eff1", "#def9ee", "wave"],
    lagoon: ["#8ad9cb", "#73cbbb", "#cef3d7", "#ffab88", "star"],
    canyon: ["#e79c77", "#d58a71", "#ffd198", "#bf786a", "mesa"],
    basalt: ["#908da6", "#817e98", "#b9abc1", "#77758c", "mesa"],
    glacier: ["#bddfe7", "#a1ccd9", "#eaf7fa", "#8ccedb", "crystal"],
    marsh: ["#a6c792", "#90b68a", "#cfe1ac", "#7caa80", "reeds"],
  };
  // Each landmark has a silhouette and a second ink stroke for interior detail.
  const shapes = {
    cactus: ["M-4 12V4Q-13 4 -13 -4V-8Q-11 -12 -8 -8V-3Q-8 0 -4 0V-13Q0 -20 4 -13V-4Q9 -4 9 -8V-12Q12 -16 14 -12V-7Q14 1 4 2V12Z", "M0 -12V8"],
    wave: ["M-17 5Q-9 5 -4 -3Q2 -12 10 -7Q3 -7 4 -2Q6 4 16 4Q9 9 2 5Q-5 9 -17 5Z", "M-8 11Q-2 13 3 10"],
    star: ["M0 -13Q2 -14 5 -4L14 -3Q16 -2 8 4L10 13Q9 15 1 8L-8 13Q-11 14 -7 4L-14 -2Q-15 -4 -4 -4Z", "M0 -6L1 0 M6 7L4 4"],
    mesa: ["M-18 9L-11 -4L-5 -4L-2 -12L8 -12L13 0L18 9Z", "M-9 1L-4 1L0 -6 M7 -8L10 1"],
    crystal: ["M-12 6L-14 -4L-10 -8L-5 -4L-5 -11L2 -18L9 -10L8 1L13 -4L16 0L10 10L-4 13Z", "M2 -16L3 -8L0 9 M-10 -5L-5 6"],
    reeds: ["M0 12Q-11 5 -15 -8Q-6 -6 -1 5Q-3 -9 3 -15Q7 -6 3 6Q9 -4 15 -5Q11 6 3 12Z", "M1 10L3 -7"],
  };
  const motifs = Object.fromEntries(Object.entries(shapes).map(([key, paths]) =>
    [key, paths.map(d => new Path2D(d))]));
  function draw(ctx, scene, left, top, right, bottom) {
    const [base, band, cream, fill, shape] = biomes[scene.id];
    ctx.save();
    ctx.fillStyle = base;
    ctx.fillRect(left, top, right-left, bottom-top);
    ctx.lineCap = ctx.lineJoin = "round";
    for (let row = Math.floor(top / 165)-1; row <= Math.ceil(bottom / 165); row++) {
      const phase = row * 1.46 + scene.phase;
      const ridge = x => row*165 + 36*Math.sin(x/250+phase) + 15*Math.sin(x/94-phase);
      ctx.beginPath();
      for (let x = Math.floor(left/12)*12-12; x <= right+12; x+=12) {
        ctx.lineTo(x, ridge(x));
      }
      ctx.strokeStyle = band;
      ctx.lineWidth = 20;
      ctx.stroke();
      ctx.translate(0,-10);
      ctx.strokeStyle = cream;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.translate(0,10);
      for (let col=Math.floor(left/174)-1; col<=Math.ceil(right/174); col++) {
        const k = Math.sin(col*78.23 + phase*33.31)*14237;
        const t = k-Math.floor(k);
        const x = col*174+28+t*105, y = ridge(x)+44+t*48;
        ctx.save();
        ctx.translate(x,y);
        ctx.rotate((t-.5)*.55);
        ctx.scale(.8+t*.45,.8+t*.45);
        ctx.fillStyle = band;
        ctx.beginPath();
        ctx.ellipse(2,12,16,4,0,0,2*Math.PI);
        ctx.fill();
        const [body, detail] = motifs[shape];
        ctx.fillStyle = fill;
        ctx.strokeStyle = "#415253";
        ctx.lineWidth = 2;
        ctx.fill(body);
        ctx.stroke(body);
        ctx.strokeStyle = cream;
        ctx.stroke(detail);
        ctx.restore();
      }
    }
    ctx.restore();
  }
  return { draw };
})();

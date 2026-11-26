/* Illustrated scenery in world coordinates. SVG paths are compiled once for Canvas. */
window.CartoonArena = (() => {
  // World-space ink and flat-colour layers remain sharp at recording resolution.
  const maps = {
    sweets:   { ground: ["#f7c5b9","#ecacaa"], island: ["#dd9395","#ffe2b5","#f5c486"], props: ["pop","cupcake","mint"], route: "icing" },
    pirates:  { ground: ["#76cfc7","#43a9b0"], island: ["#dbebc7","#efca8d","#9bc581"], props: ["palm","chest","palm"], route: "wake" },
    clockwork:{ ground: ["#687891","#465670"], island: ["#38455c","#98a6aa","#8896a6"], props: ["gear","dial","gear"], route: "pipe" },
    fungi:    { ground: ["#97be93","#69a596"], island: ["#6b9983","#c2d592","#abca89"], props: ["cap","fern","cap"], route: "path" },
    luna:     { ground: ["#9999b5","#767e9c"], island: ["#bfc2cc","#727c98","#8e97ae"], props: ["rocket","crystal","crystal"], route: "tracks" },
    railway:  { ground: ["#ccdb9b","#91ba91"], island: ["#87aa85","#dfcc9e","#dfc790"], props: ["station","pine","pine"], route: "rails" },
    sakura:   { ground: ["#accbad","#8bb7ab"], island: ["#91aba6","#b9dad2","#89bdb9"], props: ["blossom","lantern","blossom"], route: "stones" },
  };
  const art = {};
  function symbol(name, layers) {
    art[name] = layers.map(([color, path]) => [color, new Path2D(path)]);
  }
  symbol("pop", [
    ["#fff2ce","M-3 0L2 -1L0 34Q-2 37 -4 33Z"],
    ["#ef7296","M0 -38C29 -37 31 4 4 9C-28 14 -33 -36 0 -38Z"],
    ["none","M-17 -16C-20 -34 10 -36 16 -17C22 3 -10 10 -14 -9C-17 -23 7 -28 9 -12C10 -5 -1 -5 -2 -13"],
  ]);
  symbol("cupcake",[
    ["#e49668","M-22 4L23 3L16 27Q0 33 -15 26Z"],
    ["#ffedf0","M-24 6Q-34 -4 -17 -10Q-21 -21 -5 -24Q7 -26 8 -37Q23 -29 15 -19Q31 -15 24 -5Q34 6 22 9Q13 14 7 6Q-1 14 -8 6Q-18 15 -24 6Z"],
    ["none","M-12 13L-9 24M0 14L0 26M12 13L10 24"],
  ]);
  symbol("mint",[["#b6dfcd","M-11 -5L-24 -13L-22 6L-12 4M10 -4L24 -10L21 9L10 5Z"],["#fcdf95","M0 -12C19 -12 18 13 0 13C-16 13 -18 -11 0 -12Z"],["none","M-6 -7Q2 -2 -4 6M3 -8Q10 -2 4 8"]]);
  symbol("palm",[
    ["#b47b52","M-9 22Q2 4 1 -18L7 -21Q12 1 0 25Z"],["#50a47d","M3 -17Q-18 -42 -34 -17Q-17 -22 -6 -12Q-25 -14 -23 9Q-12 -6 4 -12Q24 8 26 14Q31 -8 13 -17Q28 -22 39 -12Q33 -37 8 -23Q7 -39 -7 -42Q-2 -33 3 -17Z"],["none","M-5 16L2 17M-2 7L6 9M5 -19L19 -25"]]);
  symbol("chest",[["#b77951","M-23 -8L19 -14L27 -3L25 19L-16 26L-24 14Z"],["#edbb63","M-24 -7Q-25 -18 -14 -21L13 -25Q21 -24 23 -12L26 -4L-17 3Z"],["#ffe59b","M-3 -4L7 -6L8 6L-2 8Z"],["none","M-17 3L-16 21M-22 9L-17 13L24 5"]]);
  symbol("gear",[["#e1b963","M-8 -26L6 -26L8 -19L15 -17L21 -20L29 -9L23 -4L23 4L29 8L21 20L14 17L7 21L5 27L-8 26L-10 19L-17 15L-24 17L-30 5L-24 1L-23 -7L-28 -13L-19 -23L-12 -18L-8 -20Z"],["#76849a","M0 -11A11 11 0 1 1 -.1 -11Z"],["none","M-18 -6Q-17 -14 -10 -16"]]);
  symbol("dial",[["#dcac63","M0 -26A26 26 0 1 1 -.1 -26Z"],["#fff0bd","M0 -20A20 20 0 1 1 -.1 -20Z"],["none","M-14 0H-11M0 -15V-12M14 0H11M0 14V11M-8 -7L0 0L10 -9"]]);
  symbol("cap",[["#f4deac","M-8 0Q-6 13 -13 29Q0 37 13 27Q6 13 8 0Z"],["#ed8477","M-30 0Q-23 -30 -3 -32Q17 -34 31 -5Q36 4 20 7Q-1 13 -27 7Q-33 6 -30 0Z"],["#ffecc2","M-18 -9Q-18 -16 -10 -16Q-1 -12 -9 -7Q-16 -4 -18 -9ZM5 -22Q9 -27 14 -21Q14 -15 9 -16Q4 -16 5 -22Z"]]);
  symbol("fern",[["#74ad79","M0 22Q-26 9 -23 -12Q-5 -9 0 5Q-8 -13 6 -28Q15 -9 5 7Q16 -9 29 -8Q23 13 0 22Z"],["none","M0 19L6 -17M-3 12L-16 -4M5 15L21 -2"]]);
  symbol("rocket",[["#df816b","M-7 3L-21 23L-18 1L-8 -8M8 -2L20 5L22 22L9 13Z"],["#ede6d8","M-9 12Q-18 -13 0 -38Q20 -17 11 11Z"],["#82c6ca","M-1 -16A6 6 0 1 1 -1.1 -16Z"],["#e8b564","M-6 14L9 13L3 30L0 23L-3 27Z"]]);
  symbol("crystal",[["#b6c8eb","M-18 12L-22 -4L-13 -13L-6 -5L-4 -22L3 -31L12 -18L9 -1L17 -11L24 -6L15 16L-2 21Z"],["none","M3 -27L4 -15L0 14M-15 -7L-6 10M18 -6L12 10"]]);
  symbol("station",[["#f5dfaa","M-25 -9L19 -12L25 16L-23 21Z"],["#d97666","M-32 -8L-18 -27L15 -30L28 -13L19 -9L-24 -5Z"],["#798e96","M-5 17L-7 1L4 0L6 16ZM11 -1L18 -2L18 6L12 6Z"],["none","M-19 0L-13 -1L-12 7L-18 8Z"]]);
  symbol("pine",[["#ac8259","M-4 12H5L4 26H-5Z"],["#71a58a","M0 -31L17 -8L10 -9L24 13Q6 23 -23 15L-9 -6L-16 -4Z"],["none","M-8 -5L0 -10M4 10L12 8"]]);
  symbol("blossom",[["#a47a68","M-7 25L-2 3L-13 -7L-9 -9L2 -2L8 -14L12 -11L6 3L5 25Z"],["#ecacbc","M-26 1Q-39 -7 -28 -19Q-30 -33 -15 -33Q-7 -49 6 -39Q19 -46 25 -29Q41 -24 32 -11Q38 4 22 6Q9 18 0 9Q-14 16 -20 5Z"],["#ffe0dc","M-23 -20Q-20 -30 -10 -25Q-8 -19 -15 -18Q-18 -11 -23 -16ZM5 -32Q12 -36 15 -28Q13 -22 8 -25Q1 -23 5 -32Z"]]);
  symbol("lantern",[["#a59d99","M-13 23L-7 17L-5 3H5L7 16L14 21L14 25H-14Z"],["#ffe5ac","M-10 1V-13H10V1Z"],["#858d96","M-18 -12Q-7 -17 -2 -25H3Q9 -17 19 -13L16 -9H-15ZM-12 1H13L9 6H-8Z"],["none","M0 -10V0"]]);

  const landmarks = { sweets:"bakery", pirates:"sloop", clockwork:"tower", fungi:"burrow",
    luna:"dome", railway:"engine", sakura:"bridge" };
  symbol("sloop",[
    ["#a5684d","M-42 5Q-14 15 40 -2L23 20Q-2 34 -26 24Z"],
    ["#ffe2a1","M-39 7Q-9 17 38 0L33 6Q-5 23 -34 12Z"],
    ["#795044","M-4 13L-6 -42L-3 -44L1 12Z"],
    ["#fff2cb","M-9 -36L-8 1Q-23 -5 -36 1Q-22 -15 -9 -36ZM0 -36Q20 -23 27 -7Q15 -8 1 0Q8 -17 0 -36Z"],
    ["#db6967","M-5 -43Q5 -50 14 -42Q7 -44 -4 -37Z"]]);
  symbol("bakery",[
    ["#c88a63","M-26 24V-10L0 -34L27 -10V22Z"],
    ["#fff1d1","M-34 -9L-2 -43L34 -12Q31 -4 25 -9Q20 0 16 -8L0 -26L-18 -7Q-22 -1 -26 -7Q-31 -2 -34 -9Z"],
    ["#c85e80","M-5 24V10Q-5 -2 6 -1Q13 0 13 9V23Z"],
    ["#ffe7a6","M-21 1H-10V12H-21ZM15 -34V-45H23V-25Z"]]);
  symbol("tower",[["#bf996c","M-16 26L-14 -18H14L18 23Z"],["#61738a","M-23 -17L0 -41L23 -17Z"],["#ffe8ae","M0 -15A12 12 0 1 1 -.1 -15Z"],["none","M-6 -7L0 -3L6 -10M-6 15H9M-7 20H11"]]);
  symbol("burrow",[["#f2d6a1","M-17 22L-14 -8H15L20 20Z"],["#db776b","M-32 -8Q-13 -52 8 -41Q25 -30 34 -9Q25 1 0 -2Q-17 1 -32 -8Z"],["#ffe9bc","M-18 -18Q-18 -26 -10 -25Q-4 -22 -9 -17Q-15 -13 -18 -18ZM7 -31Q13 -35 17 -27Q13 -21 7 -25Z"],["#799c90","M-7 22V11Q-7 0 2 1Q9 2 9 11V21Z"]]);
  symbol("dome",[["#c6c6d6","M-31 7Q0 -6 31 5L32 17Q1 31 -30 17Z"],["#91c4d5","M-28 8Q-25 -27 -2 -26Q24 -29 30 7Q3 21 -28 8Z"],["none","M-2 -25Q-14 -15 -13 12M0 -24Q14 -13 15 12M-22 -8Q0 0 23 -8M19 -23L27 -37"],["#ffe7a2","M26 -41A4 4 0 1 1 25.9 -41Z"]]);
  symbol("engine",[["#86b9ac","M-29 9V-25H-7V-7L18 -10L28 -3V11Z"],["#d37b66","M-33 -26L-8 -31L-3 -24L-30 -19ZM12 -10L10 -24L21 -26L20 -11Z"],["#f6d696","M-24 -17L-14 -18V-7L-24 -6Z"],["#647785","M-25 9A8 8 0 1 1 -25.1 9ZM0 8A7 7 0 1 1 -.1 8ZM18 7A6 6 0 1 1 17.9 7Z"],["none","M-25 17L19 13"]]);
  symbol("bridge",[["#ab665b","M-39 14Q-2 -12 38 10L38 19Q0 -2 -38 24Z"],["#df8a75","M-37 8Q0 -17 37 3L37 8Q0 -10 -37 13Z"],["none","M-36 18V3M-18 8V-5M0 4V-9M19 6V-6M36 12V0"]]);

  function noise(x,y,phase) {
    const n = Math.sin(x*91.43+y*37.82+phase)*41589.73;
    return n-Math.floor(n);
  }
  function draw(ctx, scene, left, top, right, bottom) {
    const map = maps[scene.id];
    ctx.save();
    ctx.lineCap = ctx.lineJoin = "round";
    const sky = ctx.createLinearGradient(0,0,scene.size,scene.size);
    sky.addColorStop(0,map.ground[0]); sky.addColorStop(1,map.ground[1]);
    ctx.fillStyle=sky; ctx.fillRect(left,top,right-left,bottom-top);
    const stroke=(path,color,width,dashes=[])=>{
      ctx.strokeStyle=color; ctx.lineWidth=width; ctx.setLineDash(dashes);
      ctx.stroke(path); ctx.setLineDash([]);
    };
    const span=440;
    for(let j=Math.floor(top/span)-1;j<=Math.ceil(bottom/span);j++){
      // Long paths share fixed world coordinates, so dashes stay put as the camera moves.
      const path=new Path2D();
      for(let x=-64;x<=scene.size+64;x+=16){
        const y=j*span+67*Math.sin(x/265+j+scene.phase)+36*Math.cos(x/130-j);
        if(x===-64) path.moveTo(x,y); else path.lineTo(x,y);
      }
      switch(map.route){
        case "rails": stroke(path,"#96785b",25,[5,11]); stroke(path,"#566778",15); stroke(path,"#bdd398",9); break;
        case "icing": stroke(path,"#d68c99",31); stroke(path,"#f6a9bb",27); stroke(path,"#ffe1cf",7,[9,16]); break;
        case "pipe": stroke(path,"#3d4b61",18); stroke(path,"#b29472",14); stroke(path,"#e5c68e",3); stroke(path,"#546274",17,[3,64]); break;
        case "tracks": stroke(path,"#6e7991",13,[2,8]); break;
        case "wake": stroke(path,"#cef0dd",2,[12,8,2,31]); break;
        case "stones": stroke(path,"#d9d6b6",17,[9,19]); break;
        default: stroke(path,"#c9c193",24); stroke(path,"#e0d4ac",13);
      }
    }
    for(let row=Math.floor(top/270)-1;row<=Math.ceil(bottom/270);row++){
      for(let col=Math.floor(left/310)-1;col<=Math.ceil(right/310);col++){
        const u=noise(col,row,scene.phase), v=noise(row,col,scene.phase+4);
        const x=(col+.2+.64*u)*310, y=(row+.2+.6*v)*270;
        ctx.save();
        ctx.translate(x-85, y+75);
        ctx.rotate(v-.5);
        if (scene.id === "luna") {
          for (let i=0;i<3;i++) {
            const size=(3-i)*(5+3*u);
            ctx.fillStyle="#69738d"; ctx.beginPath();ctx.ellipse(i*23,i*7,size,size*.65,0,0,Math.PI*2);ctx.fill();
            ctx.strokeStyle="#c4c3ce";ctx.lineWidth=2;ctx.stroke();
          }
        } else if (scene.id === "sakura" || scene.id === "sweets") {
          ctx.fillStyle=scene.id === "sakura" ? "#f9d6db" : "#ffebd1";
          for (let i=0;i<6;i++) {
            ctx.beginPath();ctx.ellipse(i*8,Math.sin(v*8+i)*11,4.3,2,i*.7,0,Math.PI*2);ctx.fill();
          }
        } else if (scene.id === "pirates") {
          const crest=new Path2D("M-27 2Q-15 7 -4 0Q6 -6 17 -3M-8 8Q0 10 9 6");
          stroke(crest,"#bce8dc",2);
        } else if (scene.id === "clockwork") {
          const plate=new Path2D("M-26 -9H18L26 -2V11H-19L-26 5Z");
          stroke(plate,"#46576c",1.5);
          for(const px of [-19,18]) {ctx.fillStyle="#b6b5a3";ctx.beginPath();ctx.arc(px,1,2.5,0,Math.PI*2);ctx.fill();}
        } else {
          const grass=new Path2D("M-10 3L-13 -4M-7 3L-6 -6M-4 3L0 -2M14 8L12 4M17 8L19 3");
          stroke(grass,"#618b7788",1.6);
        }
        ctx.restore();
        ctx.save(); ctx.translate(x,y);
        ctx.scale(.75+.45*v,.75+.45*v);
        const island=new Path2D();
        island.moveTo(-66,-7);
        island.bezierCurveTo(-72,-35,-23,-35-u*22,9,-32);
        island.bezierCurveTo(39,-29,84,-21,70,6);
        island.bezierCurveTo(58,31,27,26,2,36);
        island.bezierCurveTo(-31,45,-67,22,-66,-7);
        ctx.rotate((u-.5)*.8);
        ctx.fillStyle=map.island[0];ctx.fill(island);
        ctx.translate(0,-4);ctx.fillStyle=map.island[1];ctx.fill(island);
        ctx.save();ctx.scale(.87,.77);ctx.fillStyle=map.island[2];ctx.fill(island);ctx.restore();
        ctx.rotate((.5-u)*.8);
        // A landmark, a smaller companion and short ground marks form each vignette.
        for(let i=0;i<2;i++){
          ctx.save();ctx.translate(i?30:-15,i?11:0);
          const scale=i?.44+u*.16:.86+.22*v;
          ctx.scale(scale,scale);
          ctx.fillStyle="#26344927";ctx.beginPath();ctx.ellipse(4,18,27,7,-.08,0,Math.PI*2);ctx.fill();
          const focal = (col === Math.floor(scene.size/620) && row === Math.floor(scene.size/540)) || u > .78;
          const prop = focal && i === 0 ? landmarks[scene.id]
            : map.props[(Math.floor(u*map.props.length)+i)%map.props.length];
          for(const [color,path] of art[prop]){
            if(color!=="none"){ctx.fillStyle=color;ctx.fill(path);}
            stroke(path,color==="none"?"#594d65a0":"#423c52",color==="none"?1.7:1.9);
          }
          ctx.restore();
        }
        for(let i=0;i<4;i++){
          ctx.fillStyle=i%2?"#fff4d580":"#4c525733";ctx.beginPath();
          ctx.ellipse(-44+i*17,21+Math.sin(i+v)*6,3,1.4,-.3,0,Math.PI*2);ctx.fill();
        }
        ctx.restore();
      }
    }
    ctx.restore();
  }
  // Two adjacent repeats allow a curved body slice to cross the repeat boundary.
  const ribbons = new WeakMap();
  function ribbon(texture) {
    if (ribbons.has(texture)) return ribbons.get(texture);
    const tile = document.createElement("canvas");
    const period = texture.width * 3;
    tile.width = 2 * period;
    tile.height = texture.height;
    const paint = tile.getContext("2d");
    for (const start of [0, period]) {
      paint.drawImage(texture, 0, 0, 1, tile.height, start, 0, texture.width, tile.height);
      paint.drawImage(texture, start + texture.width, 0);
      paint.drawImage(texture, texture.width-1, 0, 1, tile.height,
        start + 2*texture.width, 0, texture.width, tile.height);
    }
    ribbons.set(texture, tile);
    return tile;
  }

  const ink = "#172334";
  const dome = new Path2D("M-1.05 .68 C-1.6 .03 -1.16 -1.18 -.31 -1.42 C.38 -1.62 1.02 -1.29 1.19 -.68 C1.52 -.15 1.36 .67 .74 .97 C.04 1.38 -.62 1.19 -1.05 .68Z");
  const muzzle = new Path2D("M.32 .7 C.12 .49 .36 .17 .64 -.06 C.99 -.44 1.53 -.51 1.74 -.18 C2.05 .33 1.69 .77 1.2 .93 C.86 1.06 .49 .94 .32 .7Z");
  function drawHead(ctx,r,texture,color,gaze) {
    ctx.save();
    ctx.scale(r,r);
    ctx.lineWidth=.095;
    ctx.strokeStyle=ink;
    ctx.fillStyle="#c9dce5";
    ctx.fill(dome);
    ctx.save();
    ctx.clip(dome);
    ctx.fillStyle="#fffefa";
    ctx.beginPath();
    ctx.ellipse(.12,-.35,1.44,1.42,-.2,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
    ctx.stroke(dome);

    function eye(x,y,rx,ry) {
      ctx.beginPath();
      ctx.ellipse(x,y,rx,ry,-.19,0,Math.PI*2);
      ctx.fillStyle="#fff4d9";
      ctx.fill();
      ctx.stroke();
      const px=x+Math.cos(gaze)*rx*.36, py=y+Math.sin(gaze)*ry*.36;
      ctx.fillStyle="#191923";
      ctx.beginPath();
      ctx.ellipse(px,py,rx*.42,ry*.45,-.15,0,Math.PI*2);
      ctx.fill();
      ctx.fillStyle="white";
      ctx.beginPath();
      ctx.arc(px-.06,py-.09,rx*.13,0,Math.PI*2);
      ctx.fill();
    }
    eye(.72,-.78,.52,.62);
    ctx.fillStyle=color;
    ctx.fill(muzzle);
    if (texture) {
      ctx.save();
      ctx.clip(muzzle);
      ctx.drawImage(texture,2,45,1,1,.1,-.55,1.9,1.7);
      ctx.restore();
    }
    ctx.stroke(muzzle);
    ctx.beginPath();
    ctx.ellipse(1.55,-.12,.1,.045,.5,0,Math.PI*2);
    ctx.fillStyle="#ffffffde";
    ctx.fill();
    ctx.fillStyle="#23344799";
    for (const [x,y] of [[1.13,.32],[1.31,.22],[1.35,.43]]) {
      ctx.beginPath();
      ctx.arc(x,y,.045,0,Math.PI*2);
      ctx.fill();
    }
    eye(.02,-.03,.59,.68);
    ctx.restore();
  }
  return { draw, drawHead, ribbon };
})();

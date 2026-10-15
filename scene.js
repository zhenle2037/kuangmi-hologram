/* 數珠 3D 層（three.js）：紙感背景上的念珠、拉近特寫、引線與文字入口。
 * 內容與珠位模型由 app.js（KM）提供；本檔只負責畫面。 */
(function () {
  "use strict";
  var API = (window.KM3D = {});
  var T = window.THREE, G = window.gsap;
  var KM, D, host, stage, renderer, scene, camera, controls, malaGroup, galaxyGroup, baseGroup;
  var GY = 1.85, R = 26, TAU = Math.PI * 2, FOV = 45, ZC = [0x6fe3f0, 0xffd27a, 0xc9a8ff, 0xff8f9d];
  var W = 1, H = 1, narrow = false, offX = 0, offY = 0;
  var hulls = [], hoverHull = null, ray = null, beads = [], guru, tassel, stringMesh, ringLocal = [], segs = [], reading = false, readerEl = null, YAX = new THREE.Vector3(0, 1, 0), tmpQ = new THREE.Quaternion(), tmp3 = new THREE.Vector3(), tmp4 = new THREE.Vector3();
  var paused = false, reduce = false, lines = true, selected = null, focused = false, mode = "mala", labelSet = "parts";
  var hover = null, down = null, userDrag = false, spinV = 0, bobAmp = 1, tt = 0, rotTween = null, built = false;
  var labelDefs = [], labelEls = [], fanEls = [], leaderPaths = {};
  var leaders, labelsBox, calloutEl, fanBox, mainLeader, crosshair, quoteEl, bookStele;
  var tmp = new T.Vector3(), tmp2 = new T.Vector3();
  var cands = [];

  /* ---------- 工具 ---------- */
  function glowTexture() {
    var c = document.createElement("canvas"); c.width = c.height = 64;
    var g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.25, "rgba(255,255,255,.45)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  }
  function wrapNear(target, cur) { var d = (((target - cur) % TAU) + 3 * Math.PI) % TAU - Math.PI; return cur + d; }
  function toScreen(v) { tmp2.copy(v).project(camera); return { x: (tmp2.x * .5 + .5) * W, y: (-tmp2.y * .5 + .5) * H, z: tmp2.z }; }
  function pxPerUnit(worldPos) { var d = camera.position.distanceTo(worldPos); return (H / 2) / (Math.tan(FOV * Math.PI / 360) * d); }
  function aEff() { return Math.max(0.5, (W - (narrow ? 0 : 2 * offX)) / H); }

  /* ---------- 建構 ---------- */
  API.init = function (km) {
    KM = km; D = km.D;
    if (G.ticker && G.ticker.lagSmoothing) G.ticker.lagSmoothing(0); // 慢裝置上鏡頭動畫仍準時完成
    host = document.getElementById("canvas-container"); stage = document.getElementById("stage");
    leaders = document.getElementById("leaders"); labelsBox = document.getElementById("labels");
    calloutEl = document.getElementById("callout"); fanBox = document.getElementById("fan");
    crosshair = document.getElementById("crosshair"); quoteEl = document.getElementById("main-quote"); bookStele = document.getElementById("book-stele");
    reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) { return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.38; // 柔和高光，避免過曝
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap; renderer.physicallyCorrectLights = false;
    host.appendChild(renderer.domElement);

    scene = new T.Scene();
    camera = new T.PerspectiveCamera(FOV, 1, 0.1, 1000);
    controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.06; controls.enablePan = false;
    controls.minDistance = 2; controls.maxDistance = 140; controls.minPolarAngle = 0.3; controls.maxPolarAngle = 1.5;
    controls.rotateSpeed = 0.6;

    scene.add(new T.HemisphereLight(0xfff6e8, 0xdcc8aa, 0.46));
    var dl = new T.DirectionalLight(0xfffaf2, 0.55); dl.position.set(-14, 60, 26); dl.castShadow = true;
    dl.shadow.mapSize.set(2048, 2048); dl.shadow.radius = 9; dl.shadow.bias = -0.0005;
    var sc = dl.shadow.camera; sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 1; sc.far = 140; scene.add(dl);
    var fl = new T.DirectionalLight(0xf3f0ea, 0.22); fl.position.set(30, 10, 60); scene.add(fl);

    buildGalaxy(); buildBase(); buildMala(); buildLabels();
    resize();
    camera.position.copy(overviewPos()); controls.target.set(0, 0, 0); controls.update();
    malaGroup.rotation.y = Math.PI; // 初始：第 108 顆（兼作佛頭珠）在後方
    applyTargets(true);

    var el = renderer.domElement;
    el.addEventListener("pointermove", onMove); el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp); el.addEventListener("pointerleave", function () { setHover(null); });
    el.addEventListener("pointercancel", function () { down = null; userDrag = false; });
    window.addEventListener("resize", resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
    built = true;
    requestAnimationFrame(loop);
    return true;
  };

  function buildGalaxy() { galaxyGroup = new T.Group(); scene.add(galaxyGroup); }

  function buildBase() { // 地面：只接收念珠的柔和陰影
    baseGroup = new T.Group(); baseGroup.position.y = -9; scene.add(baseGroup);
    var g = new T.Mesh(new T.PlaneGeometry(400, 400), new T.ShadowMaterial({ opacity: 0.11 }));
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true; baseGroup.add(g);
  }

  /* ---------- 材質：星月菩提子、紅瑪瑙（程式產生貼圖，不需外部圖檔） ---------- */
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function bodhiTextures(seed) { // 等距長方投影：v=0/1 為穿孔兩極（朝向相鄰珠）
    var w = 512, h = 256, r = rng(seed), K = 2; // 以 2 倍解析度繪製（1024×512）
    var c = document.createElement("canvas"), b = document.createElement("canvas"); c.width = b.width = w * K; c.height = b.height = h * K;
    var g = c.getContext("2d"), gb = b.getContext("2d"); g.scale(K, K); gb.scale(K, K);
    var grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "#d9cbb3"); grd.addColorStop(0.08, "#efe7da"); grd.addColorStop(0.5, "#fcf6ea"); grd.addColorStop(0.92, "#efe7da"); grd.addColorStop(1, "#d9cbb3");
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    gb.fillStyle = "#808080"; gb.fillRect(0, 0, w, h);
    var i, x, y, a;
    for (i = 0; i < 4200; i++) { // 霧面細紋
      x = r() * w; y = r() * h; a = r() * 0.045;
      g.fillStyle = r() < 0.5 ? "rgba(255,253,248," + a + ")" : "rgba(160,130,95," + a + ")"; g.fillRect(x, y, 1 + r() * 2, 1);
      gb.fillStyle = "rgba(" + (r() < 0.5 ? "255,255,255" : "0,0,0") + "," + a * 2 + ")"; gb.fillRect(x, y, 1 + r() * 2, 1);
    }
    [0, h].forEach(function (py) { // 月：穿孔周圍的凹環
      var mg = g.createLinearGradient(0, py, 0, py === 0 ? 26 : h - 26);
      mg.addColorStop(0, "rgba(140,105,70,.4)"); mg.addColorStop(1, "rgba(140,105,70,0)"); g.fillStyle = mg; g.fillRect(0, py === 0 ? 0 : h - 26, w, 26);
      var bg2 = gb.createLinearGradient(0, py, 0, py === 0 ? 20 : h - 20); bg2.addColorStop(0, "rgba(0,0,0,.6)"); bg2.addColorStop(1, "rgba(0,0,0,0)"); gb.fillStyle = bg2; gb.fillRect(0, py === 0 ? 0 : h - 20, w, 20);
    });
    // 星：細小清晰的深褐凹點，靠兩極橫向拉長以抵銷投影
    var N = 380 + Math.floor(r() * 120);
    for (i = 0; i < N; i++) {
      y = h * (0.1 + r() * 0.8); x = r() * w;
      var lat = Math.sin(Math.PI * y / h), sz = 0.7 + Math.pow(r(), 2.2) * 1.9, stretch = 1 / Math.max(0.3, lat);
      var al = 0.82 + r() * 0.18, d0 = Math.floor(70 + r() * 35);
      [x, x - w, x + w].forEach(function (xx) {
        if (xx < -8 || xx > w + 8) return;
        g.save(); g.translate(xx, y); g.scale(stretch, 1);
        var rg = g.createRadialGradient(0, 0, 0, 0, 0, sz * 1.5);
        rg.addColorStop(0, "rgba(" + d0 + "," + Math.floor(d0 * 0.62) + "," + Math.floor(d0 * 0.38) + "," + al + ")");
        rg.addColorStop(0.55, "rgba(" + (d0 + 20) + "," + Math.floor((d0 + 20) * 0.66) + "," + Math.floor((d0 + 20) * 0.42) + "," + al * 0.85 + ")");
        rg.addColorStop(1, "rgba(190,150,110,0)");
        g.fillStyle = rg; g.beginPath(); g.arc(0, 0, sz * 1.5, 0, TAU); g.fill(); g.restore();
        gb.save(); gb.translate(xx, y); gb.scale(stretch, 1); gb.fillStyle = "rgba(0,0,0,.85)"; gb.beginPath(); gb.arc(0, 0, sz * 1.1, 0, TAU); gb.fill(); gb.restore();
      });
    }
    var t1 = new T.CanvasTexture(c), t2 = new T.CanvasTexture(b);
    t1.anisotropy = t2.anisotropy = 8;
    return { map: t1, bump: t2, canvas: c };
  }
  function threadTexture(dir, base, dark) { // 絲線紋理：dir="h" 橫向纏繞、"v" 直向流蘇、"d" 斜向編繩
    var c = document.createElement("canvas"); c.width = 256; c.height = 256; var g = c.getContext("2d"), r = rng(dir.charCodeAt(0) * 31);
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 256; i += 2) {
      g.strokeStyle = "rgba(" + (r() < 0.5 ? "255,220,200," + (0.05 + r() * 0.12) : dark + "," + (0.15 + r() * 0.3)) + ")"; g.lineWidth = 1 + r();
      g.beginPath();
      if (dir === "h") { g.moveTo(0, i); g.lineTo(256, i + (r() - 0.5) * 2); }
      else if (dir === "v") { g.moveTo(i, 0); g.lineTo(i + (r() - 0.5) * 3, 256); }
      else { g.moveTo(i - 64, 0); g.lineTo(i + 64, 256); g.moveTo(i + 64, 0); g.lineTo(i - 64, 256); }
      g.stroke();
    }
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; return t;
  }
  function agateTexture() {
    var w = 512, h = 256, r = rng(77), c = document.createElement("canvas"); c.width = w; c.height = h;
    var g = c.getContext("2d"); g.fillStyle = "#3c0307"; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 34; i++) { // 瑪瑙的層狀色帶（深紅中帶較透亮的紅）
      g.strokeStyle = "rgba(" + (r() < 0.55 ? "120,8,16" : "18,0,2") + "," + (0.08 + r() * 0.16) + ")"; g.lineWidth = 3 + r() * 16;
      g.beginPath(); var y0 = r() * h; g.moveTo(0, y0); for (var x = 0; x <= w; x += 16) g.lineTo(x, y0 + Math.sin(x / 60 + i) * 9 + (r() - 0.5) * 5); g.stroke();
    }
    var t = new T.CanvasTexture(c); t.anisotropy = 8; return t;
  }
  function buildEnv() { // 柔光棚環境貼圖：讓菩提子與瑪瑙有自然反光
    var es = new T.Scene(), geo = new T.SphereGeometry(50, 32, 16), cols = [], p = geo.attributes.position, cc = new T.Color();
    for (var i = 0; i < p.count; i++) { var yy = p.getY(i) / 50; cc.setRGB(0.55 + 0.45 * Math.max(0, yy), 0.5 + 0.43 * Math.max(0, yy), 0.42 + 0.4 * Math.max(0, yy)); if (yy < 0) cc.multiplyScalar(0.75 + 0.25 * (1 + yy)); cols.push(cc.r, cc.g, cc.b); }
    geo.setAttribute("color", new T.Float32BufferAttribute(cols, 3));
    es.add(new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    [[-20, 30, 20, 26, 14], [25, 18, 30, 16, 10]].forEach(function (a) { var m = new T.Mesh(new T.PlaneGeometry(a[3], a[4]), new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide })); m.position.set(a[0], a[1], a[2]); m.lookAt(0, 0, 0); es.add(m); });
    var pm = new T.PMREMGenerator(renderer), tex = pm.fromScene(es, 0.03).texture; pm.dispose();
    return tex;
  }

  var ANG = [], RAD = [], RB = 0.62, RS = 0.76, RG = 1.0, tasselPivot = null, towerTip = null;
  function buildMala() {
    malaGroup = new T.Group(); scene.add(malaGroup);
    scene.environment = buildEnv();
    // 珠位角度：依各珠大小緊密排列（第 108 顆隔珠兼作佛頭珠，較大），第 108 顆在角度 0
    var n, sum = 0;
    for (n = 1; n <= 108; n++) { RAD[n] = n === 108 ? RG : KM.BEADS[n].spacer ? RS : RB; sum += 2 * RAD[n]; }
    var gap = (TAU * R - sum) / 108; ANG[108] = 0;
    for (n = 1; n <= 107; n++) ANG[n] = ANG[n - 1 || 108] + (RAD[n - 1 || 108] + gap + RAD[n]) / R;
    for (n = 1; n <= 107; n++) ANG[n] = -ANG[n]; // 依手繪箭頭方向計數：佛頭（隔珠一）→見→隔珠二→修→隔珠三→行→隔珠四→果
    var geoR = new T.SphereGeometry(RB, 48, 32), geoM = new T.SphereGeometry(RS, 48, 32), geoG = new T.SphereGeometry(RG, 64, 44);
    var BT = [11, 23, 37, 59, 71, 97].map(bodhiTextures), agate = agateTexture(), YA = new T.Vector3(0, 1, 0), r = rng(2024);
    function bodhiMat(k) { var tx = BT[k % BT.length]; return new T.MeshPhysicalMaterial({ map: tx.map, bumpMap: tx.bump, bumpScale: 0.022, color: 0xffffff, emissive: 0xffe2b8, emissiveIntensity: 0, roughness: 0.8, metalness: 0, clearcoat: 0, envMapIntensity: 0.28, transparent: true, opacity: 1 }); }
    function agateMat() { return new T.MeshPhysicalMaterial({ map: agate, color: 0x9c7474, emissive: 0x3a0205, emissiveIntensity: 0, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 0.75, reflectivity: 0.8, transparent: true, opacity: 0.93, depthWrite: true }); }
    var agateCore = new T.MeshBasicMaterial({ color: 0x2c0104 }); // 內層透光，讓瑪瑙有深處的紅光
    var holeGeo = new T.CircleGeometry(0.135, 28), holeMat = new T.MeshStandardMaterial({ color: 0x6e5236, roughness: 1, transparent: true }), holeMatA = new T.MeshStandardMaterial({ color: 0x1e0204, roughness: 0.6, transparent: true });
    for (n = 1; n <= 108; n++) {
      var b = KM.BEADS[n], th = ANG[n], grp = new T.Group(), rr = RAD[n];
      var core = new T.Mesh(b.spacer ? (n === 108 ? geoG : geoM) : geoR, b.spacer ? agateMat() : bodhiMat(n * 7));
      core.castShadow = true;
      var tan = new T.Vector3(Math.cos(th), 0, -Math.sin(th));
      var spin = new T.Quaternion().setFromAxisAngle(YA, r() * TAU);
      core.quaternion.setFromUnitVectors(YA, tan).multiply(spin);
      [1, -1].forEach(function (sg) { // 珠孔：兩極的深色凹孔，串繩由此穿入
        var hole = new T.Mesh(holeGeo, (b.spacer ? holeMatA : holeMat).clone()); hole.position.y = sg * rr * 0.992; hole.rotation.x = sg > 0 ? -Math.PI / 2 : Math.PI / 2; hole.scale.setScalar(rr / RB); core.add(hole);
      });
      var wire = new T.Object3D(); wire.material = {}; var glow = new T.Object3D(); glow.material = {};
      if (b.spacer) { var inner = new T.Mesh(new T.SphereGeometry(rr * 0.72, 32, 24), agateCore); grp.add(inner); }
      grp.add(core, wire, glow);
      grp.position.set(Math.sin(th) * R, 0, Math.cos(th) * R);
      malaGroup.add(grp);
      var o = { n: n, grp: grp, core: core, spin: spin, inner: b.spacer ? grp.children[0] : null, wire: wire, glow: glow, spacer: b.spacer, z: b.z, assigned: !!b.term, r: rr * 1.04, base: b.spacer ? 0.93 : 1,
        cur: { op: 1, em: 0.5, wo: 0, go: 0 }, tgt: { op: 1, em: 0.5, wo: 0, go: 0 }, sc: 1 };
      beads[n] = o;
      cands.push({ obj: grp, rad: n === 108 ? 1.3 : b.spacer ? 1.05 : 0.9, bead: o });
    }
    // 串繩（連續圓環，貫穿所有珠心）
    var cordMat = new T.MeshStandardMaterial({ color: 0x9e3a30, roughness: 0.85, envMapIntensity: 0.3 });
    // 串繩：逐段連接相鄰兩顆珠的珠孔，隨珠子一起擺動（不再是與珠體分離的固定圓環）
    stringMesh = new T.Group(); malaGroup.add(stringMesh);
    var segGeo = new T.CylinderGeometry(0.085, 0.085, 1, 12, 1, true);
    for (n = 1; n <= 108; n++) { var sm = new T.Mesh(segGeo, cordMat.clone()); sm.material.transparent = true; sm.userData.op = 1; stringMesh.add(sm); segs[n] = sm; }
    for (var i = 0; i < 128; i++) { var a = i / 128 * TAU; ringLocal.push(new T.Vector3(Math.sin(a) * R, 0, Math.cos(a) * R)); }

    // 佛頭：隔珠一（環上第 108 顆）兼作佛頭珠；三層三通塔頭沿半徑水平朝外（90°）
    var towerMat = bodhiMat(5);
    guru = new T.Group(); guru.position.set(0, 0, R + RG - 0.12); malaGroup.add(guru);
    var tower = new T.Group(); tower.rotation.x = Math.PI / 2; guru.add(tower); // 幾何沿 y 建造，旋轉後指向 +z（外側）
    var tiers = [[0.5, 0.46, 0.26], [0.42, 0.38, 0.24], [0.33, 0.29, 0.22]], yy = 0;
    tiers.forEach(function (t, i) {
      var m = new T.Mesh(new T.CylinderGeometry(t[1], t[0], t[2], 48), towerMat); m.position.y = yy + t[2] / 2; m.castShadow = true; tower.add(m);
      var lip = new T.Mesh(new T.TorusGeometry(t[0] - 0.01, 0.045, 12, 48), towerMat); lip.rotation.x = Math.PI / 2; lip.position.y = yy + 0.02; tower.add(lip);
      yy += t[2] + 0.035; // 層間細縫
    });
    var dome = new T.Mesh(new T.SphereGeometry(0.29, 32, 16, 0, TAU, 0, Math.PI / 2), towerMat); dome.scale.y = 0.55; dome.position.y = yy - 0.02; tower.add(dome);
    var tipLocal = yy + 0.12;
    cands.push({ act: "part:head", obj: guru, rad: 0.9 });
    // 飾穗：自塔頭末端出繩，受重力垂下；結下兩股，各串 6 顆中菩提子，尾端為絲線流蘇繩頭
    var redSilk = "#4a0a10", braid = threadTexture("d", redSilk, "20,0,4"); braid.repeat.set(1, 18);
    var cordM = new T.MeshStandardMaterial({ color: 0xffffff, map: braid, roughness: 0.7, envMapIntensity: 0.35 });
    var wrapT = threadTexture("h", redSilk, "25,0,5"); wrapT.repeat.set(1, 3);
    var wrapM = new T.MeshStandardMaterial({ color: 0xffffff, map: wrapT, roughness: 0.5, envMapIntensity: 0.45 });
    var fringeT = threadTexture("v", redSilk, "18,0,3"); fringeT.repeat.set(10, 1);
    var fringeM = new T.MeshStandardMaterial({ color: 0xffffff, map: fringeT, roughness: 0.45, envMapIntensity: 0.5, side: T.DoubleSide });
    var tip = new T.Vector3(0, 0, R + RG - 0.12 + tipLocal);
    tasselPivot = new T.Group(); tasselPivot.position.copy(tip); malaGroup.add(tasselPivot);
    tassel = new T.Group(); tasselPivot.add(tassel);
    var hang = new T.CubicBezierCurve3(new T.Vector3(0, 0, -0.05), new T.Vector3(0, 0.05, 0.2), new T.Vector3(0, -0.15, 0.32), new T.Vector3(0, -0.55, 0.32));
    tassel.add(new T.Mesh(new T.TubeGeometry(hang, 24, 0.055, 8, false), cordM));
    var k1 = new T.Mesh(new T.TorusKnotGeometry(0.15, 0.06, 80, 10, 2, 3), cordM); k1.position.set(0, -0.68, 0.32); tassel.add(k1);
    var MB = 0.21; // 中菩提子
    [-1, 1].forEach(function (sd, si) {
      var A = new T.Vector3(sd * 0.04, -0.82, 0.32), x1 = sd * 0.26, yTop = -0.95, yLast = yTop - MB - 5 * 2 * MB, yCap = yLast - MB - 0.28;
      var B = new T.Vector3(x1, yCap, 0.32);
      tassel.add(new T.Mesh(new T.TubeGeometry(new T.LineCurve3(A, B), 12, 0.035, 6, false), cordM));
      for (var j = 0; j < 6; j++) {
        var y1 = yTop - MB - j * 2 * MB, f = (y1 - A.y) / (B.y - A.y);
        var bm = new T.Mesh(new T.SphereGeometry(MB, 32, 24), bodhiMat(j + si * 3)); bm.position.set(A.x + (B.x - A.x) * f, y1, 0.32); bm.rotation.set(r() * 3, r() * 3, 0); bm.castShadow = true; tassel.add(bm);
      }
      // 繩頭：編繩小結、纏線圓帽、束口、絲線流蘇（含散開的線尾）
      var head = new T.Group(); head.position.set(x1, yCap, 0.32); tassel.add(head);
      var sk = new T.Mesh(new T.TorusGeometry(0.075, 0.035, 10, 24), cordM); sk.rotation.x = Math.PI / 2; sk.position.y = 0.06; head.add(sk);
      var capM = new T.Mesh(new T.SphereGeometry(0.17, 32, 24), wrapM); capM.scale.set(1, 0.9, 1); capM.position.y = -0.12; head.add(capM);
      var collar = new T.Mesh(new T.CylinderGeometry(0.12, 0.14, 0.16, 32), wrapM); collar.position.y = -0.33; head.add(collar);
      var band = new T.Mesh(new T.TorusGeometry(0.135, 0.02, 8, 32), cordM); band.rotation.x = Math.PI / 2; band.position.y = -0.4; head.add(band);
      var FL = 1.35, fr = new T.Mesh(new T.CylinderGeometry(0.135, 0.26, FL, 64, 1, true), fringeM); fr.position.y = -0.41 - FL / 2; head.add(fr);
      var frIn = new T.Mesh(new T.CylinderGeometry(0.11, 0.2, FL * 0.97, 32), fringeM); frIn.position.y = fr.position.y; head.add(frIn);
      var lines = []; for (var q = 0; q < 140; q++) { var aq = r() * TAU, rq = 0.12 + r() * 0.13, yb = -0.41 - FL * (0.88 + r() * 0.12); lines.push(new T.Vector3(Math.cos(aq) * 0.12, -0.42, Math.sin(aq) * 0.12), new T.Vector3(Math.cos(aq) * rq * 1.05, yb, Math.sin(aq) * rq * 1.05)); }
      head.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(lines), new T.LineBasicMaterial({ color: 0x4a0a10, transparent: true, opacity: 0.7 })));
    });
    tassel.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    var tbx = new T.Object3D(); tbx.position.set(0, -2.2, 0.32); tassel.add(tbx); tassel.userData.hit = tbx;
    buildHulls();
    cands.push({ act: "part:tassel", obj: tbx, rad: 1.6 });
  }
  function buildHulls() { // 見修行果四區的半透明罩體：沿圓弧包住每區 26 顆數珠，像一段磨砂琉璃
    var TINT = [0x5f95cc, 0xd6a03c, 0x8e78d0, 0xd2685d];
    D.zones.forEach(function (zn, zi) {
      var HR = 0.86, g = new T.Group(), runs = zoneRuns(zi);
      var outer = new T.MeshPhysicalMaterial({ color: TINT[zi], transparent: true, opacity: 0.17, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.5, depthWrite: false, side: T.FrontSide, emissive: TINT[zi], emissiveIntensity: 0.12 });
      var inner = new T.MeshPhysicalMaterial({ color: TINT[zi], transparent: true, opacity: 0.07, roughness: 0.5, depthWrite: false, side: T.BackSide });
      outer.onBeforeCompile = function (sh) { // 琉璃邊緣：越靠輪廓越不透明，形成柔和的玻璃邊光
        sh.fragmentShader = sh.fragmentShader.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n float fres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.2);\n gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.82, fres);\n gl_FragColor.a = clamp(opacity * (0.55 + 3.2 * fres), 0.0, 0.85);");
      };
      // 隔珠在各區之前：隔珠＋緊接其後的有內容珠段，做成「一整個」平滑封閉的琉璃泡（單一網格，無接縫、無重疊）
      var spN = zn.spacerNo, joined = runs.length && runs[0][0] === zn.first;
      runs.forEach(function (rn, ri) {
        var withSp = ri === 0 && joined, a0 = withSp ? ANG[spN] : ANG[rn[0]], a1 = ANG[rn[1]];
        var spR = RAD[spN] + 0.24, geo = hullGeometry(a0, a1, HR, withSp ? a0 : null, spR), geo2 = hullGeometry(a0, a1, HR * 0.985, withSp ? a0 : null, spR * 0.985);
        g.add(new T.Mesh(geo, outer)); g.add(new T.Mesh(geo2, inner));
      });
      if (!joined) { var spA = ANG[spN], g3 = hullGeometry(spA, spA, 0.01, spA, RAD[spN] + 0.24); g.add(new T.Mesh(g3, outer)); }
      g.userData = { zone: zi, outer: outer, base: 0.17 }; g.renderOrder = 2; g.visible = false;
      g.traverse(function (o) { o.userData.zone = zi; o.renderOrder = 2; });
      malaGroup.add(g); hulls[zi] = g;
    });
  }
  function hullGeometry(a0, a1, hr, aSp, spR) { // 沿圓弧掃出的封閉管：兩端以半球收口，隔珠處隆起；以平滑最大值融合，避免接縫
    var dir = a1 >= a0 ? 1 : -1, ext = Math.max(hr, aSp != null ? spR : 0) / R + 0.004, aS = a0 - dir * ext, aE = a1 + dir * ext;
    var NA = Math.max(24, Math.round(Math.abs(aE - aS) * R * 9)), NR = 48, P = 8, pos = [], idx = [];
    function rad(a) {
      var sum = 0, x;
      var lo = Math.min(a0, a1), hi = Math.max(a0, a1);
      if (a >= lo && a <= hi) sum += Math.pow(hr, P);
      x = (a - a0) * R; if (Math.abs(x) < hr) sum += Math.pow(Math.sqrt(hr * hr - x * x), P);
      x = (a - a1) * R; if (Math.abs(x) < hr) sum += Math.pow(Math.sqrt(hr * hr - x * x), P);
      if (aSp != null) { x = (a - aSp) * R; if (Math.abs(x) < spR) sum += Math.pow(Math.sqrt(spR * spR - x * x), P); }
      return Math.pow(sum, 1 / P);
    }
    for (var i = 0; i <= NA; i++) {
      var a = aS + (aE - aS) * i / NA, r = i === 0 || i === NA ? 0 : rad(a), ux = Math.sin(a), uz = Math.cos(a);
      for (var j = 0; j <= NR; j++) { var f = j / NR * TAU, c = Math.cos(f), sn = Math.sin(f); pos.push(ux * (R + r * c), r * sn, uz * (R + r * c)); }
    }
    for (i = 0; i < NA; i++) for (j = 0; j < NR; j++) { var p0 = i * (NR + 1) + j, p1 = p0 + NR + 1; if (dir > 0) idx.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1); else idx.push(p0, p0 + 1, p1, p1, p0 + 1, p1 + 1); }
    var gg = new T.BufferGeometry(); gg.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); gg.setIndex(idx); gg.computeVertexNormals();
    return gg;
  }
  function zoneSpan(zi) { // 區畫面要置中的角度範圍：已配置名相的第一顆到最後一顆（沒有則整區）
    var zn = D.zones[zi], rs = zoneRuns(zi);
    if (!rs.length) return [ANG[zn.spacerNo], ANG[zn.last]];
    return [ANG[zn.spacerNo], ANG[rs[rs.length - 1][1]]]; // 隔珠連同有內容的珠段一起置中
  }
  function zoneRuns(zi) { // 該區已配置名相的連續珠段
    var zn = D.zones[zi], runs = [], st = null;
    for (var n = zn.first; n <= zn.last + 1; n++) {
      var on = n <= zn.last && !!KM.BEADS[n].term;
      if (on && st == null) st = n; if (!on && st != null) { runs.push([st, n - 1]); st = null; }
    }
    return runs;
  }
  function syncHulls() {
    var on = labelSet === "terms" && !reading;
    hulls.forEach(function (g, zi) {
      var selZ = selected && selected.k === "zone" ? selected.z : null;
      g.visible = on && (selZ == null || selZ === zi);
      g.userData.outer.opacity = selZ === zi ? 0.06 : hoverHull === zi ? 0.34 : 0.22;
      g.userData.outer.emissiveIntensity = hoverHull === zi ? 0.4 : 0.12;
    });
  }
  function angOf(n) { return ANG[((Math.round(n) - 1 + 108) % 108) + 1] - (n - Math.round(n)) * TAU / 108; }

  /* ---------- 文字入口（螢幕座標的 HTML 標籤＋引線） ---------- */
  function buildLabels() {
    var set = "parts";
    function add(id, act, text, anchor, mode, off, html) { labelDefs.push({ id: id, act: act, text: text, anchor: anchor, mode: mode, off: off, set: set, html: html }); }
    function partHtml(k) { var p = KM.partText(k); return "<b>" + KM.esc(p.title) + "</b><span>" + KM.esc(p.text) + "</span>"; }
    var ringPt = function (n) { return function (out) { var th = angOf(n); return out.set(Math.sin(th) * R, 0, Math.cos(th) * R); }; };
    var obj = function (o, dy) { return function (out) { o.getWorldPosition(out); out.y += dy || 0; return out; }; };
    var world = function (fn) { return function (out) { fn(out); return malaGroup.localToWorld(out); }; };
    // 部件譬喻（預設）：五種部件，文字與引文一致
    add("head", "part:head", "佛頭珠", function (out) { return guru.getWorldPosition(out); }, "out", 44, partHtml("head"));
    add("tassel", "part:tassel", "飾穗", function (out) { tassel.userData.hit.getWorldPosition(out); return out; }, "out", 44, partHtml("tassel"));
    add("pbead", "part:bead", "數珠", world(ringPt(34)), "out", 70, partHtml("bead"));
    add("string", "part:string", "串繩", world(ringPt(66.5)), "out", 60, partHtml("string")); // 引線指向兩珠之間的串繩
    // 四顆隔珠：標題與其他部件同格式；「隔珠・行」兼標隔珠的譬喻（風瑜伽）
    D.zones.forEach(function (zn, zi) {
      var t = "隔珠・" + zn.name, sub = zi === 2 ? KM.partText("spacer").text : "";
      add("psp" + zi, zi === 2 ? "part:spacer" : "spacer:" + zi, t + (sub ? " " + sub : ""), world(ringPt(zn.spacerNo)), "out", zi === 0 ? 46 : 40, "<b>" + KM.esc(t) + "</b>" + (sub ? "<span>" + KM.esc(sub) + "</span>" : ""));
      labelDefs[labelDefs.length - 1].zone = zi; labelDefs[labelDefs.length - 1].spacer = true;
    });
    // 依四區查看名相
    set = "zones";
    add("head2", "part:head", "佛頭珠", function (out) { return guru.getWorldPosition(out); }, "out", 44);
    D.zones.forEach(function (zn, zi) {
      add("sp" + zi, "spacer:" + zi, "隔珠" + "一二三四".charAt(zi) + "・" + zn.name, world(ringPt(zn.spacerNo)), "out", 40);
      add("zn" + zi, "zone:" + zi, zn.name + " " + zn.first + "–" + zn.last, world(ringPt(zi * 27 + 13.5)), "out", 52);
    });
    // 見修行果名相：76 個名相＋4 顆隔珠，全部標出（左右兩欄排列）
    set = "terms";
    D.zones.forEach(function (zn, zi) { // 與「以數珠為喻」頁一致：隔珠・見／修／行／果；括號內的說明（如風瑜伽）改為小字副標
      var m = /^[^（(]*[（(]([^）)]*)[）)]/.exec(zn.spacerTitle || "");
      add("tsp" + zi, "zone:" + zi, "隔珠・" + zn.name, world(ringPt(zn.spacerNo)), "out", 40); var dd = labelDefs[labelDefs.length - 1]; dd.zone = zi; dd.spacer = true; dd.sub = m ? m[1] : ""; });
    set = "zterm"; // 進入某區後才顯示的該區名相
    D.terms.forEach(function (t) { add("t" + t.slot, "bead:" + t.slot, t.name, world(ringPt(t.slot)), "row", 0); labelDefs[labelDefs.length - 1].zone = KM.BEADS[t.slot].z; labelDefs[labelDefs.length - 1].n = t.slot; });
    // 原書導讀：17 章各一顆
    set = "book";
    D.chapters.forEach(function (c) { add("ch" + c.no, "chapter:" + c.id, KM.chLabel(c) + " " + KM.shortTitle(c.title), world(ringPt(KM.CH_BEAD[c.id])), "out", 26); });
    labelDefs.forEach(function (d) {
      var b = document.createElement("button"); b.type = "button"; b.className = "lab lab-" + d.set + (d.html ? " lab-part" : "") + (d.zone != null ? " lab-z" + d.zone : "") + (d.spacer ? " lab-sp" : ""); if (d.html) b.innerHTML = d.html; else if (d.sub) b.innerHTML = KM.esc(d.text) + '<small class="sub">' + KM.esc(d.sub) + "</small>"; else if (d.set === "book") { var sp1 = d.text.indexOf(" "); b.innerHTML = '<span class="bn">' + KM.esc(d.text.slice(0, sp1)) + '</span><span class="bt">' + KM.esc(d.text.slice(sp1)) + "</span>"; } else b.textContent = d.text; b.setAttribute("data-act", d.act); b.setAttribute("aria-label", d.text);
      b.addEventListener("click", function () { KM.go(d.act); });
      labelsBox.appendChild(b); d.el = b;
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path"); leaders.appendChild(p); d.path = p;
    });
    mainLeader = document.createElementNS("http://www.w3.org/2000/svg", "path"); mainLeader.setAttribute("class", "main"); mainLeader.style.opacity = 0; leaders.appendChild(mainLeader);
  }

  /* ---------- 版面 ---------- */
  function overviewPos() {
    var f = Math.max(1, 1.5 / aEff()) * (narrow ? 1.2 : 1); // 手機：念珠縮小一些，左右留出標題的位置
    return narrow && W < H * 1.1 ? new T.Vector3(0, 50 * f, 44 * f) : new T.Vector3(0, 30 * f, 60 * f); // 手機畫面較高：鏡頭抬高，念珠橢圓較圓、填滿上下空間
  }
  function resize() {
    if (!renderer) return;
    W = host.clientWidth || 800; H = host.clientHeight || 600; narrow = window.matchMedia ? window.matchMedia("(max-width:900px)").matches : W < 760; // 與 CSS 的手機版斷點一致
    var panel = document.getElementById("panel");
    var pw = (!narrow && panel) ? panel.offsetWidth + 32 : 0;
    offX = pw / 2; offY = narrow ? 0 : 55;
    renderer.setSize(W, H);
    camera.aspect = W / H;
    camera.setViewOffset(W, H, offX, offY, W, H);
    camera.updateProjectionMatrix();
    labelsBox.classList.toggle("narrow", narrow); labelDefs.forEach(function (d) { d.w = 0; }); // 手機也顯示標題（只顯示標題字，不顯示說明）
    if (built && !focused) { camera.position.copy(overviewPos()); }
  }

  /* ---------- 狀態目標（高亮、淡化） ---------- */
  function applyTargets(instant) {
    var s = selected, zone = null, chSet = null, selN = 0;
    if (s) {
      if (s.k === "bead") { zone = KM.BEADS[s.n].z; selN = s.n; }
      else if (s.k === "spacer") { zone = s.z; selN = D.zones[s.z].spacerNo; }
      else if (s.k === "zone") zone = s.z;
    }
    var book = mode === "book";
    if (s && (s.k === "chapter" || s.k === "sec")) { selN = KM.CH_BEAD[s.k === "chapter" ? s.id : KM.secById[s.id].ch]; chSet = null; }
    if (s && s.k === "empty") { zone = KM.BEADS[s.n].z; selN = s.n; }
    for (var n = 1; n <= 108; n++) {
      var b = beads[n], t = b.tgt;
      b.assigned = book ? !!KM.BEADS[n].ch : !!KM.BEADS[n].term;
      if (!b.spacer) b.core.material.color.setHex(b.assigned ? 0xf4d09a : 0xfff8ec); // 已配置：較深的蜜色；待配置：原色較淺
      if (b.spacer) { t.op = 1; t.em = 0.6; t.wo = 0; t.go = 0; }
      else if (b.assigned) { t.op = 1; t.em = 0.6; t.wo = 0; t.go = 0; }
      else { t.op = 1; t.em = 0.6; t.wo = 0; t.go = 0; }
      var dim = false;
      if (zone != null) dim = b.z !== zone; else if (chSet) dim = !chSet[n];
      if (dim) { t.op = 0.28; }
      if (chSet && chSet[n]) { t.em = 1.6; t.go = 0.95; t.wo = 0.7; }
      if (n === selN) { t.em = 1.6; t.go = 1; t.wo = 0.8; }
      if (reading && selN) { // 珠內閱讀：被點的珠半透明作為文字底，左右相鄰珠半透明，其餘淡出
        var dk = Math.min(Math.abs(n - selN), 108 - Math.abs(n - selN));
        t.op = dk === 0 ? 0.3 : dk <= 3 ? 0.5 : 0.08; t.em = 0.6;
      }
      if (instant) { b.cur.op = t.op; b.cur.em = t.em; b.cur.wo = t.wo; b.cur.go = t.go; }
    }
    for (n = 1; n <= 108; n++) {
      var sd = selN ? Math.min(Math.abs(n + 0.5 - selN), 108 - Math.abs(n + 0.5 - selN)) : 99;
      segs[n].userData.op = reading ? (sd <= 3 ? 0.55 : 0.06) : 1;
    }
    if (guru) { var go = reading && selN && Math.min(selN, 108 - selN) > 3 ? 0.08 : 1; [guru, tassel].forEach(function (o) { o.traverse(function (m) { if (m.material) { m.material.transparent = go < 1; m.material.opacity = go; } }); }); }
  }
  function lerpBeads(dt) {
    var k = 1 - Math.exp(-dt * 6);
    for (var n = 1; n <= 108; n++) {
      var b = beads[n], c = b.cur, t = b.tgt;
      c.op += (t.op - c.op) * k; c.em += (t.em - c.em) * k; c.wo += (t.wo - c.wo) * k; c.go += (t.go - c.go) * k;
      b.core.material.opacity = c.op * b.base; b.core.material.emissiveIntensity = Math.max(0, c.em - 0.8) * 0.35; b.core.material.transparent = b.spacer || c.op < 0.99;
      b.grp.position.y = (paused || reduce) ? 0 : Math.sin(tt * 1.6 + n * 0.35) * 0.16 * bobAmp;
      if (b.inner) b.inner.visible = c.op > 0.6;
      b.core.children.forEach(function (h) { h.material.opacity = Math.min(1, c.op * 1.2); });
    }
    updateString(k);
  }
  function updateString(k) { // 珠孔朝向前後兩顆珠的連線，串繩段由一顆珠孔接到下一顆珠孔
    for (var n = 1; n <= 108; n++) {
      var b = beads[n], pv = beads[n === 1 ? 108 : n - 1].grp.position, nx = beads[n === 108 ? 1 : n + 1].grp.position;
      tmp3.subVectors(nx, pv).normalize(); b.core.quaternion.setFromUnitVectors(YAX, tmp3).multiply(b.spin);
    }
    for (n = 1; n <= 108; n++) {
      var a = beads[n], c2 = beads[n === 108 ? 1 : n + 1], sgm = segs[n];
      tmp3.subVectors(c2.grp.position, a.grp.position); var len = tmp3.length(); tmp3.divideScalar(len);
      var ra = RAD[a.n] * a.grp.scale.x * 0.9, rb = RAD[c2.n] * c2.grp.scale.x * 0.9, L = Math.max(0.02, len - ra - rb);
      tmp4.copy(a.grp.position).addScaledVector(tmp3, ra + L / 2);
      sgm.position.copy(tmp4); sgm.scale.set(1, L, 1); sgm.quaternion.setFromUnitVectors(YAX, tmp3);
      var tgt = sgm.userData.op; sgm.material.opacity += (tgt - sgm.material.opacity) * (k || 1); sgm.visible = sgm.material.opacity > 0.03;
    }
  }

  /* ---------- 選取 → 轉動與飛近 ---------- */
  var FOCUS_KINDS = { bead: 1, empty: 1, spacer: 1, zone: 1, chapter: 1, sec: 1 };
  function focusBead(s) {
    if (!s) return 0;
    if (s.k === "bead" || s.k === "empty") return s.n;
    if (s.k === "spacer") return D.zones[s.z].spacerNo;
    if (s.k === "chapter") return KM.CH_BEAD[s.id];
    if (s.k === "sec") return KM.CH_BEAD[KM.secById[s.id].ch];
    return 0;
  }
  API.setSelection = function (sel) {
    if (!built) return;
    var prev = selected, wasReading = reading; selected = sel;
    focused = !!sel && (FOCUS_KINDS[sel.k] || (sel.k === "part" && (sel.id === "head" || sel.id === "tassel")));
    reading = !!sel && (sel.k === "bead" || sel.k === "empty" || sel.k === "chapter" || sel.k === "sec");
    applyTargets();
    var RS_ = 1.33; // 閱讀時被點的珠放大（相鄰珠仍不重疊）
    scaleFor(prev, 1); if (focusBead(sel)) scaleFor(sel, reading ? RS_ : 1.3);
    var dur = reduce ? 0.01 : wasReading && reading ? 1.2 : 1.9, camTo, tgtTo, rotTo = null;
    var f = Math.max(1, 1.45 / aEff());
    var fb = focusBead(sel);
    if (fb) rotTo = -angOf(fb);
    else if (sel && sel.k === "zone" && labelSet === "terms") { var zr = zoneSpan(sel.z); rotTo = -(zr[0] + zr[1]) / 2; } // 有內容的珠段置中
    else if (sel && sel.k === "zone") rotTo = -(ANG[D.zones[sel.z].first] + ANG[D.zones[sel.z].last]) / 2;
    else if (sel && sel.k === "part" && (sel.id === "head" || sel.id === "tassel")) rotTo = 0;
    if (fb && reading) { // 鏡頭正對被點的珠，使它在畫面中放大到可容納文字的大小
      var availW = W - (narrow ? 0 : 2 * offX), Dpx = narrow ? Math.min(W * 0.92, H * 0.86) : Math.min(H * 0.72, availW * 0.56);
      var dist = RAD[fb] * RS_ * H / (Math.tan(FOV * Math.PI / 360) * Dpx);
      camTo = new T.Vector3(0, dist * 0.07, R + dist); tgtTo = new T.Vector3(0, 0, R);
    } else if (fb) { camTo = new T.Vector3(0, 6.5, R + 13); tgtTo = new T.Vector3(0, 0, R); }
    else if (sel && sel.k === "zone" && labelSet === "terms") { // 區畫面：正面看這一區，整排數珠橫在畫面中
      var zs = zoneSpan(sel.z), half = Math.abs(zs[1] - zs[0]) / 2 + (RB + 0.6) / R, chord = 2 * R * Math.sin(half), sag = R * (1 - Math.cos(half));
      var availW2 = W - (narrow ? 0 : 2 * offX), dz = chord * (H / 2) / (Math.tan(FOV * Math.PI / 360) * availW2 * 0.94) + sag * 0.5;
      var tilt = 0.36; // 傾斜俯視，讓後方的念珠退到上方，不壓到前排的名相
      camTo = new T.Vector3(0, dz * Math.sin(tilt), R - sag * 0.4 + dz * Math.cos(tilt)); tgtTo = new T.Vector3(0, 0, R - sag * 0.4);
    }
    else if (sel && sel.k === "zone") { camTo = new T.Vector3(0, 16 * f, R + 28 * f); tgtTo = new T.Vector3(0, 0, R - 5); }
    else if (sel && sel.k === "part" && (sel.id === "head" || sel.id === "tassel")) { camTo = new T.Vector3(6, 3.5, R + 13); tgtTo = new T.Vector3(0, -1.2, R + 1.4); }
    else { camTo = overviewPos(); tgtTo = new T.Vector3(0, 0, 0); }
    G.killTweensOf(camera.position); G.killTweensOf(controls.target); if (rotTween) rotTween.kill();
    controls.enabled = false;
    if (rotTo != null) rotTween = G.to(malaGroup.rotation, { y: wrapNear(rotTo, malaGroup.rotation.y), duration: dur, ease: "power3.inOut" });
    G.to(controls.target, { x: tgtTo.x, y: tgtTo.y, z: tgtTo.z, duration: dur, ease: "power3.inOut" });
    G.to(camera.position, { x: camTo.x, y: camTo.y, z: camTo.z, duration: dur, ease: "power3.inOut", onComplete: function () { controls.enabled = true; } });
    quoteEl.classList.toggle("hide", !!focused && !narrow); bookStele.classList.toggle("hide", !!focused && !narrow);
    labelsBox.classList.toggle("hide", !!focused && !(labelSet === "terms" && sel && sel.k === "zone"));
    syncHulls();
    if (labelSet === "terms" && sel && sel.k === "zone") { var z3 = D.zones[sel.z], own = D.terms.filter(function (t) { return t.group === z3.group; }).length; calloutEl.innerHTML = "<b>" + KM.esc(z3.name) + "　區</b><small>數珠 " + z3.first + "–" + z3.last + " ・ " + z3.spacerName + " " + z3.spacerNo + " ・ 已配置 " + own + "／26 ・ 點名相進入該珠</small>"; calloutEl.classList.add("on", "zonehead"); } else calloutEl.classList.remove("zonehead");
    buildFocusUI();
    if (labelSet === "terms" && sel && sel.k === "zone") calloutEl.classList.add("on");
  };
  function scaleFor(s, v) {
    var n = focusBead(s); if (!n) return;
    G.to(beads[n].grp.scale, { x: v, y: v, z: v, duration: v > 1 ? 1 : 0.5, ease: v > 1 ? "elastic.out(1,0.4)" : "power2.out" });
  }

  /* ---------- 聚焦時的文字：名稱、章名引線 ---------- */
  var fanItems = [], selInfo = null, fanPaths = [];
  function buildFocusUI() {
    fanBox.innerHTML = ""; fanPaths.forEach(function (p) { p.remove(); }); fanPaths = []; fanItems = []; selInfo = null;
    calloutEl.classList.remove("on"); mainLeader.style.opacity = 0;
    if (reading) return; // 珠內閱讀時，文字改寫在珠上（見 #beadview）
    var info = KM.focusInfo(selected); if (!info) return;
    calloutEl.innerHTML = "<b>" + KM.esc(info.name) + "</b><small>" + KM.esc(info.sub) + "</small>";
    selInfo = { n: info.n, nb: [] };
    var cp = document.createElementNS("http://www.w3.org/2000/svg", "path"); leaders.appendChild(cp); selInfo.cpath = cp; fanPaths.push(cp);
    info.neighbors.forEach(function (nb) { // 相鄰珠的名稱（只顯示標題）
      var e = document.createElement("button"); e.type = "button"; e.className = "nb"; e.textContent = nb.text; e.setAttribute("aria-label", nb.text);
      e.addEventListener("click", function () { var a = KM.actForBead(nb.n); if (a) KM.go(a); });
      fanBox.appendChild(e); selInfo.nb.push({ n: nb.n, el: e });
    });
    if (narrow) return;
    info.fan.slice(0, 5).forEach(function (f) {
      var b2 = document.createElement("button"); b2.type = "button"; b2.className = "fl"; b2.textContent = f.text; b2.setAttribute("aria-label", f.text);
      b2.addEventListener("click", function () { KM.go(f.act); });
      fanBox.appendChild(b2);
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path"); leaders.appendChild(p); fanPaths.push(p);
      fanItems.push({ el: b2, path: p });
    });
  }

  function updateReader() {
    if (!readerEl) readerEl = document.getElementById("beadview");
    if (!readerEl || !reading) return;
    var fb = focusBead(selected); if (!fb) return;
    beads[fb].grp.getWorldPosition(tmp); var sp = toScreen(tmp), Dp = 2 * RAD[fb] * beads[fb].grp.scale.x * pxPerUnit(tmp);
    var right = W - (narrow ? 0 : 2 * offX), gapL = sp.x - Dp / 2, gapR = right - (sp.x + Dp / 2);
    var st = readerEl.style;
    st.setProperty("--cx", sp.x.toFixed(1) + "px"); st.setProperty("--cy", sp.y.toFixed(1) + "px"); st.setProperty("--D", Dp.toFixed(1) + "px");
    st.setProperty("--lx", Math.max(64, gapL / 2).toFixed(1) + "px"); st.setProperty("--rx", Math.min(right - 64, sp.x + Dp / 2 + gapR / 2).toFixed(1) + "px");
  }
  function layoutZone(zi) { // 某區：名相分上下多排，依珠子左右順序擺放、互不重疊，以引線連到各自的珠
    var rowsY = [-1, 1, -2, 2, -3, 3], rowR = {}, right = W - (narrow ? 0 : 2 * offX), list = [];
    labelDefs.forEach(function (d) {
      if (d.set !== "zterm" || d.zone !== zi) { if (d.set !== "zterm" || d.zone !== zi) { d.el.style.display = "none"; d.path.style.display = "none"; } return; }
      d.el.style.display = ""; d.path.style.display = "";
      beads[d.n].grp.getWorldPosition(tmp); d.a = toScreen(tmp); d.rpx = RAD[d.n] * pxPerUnit(tmp); list.push(d);
    });
    list.sort(function (p, q) { return p.a.x - q.a.x; });
    calloutEl.style.transform = "translate(" + ((W - (narrow ? 0 : 2 * offX)) / 2).toFixed(1) + "px," + (narrow ? 40 : 170) + "px) translate(-50%,0)"; calloutEl.style.textAlign = "center";
    var gap = narrow ? 30 : 46;
    list.forEach(function (d) {
      var w = d.w || (d.w = d.el.offsetWidth), pick = null;
      for (var k = 0; k < rowsY.length; k++) { var rr = rowsY[k], left = Math.max(6, Math.min(right - w - 6, d.a.x - w / 2)); if (rowR[rr] == null || left > rowR[rr] + 12) { pick = rr; break; } }
      if (pick == null) pick = rowsY.reduce(function (m, rr) { return rowR[rr] < rowR[m] ? rr : m; }, rowsY[0]);
      var lx = Math.max(6, Math.min(right - w - 6, d.a.x - w / 2)); rowR[pick] = lx + w;
      var ly = d.a.y + Math.sign(pick) * (d.rpx + 18 + (Math.abs(pick) - 1) * gap + 10);
      d.el.style.transform = "translate(" + lx.toFixed(1) + "px," + ly.toFixed(1) + "px) translate(0,-50%)";
      var y0 = d.a.y + Math.sign(pick) * d.rpx, y1 = ly - Math.sign(pick) * 11;
      d.path.setAttribute("d", "M" + d.a.x.toFixed(1) + " " + y0.toFixed(1) + " L" + d.a.x.toFixed(1) + " " + ((y0 + y1) / 2).toFixed(1) + " L" + (lx + w / 2).toFixed(1) + " " + y1.toFixed(1));
    });
    labelDefs.forEach(function (d) { if (d.set !== "zterm") { d.el.style.display = "none"; d.path.style.display = "none"; } });
  }
  function updateStele() { // 引文碑：置於整串念珠的中央
    if (narrow || (labelSet !== "parts" && labelSet !== "book") || focused) return;
    var c = toScreen(tmp.set(0, 0, 0)), f = toScreen(tmp2b.set(0, 0, R)), b = toScreen(tmp2b.set(0, 0, -R));
    var top = Math.min(f.y, b.y), bot = Math.max(f.y, b.y), st = document.documentElement.style; // 兩個碑文（引文、原書題辭）共用位置變數
    if (labelSet === "book") { // 原書題辭：每行最多約 12 字，字級依念珠圈高度放大
      var hb = bot - top; st.setProperty("--qx", c.x.toFixed(1) + "px"); st.setProperty("--qy", ((top + bot) / 2 + hb * 0.02).toFixed(1) + "px");
      st.setProperty("--bf", Math.max(15, Math.min(23, hb * 0.62 / 13.8)).toFixed(2) + "px"); return;
    }
    var hh = bot - top; st.setProperty("--qx", c.x.toFixed(1) + "px"); st.setProperty("--qy", ((top + bot) / 2 + hh * 0.02).toFixed(1) + "px"); // 碑文成橫向長方形（約念珠圈寬的 52%、高的 50%），與橫橢圓的念珠相配；依字數算字級，讓全文剛好填滿
    var ew = Math.abs(toScreen(tmp2b.set(R, 0, 0)).x - toScreen(tmp2b.set(-R, 0, 0)).x), qh = Math.max(140, hh * 0.5), qw = ew * 0.52;
    var nq = steleN || (steleN = (document.getElementById("quote-full").textContent || "").length || 160);
    var fs = Math.max(12, Math.min(19, Math.sqrt(qw * qh / (1.75 * 1.06 * nq * 1.12))));
    st.setProperty("--qh", qh.toFixed(1) + "px"); st.setProperty("--qf", fs.toFixed(2) + "px"); // 碑立於念珠中央，不壓到佛頭 st.setProperty("--qw", Math.max(260, (Math.abs(toScreen(tmp2b.set(R, 0, 0)).x - toScreen(tmp2b.set(-R, 0, 0)).x)) * 0.62).toFixed(1) + "px");
  }
  var tmp2b = new T.Vector3(), steleN = 0;
  function updateOverlays() {
    updateReader(); updateStele();
    var o = toScreen(tmp.set(0, 0, 0)), ctr = { x: o.x, y: o.y };
    var zoneView = labelSet === "terms" && selected && selected.k === "zone";
    if (zoneView) layoutZone(selected.z);
    else if (!focused) {
      labelDefs.forEach(function (d) {
        if (d.set !== labelSet) { d.el.style.display = "none"; d.path.style.display = "none"; return; }
        d.el.style.display = "";
        d.anchor(tmp); var a = toScreen(tmp), pa = a; // pa：引線起點（飾穗的引線指向垂下的流蘇，標籤位置則以佛頭為準，免得被擠進念珠上）
        if (d.id === "tassel") { guru.getWorldPosition(tmp); a = toScreen(tmp); }
        var dx = a.x - ctr.x, dy = a.y - ctr.y, m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
        if (d.mode === "in") { dx = -dx; dy = -dy; }
        // 佛頭珠、飾穗、隔珠・見同在一處：都朝念珠外側，分別偏左、偏右、正外，隨念珠轉動也不會轉進圈內
        var pair = d.id === "head" || d.id === "head2" || d.id === "tassel";
        if (pair) { var sg = d.id === "tassel" ? 1 : -1, ko = narrow ? 0.45 : 1, ox = (dx * 74 - sg * dy * 104) * ko, oy = (dy * 74 + sg * dx * 104) * ko; d.off = Math.hypot(ox, oy); dx = ox / d.off; dy = oy / d.off; } // 往外 74px，再沿念珠切線左右各錯開 104px
        if (d.set === "book" && a.z > 1) { d.el.style.display = "none"; d.path.style.display = "none"; return; }
        var off = (d.set === "parts" && !pair && Math.abs(dx) > 0.8 ? d.off * 0.45 : d.off) * (narrow && !pair ? 0.5 : 1); // 左右兩側空間較窄，標籤貼近念珠外緣
        var lx = a.x + dx * off, ly = a.y + dy * off, tx = d.id === "psp0" ? "-50%" : dx > 0.35 ? "0" : dx < -0.35 ? "-100%" : "-50%"; // 隔珠・見夾在佛頭珠與飾穗之間，置中對齊
        // 標籤保持在可視範圍內（不被畫面邊緣或右側面板切掉）
        var w = d.w || (d.w = d.el.offsetWidth), left = tx === "0" ? lx : tx === "-100%" ? lx - w : lx - w / 2;
        var maxR = W - (narrow ? 0 : offX * 2) - 10, cl = Math.max(10, Math.min(left, maxR - w));
        if (cl !== left) { lx += cl - left; left = cl; }
        d.el.style.transform = "translate(" + left.toFixed(1) + "px," + ly.toFixed(1) + "px) translate(0,-50%)";
        var ex = dx > 0.35 ? lx : dx < -0.35 ? lx : lx, ey = ly + (dy > 0.5 ? -9 : dy < -0.5 ? 9 : 0);
        d.path.setAttribute("d", "M" + pa.x.toFixed(1) + " " + pa.y.toFixed(1) + " L" + (dx > 0.35 ? lx - 2 : dx < -0.35 ? lx + 2 : lx).toFixed(1) + " " + ey.toFixed(1));
        d.path.style.display = "";
      });
    } else labelDefs.forEach(function (d) { d.path.style.display = "none"; if (d.set === "zterm") d.el.style.display = "none"; });

    if (selInfo) {
      beads[selInfo.n].grp.getWorldPosition(tmp); var s = toScreen(tmp), cx = s.x, cy = s.y;
      calloutEl.classList.add("on");
      calloutEl.style.transform = narrow ? "translate(" + cx.toFixed(1) + "px," + (cy - 46).toFixed(1) + "px) translate(-50%,-100%)" : "translate(" + (cx - 40).toFixed(1) + "px," + (cy - 86).toFixed(1) + "px) translate(-100%,-100%)";
      calloutEl.style.textAlign = narrow ? "center" : "left";
      if (!narrow) selInfo.cpath.setAttribute("d", "M" + (cx - 14) + " " + (cy - 18) + " L" + (cx - 38) + " " + (cy - 82));
      selInfo.nb.forEach(function (it, i) {
        beads[it.n].grp.getWorldPosition(tmp); var q = toScreen(tmp);
        it.el.style.display = q.z > 1 || q.x < 0 || q.x > W ? "none" : "";
        it.el.style.transform = "translate(" + q.x.toFixed(1) + "px," + (q.y - 34 - (i % 2) * 22).toFixed(1) + "px) translate(-50%,-100%)";
      });
      fanItems.forEach(function (it, i) {
        var x = cx - 120, y = cy + 78 + i * 31;
        it.el.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) translate(0,-50%)";
        it.path.setAttribute("d", "M" + (x - 4) + " " + y + " C" + (x - 70) + " " + y + " " + (cx - 30 + i * 8) + " " + (cy + 50) + " " + cx + " " + (cy + 16));
      });
      if (!narrow) {
        var pr = document.getElementById("panel").getBoundingClientRect(), sr = stage.getBoundingClientRect();
        var px = pr.left - sr.left, py = pr.top - sr.top + 64;
        mainLeader.setAttribute("d", "M" + (cx + 16) + " " + cy + " C" + (cx + 90) + " " + cy + " " + (px - 90) + " " + py + " " + px + " " + py);
        mainLeader.style.opacity = 1;
      }
    }
  }

  /* ---------- 點選／懸停（以螢幕距離挑選，手機也易點） ---------- */
  function pick(cx, cy) {
    var best = null, bs = 1e9, i;
    for (i = 0; i < cands.length; i++) {
      var c = cands[i]; c.obj.getWorldPosition(tmp); var s = toScreen(tmp);
      if (s.z > 1) continue;
      var rp = Math.max(narrow ? 13 : 10, c.rad * pxPerUnit(tmp) * (c.bead ? c.obj.scale.x : 1)), d = Math.hypot(s.x - cx, s.y - cy);
      if (d <= rp) { var sc = d / rp + s.z * 0.01; if (sc < bs) { bs = sc; best = c; } }
    }
    var termsOverview = labelSet === "terms" && !selected;
    if (termsOverview) { // 名相頁總覽：點珠或罩體都進入該區
      if (best && best.bead && (best.bead.spacer || KM.BEADS[best.bead.n].term)) return { act: "zone:" + best.bead.z, hull: best.bead.z }; // 空白珠不可點
      if (!ray) ray = new T.Raycaster();
      ray.setFromCamera({ x: cx / W * 2 - 1, y: -(cy / H) * 2 + 1 }, camera);
      var hit = ray.intersectObjects(hulls.filter(function (g) { return g.visible; }), true)[0];
      return hit ? { act: "zone:" + hit.object.userData.zone, hull: hit.object.userData.zone } : null;
    }
    if (best) {
      if (best.bead) { var act = KM.actForBead(best.bead.n); return act ? { act: act, obj: best.obj, bead: best.bead } : null; }
      return best;
    }
    var md = 1e9;
    malaGroup.updateMatrixWorld();
    for (i = 0; i < ringLocal.length; i++) { tmp.copy(ringLocal[i]).applyMatrix4(malaGroup.matrixWorld); var q = toScreen(tmp); if (q.z > 1) continue; md = Math.min(md, Math.hypot(q.x - cx, q.y - cy)); }
    if (md < (narrow ? 12 : 9)) return { act: "part:string" };
    return null;
  }
  function localXY(e) { var r = renderer.domElement.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function setHover(c) {
    var hz = c && c.hull != null ? c.hull : null; if (hz !== hoverHull) { hoverHull = hz; syncHulls(); }
    if (c && c.hull != null) { renderer.domElement.style.cursor = "pointer"; if (hover && hover.obj && hover.bead) G.to(hover.obj.scale, { x: 1, y: 1, z: 1, duration: 0.3 }); hover = null; return; }
    if (hover && hover.obj && hover.obj !== (c && c.obj) && hover.bead && !(selected && selected.k !== "zone" && isSelBead(hover))) G.to(hover.obj.scale, { x: 1, y: 1, z: 1, duration: 0.3 });
    hover = c;
    if (c && c.bead && !isSelBead(c) && !reading) G.to(c.obj.scale, { x: 1.25, y: 1.25, z: 1.25, duration: 0.3, ease: "back.out(1.7)" }); // 閱讀時相鄰珠不放大，減少視覺疲勞
    renderer.domElement.style.cursor = c ? "pointer" : "grab";
    crosshair.classList.toggle("active", !!c);
  }
  function isSelBead(c) { return !!(c.bead && focusBead(selected) === c.bead.n); }
  function onMove(e) { if (down || e.pointerType !== "mouse") return; var p = localXY(e); setHover(pick(p.x, p.y)); }
  function onDown(e) { down = { x: e.clientX, y: e.clientY, t: performance.now() }; userDrag = true; }
  function onUp(e) {
    userDrag = false; if (!down) return;
    var moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (moved > 6 || dt > 700) return;
    var p = localXY(e), c = pick(p.x, p.y); if (c) KM.go(c.act);
  }

  /* ---------- 主迴圈 ---------- */
  var clock = new T.Clock(), first = true;
  function loop() {
    requestAnimationFrame(loop);
    var raw = clock.getDelta(), dt = Math.min(0.05, raw);
    if (!paused && !reduce) { tt += dt; galaxyGroup.rotation.y += dt * 0.02; baseGroup.rotation.y -= dt * 0.05; }
    var idle = !focused && !paused && !reduce && !hover && !userDrag && !(labelSet === "terms" && selected && selected.k === "zone"); // 名相頁總覽照常轉動；進入某區時停住，讓名相穩定好讀
    spinV += ((idle ? 0.07 : 0) - spinV) * Math.min(1, dt * 2.5); if (paused || reduce) spinV = 0;
    if (!(rotTween && rotTween.isActive())) malaGroup.rotation.y -= spinV * dt;
    bobAmp += ((focused ? 0 : 1) - bobAmp) * Math.min(1, dt * 3);
    lerpBeads(Math.min(0.3, raw));
    if (guru) { var y108 = beads[108].grp.position.y; guru.position.y = y108; tasselPivot.position.y = y108; } // 佛頭與飾穗隨隔珠一一起擺動
    if (tasselPivot) { tasselPivot.rotation.x = (paused || reduce) ? 0 : Math.sin(tt * 0.9) * 0.05; tasselPivot.rotation.z = (paused || reduce) ? 0 : Math.sin(tt * 0.7 + 1) * 0.035; } // 微風般輕擺 // 淡入淡出依實際時間，慢裝置也能及時完成
    controls.update();
    updateOverlays();
    renderer.render(scene, camera);
    if (first) { first = false; window.__kmReady = true; var l = document.getElementById("loading"); if (l) { l.style.opacity = 0; setTimeout(function () { l.style.display = "none"; }, 900); } }
  }

  /* ---------- 對外 ---------- */
  API.setPaused = function (v) { paused = !!v; };
  API.opacityOf = function (n) { return beads[n].core.material.opacity; };
  API.isReading = function () { return reading; };
  API.hullsVisible = function () { return hulls.filter(function (g) { return g.visible; }).length; };
  API.cordCheck = function () { // 串繩段兩端是否貼在相鄰兩顆珠的珠孔上（擺動中也成立）
    var worst = 0, bob = 0, v = new T.Vector3(), d = new T.Vector3();
    for (var n = 1; n <= 108; n++) {
      var a = beads[n], b = beads[n === 108 ? 1 : n + 1], sg = segs[n];
      bob = Math.max(bob, Math.abs(a.grp.position.y));
      d.set(0, 1, 0).applyQuaternion(sg.quaternion);
      v.copy(sg.position).addScaledVector(d, -sg.scale.y / 2); // 起點
      var ra = RAD[a.n] * a.grp.scale.x * 0.9;
      worst = Math.max(worst, Math.abs(v.distanceTo(a.grp.position) - ra));
    }
    return { worst: worst, bob: bob };
  };
  API.beadTextureURL = function (k) { try { return bodhiTextures([11, 23, 37, 59, 71, 97][k % 6]).canvas.toDataURL("image/jpeg", 0.85); } catch (e) { return ""; } };
  API.setMode = function (m) {
    if (!built) return;
    mode = m; labelSet = m === "book" ? "book" : m === "terms" ? "terms" : "parts";
    applyTargets(); syncHulls();
    if (!selected) { G.killTweensOf(camera.position); var to = overviewPos(); G.to(camera.position, { x: to.x, y: to.y, z: to.z, duration: reduce ? 0.01 : 1.2, ease: "power2.inOut" }); }
  };
  API.setLines = function (v) { lines = !!v; stage.classList.toggle("nolines", !lines); };
  API.hint = function () {};
  API.screenOf = function (n) { // 供測試：第 n 顆珠在頁面上的座標
    var o = n === "head" ? guru : n === "tassel" ? tassel.userData.hit : beads[n].grp; o.getWorldPosition(tmp); var s = toScreen(tmp), r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + s.x, y: r.top + s.y, z: s.z };
  };
  API.stats = function () {
    malaGroup.updateMatrixWorld(true); var out = { beads: 0, spacers: [], axisErr: 0, minGap: 1e9, guruAbove: false, tasselOutside: false, strings: 0 };
    var P = [];
    for (var n = 1; n <= 108; n++) {
      var b = beads[n]; P[n] = b.grp.position.clone(); P[n].y = 0;
      out.beads++; if (b.spacer) out.spacers.push(n);
      out.axisErr = Math.max(out.axisErr, Math.abs(Math.hypot(P[n].x, P[n].z) - R));
    }
    for (var m = 1; m <= 108; m++) { var m2 = m % 108 + 1; out.minGap = Math.min(out.minGap, P[m].distanceTo(P[m2]) - beads[m].r - beads[m2].r); }
    out.guruAbove = Math.abs(guru.position.y) < 0.01 && Math.abs(guru.position.x - P[108].x) < 0.01 && guru.position.z > P[108].z + RG * 0.8; // 三通塔頭自隔珠一沿半徑水平朝外
    out.headIsSpacer108 = beads[108].spacer && RAD[108] > RS;
    var tw = new T.Vector3(); tassel.userData.hit.getWorldPosition(tw); malaGroup.worldToLocal(tw); out.tasselHangs = tw.y < -1 && Math.hypot(tw.x, tw.z) > R + RG; // 飾穗垂在珠外緣下方
    out.strings = malaGroup.children.filter(function (c) { return c === stringMesh; }).length;
    out.rotY = malaGroup.rotation.y; out.cam = camera.position.toArray();
    return out;
  };
})();

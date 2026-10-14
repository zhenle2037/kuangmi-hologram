/* 數珠 3D 層（three.js）：紙感背景上的念珠、拉近特寫、引線與文字入口。
 * 內容與珠位模型由 app.js（KM）提供；本檔只負責畫面。 */
(function () {
  "use strict";
  var API = (window.KM3D = {});
  var T = window.THREE, G = window.gsap;
  var KM, D, host, stage, renderer, scene, camera, controls, malaGroup, galaxyGroup, baseGroup;
  var GY = 1.85, R = 26, TAU = Math.PI * 2, FOV = 45, ZC = [0x6fe3f0, 0xffd27a, 0xc9a8ff, 0xff8f9d];
  var W = 1, H = 1, narrow = false, offX = 0, offY = 0;
  var beads = [], guru, tassel, stringMesh, ringLocal = [];
  var paused = false, reduce = false, lines = true, selected = null, focused = false, mode = "mala", labelSet = "parts";
  var hover = null, down = null, userDrag = false, spinV = 0, bobAmp = 1, tt = 0, rotTween = null, built = false;
  var labelDefs = [], labelEls = [], fanEls = [], leaderPaths = {};
  var leaders, labelsBox, calloutEl, fanBox, mainLeader, crosshair, quoteEl;
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
    host = document.getElementById("canvas-container"); stage = document.getElementById("stage");
    leaders = document.getElementById("leaders"); labelsBox = document.getElementById("labels");
    calloutEl = document.getElementById("callout"); fanBox = document.getElementById("fan");
    crosshair = document.getElementById("crosshair"); quoteEl = document.getElementById("main-quote");
    reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) { return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
    host.appendChild(renderer.domElement);

    scene = new T.Scene();
    camera = new T.PerspectiveCamera(FOV, 1, 0.1, 1000);
    controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.06; controls.enablePan = false;
    controls.minDistance = 8; controls.maxDistance = 140; controls.minPolarAngle = 0.3; controls.maxPolarAngle = 1.3;
    controls.rotateSpeed = 0.6;

    scene.add(new T.HemisphereLight(0xfffaf0, 0xd9cbb5, 0.62));
    var dl = new T.DirectionalLight(0xffffff, 0.75); dl.position.set(-14, 60, 26); dl.castShadow = true;
    dl.shadow.mapSize.set(2048, 2048); dl.shadow.radius = 9; dl.shadow.bias = -0.0005;
    var sc = dl.shadow.camera; sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 1; sc.far = 140; scene.add(dl);
    var fl = new T.DirectionalLight(0xfff1dc, 0.35); fl.position.set(30, 10, 60); scene.add(fl);

    buildGalaxy(); buildBase(); buildMala(); buildLabels();
    resize();
    camera.position.copy(overviewPos()); controls.target.set(0, 0, 0); controls.update();
    malaGroup.rotation.y = Math.PI; // 初始：第 108 顆（及佛頭珠）在後方，從前方看佛頭珠位於其上方
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

  function buildMala() {
    malaGroup = new T.Group(); scene.add(malaGroup);
    var gtex = glowTexture();
    var RB = 0.62, RS = 0.74;
    var geoR = new T.SphereGeometry(RB, 32, 24), geoRW = geoR, geoM = new T.SphereGeometry(RS, 32, 24), geoMW = geoM;
    for (var n = 1; n <= 108; n++) {
      var b = KM.BEADS[n], th = TAU * n / 108, grp = new T.Group();
      var col = b.spacer ? 0x7a1518 : b.term ? 0xe2cba6 : 0xf2ece2;
      var core = new T.Mesh(b.spacer ? geoM : geoR, new T.MeshPhysicalMaterial({ color: col, emissive: b.spacer ? 0x6a0d10 : 0xffd9a0, emissiveIntensity: 0, transparent: true, opacity: 1, roughness: b.spacer ? 0.3 : 0.42, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.25 }));
      core.castShadow = true;
      var wire = new T.Object3D(); wire.material = {}; var glow = new T.Object3D(); glow.material = {};
      grp.add(core, wire, glow);
      grp.position.set(Math.sin(th) * R, 0, Math.cos(th) * R);
      malaGroup.add(grp);
      var o = { n: n, grp: grp, core: core, wire: wire, glow: glow, spacer: b.spacer, z: b.z, assigned: !!b.term, r: (b.spacer ? RS : RB) * 1.08,
        cur: { op: 0.85, em: 0.5, wo: 0.35, go: 0.35 }, tgt: { op: 0.85, em: 0.5, wo: 0.35, go: 0.35 }, sc: 1 };
      beads[n] = o;
      cands.push({ obj: grp, rad: b.spacer ? 1.05 : 0.9, bead: o });
    }
    // 串繩（連續圓環，貫穿所有珠心）
    stringMesh = new T.Mesh(new T.TorusGeometry(R, 0.06, 8, 256), new T.MeshStandardMaterial({ color: 0xb0302c, roughness: 0.6 }));
    stringMesh.rotation.x = Math.PI / 2; malaGroup.add(stringMesh);
    for (var i = 0; i < 128; i++) { var a = i / 128 * TAU; ringLocal.push(new T.Vector3(Math.sin(a) * R, 0, Math.cos(a) * R)); }

    // 佛頭珠：在第 108 顆（local 角度 0，座標 (0,0,R)）正上方；飾穗由佛頭珠向外垂下
    var red = new T.MeshPhysicalMaterial({ color: 0x7a1518, emissive: 0x6a0d10, emissiveIntensity: 0, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    guru = new T.Group(); guru.position.set(0, GY, R);
    var gb = new T.Mesh(new T.SphereGeometry(1.0, 40, 28), red); gb.castShadow = true; guru.add(gb);
    malaGroup.add(guru);
    var stem = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, GY, 8), new T.MeshStandardMaterial({ color: 0xb0302c })); stem.position.set(0, GY / 2, R); malaGroup.add(stem);
    cands.push({ act: "part:head", obj: guru, rad: 1.3 });
    // 飾穗：繫於佛頭珠頂端，向上（遠離念珠）展開，任何視角都不遮住第 108 顆
    var tred = new T.MeshStandardMaterial({ color: 0xa3262a, roughness: 0.75 });
    tassel = new T.Group(); tassel.position.set(0, GY + 1.0, R);
    tassel.add(new T.Mesh(new T.SphereGeometry(0.22, 12, 12), red));
    var body = new T.Mesh(new T.ConeGeometry(0.32, 0.9, 16), tred); body.rotation.z = Math.PI; body.position.y = 0.6; tassel.add(body);
    var tp = []; for (var k = 0; k < 16; k++) { var ta = k / 16 * TAU; tp.push(new T.Vector3(Math.cos(ta) * 0.28, 1.0, Math.sin(ta) * 0.28), new T.Vector3(Math.cos(ta) * 0.55, 2.0, Math.sin(ta) * 0.55)); }
    tassel.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(tp), new T.LineBasicMaterial({ color: 0xa3262a })));
    tassel.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    var tb = new T.Object3D(); tb.position.set(0, 1.1, 0); tassel.add(tb);
    malaGroup.add(tassel);
    cands.push({ act: "part:tassel", obj: tb, rad: 1.4 });
  }

  /* ---------- 文字入口（螢幕座標的 HTML 標籤＋引線） ---------- */
  function buildLabels() {
    var set = "parts";
    function add(id, act, text, anchor, mode, off, html) { labelDefs.push({ id: id, act: act, text: text, anchor: anchor, mode: mode, off: off, set: set, html: html }); }
    function partHtml(k) { var p = KM.partText(k); return "<b>" + KM.esc(p.title) + "</b><span>" + KM.esc(p.text) + "</span>"; }
    var ringPt = function (n) { return function (out) { var th = TAU * n / 108; return out.set(Math.sin(th) * R, 0, Math.cos(th) * R); }; };
    var obj = function (o, dy) { return function (out) { o.getWorldPosition(out); out.y += dy || 0; return out; }; };
    var world = function (fn) { return function (out) { fn(out); return malaGroup.localToWorld(out); }; };
    // 部件譬喻（預設）：五種部件，文字與引文一致
    add("head", "part:head", "佛頭珠", function (out) { return guru.getWorldPosition(out); }, "out", 44, partHtml("head"));
    add("tassel", "part:tassel", "飾穗", function (out) { tassel.getWorldPosition(out); out.y += 1.6; return out; }, "out", 44, partHtml("tassel"));
    add("pbead", "part:bead", "數珠", world(ringPt(34)), "out", 46, partHtml("bead"));
    add("pspacer", "part:spacer", "隔珠", world(ringPt(81)), "out", 44, partHtml("spacer"));
    add("string", "part:string", "串繩", world(ringPt(67.5)), "in", 90, partHtml("string"));
    // 依四區查看名相
    set = "zones";
    add("head2", "part:head", "佛頭珠", function (out) { return guru.getWorldPosition(out); }, "out", 44);
    D.zones.forEach(function (zn, zi) {
      add("sp" + zi, "spacer:" + zi, "隔珠" + "一二三四".charAt(zi) + "・" + zn.name, world(ringPt(zn.spacerNo)), "out", 40);
      add("zn" + zi, "zone:" + zi, zn.name + " " + zn.first + "–" + zn.last, world(ringPt(zi * 27 + 13.5)), "out", 52);
    });
    // 原書導讀：17 章各一顆
    set = "book";
    D.chapters.forEach(function (c) { add("ch" + c.no, "chapter:" + c.id, KM.chLabel(c) + " " + KM.shortTitle(c.title), world(ringPt(KM.CH_BEAD[c.id])), "out", 26); });
    labelDefs.forEach(function (d) {
      var b = document.createElement("button"); b.type = "button"; b.className = "lab lab-" + d.set + (d.html ? " lab-part" : ""); if (d.html) b.innerHTML = d.html; else b.textContent = d.text; b.setAttribute("data-act", d.act); b.setAttribute("aria-label", d.text);
      b.addEventListener("click", function () { KM.go(d.act); });
      labelsBox.appendChild(b); d.el = b;
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path"); leaders.appendChild(p); d.path = p;
    });
    mainLeader = document.createElementNS("http://www.w3.org/2000/svg", "path"); mainLeader.setAttribute("class", "main"); mainLeader.style.opacity = 0; leaders.appendChild(mainLeader);
  }

  /* ---------- 版面 ---------- */
  function overviewPos() {
    var f = Math.max(1, 1.5 / aEff());
    return new T.Vector3(0, 30 * f, 60 * f);
  }
  function resize() {
    if (!renderer) return;
    W = host.clientWidth || 800; H = host.clientHeight || 600; narrow = W < 760;
    var panel = document.getElementById("panel");
    var pw = (!narrow && panel) ? panel.offsetWidth + 32 : 0;
    offX = pw / 2; offY = narrow ? 0 : 55;
    renderer.setSize(W, H);
    camera.aspect = W / H;
    camera.setViewOffset(W, H, offX, offY, W, H);
    camera.updateProjectionMatrix();
    labelsBox.style.display = narrow ? "none" : "";
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
      if (!b.spacer) b.core.material.color.setHex(b.assigned ? (book ? 0xdcc39a : 0xe2cba6) : 0xf2ece2);
      if (b.spacer) { t.op = 1; t.em = 0.6; t.wo = 0; t.go = 0; }
      else if (b.assigned) { t.op = 1; t.em = 0.6; t.wo = 0; t.go = 0; }
      else { t.op = 1; t.em = 0.6; t.wo = 0; t.go = 0; }
      var dim = false;
      if (zone != null) dim = b.z !== zone; else if (chSet) dim = !chSet[n];
      if (dim) { t.op = 0.28; }
      if (chSet && chSet[n]) { t.em = 1.6; t.go = 0.95; t.wo = 0.7; }
      if (n === selN) { t.em = 1.6; t.go = 1; t.wo = 0.8; }
      if (instant) { b.cur.op = t.op; b.cur.em = t.em; b.cur.wo = t.wo; b.cur.go = t.go; }
    }
  }
  function lerpBeads(dt) {
    var k = 1 - Math.exp(-dt * 6);
    for (var n = 1; n <= 108; n++) {
      var b = beads[n], c = b.cur, t = b.tgt;
      c.op += (t.op - c.op) * k; c.em += (t.em - c.em) * k; c.wo += (t.wo - c.wo) * k; c.go += (t.go - c.go) * k;
      b.core.material.opacity = c.op; b.core.material.emissiveIntensity = Math.max(0, c.em - 0.8) * 0.35; b.core.material.transparent = c.op < 0.99;
      b.grp.position.y = (paused || reduce) ? 0 : Math.sin(tt * 1.6 + n * 0.35) * 0.16 * bobAmp;
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
    var prev = selected; selected = sel;
    focused = !!sel && (FOCUS_KINDS[sel.k] || (sel.k === "part" && (sel.id === "head" || sel.id === "tassel")));
    applyTargets();
    scaleFor(prev, 1); if (focusBead(sel)) scaleFor(sel, 1.3);
    var dur = reduce ? 0.01 : 1.9, camTo, tgtTo, rotTo = null;
    var f = Math.max(1, 1.45 / aEff());
    var fb = focusBead(sel);
    if (fb) rotTo = -TAU * fb / 108;
    else if (sel && sel.k === "zone") rotTo = -TAU * (D.zones[sel.z].first + 13) / 108;
    else if (sel && sel.k === "part" && (sel.id === "head" || sel.id === "tassel")) rotTo = 0;
    if (fb) { camTo = new T.Vector3(0, 6.5, R + 13); tgtTo = new T.Vector3(0, 0, R); }
    else if (sel && sel.k === "zone") { camTo = new T.Vector3(0, 16 * f, R + 28 * f); tgtTo = new T.Vector3(0, 0, R - 5); }
    else if (sel && sel.k === "part" && (sel.id === "head" || sel.id === "tassel")) { camTo = new T.Vector3(0, 9, R + 17); tgtTo = new T.Vector3(0, 3, R); }
    else { camTo = overviewPos(); tgtTo = new T.Vector3(0, 0, 0); }
    G.killTweensOf(camera.position); G.killTweensOf(controls.target); if (rotTween) rotTween.kill();
    controls.enabled = false;
    if (rotTo != null) rotTween = G.to(malaGroup.rotation, { y: wrapNear(rotTo, malaGroup.rotation.y), duration: dur, ease: "power3.inOut" });
    G.to(controls.target, { x: tgtTo.x, y: tgtTo.y, z: tgtTo.z, duration: dur, ease: "power3.inOut" });
    G.to(camera.position, { x: camTo.x, y: camTo.y, z: camTo.z, duration: dur, ease: "power3.inOut", onComplete: function () { controls.enabled = true; } });
    quoteEl.classList.toggle("hide", !!focused && !narrow);
    labelsBox.classList.toggle("hide", !!focused);
    buildFocusUI();
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

  function updateOverlays() {
    var o = toScreen(tmp.set(0, 0, 0)), ctr = { x: o.x, y: o.y };
    if (!narrow && !focused) {
      labelDefs.forEach(function (d) {
        if (d.set !== labelSet) { d.el.style.display = "none"; d.path.style.display = "none"; return; }
        d.el.style.display = "";
        d.anchor(tmp); var a = toScreen(tmp), dx = a.x - ctr.x, dy = a.y - ctr.y, m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
        if (d.mode === "in") { dx = -dx; dy = -dy; }
        if (d.id === "head" || d.id === "head2" || d.id === "tassel") { dx = d.id === "tassel" ? 0.75 : -0.75; dy = -0.66; } // 斜上方，避免蓋住第 108 顆兩側的珠子
        if (d.set === "book" && a.z > 1) { d.el.style.display = "none"; d.path.style.display = "none"; return; }
        if (d.id === "sp3") { dx = 0.8; dy = 0.6; } // 第四隔珠：標籤放右下，避開正上方的佛頭珠
        var lx = a.x + dx * d.off, ly = a.y + dy * d.off, tx = dx > 0.35 ? "0" : dx < -0.35 ? "-100%" : "-50%";
        // 標籤保持在可視範圍內（不被畫面邊緣或右側面板切掉）
        var w = d.w || (d.w = d.el.offsetWidth), left = tx === "0" ? lx : tx === "-100%" ? lx - w : lx - w / 2;
        var maxR = W - (narrow ? 0 : offX * 2) - 10, cl = Math.max(10, Math.min(left, maxR - w));
        if (cl !== left) { lx += cl - left; left = cl; }
        d.el.style.transform = "translate(" + left.toFixed(1) + "px," + ly.toFixed(1) + "px) translate(0,-50%)";
        var ex = dx > 0.35 ? lx : dx < -0.35 ? lx : lx, ey = ly + (dy > 0.5 ? -9 : dy < -0.5 ? 9 : 0);
        d.path.setAttribute("d", "M" + a.x.toFixed(1) + " " + a.y.toFixed(1) + " L" + (dx > 0.35 ? lx - 2 : dx < -0.35 ? lx + 2 : lx).toFixed(1) + " " + ey.toFixed(1));
        d.path.style.display = "";
      });
    } else labelDefs.forEach(function (d) { d.path.style.display = "none"; });

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
    if (hover && hover.obj && hover.obj !== (c && c.obj) && hover.bead && !(selected && selected.k !== "zone" && isSelBead(hover))) G.to(hover.obj.scale, { x: 1, y: 1, z: 1, duration: 0.3 });
    hover = c;
    if (c && c.bead && !isSelBead(c)) G.to(c.obj.scale, { x: 1.25, y: 1.25, z: 1.25, duration: 0.3, ease: "back.out(1.7)" });
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
    var dt = Math.min(0.05, clock.getDelta());
    if (!paused && !reduce) { tt += dt; galaxyGroup.rotation.y += dt * 0.02; baseGroup.rotation.y -= dt * 0.05; }
    var idle = !focused && !paused && !reduce && !hover && !userDrag;
    spinV += ((idle ? 0.07 : 0) - spinV) * Math.min(1, dt * 2.5); if (paused || reduce) spinV = 0;
    if (!(rotTween && rotTween.isActive())) malaGroup.rotation.y -= spinV * dt;
    bobAmp += ((focused ? 0 : 1) - bobAmp) * Math.min(1, dt * 3);
    lerpBeads(dt);
    controls.update();
    updateOverlays();
    renderer.render(scene, camera);
    if (first) { first = false; window.__kmReady = true; var l = document.getElementById("loading"); if (l) { l.style.opacity = 0; setTimeout(function () { l.style.display = "none"; }, 900); } }
  }

  /* ---------- 對外 ---------- */
  API.setPaused = function (v) { paused = !!v; };
  API.setMode = function (m, zoneView) {
    if (!built) return;
    mode = m; labelSet = m === "book" ? "book" : zoneView ? "zones" : "parts";
    applyTargets();
  };
  API.setLines = function (v) { lines = !!v; stage.classList.toggle("nolines", !lines); };
  API.hint = function () {};
  API.screenOf = function (n) { // 供測試：第 n 顆珠在頁面上的座標
    var o = n === "head" ? guru : n === "tassel" ? tassel : beads[n].grp; o.getWorldPosition(tmp); var s = toScreen(tmp), r = renderer.domElement.getBoundingClientRect();
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
    out.guruAbove = guru.position.y > 1 && Math.hypot(guru.position.x - P[108].x, guru.position.z - P[108].z) < 0.01;
    out.tasselAbove = tassel.position.y > guru.position.y;
    out.strings = malaGroup.children.filter(function (c) { return c === stringMesh; }).length;
    out.rotY = malaGroup.rotation.y; out.cam = camera.position.toArray();
    return out;
  };
})();

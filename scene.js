/* 全息星海 3D 層（three.js）：星系、念珠、飛近特寫、引線與文字入口。
 * 內容與珠位模型由 app.js（KM）提供；本檔只負責畫面。 */
(function () {
  "use strict";
  var API = (window.KM3D = {});
  var T = window.THREE, G = window.gsap;
  var KM, D, host, stage, renderer, scene, camera, controls, malaGroup, galaxyGroup, baseGroup;
  var R = 26, TAU = Math.PI * 2, FOV = 45, ZC = [0x6fe3f0, 0xffd27a, 0xc9a8ff, 0xff8f9d];
  var W = 1, H = 1, narrow = false, offX = 0, offY = 0;
  var beads = [], guru, tassel, stringMesh, ringLocal = [];
  var paused = false, reduce = false, lines = true, selected = null, focused = false;
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
    host.appendChild(renderer.domElement);

    scene = new T.Scene(); scene.fog = new T.FogExp2(0x000510, 0.006);
    camera = new T.PerspectiveCamera(FOV, 1, 0.1, 1000);
    controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.06; controls.enablePan = false;
    controls.minDistance = 8; controls.maxDistance = 140; controls.minPolarAngle = 0.3; controls.maxPolarAngle = 1.3;
    controls.rotateSpeed = 0.6;

    scene.add(new T.AmbientLight(0xffffff, 0.45));
    var cl = new T.PointLight(0x00f3ff, 2, 120); cl.position.set(0, 4, 0); scene.add(cl);
    var dl = new T.DirectionalLight(0xffffff, 0.8); dl.position.set(20, 50, 20); scene.add(dl);

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

  function buildGalaxy() {
    galaxyGroup = new T.Group(); galaxyGroup.position.y = -9; scene.add(galaxyGroup);
    var N = 7000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), i, c = new T.Color();
    for (i = 0; i < N; i++) {
      var arm = i % 3, r = Math.pow(Math.random(), 0.7) * 150 + 6, ang = arm * TAU / 3 + r * 0.045 + (Math.random() - .5) * (0.9 - r / 220);
      var spread = (Math.random() - .5) * (3 + r * 0.05);
      pos[i * 3] = Math.cos(ang) * r + (Math.random() - .5) * 6; pos[i * 3 + 1] = spread * (1 - r / 190); pos[i * 3 + 2] = Math.sin(ang) * r + (Math.random() - .5) * 6;
      var m = Math.random(); if (r < 30) c.setRGB(1, 0.8 + m * 0.2, 0.6 + m * 0.2); else if (m < 0.25) c.setRGB(0.85, 0.7, 1); else c.setRGB(0.5 + m * 0.4, 0.8 + m * 0.2, 1);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    var g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(pos, 3)); g.setAttribute("color", new T.BufferAttribute(col, 3));
    galaxyGroup.add(new T.Points(g, new T.PointsMaterial({ map: glowTexture(), size: 1.1, vertexColors: true, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false })));
    var core = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), color: 0x6a5cff, transparent: true, opacity: 0.45, blending: T.AdditiveBlending, depthWrite: false }));
    core.scale.set(110, 110, 1); galaxyGroup.add(core);
    var core2 = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), color: 0xffc58a, transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false }));
    core2.scale.set(34, 34, 1); galaxyGroup.add(core2);
    // 遠景散星
    var M = 1500, p2 = new Float32Array(M * 3);
    for (i = 0; i < M; i++) { var u = Math.random() * TAU, v = Math.acos(2 * Math.random() - 1), rr = 260 + Math.random() * 200; p2[i * 3] = rr * Math.sin(v) * Math.cos(u); p2[i * 3 + 1] = rr * Math.cos(v); p2[i * 3 + 2] = rr * Math.sin(v) * Math.sin(u); }
    var g2 = new T.BufferGeometry(); g2.setAttribute("position", new T.BufferAttribute(p2, 3));
    scene.add(new T.Points(g2, new T.PointsMaterial({ map: glowTexture(), size: 2.6, color: 0xcfe8ff, transparent: true, opacity: 0.7, sizeAttenuation: true, blending: T.AdditiveBlending, depthWrite: false, fog: false })));
  }

  function buildBase() { // 全息投影底座：同心環＋放射線
    baseGroup = new T.Group(); baseGroup.position.y = -11; scene.add(baseGroup);
    [[R + 3, R + 3.25, .3], [R + 7, R + 7.15, .18], [R + 12, R + 12.1, .1], [R - 4, R - 3.9, .16]].forEach(function (a) {
      var m = new T.Mesh(new T.RingGeometry(a[0], a[1], 128), new T.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: a[2], side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; baseGroup.add(m);
    });
    var pts = []; for (var i = 0; i < 36; i++) { var a = i / 36 * TAU; pts.push(new T.Vector3(Math.cos(a) * (R - 4), 0, Math.sin(a) * (R - 4)), new T.Vector3(Math.cos(a) * (R + 12), 0, Math.sin(a) * (R + 12))); }
    baseGroup.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.07, blending: T.AdditiveBlending, depthWrite: false })));
  }

  function buildMala() {
    malaGroup = new T.Group(); scene.add(malaGroup);
    var gtex = glowTexture();
    var geoR = new T.IcosahedronGeometry(0.55, 2), geoRW = new T.IcosahedronGeometry(0.55, 1);
    var geoM = new T.IcosahedronGeometry(0.72, 2), geoMW = new T.IcosahedronGeometry(0.72, 1);
    for (var n = 1; n <= 108; n++) {
      var b = KM.BEADS[n], th = TAU * n / 108, grp = new T.Group();
      var tint = b.spacer ? 0xff2a2a : b.term ? ZC[b.z] : 0x2a6cff;
      var core = new T.Mesh(b.spacer ? geoM : geoR, new T.MeshPhysicalMaterial({ color: b.spacer ? 0x8a0a0a : 0x0a3acc, emissive: tint, emissiveIntensity: 0.5, transparent: true, opacity: 0.85, roughness: 0.1, metalness: 0.8, clearcoat: 1 }));
      var wire = new T.Mesh(b.spacer ? geoMW : geoRW, new T.MeshBasicMaterial({ color: b.spacer ? 0xff5555 : tint, wireframe: true, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false }));
      wire.scale.setScalar(1.08);
      var glow = new T.Sprite(new T.SpriteMaterial({ map: gtex, color: tint, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false }));
      glow.scale.setScalar(b.spacer ? 5 : 3.6);
      grp.add(core, wire, glow);
      grp.position.set(Math.sin(th) * R, 0, Math.cos(th) * R);
      malaGroup.add(grp);
      var o = { n: n, grp: grp, core: core, wire: wire, glow: glow, spacer: b.spacer, z: b.z, assigned: !!b.term, r: (b.spacer ? 0.72 : 0.55) * 1.08,
        cur: { op: 0.85, em: 0.5, wo: 0.35, go: 0.35 }, tgt: { op: 0.85, em: 0.5, wo: 0.35, go: 0.35 }, sc: 1 };
      beads[n] = o;
      if (b.term || b.spacer) cands.push({ act: b.spacer ? "spacer:" + b.z : "bead:" + n, obj: grp, rad: b.spacer ? 1.05 : 0.85, bead: o });
    }
    // 串繩（連續圓環，貫穿所有珠心）
    stringMesh = new T.Mesh(new T.TorusGeometry(R, 0.06, 8, 256), new T.MeshBasicMaterial({ color: 0xb9f6ff, transparent: true, opacity: 0.75, blending: T.AdditiveBlending, depthWrite: false }));
    stringMesh.rotation.x = Math.PI / 2; malaGroup.add(stringMesh);
    var sg = new T.Mesh(new T.TorusGeometry(R, 0.22, 8, 192), new T.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.12, blending: T.AdditiveBlending, depthWrite: false }));
    sg.rotation.x = Math.PI / 2; malaGroup.add(sg);
    for (var i = 0; i < 128; i++) { var a = i / 128 * TAU; ringLocal.push(new T.Vector3(Math.sin(a) * R, 0, Math.cos(a) * R)); }

    // 佛頭珠：在第 108 顆（local 角度 0，座標 (0,0,R)）正上方；飾穗由佛頭珠向外垂下
    var gold = new T.MeshPhysicalMaterial({ color: 0xffaa00, emissive: 0x885500, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.9, clearcoat: 1 });
    guru = new T.Group(); guru.position.set(0, 3.5, R);
    guru.add(new T.Mesh(new T.IcosahedronGeometry(1.35, 2), gold));
    var gw = new T.Mesh(new T.IcosahedronGeometry(1.35, 1), new T.MeshBasicMaterial({ color: 0xffe08a, wireframe: true, transparent: true, opacity: 0.45, blending: T.AdditiveBlending, depthWrite: false })); gw.scale.setScalar(1.1); guru.add(gw);
    var band = new T.Mesh(new T.TorusGeometry(1.36, 0.09, 8, 48), gold); band.rotation.x = Math.PI / 2; guru.add(band);
    var cap = new T.Mesh(new T.ConeGeometry(0.55, 0.9, 16), gold); cap.position.y = 1.7; guru.add(cap);
    var gg = new T.Sprite(new T.SpriteMaterial({ map: gtex, color: 0xffc040, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false })); gg.scale.setScalar(7); guru.add(gg);
    malaGroup.add(guru);
    var stem = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 1.4, 8), new T.MeshBasicMaterial({ color: 0xb9f6ff, transparent: true, opacity: 0.8, blending: T.AdditiveBlending })); stem.position.set(0, 1.45, R); malaGroup.add(stem);
    cands.push({ act: "part:head", obj: guru, rad: 1.7 });
    // 飾穗：繫於佛頭珠頂端，向上（遠離念珠）展開，任何視角都不遮住第 108 顆
    tassel = new T.Group(); tassel.position.set(0, 3.5 + 2.15, R);
    tassel.add(new T.Mesh(new T.SphereGeometry(0.3, 12, 12), gold));
    var red = new T.MeshPhysicalMaterial({ color: 0xaa1111, emissive: 0xff2a2a, emissiveIntensity: 0.7, transparent: true, opacity: 0.9, roughness: 0.2, metalness: 0.5 });
    var body = new T.Mesh(new T.ConeGeometry(0.55, 1.8, 16), red); body.rotation.z = Math.PI; body.position.y = 1.1; tassel.add(body);
    var tp = []; for (var k = 0; k < 16; k++) { var ta = k / 16 * TAU; tp.push(new T.Vector3(Math.cos(ta) * 0.5, 2.0, Math.sin(ta) * 0.5), new T.Vector3(Math.cos(ta) * 1.1, 4.6, Math.sin(ta) * 1.1)); }
    tassel.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(tp), new T.LineBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.9, blending: T.AdditiveBlending })));
    var tb = new T.Object3D(); tb.position.set(0, 2.3, 0); tassel.add(tb);
    malaGroup.add(tassel);
    cands.push({ act: "part:tassel", obj: tb, rad: 2.4 });
  }

  /* ---------- 文字入口（螢幕座標的 HTML 標籤＋引線） ---------- */
  function buildLabels() {
    function add(id, act, text, anchor, mode, off) { labelDefs.push({ id: id, act: act, text: text, anchor: anchor, mode: mode, off: off }); }
    var ringPt = function (n) { return function (out) { var th = TAU * n / 108; return out.set(Math.sin(th) * R, 0, Math.cos(th) * R); }; };
    var obj = function (o, dy) { return function (out) { o.getWorldPosition(out); out.y += dy || 0; return out; }; };
    var world = function (fn) { return function (out) { fn(out); return malaGroup.localToWorld(out); }; };
    add("head", "part:head", "佛頭珠", function (out) { return guru.getWorldPosition(out); }, "out", 44);
    add("tassel", "part:tassel", "佛頭珠飾穗", function (out) { tassel.getWorldPosition(out); out.y += 2.6; return out; }, "out", 44);
    D.zones.forEach(function (zn, zi) {
      add("sp" + zi, "spacer:" + zi, "隔珠" + "一二三四".charAt(zi) + "・" + zn.name, world(ringPt(zn.spacerNo)), "out", 40);
      add("zn" + zi, "zone:" + zi, zn.name + " " + zn.first + "–" + zn.last, world(ringPt(zi * 27 + 13.5)), "out", 52);
    });
    add("bead", "part:bead", "普通數珠 104 顆", world(ringPt(40)), "in", 80);
    add("string", "part:string", "串繩", world(ringPt(67.5)), "in", 80);
    labelDefs.forEach(function (d) {
      var b = document.createElement("button"); b.type = "button"; b.className = "lab"; b.textContent = d.text; b.setAttribute("data-act", d.act); b.setAttribute("aria-label", d.text);
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
      else if (s.k === "chapter") { chSet = {}; KM.zonesOfChapter(s.id).forEach(function (zn) { zn.terms.forEach(function (_, i) { chSet[zn.first + i] = 1; }); }); }
    }
    for (var n = 1; n <= 108; n++) {
      var b = beads[n], t = b.tgt;
      if (b.spacer) { t.op = 0.95; t.em = 0.9; t.wo = 0.55; t.go = 0.6; }
      else if (b.assigned) { t.op = 0.88; t.em = 0.75; t.wo = 0.4; t.go = 0.4; }
      else { t.op = 0.3; t.em = 0.14; t.wo = 0.12; t.go = 0.05; }
      var dim = false;
      if (zone != null) dim = b.z !== zone; else if (chSet) dim = !chSet[n];
      if (dim) { t.op *= 0.25; t.em *= 0.3; t.wo *= 0.3; t.go *= 0.2; }
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
      b.core.material.opacity = c.op; b.core.material.emissiveIntensity = c.em; b.wire.material.opacity = c.wo; b.glow.material.opacity = c.go;
      b.grp.position.y = (paused || reduce) ? 0 : Math.sin(tt * 1.6 + n * 0.35) * 0.16 * bobAmp;
    }
  }

  /* ---------- 選取 → 轉動與飛近 ---------- */
  var FOCUS_KINDS = { bead: 1, spacer: 1, zone: 1 };
  API.setSelection = function (sel) {
    if (!built) return;
    var prev = selected; selected = sel;
    focused = !!sel && (FOCUS_KINDS[sel.k] || (sel.k === "part" && (sel.id === "head" || sel.id === "tassel")));
    applyTargets();
    scaleFor(prev, 1); if (sel && (sel.k === "bead" || sel.k === "spacer")) scaleFor(sel, 1.3);
    var dur = reduce ? 0.01 : 1.9, camTo, tgtTo, rotTo = null;
    var f = Math.max(1, 1.45 / aEff());
    if (sel && sel.k === "bead") rotTo = -TAU * sel.n / 108;
    else if (sel && sel.k === "spacer") rotTo = -TAU * D.zones[sel.z].spacerNo / 108;
    else if (sel && sel.k === "zone") rotTo = -TAU * (D.zones[sel.z].first + 13) / 108;
    else if (sel && sel.k === "part" && (sel.id === "head" || sel.id === "tassel")) rotTo = 0;
    if (sel && (sel.k === "bead" || sel.k === "spacer")) { camTo = new T.Vector3(0, 6.5, R + 13); tgtTo = new T.Vector3(0, 0, R); }
    else if (sel && sel.k === "zone") { camTo = new T.Vector3(0, 16 * f, R + 28 * f); tgtTo = new T.Vector3(0, 0, R - 5); }
    else if (sel && sel.k === "part" && (sel.id === "head" || sel.id === "tassel")) { camTo = new T.Vector3(0, 11, R + 20); tgtTo = new T.Vector3(0, 5.5, R); }
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
    if (!s || (s.k !== "bead" && s.k !== "spacer")) return;
    var n = s.k === "bead" ? s.n : D.zones[s.z].spacerNo;
    G.to(beads[n].grp.scale, { x: v, y: v, z: v, duration: v > 1 ? 1 : 0.5, ease: v > 1 ? "elastic.out(1,0.4)" : "power2.out" });
  }

  /* ---------- 聚焦時的文字：名稱、章名引線 ---------- */
  var fanItems = [], selInfo = null, fanPaths = [];
  function buildFocusUI() {
    fanBox.innerHTML = ""; fanPaths.forEach(function (p) { p.remove(); }); fanPaths = []; fanItems = []; selInfo = null;
    calloutEl.classList.remove("on"); mainLeader.style.opacity = 0;
    var s = selected; if (!s || (s.k !== "bead" && s.k !== "spacer")) return;
    var n, zn, name, sub;
    if (s.k === "bead") { var b = KM.BEADS[s.n]; n = s.n; zn = D.zones[b.z]; name = KM.termById[b.term].name; sub = zn.name + "區 第 " + b.pos + "／26 珠 ・ 環上 " + n + "／108"; }
    else { zn = D.zones[s.z]; n = zn.spacerNo; name = "隔珠" + "一二三四".charAt(s.z) + "：" + zn.spacerTitle; sub = "環上 " + n + "／108 ・ 代表其前 26 顆數珠"; }
    calloutEl.innerHTML = "<b>" + KM.esc(name) + "</b><small>" + KM.esc(sub) + "</small>";
    selInfo = { n: n };
    var cp = document.createElementNS("http://www.w3.org/2000/svg", "path"); leaders.appendChild(cp); selInfo.cpath = cp; fanPaths.push(cp);
    if (narrow) return;
    zn.chapters.forEach(function (c) {
      var ch = KM.chById[c.id], t = "第" + ch.no + "章 " + ch.title + (c.partial ? "（部分內容）" : "");
      var b2 = document.createElement("button"); b2.type = "button"; b2.className = "fl"; b2.textContent = t; b2.setAttribute("aria-label", t);
      b2.addEventListener("click", function () { KM.go("chapter:" + ch.id); });
      fanBox.appendChild(b2);
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path"); leaders.appendChild(p); fanPaths.push(p);
      fanItems.push({ el: b2, path: p });
    });
  }

  function updateOverlays() {
    var o = toScreen(tmp.set(0, 0, 0)), ctr = { x: o.x, y: o.y };
    if (!narrow && !focused) {
      labelDefs.forEach(function (d) {
        d.anchor(tmp); var a = toScreen(tmp), dx = a.x - ctr.x, dy = a.y - ctr.y, m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
        if (d.mode === "in") { dx = -dx; dy = -dy; }
        if (d.id === "head" || d.id === "tassel") { dx = d.id === "head" ? -1 : 1; dy = d.id === "head" ? 0.1 : -0.15; }
        if (d.id === "sp3") { dx = 0.8; dy = 0.6; } // 第四隔珠：標籤放右下，避開正上方的佛頭珠
        var lx = a.x + dx * d.off, ly = a.y + dy * d.off, tx = dx > 0.35 ? "0" : dx < -0.35 ? "-100%" : "-50%";
        d.el.style.transform = "translate(" + lx.toFixed(1) + "px," + ly.toFixed(1) + "px) translate(" + tx + ",-50%)";
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
    if (best) return best;
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
  function isSelBead(c) { var s = selected; return !!(s && c.bead && ((s.k === "bead" && s.n === c.bead.n) || (s.k === "spacer" && D.zones[s.z].spacerNo === c.bead.n))); }
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

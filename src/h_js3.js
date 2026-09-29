
/* ======================================================================
   3D — a Class 8 tractor (aero cab + sleeper, duals on a tandem) and a
   53' dry van. Metres, x forward, y up, z toward the passenger side.
   ====================================================================== */
const stageEl = $('#tireStage'), canvas = $('#tireCanvas');
let renderer = null, scene = null, camera = null, controls = null, sun = null, hemi = null, groundShadow = null;
let sceneOK = true, curModel = null, fly = null, stageK = 1;
const models = { truck:null, trailer:null };
const MAT = {};

function initMaterials(){
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MAT.paint     = phys({ color:'#b9c0c9', roughness:.34, metalness:.45, clearcoat:1, clearcoatRoughness:.14, envMapIntensity:.85 });
  MAT.paintGrey = phys({ color:'#6f7885', roughness:.45, metalness:.4, clearcoat:.5 });
  MAT.paintDS   = MAT.paint.clone(); MAT.paintDS.side = THREE.DoubleSide;
  MAT.trailer   = phys({ color:'#e4e8ed', roughness:.5, metalness:.08, clearcoat:.4, clearcoatRoughness:.3, envMapIntensity:.7 });
  MAT.ribs      = std({ color:'#d7dce3', roughness:.55, metalness:.15 });
  MAT.skirt     = std({ color:'#c3c9d2', roughness:.5, metalness:.25 });
  MAT.glass     = std({ color:'#0c1520', roughness:.04, metalness:.92, envMapIntensity:1.7 });
  MAT.chrome    = std({ color:'#e2e6eb', roughness:.1, metalness:1, envMapIntensity:1.4 });
  MAT.alum      = std({ color:'#c9cfd7', roughness:.3, metalness:1 });
  MAT.frame     = std({ color:'#1a1d22', roughness:.62, metalness:.45 });
  MAT.axle      = std({ color:'#30353d', roughness:.5, metalness:.7 });
  MAT.rubber    = std({ color:'#161618', roughness:.95, metalness:0 });
  MAT.rim       = std({ color:'#d4d9e0', roughness:.2, metalness:1, envMapIntensity:1.3 });
  MAT.lampH     = std({ color:'#fff6d6', roughness:.15, emissive:'#ffedb0', emissiveIntensity:.7 });
  MAT.lampR     = std({ color:'#d63a30', roughness:.3, emissive:'#ff2b20', emissiveIntensity:.55 });
  MAT.dark      = std({ color:'#0f1115', roughness:.6, metalness:.3 });
}
const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if(parent) parent.add(m); return m;
};
const box = (w, h, d, r = .03) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
function roundedShape(pts, r){
  const s = new THREE.Shape(), n = pts.length;
  for(let i = 0; i < n; i++){
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const v1 = [p0[0] - p1[0], p0[1] - p1[1]], v2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]), rr = Math.min(r, l1 / 2, l2 / 2);
    const a = [p1[0] + v1[0] / l1 * rr, p1[1] + v1[1] / l1 * rr], b = [p1[0] + v2[0] / l2 * rr, p1[1] + v2[1] / l2 * rr];
    if(i === 0) s.moveTo(a[0], a[1]); else s.lineTo(a[0], a[1]);
    s.quadraticCurveTo(p1[0], p1[1], b[0], b[1]);
  }
  s.closePath(); return s;
}
function extrude(pts, width, r = .15, bevel = .08){
  const g = new THREE.ExtrudeGeometry(roundedShape(pts, r), { depth:width - 2 * bevel, bevelEnabled:true, bevelThickness:bevel, bevelSize:bevel, bevelSegments:3, curveSegments:6 });
  g.translate(0, 0, -(width - 2 * bevel) / 2); return g;
}
function rrPath(p, w, h, r){
  p.moveTo(-w / 2 + r, -h / 2); p.lineTo(w / 2 - r, -h / 2); p.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  p.lineTo(w / 2, h / 2 - r); p.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  p.lineTo(-w / 2 + r, h / 2); p.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  p.lineTo(-w / 2, -h / 2 + r); p.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2); return p;
}
function ringGeo(w, d, t = .07, r = .2){
  const s = rrPath(new THREE.Shape(), w, d, r); s.holes.push(rrPath(new THREE.Path(), w - 2 * t, d - 2 * t, Math.max(.02, r - t)));
  const g = new THREE.ShapeGeometry(s, 6); g.rotateX(-Math.PI / 2); return g;
}

/* ---------- tire + wheel ---------- */
let TIRE_GEO = null;
function tireGeo(){
  if(TIRE_GEO) return TIRE_GEO;
  const P = [[.286,-.10],[.30,-.138],[.38,-.149],[.46,-.143],[.505,-.12],[.523,-.088],[.53,0],[.523,.088],[.505,.12],[.46,.143],[.38,.149],[.30,.138],[.286,.10]];
  TIRE_GEO = new THREE.LatheGeometry(P.map(p => new THREE.Vector2(p[0], p[1])), 56);
  return TIRE_GEO;
}
function makeTire(l, parent){
  const grp = new THREE.Group(); grp.position.set(l.x, TR, l.z); grp.userData.n = l.n;
  const mat = MAT.rubber.clone();
  const body = new THREE.Mesh(tireGeo(), mat); body.rotation.x = Math.PI / 2; body.castShadow = true; body.receiveShadow = true; grp.add(body);
  [-.075, 0, .075].forEach(o => {                               // tread grooves
    const t = new THREE.Mesh(new THREE.TorusGeometry(.529, .0065, 6, 64), MAT.dark); t.position.z = o; grp.add(t);
  });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(.285, .285, .23, 36), MAT.rim); rim.rotation.x = Math.PI / 2; grp.add(rim);
  const sgn = Math.sign(l.z) || 1;
  const face = new THREE.Mesh(new THREE.CylinderGeometry(.215, .215, .045, 32), MAT.chrome); face.rotation.x = Math.PI / 2; face.position.z = sgn * .118; grp.add(face);
  const hubcap = new THREE.Mesh(new THREE.CylinderGeometry(.09, .1, .07, 20), MAT.chrome); hubcap.rotation.x = Math.PI / 2; hubcap.position.z = sgn * .15; grp.add(hubcap);
  for(let i = 0; i < 10; i++){
    const a = i / 10 * Math.PI * 2;
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .05, 6), MAT.alum);
    nut.rotation.x = Math.PI / 2; nut.position.set(Math.cos(a) * .155, Math.sin(a) * .155, sgn * .14); grp.add(nut);
  }
  parent.add(grp);
  const marker = new THREE.Mesh(ringGeo(1.4, .5), new THREE.MeshBasicMaterial({ color:'#0F6FFF', transparent:true, opacity:.95, depthWrite:false }));
  marker.position.set(l.x, .035, l.z); marker.visible = false; parent.add(marker);
  return { n:l.n, grp, mat, marker };
}
function fender(parent, x, z, w, r = .64){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 36, 1, true, Math.PI / 2, Math.PI), MAT.paintDS);
  m.rotation.x = Math.PI / 2; m.position.set(x, TR, z); m.castShadow = true; m.receiveShadow = true; parent.add(m);
}

/* ---------- Class 8 tractor ---------- */
function buildTractor(){
  const g = new THREE.Group(), tires = [];
  /* chassis */
  [-.42, .42].forEach(z => mesh(box(8.5, .26, .11, .02), MAT.frame, -.55, .95, z, g));
  [3.0, 1.9, .6, -1.2, -3.0, -4.4].forEach(x => mesh(box(.12, .16, .9, .02), MAT.frame, x, .93, 0, g));
  [2.55, -2.35, -3.70].forEach(x => { const c = mesh(new THREE.CylinderGeometry(.075, .075, x > 0 ? 2.0 : 1.9, 14), MAT.axle, x, TR, 0, g); c.rotation.x = Math.PI / 2; });
  [-2.35, -3.70].forEach(x => mesh(box(.55, .42, .6, .1), MAT.axle, x, TR, 0, g));
  const shaft = mesh(new THREE.CylinderGeometry(.05, .05, 1.5, 10), MAT.axle, -1.55, .8, 0, g); shaft.rotation.z = Math.PI / 2;
  /* fifth wheel */
  mesh(new THREE.CylinderGeometry(.56, .56, .13, 40), MAT.frame, -2.85, 1.2, 0, g);
  mesh(box(1.1, .1, 1.5, .03), MAT.axle, -2.6, 1.13, 0, g);
  mesh(box(.5, .05, .12, .01), MAT.paintGrey, -2.5, 1.3, .3, g); mesh(box(.5, .05, .12, .01), MAT.paintGrey, -2.5, 1.3, -.3, g);
  /* cab + sleeper, hood, roof fairing */
  mesh(extrude([[1.65,1.25],[1.65,2.75],[1.2,2.95],[.7,3.55],[.45,3.72],[-1.15,3.72],[-1.4,3.55],[-1.4,1.3]], 2.5, .22, .09), MAT.paint, 0, 0, 0, g);
  mesh(extrude([[3.42,1.3],[3.52,1.6],[3.5,2.15],[3.3,2.48],[2.5,2.7],[1.7,2.78],[1.65,1.3]], 2.05, .14, .08), MAT.paint, 0, 0, 0, g);
  mesh(extrude([[.5,3.7],[.28,3.98],[-.5,4.02],[-1.3,3.7]], 2.3, .12, .06), MAT.paint, 0, 0, 0, g);
  mesh(box(2.85, .34, 2.58, .06), MAT.paintGrey, .2, 1.45, 0, g);                       // lower cladding
  [-1, 1].forEach(s => {
    mesh(box(.9, .9, .05, .02), MAT.paint, -1.85, 3.15, s * 1.12, g);                      // cab extenders
    mesh(box(.86, .56, .04, .02), MAT.glass, .72, 3.1, s * 1.265, g);                       // door glass
    mesh(box(.02, 1.5, .02, .005), MAT.dark, 1.28, 2.35, s * 1.262, g);                     // door seams
    mesh(box(.02, 1.5, .02, .005), MAT.dark, -.18, 2.35, s * 1.262, g);
    mesh(box(.5, .045, .045, .01), MAT.alum, .55, 2.25, s * 1.29, g);                       // door handle
    mesh(box(.06, .06, .42, .02), MAT.frame, 1.36, 3.3, s * 1.42, g);                        // mirror arm
    mesh(box(.13, .6, .17, .04), MAT.frame, 1.3, 3.05, s * 1.62, g);                         // mirror head
    mesh(box(.02, .4, .13, .01), MAT.glass, 1.37, 3.05, s * 1.62, g);
    mesh(new THREE.CylinderGeometry(.085, .085, 2.9, 18), MAT.chrome, -1.05, 2.3, s * 1.37, g); // exhaust stacks
    mesh(new THREE.CylinderGeometry(.095, .095, .09, 18), MAT.dark, -1.05, 3.78, s * 1.37, g);
    const tank = mesh(new THREE.CylinderGeometry(.34, .34, 1.55, 28), MAT.chrome, -.1, .95, s * 1.04, g); tank.rotation.z = Math.PI / 2;
    [-.55, .35].forEach(x => mesh(box(.06, .7, .06, .01), MAT.frame, x, .95, s * 1.04, g));
    mesh(box(.38, .05, .44, .01), MAT.alum, 1.25, 1.1, s * 1.16, g);                        // steps
    mesh(box(.38, .05, .44, .01), MAT.alum, 1.25, 1.55, s * 1.16, g);
    mesh(box(.06, .26, .5, .03), MAT.lampH, 3.53, 1.88, s * .78, g);                          // headlamps
    mesh(box(.05, .08, .4, .02), MAT.lampH, 3.53, 1.66, s * .78, g);
    mesh(box(.03, .03, 1.0, .005), MAT.frame, .95, 3.0, s * .98, g);                          // wiper hint
    mesh(box(.03, .55, .55, .01), MAT.paintGrey, 3.2, 1.55, s * .95, g);                       // bumper corners
  });
  /* windshield: glass laid on the slope (1.2,2.95)->(.7,3.55) */
  const ws = mesh(box(.035, .8, 2.24, .01), MAT.glass, 1.03, 3.29, 0, g); ws.rotation.z = .695;
  mesh(box(.04, .14, 2.24, .02), MAT.frame, .8, 3.62, 0, g).rotation.z = .695;              // sun visor
  /* face */
  mesh(box(.07, .98, 1.08, .05), MAT.chrome, 3.55, 1.95, 0, g);
  for(let i = 0; i < 7; i++) mesh(box(.078, .035, .96, .01), MAT.dark, 3.585, 1.55 + i * .14, 0, g);
  mesh(box(.34, .42, 2.36, .08), MAT.paintGrey, 3.5, 1.0, 0, g);
  mesh(box(.37, .09, 2.2, .02), MAT.chrome, 3.51, 1.13, 0, g);
  mesh(box(.3, .06, .5, .02), MAT.dark, 3.55, .84, 0, g);                                    // air dam
  /* fenders, mudflaps */
  [-1, 1].forEach(s => {
    fender(g, 2.55, s * .98, .44);
    fender(g, -2.35, s * .9, .85); fender(g, -3.70, s * .9, .85);
    mesh(box(.04, .6, .9, .005), MAT.rubber, -4.42, .62, s * .9, g);
  });
  mesh(box(.2, .2, 1.0, .02), MAT.frame, -4.75, .95, 0, g);
  [-.5, .5].forEach(z => mesh(box(.05, .2, .2, .02), MAT.lampR, -4.85, .95, z * 1.2, g));
  /* tires */
  LAYOUT.truck.forEach(l => tires.push(makeTire(l, g)));
  return { group:g, tires, len:8.6, cx:-.55, type:'truck' };
}

/* ---------- 53' dry van ---------- */
function logoTexture(){
  const c = document.createElement('canvas'); c.width = 1280; c.height = 320; const x = c.getContext('2d');
  x.clearRect(0, 0, 1280, 320);
  x.fillStyle = '#1E3A8A'; x.font = '800 132px Inter, Arial, sans-serif'; x.textBaseline = 'middle';
  x.fillText('DAWSON', 30, 128); x.fillStyle = '#0F6FFF'; x.fillText('TRUCK LINES', 30, 262);
  x.fillStyle = '#0F6FFF'; x.fillRect(830, 60, 420, 22); x.fillStyle = '#1E3A8A'; x.fillRect(830, 100, 420, 22);
  x.fillStyle = '#F97316'; x.fillRect(830, 140, 420, 22);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function buildTrailer(){
  const g = new THREE.Group(), tires = [];
  mesh(new RoundedBoxGeometry(16.0, 2.8, 2.6, 5, .1), MAT.trailer, .05, 2.62, 0, g);
  mesh(box(15.9, .14, 2.4, .02), MAT.frame, .05, 1.17, 0, g);
  const rib = new THREE.InstancedMesh(box(.03, .012, 2.5, .004), MAT.ribs, 46), m4 = new THREE.Matrix4();
  for(let i = 0; i < 46; i++){ m4.setPosition(-7.5 + i * .333, 4.024, 0); rib.setMatrixAt(i, m4); }
  rib.castShadow = false; g.add(rib);
  const sr = new THREE.InstancedMesh(box(.03, 2.55, .014, .004), MAT.ribs, 92);
  for(let i = 0; i < 46; i++){ [-1, 1].forEach((s, k) => { m4.setPosition(-7.5 + i * .333, 2.62, s * 1.302); sr.setMatrixAt(i * 2 + k, m4); }); }
  g.add(sr);
  [-.55, .55].forEach(z => mesh(box(15.2, .2, .1, .02), MAT.axle, -.2, 1.02, z, g));
  [7.0, 3.0, -1.0, -4.5, -6.3].forEach(x => mesh(box(.12, .14, 1.9, .02), MAT.axle, x, 1.03, 0, g));
  mesh(new THREE.CylinderGeometry(.09, .09, .1, 12), MAT.alum, 7.0, 1.1, 0, g);            // kingpin
  [-1, 1].forEach(s => {
    mesh(box(.14, .95, .12, .02), MAT.axle, 4.9, .72, s * .95, g);                          // landing gear
    mesh(box(.36, .05, .3, .01), MAT.axle, 4.9, .27, s * .95, g);
    mesh(box(6.0, .55, .035, .01), MAT.skirt, 2.1, .88, s * 1.27, g);                       // aero skirt
    mesh(box(.04, .55, .9, .005), MAT.rubber, -7.55, .6, s * .9, g);                         // mudflap
    mesh(box(.06, .5, .22, .02), MAT.lampR, -8.0, 1.62, s * 1.12, g);                       // tail lights
    mesh(box(.06, .18, .22, .02), MAT.lampR, -8.0, 3.72, s * 1.12, g);
  });
  mesh(box(.1, .1, 1.9, .02), MAT.axle, 4.9, 1.0, 0, g);
  mesh(box(.08, .18, .2, .02), MAT.dark, 4.9, .82, 1.06, g);                                // crank box
  [-5.55, -7.05].forEach(x => { const c = mesh(new THREE.CylinderGeometry(.075, .075, 1.95, 14), MAT.axle, x, TR, 0, g); c.rotation.x = Math.PI / 2; });
  mesh(box(.16, .28, 2.5, .04), MAT.frame, -8.02, .86, 0, g);                                // ICC bumper
  mesh(box(.02, 2.5, .02, .004), MAT.dark, -8.0, 2.62, 0, g);
  [-.85, -.35, .35, .85].forEach(z => mesh(new THREE.CylinderGeometry(.022, .022, 2.45, 8), MAT.chrome, -8.03, 2.6, z, g));
  const tex = logoTexture();
  [-1, 1].forEach(s => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.MeshStandardMaterial({ map:tex, transparent:true, roughness:.5 }));
    p.position.set(2.4, 2.75, s * 1.309); if(s < 0) p.rotation.y = Math.PI; g.add(p);
  });
  LAYOUT.trailer.forEach(l => tires.push(makeTire(l, g)));
  return { group:g, tires, len:16.1, cx:.05, type:'trailer' };
}

/* ---------- scene ---------- */
function ensureScene(){
  if(renderer || !sceneOK) return;
  try{
    renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, powerPreference:'high-performance' });
  }catch(err){ sceneOK = false; $('#stageFallback').style.display = 'flex'; return; }
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture;
  camera = new THREE.PerspectiveCamera(32, 1, .1, 250);
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = .08; controls.enablePan = false;
  controls.minDistance = 6; controls.maxDistance = 60; controls.maxPolarAngle = Math.PI * .495;
  hemi = new THREE.HemisphereLight(0xffffff, 0x9aa5b4, .5); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .03; sun.shadow.radius = 5;
  scene.add(sun); scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0xdfe8ff, .55); fill.position.set(9, 6, -7); scene.add(fill);
  groundShadow = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ opacity:.2 }));
  groundShadow.rotation.x = -Math.PI / 2; groundShadow.receiveShadow = true; scene.add(groundShadow);
  initMaterials();
  updateSceneTheme();
}
function updateSceneTheme(){
  if(!renderer) return;
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  hemi.intensity = dark ? .4 : .5; groundShadow.material.opacity = dark ? .5 : .16; renderer.toneMappingExposure = dark ? .9 : .95;
}
function sceneShow(a){
  ensureScene(); if(!renderer) return;
  if(!models[a.type]){
    models[a.type] = a.type === 'truck' ? buildTractor() : buildTrailer();
    scene.add(models[a.type].group); models[a.type].group.visible = false;
  }
  Object.entries(models).forEach(([k, m]) => { if(m) m.group.visible = k === a.type; });
  curModel = models[a.type]; setSpin(false);
  const half = curModel.len / 2 + 2.5;
  Object.assign(sun.shadow.camera, { left:-half, right:half, top:half, bottom:-half, near:1, far:60 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.position.set(curModel.cx - 2.5, 22, 3.5); sun.target.position.set(curModel.cx, 0, 0);
  sceneResize();
  S.viewPreset = 'top'; applyView('top', false);
  updateTireViz();
}
function sceneResize(){
  if(!renderer) return;
  const w = stageEl.clientWidth, h = stageEl.clientHeight; if(!w || !h) return;
  stageK = stageEl.getBoundingClientRect().width / w;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * stageK);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
let userMoved = false;
new ResizeObserver(() => { if(S.view === 'detail'){ sceneResize(); if(!fly && curModel && !userMoved) applyView(S.viewPreset, false); } }).observe(stageEl);

function pose(name, m){
  const t = Math.tan(camera.fov * Math.PI / 360), asp = camera.aspect || 1.3;
  if(name === 'top'){
    const D = Math.max((m.len + (m.type === 'trailer' ? 4.2 : 3.4)) / (2 * t), 9.4 / (2 * t * asp));
    return { pos:[m.cx - D * .1, D, 0], tgt:[m.cx, 0, 0] };
  }
  if(name === 'iso'){
    const R = Math.max((m.type === 'trailer' ? 1.22 : 1.07) * (m.len + 5), .5 * (m.len + 2) / (t * asp)), el = .42, az = m.type === 'truck' ? .62 : 2.5;
    return { pos:[m.cx + R * Math.cos(el) * Math.cos(az), R * Math.sin(el) + .5, R * Math.cos(el) * Math.sin(az)], tgt:[m.cx, 1.3, 0] };
  }
  const D = Math.max((m.len + 2.2) / (2 * t * asp), 12);
  return { pos:[m.cx, 2.6, D], tgt:[m.cx, 1.8, 0] };
}
function applyView(name, animate = true){
  if(!curModel || !camera) return;
  S.viewPreset = name; userMoved = false;
  $$('#viewSeg button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  const p = pose(name, curModel);
  if(!animate){
    camera.position.set(...p.pos); controls.target.set(...p.tgt); controls.update(); fly = null; return;
  }
  fly = { t0:performance.now(), dur:650, p0:camera.position.clone(), g0:controls.target.clone(), p1:new THREE.Vector3(...p.pos), g1:new THREE.Vector3(...p.tgt) };
}
$('#viewSeg').addEventListener('click', e => { const b = e.target.closest('button'); if(b){ setSpin(false); applyView(b.dataset.view, true); } });
canvas.addEventListener('pointerdown', () => { fly = null; userMoved = true; });
canvas.addEventListener('wheel', () => { fly = null; userMoved = true; }, { passive:true });

/* click a tire → the camera glides to stand beside it */
function focusTire(n){
  if(!curModel || !camera) return;
  const l = LAYOUT[curModel.type][n - 1]; if(!l) return;
  const sgn = Math.sign(l.z) || 1, R = curModel.type === 'truck' ? 6.4 : 7.2;
  const tgt = new THREE.Vector3(l.x, TR + .2, l.z * .55), pos = new THREE.Vector3(l.x + R * .42, TR + R * .52, l.z + sgn * R * .86);
  setSpin(false); userMoved = true;
  fly = { t0:performance.now(), dur:750, p0:camera.position.clone(), g0:controls.target.clone(), p1:pos, g1:tgt };
}
function setSpin(on){
  S.spin = on; if(controls) controls.autoRotate = on;
  const b = $('#spinBtn'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
}
$('#spinBtn').addEventListener('click', () => {
  const on = !S.spin; setSpin(on);
  if(on && S.viewPreset === 'top' && !S.sel.size) applyView('iso', true);
});
$('#resetBtn').addEventListener('click', () => { setSpin(false); applyView(S.viewPreset, true); });

/* ---------- tire state on the model: health tint, hover glow, selection ring ---------- */
function updateTireViz(){
  const a = byId(S.assetId);
  if(!curModel || curModel.type !== a.type) return;
  curModel.tires.forEach(t => {
    const st = tireState(a.tires[t.n - 1]), hov = S.hover === t.n, sel = S.sel.has(t.n);
    if(hov){ t.mat.emissive.set('#0F6FFF'); t.mat.emissiveIntensity = .7; }
    else if(sel){ t.mat.emissive.set('#0F6FFF'); t.mat.emissiveIntensity = .38; }
    else if(st === 'crit'){ t.mat.emissive.set('#ff1f1f'); t.mat.emissiveIntensity = .55; }
    else if(st === 'warn'){ t.mat.emissive.set('#ff9a0a'); t.mat.emissiveIntensity = .42; }
    else { t.mat.emissive.set('#000000'); t.mat.emissiveIntensity = 0; }
    t.marker.visible = sel || hov;
    t.marker.material.opacity = sel ? .95 : .5;
  });
}
window.updateTireViz = updateTireViz;
window.sceneHover = () => updateTireViz();

/* ---------- pills + leader lines ---------- */
const _v = new THREE.Vector3(), _look = new THREE.Vector3();
function projectTags(){
  if(!curModel || !pillEls.length || curModel.type !== byId(S.assetId).type) return;
  const w = stageEl.clientWidth, h = stageEl.clientHeight, k = stageK, lay = LAYOUT[curModel.type];
  const lines = $$('#tagLines line'), dots = $$('#tagLines circle');
  /* Looking straight down the bubbles fan out beside the vehicle; from any other angle each
     bubble sits on its own tire, and only tires facing the camera get one (the far side and
     the inner duals are hidden behind the body). */
  const look = _look.copy(camera.position).sub(controls.target).normalize();
  const topDown = look.y > .93, PR = 22.5;
  lay.forEach((l, i) => {
    const el = pillEls[i]; if(!el) return;
    const ln = lines.find(n => +n.dataset.n === l.n), dt = dots.find(n => +n.dataset.n === l.n);
    const hide = () => { el.style.display = 'none'; if(ln) ln.style.display = 'none'; if(dt) dt.style.display = 'none'; };
    if(!topDown && (!l.outer || Math.sign(l.z) * look.z < -.05)){ hide(); return; }
    let cx, cy;
    if(topDown){
      _v.set(l.x, .6, Math.sign(l.z) * 1.3).project(camera); const ex = (_v.x * .5 + .5) * w;
      _v.set(l.x, .6, l.z).project(camera); cy = (-_v.y * .5 + .5) * h;
      if(_v.z > 1){ hide(); return; }
      cx = ex + Math.sign(l.z) * (PR + 12.5 + (l.dual && l.outer ? 2 * PR + 7.5 : 0));
    } else {
      _v.set(l.x, 1.5, l.z + Math.sign(l.z) * .05).project(camera);
      if(_v.z > 1){ hide(); return; }
      cx = (_v.x * .5 + .5) * w; cy = (-_v.y * .5 + .5) * h;
    }
    el.style.display = 'block';
    el.style.left = (Math.round(cx * k - 18) / k) + 'px'; el.style.top = (Math.round(cy * k - 18) / k) + 'px';
    if(ln){
      if(!topDown){ ln.style.display = 'none'; dt.style.display = 'none'; return; }
      ln.style.display = ''; dt.style.display = '';
      _v.set(l.x, .6, l.z + Math.sign(l.z) * .16).project(camera);
      const x1 = (_v.x * .5 + .5) * w, y1 = (-_v.y * .5 + .5) * h;
      ln.setAttribute('x1', x1); ln.setAttribute('y1', y1); ln.setAttribute('x2', cx - Math.sign(l.z) * PR); ln.setAttribute('y2', cy);
      dt.setAttribute('cx', x1); dt.setAttribute('cy', y1);
    }
  });
}

/* ---------- picking + hover on the model ---------- */
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let pd = null;
function hitTire(e){
  if(!curModel) return 0;
  const r = canvas.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(curModel.tires.map(t => t.grp), true);
  if(!hits.length) return 0;
  let o = hits[0].object; while(o && !o.userData.n) o = o.parent;
  return o ? o.userData.n : 0;
}
function moveHCard(cx, cy){
  const z = ZOOM(), w = hcard.offsetWidth * z, h = hcard.offsetHeight * z;
  let x = cx + 18, y = cy + 14;
  if(x + w > window.innerWidth - 8) x = cx - w - 18;
  if(y + h > window.innerHeight - 8) y = window.innerHeight - h - 8;
  hcard.style.left = (Math.max(8, x) / z) + 'px'; hcard.style.top = (Math.max(8, y) / z) + 'px';
}
canvas.addEventListener('pointerdown', e => { pd = { x:e.clientX, y:e.clientY }; canvas.classList.add('dragging'); hideHCard(); });
canvas.addEventListener('pointerup', e => {
  canvas.classList.remove('dragging');
  if(!pd) return;
  const moved = Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > 5; pd = null;
  if(moved) return;
  const n = hitTire(e); if(n){ pickTire(n, e.shiftKey || e.ctrlKey || e.metaKey); hideHCard(); }
});
canvas.addEventListener('pointermove', e => {
  if(pd) return;
  const n = hitTire(e) || null;
  canvas.classList.toggle('pick', !!n);
  if(n !== S.hover){
    setHover(n);
    if(n){ showHCard(tireCardHTML(byId(S.assetId), n), e.clientX, e.clientY); icons(); }
  } else if(n) moveHCard(e.clientX, e.clientY);
});
canvas.addEventListener('pointerleave', () => { pd = null; canvas.classList.remove('dragging', 'pick'); if(S.hover) setHover(null); });

/* ---------- render loop ---------- */
let lastT = performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  if(S.view !== 'detail' || !renderer || !curModel || document.hidden) return;
  if(fly){
    const u = clamp((now - fly.t0) / fly.dur, 0, 1), e = u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.g0, fly.g1, e);
    if(u >= 1) fly = null;
  }
  const a = byId(S.assetId);
  if(a.moving && curModel.type === a.type){                       // wheels roll with the vehicle's speed
    const om = (a.speedNow ?? a.speed) * .447 / TR * .1 * dt;
    curModel.tires.forEach(t => { t.grp.rotation.z -= om; });
  }
  controls.update();
  projectTags();
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);

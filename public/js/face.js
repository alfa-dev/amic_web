// Three.js 3D face for Amic — Diglett/finger body, round eyes, small mouth
import * as THREE from '/js/three.module.min.js';

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  head:     0xf2f6ff,  // near-white with faint blue tint
  headEmit: 0x505e88,  // blue-white emissive to keep it bright
  eye:      0x080810,  // near-black
  eyeShine: 0xffffff,
  brow:     0x1a1a30,
  mouth:    0x2a2a44,
};

// ── Expressions ───────────────────────────────────────────────────────────────
//  eyeScY   : eye Y scale (1.0=open oval, 0.42=squint, ~0=blink)
//  eyeRotZ  : inner-corner tilt for sad/angry (applied ± per eye)
//  browLZ/RZ: eyebrow rotation
//  mouthC   : curve (+smile / -frown)
const EXPR = {
  EUPHORIC: { eyeScY: 1.10, eyeRotZ:  0,    browLZ:  0.26, browRZ: -0.26, mouthC:  0.55 },
  HAPPY:    { eyeScY: 0.42, eyeRotZ:  0,    browLZ:  0.10, browRZ: -0.10, mouthC:  0.35 },
  NEUTRAL:  { eyeScY: 0.88, eyeRotZ:  0,    browLZ:  0,    browRZ:  0,    mouthC:  0.08 },
  SAD:      { eyeScY: 0.82, eyeRotZ:  0.14, browLZ: -0.18, browRZ:  0.18, mouthC: -0.28 },
  GRUMPY:   { eyeScY: 0.58, eyeRotZ:  0.26, browLZ: -0.36, browRZ:  0.36, mouthC: -0.46 },
};

// ── State ─────────────────────────────────────────────────────────────────────
let scene, camera, renderer, faceGroup;
let leftEye, rightEye, leftBrow, rightBrow, mouthMesh;
let blinkYL = 1, blinkYR = 1;
let talkTimer = null;
let isTalking = false, talkPhase = false;

let cur = { ...EXPR.NEUTRAL, browY: 0 };
let tgt = { ...EXPR.NEUTRAL, browY: 0 };
let time = 0;
let lastMouthC = null;

const EYE_BASE_Y = 1.18;  // base oval stretch for round eyes

const idleFreqY = 0.24 + Math.random() * 0.14;
const idleFreqZ = 0.10 + Math.random() * 0.08;
let mouseNX = 0, mouseNY = 0;

function lerp(a, b, t) { return a + (b - a) * t; }

// ── Init ──────────────────────────────────────────────────────────────────────
export function initFace(canvasEl) {
  const W = canvasEl.offsetWidth  || 320;
  const H = canvasEl.offsetHeight || 320;

  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.6;

  scene  = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 50);
  camera.position.z = 3.8;

  // Lighting — soft and even
  scene.add(new THREE.AmbientLight(0xd8e8ff, 1.10));
  const key = new THREE.PointLight(0xffffff, 3.5, 20);
  key.position.set(-2, 3, 5);
  scene.add(key);
  const front = new THREE.PointLight(0xeef4ff, 1.8, 15);
  front.position.set(0, 0, 6);
  scene.add(front);
  const rim = new THREE.PointLight(0xaa99ff, 1.0, 12);
  rim.position.set(3, 0, 2);
  scene.add(rim);
  const back = new THREE.PointLight(0x4488ff, 0.5, 15);
  back.position.set(0, 0, -5);
  scene.add(back);

  faceGroup = new THREE.Group();
  scene.add(faceGroup);
  buildFace();
  scheduleNextBlink();

  document.addEventListener('mousemove', e => {
    mouseNX = (e.clientX / window.innerWidth  - 0.5) * 2;
    mouseNY = (e.clientY / window.innerHeight - 0.5) * 2;
  });
  window.addEventListener('resize', () => {
    const w = canvasEl.offsetWidth  || 320;
    const h = canvasEl.offsetHeight || 320;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  });

  (function loop() { requestAnimationFrame(loop); tick(); })();
}

// ── Build face ────────────────────────────────────────────────────────────────
function buildFace() {

  // Slight vertical offset so body reads as elongated but bottom stays round
  faceGroup.position.y = -0.08;

  // ── Head — rounded finger shape (less elongated than before) ──
  const headMat = new THREE.MeshStandardMaterial({
    color: C.head, emissive: C.headEmit, roughness: 0.55, metalness: 0.0,
  });
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(1.0, 48, 48), headMat);
  headMesh.scale.set(0.86, 1.18, 0.86);  // less tall → rounder bottom
  faceGroup.add(headMesh);

  // ── Eyes — round ovals ────────────────────────────
  // SphereGeometry scaled flat → circular disc with slight height oval
  // Matte screen-like eye material — no shine, no metalness
  const eyeMat = new THREE.MeshStandardMaterial({
    color: C.eye, roughness: 0.92, metalness: 0.0,
  });
  const eyeGeo = new THREE.SphereGeometry(0.22, 24, 24);
  leftEye  = new THREE.Mesh(eyeGeo, eyeMat.clone());
  rightEye = new THREE.Mesh(eyeGeo, eyeMat.clone());

  // scale: X=1 (circular width), Y=EYE_BASE_Y (slight oval), Z=0.22 (flat disc)
  leftEye.scale.set(1.0, EYE_BASE_Y, 0.22);
  rightEye.scale.set(1.0, EYE_BASE_Y, 0.22);

  // Position on ellipsoid surface: at (x, y) → z = 0.86*sqrt(1-(x/0.86)²-(y/1.32)²)
  // eyes at x=±0.33, y=0.18 → z ≈ 0.78
  leftEye.position.set( -0.33, 0.18, 0.79);
  rightEye.position.set(  0.33, 0.18, 0.79);
  faceGroup.add(leftEye, rightEye);

  // Pixel-art square highlight dots — BoxGeometry for crisp screen-like glints
  // No counter-scale needed; boxes are in eye local space but with explicit world-space size
  const hlMat  = new THREE.MeshBasicMaterial({ color: C.eyeShine });
  // Convert pixel sizes back through eye's scale (x=1, y=EYE_BASE_Y, z=0.22)
  const pxW = 1.0, pxH = 1 / EYE_BASE_Y, pxD = 1 / 0.22;
  const hlGeoA = new THREE.BoxGeometry(0.072 * pxW, 0.072 * pxH, 0.015 * pxD);
  const hlGeoB = new THREE.BoxGeometry(0.042 * pxW, 0.042 * pxH, 0.012 * pxD);
  for (const eye of [leftEye, rightEye]) {
    const h1 = new THREE.Mesh(hlGeoA, hlMat);
    h1.position.set(-0.05, 0.08, 0.20);
    eye.add(h1);
    const h2 = new THREE.Mesh(hlGeoB, hlMat);
    h2.position.set(0.07, -0.06, 0.20);
    eye.add(h2);
  }

  // ── Eyebrows — thin rounded capsules ──────────────
  const browMat = new THREE.MeshStandardMaterial({
    color: C.brow, roughness: 0.7, metalness: 0.0,
  });
  const browGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.30, 12);
  leftBrow  = new THREE.Mesh(browGeo, browMat.clone());
  rightBrow = new THREE.Mesh(browGeo, browMat.clone());
  // initial position: x=±0.33, y=browBase + browY, z≈0.70
  leftBrow.position.set( -0.33, 0.56, 0.70);
  rightBrow.position.set(  0.33, 0.56, 0.70);
  faceGroup.add(leftBrow, rightBrow);

  // ── Mouth — small, friendly ───────────────────────
  rebuildMouth(EXPR.NEUTRAL.mouthC);
}

// ── Mouth ─────────────────────────────────────────────────────────────────────
function rebuildMouth(curve) {
  if (mouthMesh) { faceGroup.remove(mouthMesh); mouthMesh.geometry.dispose(); }
  // Narrow mouth: x only ±0.20
  // y on ellipsoid at y=-0.38 → z ≈ 0.86*sqrt(1-(0.38/1.32)²) ≈ 0.84
  const y0 = -0.36;
  const yc = y0 - curve * 0.24;
  const path = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.20, y0, 0.83),
    new THREE.Vector3(   0,  yc, 0.86),
    new THREE.Vector3( 0.20, y0, 0.83)
  );
  const geo = new THREE.TubeGeometry(path, 20, 0.032, 8, false);
  mouthMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: C.mouth, emissive: 0x080810, roughness: 0.6,
  }));
  faceGroup.add(mouthMesh);
  lastMouthC = curve;
}

// ── Tick ──────────────────────────────────────────────────────────────────────
function tick() {
  time += 0.016;

  for (const k of ['eyeScY','eyeRotZ','browLZ','browRZ','browY','mouthC']) {
    cur[k] = lerp(cur[k] ?? 0, tgt[k] ?? 0, 0.07);
  }

  // Eyes: scale Y for squint + blink, rotate Z for tilt expression
  leftEye.scale.set(1.0, EYE_BASE_Y * cur.eyeScY * blinkYL, 0.22);
  rightEye.scale.set(1.0, EYE_BASE_Y * cur.eyeScY * blinkYR, 0.22);
  leftEye.rotation.z  =  cur.eyeRotZ;
  rightEye.rotation.z = -cur.eyeRotZ;

  // Eyebrows
  const BROW_BASE_Y = 0.56;
  leftBrow.rotation.z  = Math.PI / 2 + cur.browLZ;
  rightBrow.rotation.z = Math.PI / 2 + cur.browRZ;
  leftBrow.position.y  = BROW_BASE_Y + cur.browY;
  rightBrow.position.y = BROW_BASE_Y + cur.browY;

  // Mouth
  if (!isTalking && Math.abs(cur.mouthC - lastMouthC) > 0.003) {
    rebuildMouth(cur.mouthC);
  }

  // Idle sway + mouse tracking
  const ry = Math.sin(time * idleFreqY) * 0.13 + mouseNX * 0.09;
  const rz = Math.sin(time * idleFreqZ) * 0.04 - mouseNY * 0.03;
  faceGroup.rotation.y = lerp(faceGroup.rotation.y, ry, 0.030);
  faceGroup.rotation.z = lerp(faceGroup.rotation.z, rz, 0.030);

  // Breathing
  const br = 1 + Math.sin(time * 0.35) * 0.007;
  faceGroup.scale.setScalar(br);

  renderer.render(scene, camera);
}

// ── Blink ─────────────────────────────────────────────────────────────────────
function scheduleNextBlink() {
  setTimeout(() => { blink(); scheduleNextBlink(); }, 2800 + Math.random() * 3600);
}
function blink() {
  const doDouble = Math.random() < 0.15;
  blinkYL = blinkYR = 0.04;
  setTimeout(() => {
    blinkYL = blinkYR = 1;
    if (doDouble) {
      setTimeout(() => {
        blinkYL = blinkYR = 0.04;
        setTimeout(() => { blinkYL = blinkYR = 1; }, 85);
      }, 180);
    }
  }, 90);
}

// ── Talk ──────────────────────────────────────────────────────────────────────
function startTalk() {
  stopTalk();
  talkTimer = setInterval(() => {
    talkPhase = !talkPhase;
    rebuildMouth(cur.mouthC + (talkPhase ? 0.20 : 0));
  }, 160);
}
function stopTalk() {
  if (talkTimer) { clearInterval(talkTimer); talkTimer = null; }
  talkPhase = false;
}

// ── Public API ────────────────────────────────────────────────────────────────
export function setExpression(canvasEl, stateKey, talking = false) {
  tgt = { ...(EXPR[stateKey] || EXPR.NEUTRAL), browY: 0 };
  isTalking = talking;
  talking ? startTalk() : stopTalk();
}

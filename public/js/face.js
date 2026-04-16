// Three.js 3D face for Amic — capsule head + body, capsule eyes, natural movement
import * as THREE from '/js/three.module.min.js';

const C = {
  head:     0xf2f6ff,
  headEmit: 0x505e88,
  eye:      0x080810,
  eyeShine: 0xffffff,
  brow:     0x1a1a30,
  mouth:    0x2a2a44,
};

// ── Expressions ───────────────────────────────────────────────────────────────
// All numeric: eyeScY, eyeRotZ, browLZ, browRZ, browY, mouthC, headRX, headRZ
const EXPR = {
  // Mood states (continuous)
  EUPHORIC:  { eyeScY: 1.10, eyeRotZ:  0,    browLZ:  0.26, browRZ: -0.26, browY:  0,     mouthC:  0.55, headRX: 0,     headRZ: 0    },
  HAPPY:     { eyeScY: 0.42, eyeRotZ:  0,    browLZ:  0.10, browRZ: -0.10, browY:  0,     mouthC:  0.35, headRX: 0,     headRZ: 0    },
  NEUTRAL:   { eyeScY: 0.88, eyeRotZ:  0,    browLZ:  0,    browRZ:  0,    browY:  0,     mouthC:  0.08, headRX: 0,     headRZ: 0    },
  SAD:       { eyeScY: 0.82, eyeRotZ:  0.14, browLZ: -0.18, browRZ:  0.18, browY:  0,     mouthC: -0.28, headRX: 0,     headRZ: 0    },
  GRUMPY:    { eyeScY: 0.58, eyeRotZ:  0.26, browLZ: -0.36, browRZ:  0.36, browY:  0,     mouthC: -0.46, headRX: 0,     headRZ: 0    },
  TIRED:     { eyeScY: 0.28, eyeRotZ:  0.06, browLZ:  0.08, browRZ: -0.08, browY:  0,     mouthC: -0.04, headRX: 0.08,  headRZ: 0    },
  EXHAUSTED: { eyeScY: 0.08, eyeRotZ:  0.04, browLZ:  0.05, browRZ: -0.05, browY:  0,     mouthC: -0.08, headRX: 0.18,  headRZ: 0    },
  // Temporary expressions (2–5 s)
  SURPRISED: { eyeScY: 1.25, eyeRotZ:  0,    browLZ:  0.20, browRZ: -0.20, browY:  0.20,  mouthC:  0.00, headRX:-0.06,  headRZ: 0    },
  CURIOUS:   { eyeScY: 0.80, eyeRotZ:  0.04, browLZ:  0.20, browRZ:  0.02, browY:  0.10,  mouthC:  0.06, headRX: 0,     headRZ: 0.12 },
  DELIGHTED: { eyeScY: 0.20, eyeRotZ:  0,    browLZ:  0.18, browRZ: -0.18, browY:  0.12,  mouthC:  0.68, headRX:-0.02,  headRZ: 0    },
  THINKING:  { eyeScY: 0.72, eyeRotZ:  0,    browLZ:  0.12, browRZ:  0.02, browY:  0.04,  mouthC:  0.02, headRX:-0.04,  headRZ: 0.08 },
  LAUGHING:  { eyeScY: 0.10, eyeRotZ:  0,    browLZ:  0.18, browRZ: -0.18, browY:  0.10,  mouthC:  0.72, headRX:-0.05,  headRZ: 0    },
  WORRIED:   { eyeScY: 0.88, eyeRotZ:  0.12, browLZ: -0.16, browRZ:  0.16, browY:  0.06,  mouthC: -0.20, headRX: 0,     headRZ: 0    },
  CONFUSED:  { eyeScY: 0.72, eyeRotZ:  0.05, browLZ:  0.16, browRZ:  0.02, browY:  0.06,  mouthC: -0.06, headRX: 0,     headRZ: 0.14 },
  EXCITED:   { eyeScY: 1.18, eyeRotZ:  0,    browLZ:  0.26, browRZ: -0.26, browY:  0.16,  mouthC:  0.55, headRX:-0.06,  headRZ: 0    },
  BORED:     { eyeScY: 0.50, eyeRotZ:  0,    browLZ: -0.05, browRZ:  0.05, browY: -0.05,  mouthC: -0.10, headRX: 0.04,  headRZ: 0    },
  SLEEPING:  { eyeScY: 0.02, eyeRotZ: 0,    browLZ:  0.06, browRZ: -0.06, browY: -0.04,  mouthC:  0.04, headRX: 0.22,  headRZ: 0.05 },
};

const EXPR_DURATION = {
  SURPRISED: 2500, CURIOUS: 4000, DELIGHTED: 3500, THINKING: 4500,
  LAUGHING:  3000, WORRIED:  3500, CONFUSED:  4000, EXCITED:  3000, BORED: 3000,
};

// Register a custom expression at runtime (called by sandbox)
export function registerExpression(name, params) {
  EXPR[name] = { ...EXPR.NEUTRAL, ...params };
  if (!EXPR_DURATION[name]) EXPR_DURATION[name] = 3000;
}

// ── State ─────────────────────────────────────────────────────────────────────
let scene, camera, renderer, faceGroup, bodyGroup;
let leftEye, rightEye, leftBrow, rightBrow, mouthMesh;
let blinkYL = 1, blinkYR = 1;
let talkTimer = null;
let isTalking = false, talkPhase = false;

// Materials stored for runtime color changes
let headMat = null, bodyMat = null;

// Sandbox-driven overrides (applied each tick on top of expression system)
let _overrides = {};   // { leftEyeScale, rightEyeScale, headRZ }

// LED activity indicators
const LED_COUNT = 3;
const ledMeshes = [];
let ledActivity = 'idle';
let ledPulseT   = 0;
// [left, center, right] hex colors per activity
const LED_PAL = {
  idle:   [0x05051a, 0x07071e, 0x05051a],
  listen: [0x003311, 0x00cc44, 0x003311],
  think:  [0x441a00, 0xff8800, 0x441a00],
  speak:  [0x00114a, 0x3366ff, 0x00114a],
  code:   [0x003322, 0x00ffcc, 0x003322],
};

const LERP_KEYS = ['eyeScY','eyeRotZ','browLZ','browRZ','browY','mouthC','headRX','headRZ'];
let cur = { ...EXPR.NEUTRAL };
let tgt = { ...EXPR.NEUTRAL };
let time = 0;
let lastMouthC = null;

let moodExpression  = { ...EXPR.NEUTRAL };
let expressionTimer = null;

const EYE_BASE_Y  = 1.18;
const BROW_BASE_Y = 0.50;

// ── Movement speed (set by emotion state) ─────────────────────────────────────
let currentSpeed = 1.0;
export function setMovementSpeed(s) { currentSpeed = Math.max(0.15, Math.min(2.0, s)); }

// ── Natural idle movement state machine ───────────────────────────────────────
// States: REST (still) → GLANCE (deliberate look) → SETTLE (return) → REST
let idlePhase      = 'rest';
let idlePhaseEnd   = 0;
let glanceTarget   = { y: 0, z: 0 };
let microTremor    = { y: 0, z: 0 };
let microTimer     = 0;

// Spring state per axis
let spring = { y: { pos: 0, vel: 0 }, z: { pos: 0, vel: 0 } };

function tickIdle(t) {
  if (t < idlePhaseEnd) return;

  if (idlePhase === 'rest') {
    // Glance probability scales with energy — energetic robots look around more
    const glanceChance = 0.25 * currentSpeed;
    if (Math.random() < glanceChance) {
      idlePhase = 'glance';
      // Deliberate look — range scales with energy
      const range = 0.18 * currentSpeed;
      glanceTarget.y = (Math.random() - 0.5) * 2 * range;
      glanceTarget.z = (Math.random() - 0.5) * 2 * (range * 0.40);
      idlePhaseEnd = t + (1.0 + Math.random() * 1.8) / currentSpeed;
    } else {
      // Stay still — longer pause for calmer emotions
      idlePhaseEnd = t + (2.5 + Math.random() * 6.0) / currentSpeed;
    }
  } else if (idlePhase === 'glance') {
    idlePhase = 'settle';
    idlePhaseEnd = t + (0.4 + Math.random() * 0.7) / currentSpeed;
  } else {
    idlePhase = 'rest';
    idlePhaseEnd = t + (1.5 + Math.random() * 4.0) / currentSpeed;
  }
}

function getIdleTarget() {
  const mxY = mouseNX * (idlePhase === 'rest' ? 0.045 : 0.07);
  const mxZ = -mouseNY * (idlePhase === 'rest' ? 0.018 : 0.025);
  if (idlePhase === 'glance') return { y: glanceTarget.y + mxY, z: glanceTarget.z + mxZ };
  // rest / settle: near-zero with micro-tremor
  return { y: microTremor.y + mxY, z: microTremor.z + mxZ };
}

// Critically-damped spring: smooth and natural (zeta≥1 → no overshoot)
function springStep(pos, target, vel, omega, zeta, dt) {
  const d     = pos - target;
  const accel = -omega * omega * d - 2 * zeta * omega * vel;
  vel += accel * dt;
  pos += vel * dt;
  return { pos, vel };
}

let mouseNX = 0, mouseNY = 0;

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
  camera.position.z = 4.8;
  camera.position.y = 0.15;

  scene.add(new THREE.AmbientLight(0xd8e8ff, 1.10));
  const key = new THREE.PointLight(0xffffff, 3.5, 20); key.position.set(-2,3,5); scene.add(key);
  const frt = new THREE.PointLight(0xeef4ff, 1.8, 15); frt.position.set(0,0,6);  scene.add(frt);
  const rim = new THREE.PointLight(0xaa99ff, 1.0, 12); rim.position.set(3,0,2);  scene.add(rim);
  const bck = new THREE.PointLight(0x4488ff, 0.5, 15); bck.position.set(0,0,-5); scene.add(bck);

  faceGroup = new THREE.Group();
  scene.add(faceGroup);

  bodyGroup = new THREE.Group();
  bodyGroup.position.y = -0.88;
  scene.add(bodyGroup);

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
  faceGroup.position.y = 0.52;

  headMat = new THREE.MeshStandardMaterial({ color:C.head, emissive:C.headEmit, roughness:0.55 });
  faceGroup.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.72, 0.50, 16, 32), headMat));

  bodyMat = new THREE.MeshStandardMaterial({ color:C.head, emissive:C.headEmit, roughness:0.55 });
  bodyGroup.add(new THREE.Mesh(
    new THREE.CapsuleGeometry(0.44, 0.28, 8, 24),
    bodyMat
  ));

  // ── LED indicator dots (chest area) ──────────────────────────────────────────
  const ledGeo = new THREE.SphereGeometry(0.052, 8, 8);
  const ledXPositions = [-0.19, 0, 0.19];
  for (let i = 0; i < LED_COUNT; i++) {
    const ledMat = new THREE.MeshStandardMaterial({
      color: LED_PAL.idle[i], emissive: LED_PAL.idle[i],
      emissiveIntensity: 0.2, roughness: 0.3,
    });
    const mesh = new THREE.Mesh(ledGeo, ledMat);
    mesh.position.set(ledXPositions[i], 0.09, 0.40);
    bodyGroup.add(mesh);
    ledMeshes.push(mesh);
  }

  // Capsule eyes (pill / rounded-rectangle shape)
  const eyeMat = new THREE.MeshStandardMaterial({ color:C.eye, roughness:0.92 });
  const eyeGeo = new THREE.CapsuleGeometry(0.15, 0.10, 8, 16);
  leftEye  = new THREE.Mesh(eyeGeo, eyeMat.clone());
  rightEye = new THREE.Mesh(eyeGeo, eyeMat.clone());
  leftEye.scale.set(1.0, EYE_BASE_Y, 0.22);
  rightEye.scale.set(1.0, EYE_BASE_Y, 0.22);
  leftEye.position.set(-0.32, 0.14, 0.64);
  rightEye.position.set( 0.32, 0.14, 0.64);
  faceGroup.add(leftEye, rightEye);

  const hlMat  = new THREE.MeshBasicMaterial({ color: C.eyeShine });
  const pxW = 1.0, pxH = 1/EYE_BASE_Y, pxD = 1/0.22;
  const hlA = new THREE.BoxGeometry(0.072*pxW, 0.072*pxH, 0.015*pxD);
  const hlB = new THREE.BoxGeometry(0.042*pxW, 0.042*pxH, 0.012*pxD);
  for (const eye of [leftEye, rightEye]) {
    const h1 = new THREE.Mesh(hlA, hlMat); h1.position.set(-0.05, 0.08, 0.20); eye.add(h1);
    const h2 = new THREE.Mesh(hlB, hlMat); h2.position.set( 0.07,-0.06, 0.20); eye.add(h2);
  }

  const browMat = new THREE.MeshStandardMaterial({ color:C.brow, roughness:0.7 });
  const browGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.30, 12);
  leftBrow  = new THREE.Mesh(browGeo, browMat.clone());
  rightBrow = new THREE.Mesh(browGeo, browMat.clone());
  leftBrow.position.set(-0.32, BROW_BASE_Y, 0.54);
  rightBrow.position.set( 0.32, BROW_BASE_Y, 0.54);
  faceGroup.add(leftBrow, rightBrow);

  rebuildMouth(EXPR.NEUTRAL.mouthC);
}

// ── Mouth ─────────────────────────────────────────────────────────────────────
function rebuildMouth(curve) {
  if (mouthMesh) { faceGroup.remove(mouthMesh); mouthMesh.geometry.dispose(); }
  const y0 = -0.26, yc = y0 - curve * 0.24;
  const path = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.18, y0, 0.70),
    new THREE.Vector3(   0,  yc, 0.72),
    new THREE.Vector3( 0.18, y0, 0.70)
  );
  mouthMesh = new THREE.Mesh(
    new THREE.TubeGeometry(path, 20, 0.032, 8, false),
    new THREE.MeshStandardMaterial({ color:C.mouth, emissive:0x080810, roughness:0.6 })
  );
  faceGroup.add(mouthMesh);
  lastMouthC = curve;
}

// ── Tick ──────────────────────────────────────────────────────────────────────
function tick() {
  const dt = 0.016;
  time += dt;

  // Expression lerp — faster snap when showing expression, gentle drift back
  const lerpK = expressionTimer ? 0.14 : 0.07;
  for (const k of LERP_KEYS) cur[k] = lerp(cur[k] ?? 0, tgt[k] ?? 0, lerpK);

  leftEye.scale.set(1.0, EYE_BASE_Y * cur.eyeScY * blinkYL, 0.22);
  rightEye.scale.set(1.0, EYE_BASE_Y * cur.eyeScY * blinkYR, 0.22);
  // Sandbox overrides — multipliers on top of expression system
  if (_overrides.leftEyeScale  !== undefined) leftEye.scale.y  *= Math.max(0, _overrides.leftEyeScale);
  if (_overrides.rightEyeScale !== undefined) rightEye.scale.y *= Math.max(0, _overrides.rightEyeScale);
  leftEye.rotation.z  =  cur.eyeRotZ;
  rightEye.rotation.z = -cur.eyeRotZ;

  leftBrow.rotation.z  = Math.PI/2 + cur.browLZ;
  rightBrow.rotation.z = Math.PI/2 + cur.browRZ;
  leftBrow.position.y  = BROW_BASE_Y + cur.browY;
  rightBrow.position.y = BROW_BASE_Y + cur.browY;

  faceGroup.rotation.x = cur.headRX;

  if (!isTalking && Math.abs(cur.mouthC - lastMouthC) > 0.003) rebuildMouth(cur.mouthC);

  // ── Natural idle head movement ──────────────────────────────────────────────
  tickIdle(time);

  // Micro-tremor: subtle random offset that refreshes every 0.4–1.2 s
  if (time > microTimer) {
    microTremor.y = (Math.random() - 0.5) * 0.006;
    microTremor.z = (Math.random() - 0.5) * 0.003;
    microTimer = time + 0.4 + Math.random() * 0.8;
  }

  const target = getIdleTarget();
  // Well-damped spring (zeta=0.9 → no overshoot, very natural)
  const omega = 5.0 * currentSpeed;
  const sy = springStep(spring.y.pos, target.y, spring.y.vel, omega, 0.90, dt);
  const sz = springStep(spring.z.pos, target.z, spring.z.vel, omega, 0.90, dt);
  spring.y = { pos: sy.pos, vel: sy.vel };
  spring.z = { pos: sz.pos, vel: sz.vel };

  faceGroup.rotation.y = spring.y.pos;
  faceGroup.rotation.z = spring.z.pos + cur.headRZ + (_overrides.headRZ ?? 0);

  // Breathing
  const br = 1 + Math.sin(time * 0.55) * 0.008;
  faceGroup.scale.setScalar(br);
  bodyGroup.scale.setScalar(br);

  // LED update
  ledPulseT += dt;
  _updateLeds();

  renderer.render(scene, camera);
}

function _updateLeds() {
  if (!ledMeshes.length) return;
  const pal = LED_PAL[ledActivity] || LED_PAL.idle;
  for (let i = 0; i < ledMeshes.length; i++) {
    const mat = ledMeshes[i].material;
    let intensity = 0.1;

    if (ledActivity === 'idle') {
      // Heartbeat: slow dim pulse
      intensity = 0.06 + Math.max(0, Math.sin(ledPulseT * 0.6)) * 0.08;
    } else if (ledActivity === 'listen') {
      // Breathing green
      intensity = 0.35 + Math.sin(ledPulseT * 1.8) * 0.28;
    } else if (ledActivity === 'think') {
      // Sequential orange chase (left → center → right)
      const phase = (ledPulseT * 3.0 - i * (Math.PI * 2 / 3)) % (Math.PI * 2);
      intensity = 0.2 + Math.max(0, Math.sin(phase)) * 0.75;
    } else if (ledActivity === 'speak') {
      // All pulse blue together
      intensity = 0.35 + Math.sin(ledPulseT * 4.0) * 0.45;
    } else if (ledActivity === 'code') {
      // Fast cyan strobe
      intensity = 0.5 + Math.sin(ledPulseT * 10 + i * 2.1) * 0.45;
    }

    const c = new THREE.Color(pal[i]);
    mat.color.set(c);
    mat.emissive.set(c);
    mat.emissiveIntensity = Math.max(0, intensity);
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ── Blink (subtle overshoot for softness) ────────────────────────────────────
function scheduleNextBlink() {
  // Blink frequency scales slightly with energy
  const base = 2500 + (1 - Math.min(currentSpeed, 1.5)) * 1200;
  setTimeout(() => { blink(); scheduleNextBlink(); }, base + Math.random() * 3000);
}
function blink() {
  blinkYL = blinkYR = 0.04;
  setTimeout(() => {
    blinkYL = blinkYR = 1.06;          // very slight overshoot
    setTimeout(() => { blinkYL = blinkYR = 1.0; }, 70);
  }, 90);
}

// ── Talk ──────────────────────────────────────────────────────────────────────
function startTalk() {
  stopTalk();
  talkTimer = setInterval(() => {
    talkPhase = !talkPhase;
    rebuildMouth(cur.mouthC + (talkPhase ? 0.22 : 0));
  }, 140);
}
function stopTalk() {
  if (talkTimer) { clearInterval(talkTimer); talkTimer = null; }
  talkPhase = false;
}

// ── Public API ────────────────────────────────────────────────────────────────

// Continuous mood expression — reverts to this after any temporary expression
export function setExpression(_canvasEl, stateKey, talking = false) {
  const e = EXPR[stateKey] || EXPR.NEUTRAL;
  moodExpression = { ...e };
  if (!expressionTimer) tgt = { ...moodExpression };
  isTalking = talking;
  talking ? startTalk() : stopTalk();
}

// Temporary expression (2–5 s): face.js handles the timer internally
export function playExpression(key) {
  const e = EXPR[key];
  if (!e) return;
  if (expressionTimer) { clearTimeout(expressionTimer); expressionTimer = null; }
  tgt = { ...e };
  expressionTimer = setTimeout(() => {
    expressionTimer = null;
    tgt = { ...moodExpression };
  }, EXPR_DURATION[key] ?? 3000);
}

// Set LED activity mode — controls all 3 LEDs as a group
export function setActivity(type) {
  ledActivity = type || 'idle';
}

// Low-level face control object — returned to sandbox via getFaceAPI()
// Robot writes code that calls these directly; no hardcoded behaviors here.
export function getFaceAPI() {
  return {
    setHeadColor(hex) {
      const c = new THREE.Color(hex);
      headMat?.color.set(c);
      headMat?.emissive.set(c.clone().multiplyScalar(0.18));
    },
    resetHeadColor() {
      headMat?.color.set(C.head);
      headMat?.emissive.set(C.headEmit);
    },
    setBodyColor(hex) {
      const c = new THREE.Color(hex);
      bodyMat?.color.set(c);
      bodyMat?.emissive.set(c.clone().multiplyScalar(0.18));
    },
    resetBodyColor() {
      bodyMat?.color.set(C.head);
      bodyMat?.emissive.set(C.headEmit);
    },
    setLeftEyeScale(v)  { _overrides.leftEyeScale  = Math.max(0, Number(v)); },
    setRightEyeScale(v) { _overrides.rightEyeScale = Math.max(0, Number(v)); },
    setBothEyeScale(v)  { const n = Math.max(0, Number(v)); _overrides.leftEyeScale = _overrides.rightEyeScale = n; },
    resetEyes()         { delete _overrides.leftEyeScale; delete _overrides.rightEyeScale; },
    setHeadTilt(rz)     { _overrides.headRZ = Math.max(-0.4, Math.min(0.4, Number(rz))); },
    resetHeadTilt()     { delete _overrides.headRZ; },
    setLed(i, hex) {
      const mesh = ledMeshes[i];
      if (!mesh) return;
      const c = new THREE.Color(hex);
      mesh.material.color.set(c);
      mesh.material.emissive.set(c);
      mesh.material.emissiveIntensity = 0.9;
    },
  };
}

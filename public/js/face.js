// Three.js 3D face for Amic — natural movement/expression engine, geometry
// comes from a pluggable "skin" (see skins/index.js).
import * as THREE from '/js/three.module.min.js';
import { getSkin, listSkins } from './skins/index.js';

export { listSkins };

// ── Expressions ───────────────────────────────────────────────────────────────
const EXPR = {
  EUPHORIC:  { eyeScY: 1.10, eyeRotZ:  0,    browLZ:  0.26, browRZ: -0.26, browY:  0,     mouthC:  0.55, headRX: 0,     headRZ: 0    },
  HAPPY:     { eyeScY: 0.42, eyeRotZ:  0,    browLZ:  0.10, browRZ: -0.10, browY:  0,     mouthC:  0.35, headRX: 0,     headRZ: 0    },
  NEUTRAL:   { eyeScY: 0.88, eyeRotZ:  0,    browLZ:  0,    browRZ:  0,    browY:  0,     mouthC:  0.08, headRX: 0,     headRZ: 0    },
  SAD:       { eyeScY: 0.82, eyeRotZ:  0.14, browLZ: -0.18, browRZ:  0.18, browY:  0,     mouthC: -0.28, headRX: 0,     headRZ: 0    },
  GRUMPY:    { eyeScY: 0.58, eyeRotZ:  0.26, browLZ: -0.36, browRZ:  0.36, browY:  0,     mouthC: -0.46, headRX: 0,     headRZ: 0    },
  TIRED:     { eyeScY: 0.28, eyeRotZ:  0.06, browLZ:  0.08, browRZ: -0.08, browY:  0,     mouthC: -0.04, headRX: 0.08,  headRZ: 0    },
  EXHAUSTED: { eyeScY: 0.08, eyeRotZ:  0.04, browLZ:  0.05, browRZ: -0.05, browY:  0,     mouthC: -0.08, headRX: 0.18,  headRZ: 0    },
  SURPRISED: { eyeScY: 1.25, eyeRotZ:  0,    browLZ:  0.20, browRZ: -0.20, browY:  0.20,  mouthC:  0.00, headRX:-0.06,  headRZ: 0    },
  CURIOUS:   { eyeScY: 0.80, eyeRotZ:  0.04, browLZ:  0.20, browRZ:  0.02, browY:  0.10,  mouthC:  0.06, headRX: 0,     headRZ: 0.12 },
  DELIGHTED: { eyeScY: 0.20, eyeRotZ:  0,    browLZ:  0.18, browRZ: -0.18, browY:  0.12,  mouthC:  0.68, headRX:-0.02,  headRZ: 0    },
  THINKING:  { eyeScY: 0.72, eyeRotZ:  0,    browLZ:  0.12, browRZ:  0.02, browY:  0.04,  mouthC:  0.02, headRX:-0.04,  headRZ: 0.08 },
  LAUGHING:  { eyeScY: 0.10, eyeRotZ:  0,    browLZ:  0.18, browRZ: -0.18, browY:  0.10,  mouthC:  0.72, headRX:-0.05,  headRZ: 0    },
  WORRIED:   { eyeScY: 0.88, eyeRotZ:  0.12, browLZ: -0.16, browRZ:  0.16, browY:  0.06,  mouthC: -0.20, headRX: 0,     headRZ: 0    },
  CONFUSED:  { eyeScY: 0.72, eyeRotZ:  0.05, browLZ:  0.16, browRZ:  0.02, browY:  0.06,  mouthC: -0.06, headRX: 0,     headRZ: 0.14 },
  EXCITED:   { eyeScY: 1.18, eyeRotZ:  0,    browLZ:  0.26, browRZ: -0.26, browY:  0.16,  mouthC:  0.55, headRX:-0.06,  headRZ: 0    },
  BORED:     { eyeScY: 0.50, eyeRotZ:  0,    browLZ: -0.05, browRZ:  0.05, browY: -0.05,  mouthC: -0.10, headRX: 0.04,  headRZ: 0    },
  SLEEPING:  { eyeScY: 0.02, eyeRotZ:  0,    browLZ:  0.06, browRZ: -0.06, browY: -0.04,  mouthC:  0.04, headRX: 0.22,  headRZ: 0.05 },
};

const EXPR_DURATION = {
  SURPRISED: 2500, CURIOUS: 4000, DELIGHTED: 3500, THINKING: 4500,
  LAUGHING:  3000, WORRIED:  3500, CONFUSED:  4000, EXCITED:  3000, BORED: 3000,
};

export function registerExpression(name, params) {
  EXPR[name] = { ...EXPR.NEUTRAL, ...params };
  if (!EXPR_DURATION[name]) EXPR_DURATION[name] = 3000;
}

// ── State ─────────────────────────────────────────────────────────────────────
let scene, camera, renderer, amicRoot, faceGroup, bodyGroup;
let leftEye, rightEye, leftBrow, rightBrow;
let ledMeshes = [];
let skinRebuildMouth = null;
let currentSkin = null, currentSkinId = null;
let blinkYL = 1, blinkYR = 1;
let talkTimer = null;
let isTalking = false, talkPhase = false;

let headMat = null, bodyMat = null;
let _overrides = {};
let _headColorOverride = null;
let _bodyColorOverride = null;

let ledActivity = 'idle';
let ledPulseT   = 0;
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

let currentSpeed = 1.0;
export function setMovementSpeed(s) { currentSpeed = Math.max(0.15, Math.min(2.0, s)); }

export function setWalkIntent(intent) {
  clearTimeout(_walkIntentTimer);
  _walkIntentTimer = null;
  _walkIntent = intent || 'still';
  _walkPhaseEnd = 0; // force immediate recalc
}

// Set intent for `ms` milliseconds, then revert to 'still'
export function setWalkIntentTimed(intent, ms) {
  clearTimeout(_walkIntentTimer);
  _walkIntent   = intent || 'still';
  _walkPhaseEnd = 0;
  _walkIntentTimer = setTimeout(() => {
    _walkIntent      = 'still';
    _walkPhaseEnd    = 0;
    _walkIntentTimer = null;
  }, ms);
}
export function getVisualStateDesc() {
  const parts = [];
  if (_headColorOverride) parts.push(`sua cabeça está na cor ${_headColorOverride} (você mesmo mudou com código)`);
  if (_bodyColorOverride) parts.push(`seu corpo está na cor ${_bodyColorOverride}`);
  return parts.join('; ');
}

// ── Natural idle head movement ─────────────────────────────────────────────────
let idlePhase      = 'rest';
let idlePhaseEnd   = 0;
let glanceTarget   = { y: 0, z: 0 };
let microTremor    = { y: 0, z: 0 };
let microTimer     = 0;
let spring         = { y: { pos: 0, vel: 0 }, z: { pos: 0, vel: 0 } };
let mouseNX = 0, mouseNY = 0;

// ── Walk drift (amicRoot position) ────────────────────────────────────────────
let _walkIdleTarget = { x: 0, y: -0.2 };
let _walkTarget     = { x: 0, y: -0.2 };
let _walkPhaseEnd   = 0;
let _walkSpring     = { x: { pos: 0, vel: 0 }, y: { pos: -0.2, vel: 0 } };
// Intent: 'still'(default)|'excited'|'retreat'|'curious'|'neutral'
// 'still' = near-center, barely moves; only explicit events override.
let _walkIntent      = 'still';
let _walkIntentTimer = null;

// ── Device orientation & shake ────────────────────────────────────────────────
let _devBeta = 0, _devGamma = 0;
let _devBetaSm = 0, _devGammaSm = 0;
let _shakeMag = 0;

const _raycaster = new THREE.Raycaster();

// ── Idle state machine ────────────────────────────────────────────────────────
function tickIdle(t) {
  if (t < idlePhaseEnd) return;
  if (idlePhase === 'rest') {
    const glanceChance = 0.25 * currentSpeed;
    if (Math.random() < glanceChance) {
      idlePhase = 'glance';
      const range = 0.18 * currentSpeed;
      glanceTarget.y = (Math.random() - 0.5) * 2 * range;
      glanceTarget.z = (Math.random() - 0.5) * 2 * (range * 0.40);
      idlePhaseEnd = t + (1.0 + Math.random() * 1.8) / currentSpeed;
    } else {
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
  return { y: microTremor.y + mxY, z: microTremor.z + mxZ };
}

function springStep(pos, target, vel, omega, zeta, dt) {
  const d     = pos - target;
  const accel = -omega * omega * d - 2 * zeta * omega * vel;
  vel += accel * dt;
  pos += vel * dt;
  return { pos, vel };
}

// ── Walk helpers ──────────────────────────────────────────────────────────────
function _getWalkBounds() {
  if (!camera) return { xMin: -2, xMax: 2, yMin: -1, yMax: 0.8 };
  const fovRad = camera.fov * Math.PI / 180;
  const halfH  = Math.tan(fovRad / 2) * camera.position.z;
  const halfW  = halfH * camera.aspect;
  return {
    xMin: -(halfW - 1.1),
    xMax:   halfW - 1.1,
    yMin: -(halfH - 2.0),
    yMax:   halfH - 2.0,
  };
}

function _tickWalk(t, dt) {
  if (t >= _walkPhaseEnd) {
    const b = _getWalkBounds();
    const e = Math.min(currentSpeed, 1.5);
    if (_walkIntent === 'still') {
      // Default: barely moves, stays near center
      _walkIdleTarget.x = (Math.random() - 0.5) * (b.xMax - b.xMin) * 0.08;
      _walkIdleTarget.y = (Math.random() - 0.5) * (b.yMax - b.yMin) * 0.08;
      _walkPhaseEnd = t + 40 + Math.random() * 40;
    } else if (_walkIntent === 'retreat') {
      const side = Math.random() < 0.5 ? -1 : 1;
      _walkIdleTarget.x = side * ((b.xMax * 0.50) + Math.random() * b.xMax * 0.35);
      _walkIdleTarget.y = b.yMin + Math.random() * (b.yMax - b.yMin) * 0.30;
      _walkPhaseEnd = t + (18 + Math.random() * 28) / Math.max(0.4, currentSpeed);
    } else if (_walkIntent === 'excited') {
      _walkIdleTarget.x = (Math.random() - 0.5) * (b.xMax - b.xMin) * 0.85 * e;
      _walkIdleTarget.y = b.yMin + Math.random() * (b.yMax - b.yMin) * 0.78 * e;
      _walkPhaseEnd = t + (6 + Math.random() * 10) / Math.max(0.4, currentSpeed);
    } else if (_walkIntent === 'curious') {
      _walkIdleTarget.x = (Math.random() - 0.5) * (b.xMax - b.xMin) * 0.38 * e;
      _walkIdleTarget.y = (Math.random() - 0.5) * (b.yMax - b.yMin) * 0.38 * e;
      _walkPhaseEnd = t + (10 + Math.random() * 16) / Math.max(0.4, currentSpeed);
    } else {
      // neutral
      _walkIdleTarget.x = (Math.random() - 0.5) * (b.xMax - b.xMin) * 0.40 * e;
      _walkIdleTarget.y = (Math.random() - 0.5) * (b.yMax - b.yMin) * 0.40 * e;
      _walkPhaseEnd = t + (14 + Math.random() * 20) / Math.max(0.4, currentSpeed);
    }
  }
  _walkTarget.x = _walkIdleTarget.x + _devGammaSm * 0.55;
  _walkTarget.y = _walkIdleTarget.y - _devBetaSm  * 0.32;

  const omega = 1.2, zeta = 0.88;
  const sx = springStep(_walkSpring.x.pos, _walkTarget.x, _walkSpring.x.vel, omega, zeta, dt);
  const sy = springStep(_walkSpring.y.pos, _walkTarget.y, _walkSpring.y.vel, omega, zeta, dt);
  _walkSpring.x = sx;
  _walkSpring.y = sy;
  if (!amicRoot) return;
  amicRoot.position.x = sx.pos;
  amicRoot.position.y = sy.pos;
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initFace(canvasEl, skinId = 'classic') {
  const W = window.innerWidth  || 320;
  const H = window.innerHeight || 320;

  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.6;

  scene  = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 60);
  camera.position.z = 11.0;
  camera.position.y = 0.15;

  scene.add(new THREE.AmbientLight(0xd8e8ff, 1.10));
  const key = new THREE.PointLight(0xffffff, 3.5, 20); key.position.set(-2,3,5); scene.add(key);
  const frt = new THREE.PointLight(0xeef4ff, 1.8, 15); frt.position.set(0,0,6);  scene.add(frt);
  const rim = new THREE.PointLight(0xaa99ff, 1.0, 12); rim.position.set(3,0,2);  scene.add(rim);
  const bck = new THREE.PointLight(0x4488ff, 0.5, 15); bck.position.set(0,0,-5); scene.add(bck);

  amicRoot  = new THREE.Group();
  scene.add(amicRoot);

  faceGroup = new THREE.Group();
  amicRoot.add(faceGroup);

  bodyGroup = new THREE.Group();
  bodyGroup.position.y = -0.88;
  amicRoot.add(bodyGroup);

  setSkin(skinId);
  scheduleNextBlink();

  document.addEventListener('mousemove', e => {
    mouseNX = (e.clientX / window.innerWidth  - 0.5) * 2;
    mouseNY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  });

  (function loop() { requestAnimationFrame(loop); tick(); })();
}

// ── Skins ─────────────────────────────────────────────────────────────────────
// Disposes the currently mounted skin's meshes/materials (if any), builds the
// requested skin's geometry, and rewires the module-level references that
// tick() animates. tick()/EXPR/blink/talk/LEDs never change between skins —
// only the geometry/materials a skin builds do.
let _skinLoadToken = 0;
export async function setSkin(skinId) {
  if (!faceGroup || !bodyGroup) return;
  const token = ++_skinLoadToken; // guards against overlapping switches racing each other

  for (const group of [faceGroup, bodyGroup]) {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child.userData?.sharedGltfAsset) continue; // cached model, reused across skin switches
      child.traverse?.(o => {
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
        else o.material?.dispose?.();
      });
    }
  }
  leftEye = rightEye = leftBrow = rightBrow = undefined;
  ledMeshes = [];

  currentSkin   = getSkin(skinId);
  currentSkinId = currentSkin.id;

  const parts = await currentSkin.build(faceGroup, bodyGroup);
  if (token !== _skinLoadToken) return; // a newer setSkin() call superseded this one

  headMat        = parts.headMat;
  bodyMat        = parts.bodyMat;
  leftEye        = parts.leftEye;
  rightEye       = parts.rightEye;
  leftBrow       = parts.leftBrow;
  rightBrow      = parts.rightBrow;
  ledMeshes      = parts.ledMeshes;
  skinRebuildMouth = parts.rebuildMouth;

  // Re-apply any active color overrides from sandbox code so switching
  // skins doesn't silently drop a customization the AI made.
  if (_headColorOverride) {
    const c = new THREE.Color(_headColorOverride);
    headMat?.color.set(c);
    headMat?.emissive.set(c.clone().multiplyScalar(0.18));
  }
  if (_bodyColorOverride) {
    const c = new THREE.Color(_bodyColorOverride);
    bodyMat?.color.set(c);
    bodyMat?.emissive.set(c.clone().multiplyScalar(0.18));
  }

  rebuildMouth(cur?.mouthC ?? 0.08);
}

// ── Mouth ─────────────────────────────────────────────────────────────────────
function rebuildMouth(curve) {
  skinRebuildMouth?.(curve);
  lastMouthC = curve;
}

// ── Tick ──────────────────────────────────────────────────────────────────────
function tick() {
  const dt = 0.016;
  time += dt;

  // Walk drift
  _tickWalk(time, dt);

  // Smooth device orientation
  _devBetaSm  += (_devBeta  - _devBetaSm)  * 0.06;
  _devGammaSm += (_devGamma - _devGammaSm) * 0.06;

  // Whole-body lean from device tilt
  if (amicRoot) {
    amicRoot.rotation.x = _devBetaSm  *  0.35;
    amicRoot.rotation.z = _devGammaSm * -0.55;
  }

  // Shake FX — jitter on top of walk position
  if (_shakeMag > 0.002 && amicRoot) {
    amicRoot.position.x += (Math.random() - 0.5) * _shakeMag * 0.32;
    amicRoot.position.y += (Math.random() - 0.5) * _shakeMag * 0.20;
    _shakeMag *= 0.80;
  } else if (_shakeMag <= 0.002) {
    _shakeMag = 0;
  }

  // Expression lerp
  const lerpK = expressionTimer ? 0.14 : 0.07;
  for (const k of LERP_KEYS) cur[k] = lerp(cur[k] ?? 0, tgt[k] ?? 0, lerpK);

  // A skin swap may still be loading (e.g. fetching a .glb) — skip animating
  // until its parts are wired up rather than throwing on undefined meshes.
  if (!leftEye || !rightEye || !leftBrow || !rightBrow) {
    renderer?.render(scene, camera);
    return;
  }

  leftEye.scale.set(1.0, EYE_BASE_Y * cur.eyeScY * blinkYL, 0.22);
  rightEye.scale.set(1.0, EYE_BASE_Y * cur.eyeScY * blinkYR, 0.22);
  if (_overrides.leftEyeScale  !== undefined) leftEye.scale.y  *= Math.max(0, _overrides.leftEyeScale);
  if (_overrides.rightEyeScale !== undefined) rightEye.scale.y *= Math.max(0, _overrides.rightEyeScale);
  leftEye.rotation.z  =  cur.eyeRotZ;
  rightEye.rotation.z = -cur.eyeRotZ;

  leftBrow.rotation.z  = Math.PI/2 + cur.browLZ;
  rightBrow.rotation.z = Math.PI/2 + cur.browRZ;
  leftBrow.position.y  = BROW_BASE_Y + cur.browY;
  rightBrow.position.y = BROW_BASE_Y + cur.browY;

  // Head tilt: expression + device lean
  faceGroup.rotation.x = cur.headRX + _devBetaSm * 0.30;

  if (!isTalking && Math.abs(cur.mouthC - lastMouthC) > 0.003) rebuildMouth(cur.mouthC);

  tickIdle(time);

  if (time > microTimer) {
    microTremor.y = (Math.random() - 0.5) * 0.006;
    microTremor.z = (Math.random() - 0.5) * 0.003;
    microTimer = time + 0.4 + Math.random() * 0.8;
  }

  const target = getIdleTarget();
  const omega  = 5.0 * currentSpeed;
  const sy = springStep(spring.y.pos, target.y, spring.y.vel, omega, 0.90, dt);
  const sz = springStep(spring.z.pos, target.z, spring.z.vel, omega, 0.90, dt);
  spring.y = { pos: sy.pos, vel: sy.vel };
  spring.z = { pos: sz.pos, vel: sz.vel };

  faceGroup.rotation.y = spring.y.pos;
  faceGroup.rotation.z = spring.z.pos + cur.headRZ + (_overrides.headRZ ?? 0) - _devGammaSm * 0.25;

  const br = 1 + Math.sin(time * 0.55) * 0.008;
  faceGroup.scale.setScalar(br);
  bodyGroup.scale.setScalar(br);

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
      intensity = 0.06 + Math.max(0, Math.sin(ledPulseT * 0.6)) * 0.08;
    } else if (ledActivity === 'listen') {
      intensity = 0.35 + Math.sin(ledPulseT * 1.8) * 0.28;
    } else if (ledActivity === 'think') {
      const phase = (ledPulseT * 3.0 - i * (Math.PI * 2 / 3)) % (Math.PI * 2);
      intensity = 0.2 + Math.max(0, Math.sin(phase)) * 0.75;
    } else if (ledActivity === 'speak') {
      intensity = 0.35 + Math.sin(ledPulseT * 4.0) * 0.45;
    } else if (ledActivity === 'code') {
      intensity = 0.5 + Math.sin(ledPulseT * 10 + i * 2.1) * 0.45;
    }
    const c = new THREE.Color(pal[i]);
    mat.color.set(c);
    mat.emissive.set(c);
    mat.emissiveIntensity = Math.max(0, intensity);
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ── Blink ─────────────────────────────────────────────────────────────────────
function scheduleNextBlink() {
  const base = 2500 + (1 - Math.min(currentSpeed, 1.5)) * 1200;
  setTimeout(() => { blink(); scheduleNextBlink(); }, base + Math.random() * 3000);
}
function blink() {
  blinkYL = blinkYR = 0.04;
  setTimeout(() => {
    blinkYL = blinkYR = 1.06;
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
export function setExpression(_canvasEl, stateKey, talking = false) {
  const e = EXPR[stateKey] || EXPR.NEUTRAL;
  moodExpression = { ...e };
  if (!expressionTimer) tgt = { ...moodExpression };
  isTalking = talking;
  talking ? startTalk() : stopTalk();
}

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

export function setActivity(type) {
  ledActivity = type || 'idle';
}

export function getFaceAPI() {
  return {
    setHeadColor(hex) {
      _headColorOverride = hex;
      const c = new THREE.Color(hex);
      headMat?.color.set(c);
      headMat?.emissive.set(c.clone().multiplyScalar(0.18));
    },
    resetHeadColor() {
      _headColorOverride = null;
      headMat?.color.set(currentSkin.palette.head);
      headMat?.emissive.set(currentSkin.palette.headEmit);
    },
    setBodyColor(hex) {
      _bodyColorOverride = hex;
      const c = new THREE.Color(hex);
      bodyMat?.color.set(c);
      bodyMat?.emissive.set(c.clone().multiplyScalar(0.18));
    },
    resetBodyColor() {
      _bodyColorOverride = null;
      bodyMat?.color.set(currentSkin.palette.head);
      bodyMat?.emissive.set(currentSkin.palette.headEmit);
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
    // walk(intent, durationMs?) — move with purpose for durationMs, then stop
    // intent: 'excited'|'curious'|'retreat'|'neutral'|'still'
    walk(intent, durationMs) {
      if (durationMs && durationMs > 0) {
        setWalkIntentTimed(intent, Number(durationMs));
      } else {
        setWalkIntent(intent);
      }
    },
  };
}

// ── Device orientation input ──────────────────────────────────────────────────
// beta: forward-back tilt, normalized so 0 = upright phone
// gamma: left-right tilt, degrees
export function setDeviceOrientation(beta, gamma) {
  _devBeta  = ((beta ?? 90) - 90) * Math.PI / 180;
  _devGamma = (gamma ?? 0) * Math.PI / 180;
}

// ── Shake FX ──────────────────────────────────────────────────────────────────
export function triggerShakeFX(magnitude = 1.0) {
  _shakeMag = Math.max(_shakeMag, Math.min(2.0, magnitude));
}

// ── Touch zone raycasting ─────────────────────────────────────────────────────
// Zones mapped to amicRoot local space (faceGroup.position.y = 0.52):
//   Eyes center:  y ≈ 0.66  (faceGroup y=0.14 + 0.52)  x ≈ ±0.32
//   Mouth center: y ≈ 0.26  (faceGroup y=-0.26 + 0.52)
//   Head capsule: y -0.45 to +1.49
//   Body capsule: y -1.46 to -0.30
//   lower_body (y < -0.48) → NO REACTION, NO SOUND, hard rule
export function getTouchZone(clientX, clientY) {
  if (!renderer || !camera || !amicRoot) return null;
  const canvas = renderer.domElement;
  const rect   = canvas.getBoundingClientRect();
  const ndcX   =  ((clientX - rect.left) / rect.width)  * 2 - 1;
  const ndcY   = -((clientY - rect.top)  / rect.height) * 2 + 1;
  _raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  const meshes = [];
  faceGroup.traverse(o => { if (o.isMesh) meshes.push(o); });
  bodyGroup.traverse(o => { if (o.isMesh) meshes.push(o); });
  const hits = _raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;
  const local = amicRoot.worldToLocal(hits[0].point.clone());
  const y  = local.y;
  const ax = Math.abs(local.x);

  // Hard no-reaction zone — lower body
  if (y < -0.48) return 'lower_body';

  // Body zones
  if (y < -0.15) return 'chest';
  if (y <  0.18) return 'neck';           // chin/throat area

  // Face — check broad zones first, narrow last
  // Cheeks: sides of face at eye/cheek level
  if (ax > 0.52 && y <= 0.88) return 'cheek';

  // Eyes: at y≈0.66, flanking x≈±0.32
  if (y >= 0.48 && y <= 0.84 && ax >= 0.08 && ax <= 0.58) return 'eyes';

  // Mouth: centered, below eyes
  if (y >= 0.18 && y <= 0.52 && ax < 0.30) return 'mouth';

  // Top of head (forehead → crown)
  if (y >= 0.78) return 'head_top';

  // General face (nose bridge / inter-eye area)
  return 'face';
}

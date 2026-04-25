// vision.js — local face detection & recognition via face-api.js (UMD)
// face-api.js uses TensorFlow.js under the hood; models are served from /models/

const MODEL_URL = '/models';

let _faceapi        = null;
let _ready          = false;
let _loadingPromise = null;

async function _ensureReady() {
  if (_ready) return;
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = _init();
  return _loadingPromise;
}

async function _init() {
  if (!window.faceapi) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = '/js/face-api.min.js';
      s.onload = res;
      s.onerror = () => rej(new Error(
        'face-api.js não encontrado. Execute bin/download_models para baixar os modelos.'
      ));
      document.head.appendChild(s);
    });
  }
  _faceapi = window.faceapi;

  await Promise.all([
    _faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    _faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    _faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    _faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
  ]);
  _ready = true;
}

// Analyze an image/video/canvas element.
// Returns array of { descriptor, age, gender, genderProbability, box }
export async function analyzeFrame(el) {
  await _ensureReady();
  const opts = new _faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.38, inputSize: 416 });
  const detections = await _faceapi
    .detectAllFaces(el, opts)
    .withFaceLandmarks(true)       // true = use tiny landmark model
    .withFaceDescriptors()
    .withAgeAndGender();

  return detections.map(d => ({
    descriptor:        Array.from(d.descriptor),
    age:               Math.round(d.age),
    gender:            d.gender,
    genderProbability: Math.round(d.genderProbability * 100),
    box: {
      x: Math.round(d.detection.box.x),
      y: Math.round(d.detection.box.y),
      w: Math.round(d.detection.box.width),
      h: Math.round(d.detection.box.height),
    },
  }));
}

// Compare a descriptor against an array of stored profiles.
// Returns { profile, distance } for best match, or null if none passes threshold.
export function findBestMatch(descriptor, profiles, threshold = 0.52) {
  if (!_faceapi || !profiles?.length) return null;
  let best = null, bestDist = Infinity;
  for (const p of profiles) {
    if (!p.descriptor?.length) continue;
    const dist = _faceapi.euclideanDistance(descriptor, p.descriptor);
    if (dist < threshold && dist < bestDist) {
      bestDist = dist;
      best     = { profile: p, distance: parseFloat(dist.toFixed(3)) };
    }
  }
  return best;
}

export function isReady()  { return _ready; }
export function getApi()   { return _faceapi; }

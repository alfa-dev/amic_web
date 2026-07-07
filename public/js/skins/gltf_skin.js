// Shared builder for skins based on downloaded .glb models. Any model
// becomes an "Amic" by normalizing its scale/position inside faceGroup (the
// same local space the classic/blocky skins use) and sticking simple cute
// eyes/brows/mouth primitives on top of it — face.js's expression engine
// only needs those parts, so it doesn't matter what the underlying model is.
import * as THREE from '/js/three.module.min.js';
import { GLTFLoader } from '/js/GLTFLoader.js';

const loader = new GLTFLoader();
const _cache = new Map();

function loadModel(url) {
  if (!_cache.has(url)) _cache.set(url, loader.loadAsync(url));
  return _cache.get(url);
}

const EYE_BASE_Y = 1.18;
const BROW_BASE_Y = 0.50;

export function makeGltfSkin({
  id, name, url, palette,
  targetHeight = 1.9,   // normalize model to roughly the classic head's height
  yOffset = 0,          // nudge model up/down after centering
  rotationY = 0,        // face the model toward the camera (+Z)
  eyeZ = 0.62, eyeY = 0.14, eyeX = 0.30,
  browZ = 0.52, mouthZ = 0.58, mouthY = -0.24,
}) {
  return {
    id, name, palette,

    async build(faceGroup, bodyGroup) {
      faceGroup.position.y = 0.52;

      // ── Small neutral body so the model has something to "stand" on ──
      const bodyMat = new THREE.MeshStandardMaterial({ color: palette.head, emissive: palette.headEmit, roughness: 0.55 });
      bodyGroup.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.40, 0.24, 8, 24), bodyMat));

      const ledMeshes = [];
      const ledGeo = new THREE.SphereGeometry(0.052, 8, 8);
      const ledXPositions = [-0.19, 0, 0.19];
      for (let i = 0; i < 3; i++) {
        const ledMat = new THREE.MeshStandardMaterial({
          color: 0x05051a, emissive: 0x05051a, emissiveIntensity: 0.2, roughness: 0.3,
        });
        const mesh = new THREE.Mesh(ledGeo, ledMat);
        mesh.position.set(ledXPositions[i], 0.06, 0.36);
        bodyGroup.add(mesh);
        ledMeshes.push(mesh);
      }

      // ── The downloaded model, normalized into the head's local space ──
      // Reused directly from cache (not .clone()'d): cloning a rigged/
      // skinned model with Object3D#clone() breaks its skeleton bindings and
      // produces garbage bounding boxes. Since only one skin is ever shown
      // at a time, sharing the single cached instance is safe — we just
      // reset its transform before each reuse and skip disposing it.
      const gltf = await loadModel(url);
      const model = gltf.scene;
      model.userData.sharedGltfAsset = true;
      model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);
      model.scale.set(1, 1, 1);
      model.updateMatrixWorld(true, true);

      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      // Normalize by height (glTF's Y-up convention), not the largest axis —
      // models with a long body (e.g. a running fox) would otherwise scale
      // by their length and render huge/rotated oddly.
      const scale = targetHeight / (size.y || 1);
      model.scale.setScalar(scale);
      model.rotation.y = rotationY;

      const box2 = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      box2.getCenter(center);
      model.position.set(-center.x, -center.y + yOffset, -center.z);

      const headMat = bodyMat; // reuse; sandbox color overrides tint the body, which reads fine
      faceGroup.add(model);

      // ── Cute face overlay (same rig every skin animates) ──
      const eyeMat = new THREE.MeshStandardMaterial({ color: palette.eye ?? 0x080810, roughness: 0.9 });
      const eyeGeo = new THREE.CapsuleGeometry(0.13, 0.08, 8, 16);
      const leftEye  = new THREE.Mesh(eyeGeo, eyeMat.clone());
      const rightEye = new THREE.Mesh(eyeGeo, eyeMat.clone());
      leftEye.scale.set(1.0, EYE_BASE_Y, 0.22);
      rightEye.scale.set(1.0, EYE_BASE_Y, 0.22);
      leftEye.position.set(-eyeX, eyeY, eyeZ);
      rightEye.position.set(eyeX, eyeY, eyeZ);
      faceGroup.add(leftEye, rightEye);

      const hlMat = new THREE.MeshBasicMaterial({ color: palette.eyeShine ?? 0xffffff });
      const hl = new THREE.BoxGeometry(0.05, 0.05 / EYE_BASE_Y, 0.012 / 0.22);
      for (const eye of [leftEye, rightEye]) {
        const h1 = new THREE.Mesh(hl, hlMat); h1.position.set(-0.04, 0.06, 0.20); eye.add(h1);
      }

      const browMat = new THREE.MeshStandardMaterial({ color: palette.brow ?? 0x1a1a30, roughness: 0.7 });
      const browGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.26, 12);
      const leftBrow  = new THREE.Mesh(browGeo, browMat.clone());
      const rightBrow = new THREE.Mesh(browGeo, browMat.clone());
      leftBrow.position.set(-eyeX, BROW_BASE_Y, browZ);
      rightBrow.position.set(eyeX, BROW_BASE_Y, browZ);
      faceGroup.add(leftBrow, rightBrow);

      let mouthMesh = null;
      function rebuildMouth(curve) {
        if (mouthMesh) { faceGroup.remove(mouthMesh); mouthMesh.geometry.dispose(); }
        const width  = 0.26 + Math.max(0, curve) * 0.08;
        const height = 0.035 + Math.max(0, curve) * 0.09 + Math.max(0, -curve) * 0.02;
        mouthMesh = new THREE.Mesh(
          new THREE.BoxGeometry(width, height, 0.04),
          new THREE.MeshStandardMaterial({ color: palette.mouth ?? 0x2a2a44, emissive: 0x080810, roughness: 0.6 })
        );
        mouthMesh.position.set(0, mouthY, mouthZ);
        faceGroup.add(mouthMesh);
      }
      rebuildMouth(0.08);

      return { headMat, bodyMat, leftEye, rightEye, leftBrow, rightBrow, ledMeshes, rebuildMouth };
    },
  };
}

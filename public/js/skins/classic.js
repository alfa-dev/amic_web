// Classic Amic skin — capsule head + body, capsule eyes. This is the
// original (and default) look; preserved exactly as it always rendered.
import * as THREE from '/js/three.module.min.js';

const C = {
  head:     0xf2f6ff,
  headEmit: 0x505e88,
  eye:      0x080810,
  eyeShine: 0xffffff,
  brow:     0x1a1a30,
  mouth:    0x2a2a44,
};

const LED_COUNT = 3;
const EYE_BASE_Y = 1.18;
const BROW_BASE_Y = 0.50;

export default {
  id: 'classic',
  name: 'Clássico',
  palette: C,

  // Builds all meshes inside faceGroup/bodyGroup and returns the parts
  // face.js's tick() animates. Nothing here changes existing behavior —
  // it's the same geometry that used to live in face.js's buildFace().
  build(faceGroup, bodyGroup) {
    faceGroup.position.y = 0.52;

    const headMat = new THREE.MeshStandardMaterial({ color: C.head, emissive: C.headEmit, roughness: 0.55 });
    faceGroup.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.72, 0.50, 16, 32), headMat));

    const bodyMat = new THREE.MeshStandardMaterial({ color: C.head, emissive: C.headEmit, roughness: 0.55 });
    bodyGroup.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.44, 0.28, 8, 24), bodyMat));

    const ledMeshes = [];
    const ledGeo = new THREE.SphereGeometry(0.052, 8, 8);
    const ledXPositions = [-0.19, 0, 0.19];
    for (let i = 0; i < LED_COUNT; i++) {
      const ledMat = new THREE.MeshStandardMaterial({
        color: 0x05051a, emissive: 0x05051a, emissiveIntensity: 0.2, roughness: 0.3,
      });
      const mesh = new THREE.Mesh(ledGeo, ledMat);
      mesh.position.set(ledXPositions[i], 0.09, 0.40);
      bodyGroup.add(mesh);
      ledMeshes.push(mesh);
    }

    const eyeMat = new THREE.MeshStandardMaterial({ color: C.eye, roughness: 0.92 });
    const eyeGeo = new THREE.CapsuleGeometry(0.15, 0.10, 8, 16);
    const leftEye  = new THREE.Mesh(eyeGeo, eyeMat.clone());
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat.clone());
    leftEye.scale.set(1.0, EYE_BASE_Y, 0.22);
    rightEye.scale.set(1.0, EYE_BASE_Y, 0.22);
    leftEye.position.set(-0.32, 0.14, 0.64);
    rightEye.position.set(0.32, 0.14, 0.64);
    faceGroup.add(leftEye, rightEye);

    const hlMat = new THREE.MeshBasicMaterial({ color: C.eyeShine });
    const pxW = 1.0, pxH = 1 / EYE_BASE_Y, pxD = 1 / 0.22;
    const hlA = new THREE.BoxGeometry(0.072 * pxW, 0.072 * pxH, 0.015 * pxD);
    const hlB = new THREE.BoxGeometry(0.042 * pxW, 0.042 * pxH, 0.012 * pxD);
    for (const eye of [leftEye, rightEye]) {
      const h1 = new THREE.Mesh(hlA, hlMat); h1.position.set(-0.05, 0.08, 0.20); eye.add(h1);
      const h2 = new THREE.Mesh(hlB, hlMat); h2.position.set(0.07, -0.06, 0.20); eye.add(h2);
    }

    const browMat = new THREE.MeshStandardMaterial({ color: C.brow, roughness: 0.7 });
    const browGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.30, 12);
    const leftBrow  = new THREE.Mesh(browGeo, browMat.clone());
    const rightBrow = new THREE.Mesh(browGeo, browMat.clone());
    leftBrow.position.set(-0.32, BROW_BASE_Y, 0.54);
    rightBrow.position.set(0.32, BROW_BASE_Y, 0.54);
    faceGroup.add(leftBrow, rightBrow);

    let mouthMesh = null;
    function rebuildMouth(curve) {
      if (mouthMesh) { faceGroup.remove(mouthMesh); mouthMesh.geometry.dispose(); }
      const y0 = -0.26, yc = y0 - curve * 0.24;
      const path = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-0.18, y0, 0.70),
        new THREE.Vector3(0, yc, 0.72),
        new THREE.Vector3(0.18, y0, 0.70)
      );
      mouthMesh = new THREE.Mesh(
        new THREE.TubeGeometry(path, 20, 0.032, 8, false),
        new THREE.MeshStandardMaterial({ color: C.mouth, emissive: 0x080810, roughness: 0.6 })
      );
      faceGroup.add(mouthMesh);
    }
    rebuildMouth(0.08); // NEUTRAL.mouthC

    return {
      headMat, bodyMat, leftEye, rightEye, leftBrow, rightBrow, ledMeshes,
      rebuildMouth,
    };
  },
};

// "Cubo" skin — a blockier, robot-crate look. Demonstrates that skins can
// use entirely different geometry/proportions/colors while reusing the same
// expression/animation engine in face.js (eyes, brows, mouth, LEDs).
import * as THREE from '/js/three.module.min.js';

const C = {
  head:     0xdff5ec,
  headEmit: 0x2f6b52,
  eye:      0x081410,
  eyeShine: 0xffffff,
  brow:     0x123322,
  mouth:    0x1c3a2c,
};

const LED_COUNT = 3;
const EYE_BASE_Y = 1.18;
const BROW_BASE_Y = 0.50;

export default {
  id: 'blocky',
  name: 'Cubo',
  palette: C,

  build(faceGroup, bodyGroup) {
    faceGroup.position.y = 0.52;

    const headMat = new THREE.MeshStandardMaterial({ color: C.head, emissive: C.headEmit, roughness: 0.45 });
    faceGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1.30, 1.55, 1.10), headMat));

    const bodyMat = new THREE.MeshStandardMaterial({ color: C.head, emissive: C.headEmit, roughness: 0.45 });
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 0.62), bodyMat));

    const ledMeshes = [];
    const ledGeo = new THREE.BoxGeometry(0.08, 0.08, 0.03);
    const ledXPositions = [-0.19, 0, 0.19];
    for (let i = 0; i < LED_COUNT; i++) {
      const ledMat = new THREE.MeshStandardMaterial({
        color: 0x05051a, emissive: 0x05051a, emissiveIntensity: 0.2, roughness: 0.3,
      });
      const mesh = new THREE.Mesh(ledGeo, ledMat);
      mesh.position.set(ledXPositions[i], 0.09, 0.32);
      bodyGroup.add(mesh);
      ledMeshes.push(mesh);
    }

    const eyeMat = new THREE.MeshStandardMaterial({ color: C.eye, roughness: 0.85 });
    const eyeGeo = new THREE.BoxGeometry(0.26, 0.10, 0.08);
    const leftEye  = new THREE.Mesh(eyeGeo, eyeMat.clone());
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat.clone());
    leftEye.scale.set(1.0, EYE_BASE_Y, 0.22);
    rightEye.scale.set(1.0, EYE_BASE_Y, 0.22);
    leftEye.position.set(-0.32, 0.14, 0.58);
    rightEye.position.set(0.32, 0.14, 0.58);
    faceGroup.add(leftEye, rightEye);

    const hlMat = new THREE.MeshBasicMaterial({ color: C.eyeShine });
    const pxH = 1 / EYE_BASE_Y, pxD = 1 / 0.22;
    const hl = new THREE.BoxGeometry(0.05, 0.05 * pxH, 0.012 * pxD);
    for (const eye of [leftEye, rightEye]) {
      const h1 = new THREE.Mesh(hl, hlMat); h1.position.set(-0.05, 0.06, 0.20); eye.add(h1);
    }

    const browMat = new THREE.MeshStandardMaterial({ color: C.brow, roughness: 0.6 });
    const browGeo = new THREE.BoxGeometry(0.30, 0.05, 0.05);
    const leftBrow  = new THREE.Mesh(browGeo, browMat.clone());
    const rightBrow = new THREE.Mesh(browGeo, browMat.clone());
    leftBrow.position.set(-0.32, BROW_BASE_Y, 0.50);
    rightBrow.position.set(0.32, BROW_BASE_Y, 0.50);
    faceGroup.add(leftBrow, rightBrow);

    let mouthMesh = null;
    function rebuildMouth(curve) {
      if (mouthMesh) { faceGroup.remove(mouthMesh); mouthMesh.geometry.dispose(); }
      const width  = 0.30 + Math.max(0, curve) * 0.10;
      const height = 0.04 + Math.max(0, curve) * 0.10 + Math.max(0, -curve) * 0.03;
      const y0 = -0.26 - Math.max(0, -curve) * 0.05;
      mouthMesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, 0.05),
        new THREE.MeshStandardMaterial({ color: C.mouth, emissive: 0x080810, roughness: 0.6 })
      );
      mouthMesh.position.set(0, y0, 0.56);
      faceGroup.add(mouthMesh);
    }
    rebuildMouth(0.08);

    return {
      headMat, bodyMat, leftEye, rightEye, leftBrow, rightBrow, ledMeshes,
      rebuildMouth,
    };
  },
};

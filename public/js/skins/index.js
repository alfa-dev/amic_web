import classic from './classic.js';
import blocky from './blocky.js';
import { makeGltfSkin } from './gltf_skin.js';

// Free, permissively-licensed .glb models turned into skins. Credits:
//  - RobotExpressive: © Tomás Laulhé, CC0 1.0 (modified by Don McCurdy)
//  - Fox: © PixelMannen, CC0 1.0 (model); rig/animation/conversion CC BY 4.0
//    by tomkranis, @AsoboStudio and @scurest
//  - Avocado, BoomBox, Lantern: © Microsoft / Frank Galligan, CC0 1.0
//    (Khronos glTF-Sample-Assets)
const robot = makeGltfSkin({
  id: 'robot3d', name: 'Robô 3D',
  url: '/models/skins/RobotExpressive.glb',
  palette: { head: 0xe7ecf5, headEmit: 0x4a5a80, eye: 0x080810, eyeShine: 0xffffff, brow: 0x1a1a30, mouth: 0x2a2a44 },
  targetHeight: 1.9, yOffset: -0.15, rotationY: Math.PI,
  eyeY: 0.55, eyeZ: 0.55, eyeX: 0.26, browZ: 0.5, mouthY: 0.05, mouthZ: 0.55,
});

const fox = makeGltfSkin({
  id: 'fox', name: 'Raposa',
  url: '/models/skins/Fox.glb',
  palette: { head: 0xf0ad6e, headEmit: 0x7a4a1e, eye: 0x100804, eyeShine: 0xffffff, brow: 0x3a2010, mouth: 0x3a1c10 },
  targetHeight: 1.9, yOffset: 0, rotationY: 0,
  eyeY: 0.75, eyeZ: 0.3, eyeX: 0.14, browZ: 0.28, mouthY: 0.5, mouthZ: 0.34,
});

const avocado = makeGltfSkin({
  id: 'avocado', name: 'Abacate',
  url: '/models/skins/Avocado.glb',
  palette: { head: 0x8fae4a, headEmit: 0x35431c, eye: 0x201008, eyeShine: 0xffffff, brow: 0x3a2a10, mouth: 0x4a3018 },
  targetHeight: 1.9, yOffset: 0, rotationY: 0,
  eyeY: 0.35, eyeZ: 0.5, eyeX: 0.22, browZ: 0.44, mouthY: -0.1, mouthZ: 0.52,
});

const boombox = makeGltfSkin({
  id: 'boombox', name: 'Rádio',
  url: '/models/skins/BoomBox.glb',
  palette: { head: 0x33363d, headEmit: 0x101114, eye: 0xe8e8ee, eyeShine: 0xffffff, brow: 0xcccccc, mouth: 0x0a0a0c },
  targetHeight: 1.6, yOffset: 0.1, rotationY: 0,
  eyeY: 0.05, eyeZ: 0.55, eyeX: 0.32, browZ: 0.5, mouthY: -0.35, mouthZ: 0.58,
});

const lantern = makeGltfSkin({
  id: 'lantern', name: 'Lanterna',
  url: '/models/skins/Lantern.glb',
  palette: { head: 0x6b5a3c, headEmit: 0x2a2010, eye: 0xfff2c0, eyeShine: 0xffffff, brow: 0x2a2010, mouth: 0x1a1408 },
  targetHeight: 1.9, yOffset: -0.2, rotationY: 0,
  eyeY: 0.45, eyeZ: 0.4, eyeX: 0.16, browZ: 0.34, mouthY: 0.1, mouthZ: 0.42,
});

const SKINS = { classic, blocky, robot3d: robot, fox, avocado, boombox, lantern };
const DEFAULT_SKIN_ID = 'classic';

export function getSkin(id) {
  return SKINS[id] || SKINS[DEFAULT_SKIN_ID];
}

export function listSkins() {
  return Object.values(SKINS).map(({ id, name }) => ({ id, name }));
}

import * as THREE from 'three';

export interface KivoScene {
  greet(): void;
  focus(): void;
  reset(): void;
  resize(): void;
  dispose(): void;
}
export function createKivoScene(canvas: HTMLCanvasElement, options: { reducedMotion: () => boolean }): KivoScene {
  if (!canvas) throw new Error('Kivo needs a canvas.');
  const motionReduced = () => Boolean(options.reducedMotion && options.reducedMotion());
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (error) {
    throw new Error('Kivo could not start WebGL: ' + (error instanceof Error ? error.message : 'unknown graphics error'));
  }
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
  const home = new THREE.Vector3(3, 1.8, 5);
  const close = new THREE.Vector3(1.5, 2.0, 3.8);
  const homeTarget = new THREE.Vector3(0, 1.24, 0);
  const closeTarget = new THREE.Vector3(0, 1.75, 0.12);
  camera.position.copy(home);
  camera.lookAt(homeTarget);

  scene.add(new THREE.HemisphereLight(0xfff4e7, 0x667a9a, 2.3));
  const key = new THREE.DirectionalLight(0xfff4e7, 4.0);
  key.position.set(-3, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -2;
  key.shadow.normalBias = 0.025;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xa9c5ff, 3.2);
  rim.position.set(4, 4, -3);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffb0a0, 0.6);
  fill.position.set(-4, 1, -1);
  scene.add(fill);

  const materials = {
    shell: new THREE.MeshPhysicalMaterial({ color: 0xffefd9, roughness: 0.3, metalness: 0.03, clearcoat: 0.5, clearcoatRoughness: 0.22 }),
    body: new THREE.MeshPhysicalMaterial({ color: 0xf4826f, roughness: 0.36, metalness: 0.02, clearcoat: 0.4 }),
    trim: new THREE.MeshPhysicalMaterial({ color: 0x8f9ee4, roughness: 0.3, metalness: 0.12, clearcoat: 0.6 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x17243a, roughness: 0.17, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
    eyes: new THREE.MeshStandardMaterial({ color: 0xfff1db, emissive: 0xffd9aa, emissiveIntensity: 1.2, roughness: 0.2 }),
    blush: new THREE.MeshStandardMaterial({ color: 0xffa28c, emissive: 0xf47d67, emissiveIntensity: 0.2, roughness: 0.45 }),
    seam: new THREE.MeshStandardMaterial({ color: 0xd8c6b5, roughness: 0.65 }),
    disc: new THREE.MeshPhysicalMaterial({ color: 0xcbd3e3, roughness: 0.38, metalness: 0.15, clearcoat: 0.4 })
  };

  function roundedGeometry(width: number, height: number, depth: number, radius: number, bevel = 0.035) {
    const shape = new THREE.Shape();
    const x = -width / 2, y = -height / 2, r = Math.min(radius, width / 2, height / 2);
    shape.moveTo(x + r, y);
    shape.lineTo(x + width - r, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + r);
    shape.lineTo(x + width, y + height - r);
    shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    shape.lineTo(x + r, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 5, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 20 });
    geometry.translate(0, 0, -depth / 2);
    geometry.computeVertexNormals();
    return geometry;
  }
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(x, y, z);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  }
  function capsule(radius: number, length: number, material: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number) {
    return mesh(new THREE.CapsuleGeometry(radius, length, 8, 20), material, parent, x, y, z);
  }

  const mascot = new THREE.Group();
  scene.add(mascot);
  mascot.rotation.y = -0.12;
  const body = capsule(0.38, 0.42, materials.body, mascot, 0, 0.92, 0);
  body.scale.set(1.32, 0.98, 0.85);
  const collar = mesh(new THREE.TorusGeometry(0.29, 0.065, 12, 40), materials.seam, mascot, 0, 1.41, 0);
  collar.rotation.x = Math.PI / 2;
  const badge = mesh(roundedGeometry(0.3, 0.23, 0.025, 0.075, 0.018), materials.shell, mascot, 0, 1.02, 0.335);
  badge.rotation.x = -0.12;
  mesh(new THREE.TorusGeometry(0.058, 0.018, 10, 24), materials.trim, badge, 0, 0, 0.035);

  const head = new THREE.Group();
  head.position.set(0, 1.98, 0.02);
  head.rotation.z = -0.07;
  mascot.add(head);
  mesh(roundedGeometry(1.36, 1.0, 0.7, 0.4, 0.12), materials.shell, head);
  const visor = mesh(roundedGeometry(1.18, 0.61, 0.07, 0.27, 0.055), materials.visor, head, 0, -0.035, 0.455);
  visor.rotation.x = -0.035;
  const eyes: THREE.Mesh[] = [];
  [-0.265, 0.265].forEach(x => {
    const eye = capsule(0.065, 0.13, materials.eyes, head, x, 0.015, 0.56);
    eye.scale.z = 0.48;
    eye.rotation.z = x < 0 ? -0.08 : 0.08;
    eyes.push(eye);
    const cheek = mesh(new THREE.SphereGeometry(0.045, 16, 12), materials.blush, head, x * 1.49, -0.17, 0.543);
    cheek.scale.set(1.3, 0.48, 0.35);
  });
  const smile = mesh(new THREE.TorusGeometry(0.087, 0.014, 8, 24, Math.PI * 0.72), materials.eyes, head, 0, -0.13, 0.56);
  smile.rotation.z = Math.PI * 1.14;
  [-1, 1].forEach(side => {
    const ear = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.13, 32), materials.trim, head, side * 0.82, 0.035, 0);
    ear.rotation.z = Math.PI / 2;
    const inset = mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.145, 24), materials.shell, head, side * 0.84, 0.035, 0);
    inset.rotation.z = Math.PI / 2;
  });
  const antenna = capsule(0.032, 0.19, materials.trim, head, 0.31, 0.68, -0.04);
  antenna.rotation.z = -0.28;
  mesh(new THREE.SphereGeometry(0.083, 24, 20), materials.body, head, 0.35, 0.82, -0.04);

  function makeArm(side: number) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.51, 1.18, 0.015);
    pivot.rotation.z = side * 0.2;
    mascot.add(pivot);
    const arm = capsule(0.105, 0.28, materials.body, pivot, side * 0.035, -0.19, 0);
    arm.rotation.z = side * 0.12;
    const hand = capsule(0.125, 0.065, materials.shell, pivot, side * 0.065, -0.43, 0.025);
    hand.rotation.z = side * -0.2;
    return pivot;
  }
  const wavingArm = makeArm(-1);
  makeArm(1);
  [-1, 1].forEach(side => {
    capsule(0.13, 0.13, materials.trim, mascot, side * 0.24, 0.31, -0.015);
    const foot = capsule(0.155, 0.15, materials.shell, mascot, side * 0.255, 0.15, 0.12);
    foot.rotation.x = Math.PI / 2;
    foot.scale.set(1, 1.13, 0.78);
  });
  mesh(new THREE.CylinderGeometry(1.05, 1.11, 0.12, 80), materials.disc, scene, 0, -0.1, 0);
  const discRim = mesh(new THREE.TorusGeometry(1.02, 0.022, 8, 80), materials.shell, scene, 0, -0.031, 0);
  discRim.rotation.x = Math.PI / 2;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: 0.14 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.17;
  shadow.receiveShadow = true;
  scene.add(shadow);

  let disposed = false, visible = true, frame = 0, focused = false;
  let action: { started: number; fromPosition: THREE.Vector3; fromTarget: THREE.Vector3; wave: boolean } | null = null;
  let nextBlink = performance.now() + 3100, blinkStart = -1;
  const view = { position: home.clone(), target: homeTarget.clone() };
  function resize() {
    if (disposed) return;
    const width = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 230);
    const height = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 320);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  function render(now: number) {
    frame = 0;
    if (disposed || !visible) return;
    const reduced = motionReduced();
    const targetPosition = focused ? close : home;
    const targetLook = focused ? closeTarget : homeTarget;
    camera.position.copy(targetPosition);
    view.target.copy(targetLook);
    wavingArm.rotation.z = -0.2;
    head.rotation.z = -0.07;
    if (action) {
      const raw = Math.min(1, (now - action.started) / 650);
      const t = reduced ? 1 : raw;
      const eased = t * t * (3 - 2 * t);
      camera.position.lerpVectors(action.fromPosition, targetPosition, eased);
      view.target.lerpVectors(action.fromTarget, targetLook, eased);
      if (action.wave && !reduced) {
        const envelope = Math.sin(Math.PI * t);
        const angle = 0.09 * envelope;
        camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        camera.position.multiplyScalar(1 - 0.045 * envelope);
        wavingArm.rotation.z = -0.2 - 2.35 * envelope + 0.23 * Math.sin(t * Math.PI * 6) * envelope;
        head.rotation.z = -0.07 - envelope * 0.08;
      }
      if (t >= 1) action = null;
    }
    if (!reduced && now >= nextBlink && blinkStart < 0) blinkStart = now;
    if (reduced) {
      blinkStart = -1;
      nextBlink = now + 3300;
      eyes.forEach(eye => { eye.scale.y = 1; });
    } else if (blinkStart >= 0) {
      const t = (now - blinkStart) / 155;
      const scale = t < 1 ? 1 - Math.sin(t * Math.PI) * 0.91 : 1;
      eyes.forEach(eye => { eye.scale.y = scale; });
      if (t >= 1) { blinkStart = -1; nextBlink = now + 3900; }
    }
    camera.lookAt(view.target);
    view.position.copy(camera.position);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  }
  function ensureFrame() { if (!disposed && visible && !frame) frame = requestAnimationFrame(render); }
  function move(toFocus: boolean, wave: boolean) {
    if (disposed) return;
    focused = toFocus;
    action = { started: performance.now(), fromPosition: camera.position.clone(), fromTarget: view.target.clone(), wave };
    ensureFrame();
  }
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(canvas);
  const intersectionObserver = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) ensureFrame();
    else if (frame) { cancelAnimationFrame(frame); frame = 0; }
  }, { threshold: 0 }) : null;
  intersectionObserver?.observe(canvas);
  resize();
  ensureFrame();
  return {
    greet() { move(focused, true); },
    focus() { move(true, true); },
    reset() { move(false, false); },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      const geometries = new Set<THREE.BufferGeometry>(), sceneMaterials = new Set<THREE.Material>();
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(item => sceneMaterials.add(item));
      });
      geometries.forEach(item => item.dispose());
      sceneMaterials.forEach(item => item.dispose());
      renderer.dispose();
    }
  };
};

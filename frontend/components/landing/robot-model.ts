import * as THREE from "three";

// Extracted from the supplied robot-bug.html: original geometry, materials,
// two-bone IK, tripod gait, head motion, and antennae. No redesigned parts.
type Leg = {
  side: number; femur: THREE.Group; tibia: THREE.Group;
  knee: THREE.Mesh; kneeLight: THREE.Mesh; coxa: THREE.Mesh; foot: THREE.Mesh;
  hip: THREE.Vector3; rest: THREE.Vector3; offset: number;
};

export function createRobotModel(scene: THREE.Scene) {
  const CONFIG = { scale: 1.3, glow: 0xffffff };
  const V3 = THREE.Vector3;
  const TAU = Math.PI * 2;
  const clamp = THREE.MathUtils.clamp;
  // Glow colour (everything that glows shares this)
  // ------------------------------------------------------------------
  const accent = new THREE.Color(CONFIG.glow);
  const glowMat = new THREE.MeshBasicMaterial({ color: accent.clone(), toneMapped: false });
  const eyeGlow = new THREE.MeshBasicMaterial({ color: accent.clone(), toneMapped: false });

  // ------------------------------------------------------------------
  // Procedural armour plating texture (colour + bump)
  // ------------------------------------------------------------------
  function makeShellTextures() {
    const W = 1024, H = 512;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d')!;
    x.fillStyle = '#f6f6f6'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 2200; i++) {          // brushed-metal streaks
      x.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
      x.fillRect(Math.random() * W, Math.random() * H, 30 + Math.random() * 90, 1);
    }
    const lines = [0, -0.08, 0.08, -0.16, 0.16, -0.24, 0.24];
    const rows = [90, 175, 270, 370];
    x.fillStyle = '#17181a';
    lines.forEach(k => { x.fillRect((0.75 + k) * W - (k === 0 ? 4 : 1.5), 0, k === 0 ? 8 : 3, H); });
    rows.forEach(y => x.fillRect(0, y - 1.5, W, 3));
    x.fillStyle = '#9a9a9a';                   // rivets
    rows.forEach(y => lines.forEach(k => {
      [-1, 1].forEach(s => { x.beginPath(); x.arc((0.75 + k) * W + s * 12, y + 11, 3, 0, TAU); x.fill(); });
    }));
    const map = new THREE.CanvasTexture(c);
    map.anisotropy = 4;

    return { map };
  }
  const shellTex = makeShellTextures();

  // ------------------------------------------------------------------
  // Materials
  // ------------------------------------------------------------------
  // Palette: glossy white armour + matte-gloss black parts
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: shellTex.map, bumpMap: shellTex.map, bumpScale: 2,
    metalness: 0.1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.0
  });
  const armorMat = new THREE.MeshStandardMaterial({            // white faceted plates, knees, hips
    color: 0xf2f2f2, metalness: 0.15, roughness: 0.3, flatShading: true, envMapIntensity: 1.0
  });
  const blackArmor = new THREE.MeshStandardMaterial({          // black faceted head
    color: 0x0c0c0d, metalness: 0.5, roughness: 0.3, flatShading: true, envMapIntensity: 1.1
  });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, metalness: 0.5, roughness: 0.36, envMapIntensity: 1.0 });
  const lightMetal = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.6, roughness: 0.22, envMapIntensity: 1.2 });

  // ------------------------------------------------------------------
  // Build the robot (faces +Z)
  // ------------------------------------------------------------------
  const bug = new THREE.Group();
  const body = new THREE.Group();
  bug.add(body);
  bug.scale.setScalar(CONFIG.scale);
  scene.add(bug);

  const sphereGeo = new THREE.SphereGeometry(1, 28, 20);
  function ellipsoid(mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) {
    const m = new THREE.Mesh(sphereGeo, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    return m;
  }

  // Armoured wing-case shell
  function makeElytra() {
    const g = new THREE.SphereGeometry(1, 72, 56);
    g.rotateX(Math.PI / 2);                  // long axis along Z, front = +Z
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i);
      const z = pos.getZ(i);
      const rear = Math.max(0, -z);
      x *= 1 - 0.3 * rear * rear;
      if (y < 0) y *= 0.5;
      y *= 1 + 0.1 * (1 - z * z);
      pos.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  }
  const elytra = new THREE.Mesh(makeElytra(), shellMat);
  elytra.scale.set(0.54, 0.4, 1.0);
  elytra.position.set(0, 0.03, -0.5);
  body.add(elytra);

  // Chassis underneath, with glowing power cell strip
  body.add(ellipsoid(darkMetal, 0.46, 0.2, 0.92, 0, -0.14, -0.35));
  for (let i = 0; i < 5; i++) {
    body.add(ellipsoid(armorMat, 0.43 - i * 0.03, 0.045, 0.06, 0, -0.27, -0.05 - i * 0.2));
  }
  body.add(ellipsoid(glowMat, 0.05, 0.012, 0.5, 0, -0.325, -0.45));

  // Faceted thorax armour + hex power core
  const thorax = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), armorMat);
  thorax.scale.set(0.48, 0.28, 0.36);
  thorax.position.set(0, 0.02, 0.42);
  body.add(thorax);
  const coreBase = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.04, 6), darkMetal);
  coreBase.position.set(0, 0.27, 0.4);
  body.add(coreBase);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 6), glowMat);
  core.position.set(0, 0.285, 0.4);
  body.add(core);

  // Head on a neck pivot so it can scan independently
  const head = new THREE.Group();
  head.position.set(0, 0, 0.68);
  body.add(head);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 8), darkMetal);
  neck.rotation.x = Math.PI / 2;
  neck.position.set(0, -0.02, -0.02);
  head.add(neck);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), blackArmor);
  skull.scale.set(0.28, 0.2, 0.26);
  skull.position.set(0, -0.02, 0.17);
  head.add(skull);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.14), darkMetal);
  visor.position.set(0, 0.01, 0.3);
  head.add(visor);

  [-1, 1].forEach(s => {
    head.add(ellipsoid(eyeGlow, 0.065, 0.065, 0.065, s * 0.17, 0.02, 0.33));    // glowing eyes
    const mandible = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 6), lightMetal);
    mandible.rotation.x = Math.PI / 2;
    mandible.rotation.z = s * 0.4;
    mandible.position.set(s * 0.12, -0.08, 0.45);
    head.add(mandible);
  });
  head.add(ellipsoid(glowMat, 0.03, 0.03, 0.03, 0, 0.05, 0.38));                // centre sensor

  // Antennae: jointed rods with glowing tips
  const antennae = [-1, 1].map(s => {
    const g = new THREE.Group();
    g.position.set(s * 0.1, 0.06, 0.3);
    const curve = new THREE.CatmullRomCurve3([
      new V3(0, 0, 0), new V3(s * 0.08, 0.1, 0.2), new V3(s * 0.2, 0.17, 0.4), new V3(s * 0.34, 0.12, 0.58)
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.009, 6, false), lightMetal));
    [0.35, 0.65].forEach(t => { const p = curve.getPoint(t); g.add(ellipsoid(darkMetal, 0.02, 0.02, 0.02, p.x, p.y, p.z)); });
    const tip = curve.getPoint(1);
    g.add(ellipsoid(glowMat, 0.032, 0.032, 0.032, tip.x, tip.y, tip.z));
    head.add(g);
    return { g, s };
  });

  // ------------------------------------------------------------------
  // Legs: hydraulic segments + 2-bone IK + tripod gait
  // ------------------------------------------------------------------
  const L1 = 0.7, L2 = 0.8;
  const STRIDE = 0.28, LIFT = 0.3, FOOT_Y = -0.5, STANCE = 0.6;
  const rows = [
    { hz: 0.45,  fx: 1.2,  fz: 0.95 },   // front
    { hz: 0.1,   fx: 1.45, fz: 0.15 },   // middle
    { hz: -0.25, fx: 1.3,  fz: -0.8 }    // hind
  ];

  function limb(len: number, r0: number, r1: number, bands: number[], piston: boolean) {
    const grp = new THREE.Group();
    const geo = new THREE.CylinderGeometry(r1, r0, len, 12);
    geo.translate(0, len / 2, 0);
    grp.add(new THREE.Mesh(geo, darkMetal));
    bands.forEach(f => {
      const r = r0 + (r1 - r0) * f + 0.008;
      const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.011, 6, 20), glowMat);
      band.rotation.x = Math.PI / 2;
      band.position.y = len * f;
      grp.add(band);
    });
    if (piston) {                              // hydraulic rod beside the segment
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, len * 0.7, 8), lightMetal);
      rod.position.set(0.075, len * 0.45, 0);
      grp.add(rod);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, len * 0.4, 8), armorMat);
      sleeve.position.set(0.075, len * 0.2, 0);
      grp.add(sleeve);
    }
    return grp;
  }

  const footGeo = new THREE.ConeGeometry(0.032, 0.13, 8);
  const legs: Leg[] = [];
  rows.forEach((r, row) => {
    [-1, 1].forEach(side => {
      const femur = limb(L1, 0.058, 0.046, [0.55], true);
      const tibia = limb(L2, 0.044, 0.02, [0.3, 0.6], true);
      const knee = ellipsoid(armorMat, 0.075, 0.075, 0.075, 0, 0, 0);
      const kneeLight = ellipsoid(glowMat, 0.026, 0.026, 0.026, 0, 0, 0);
      const coxa = ellipsoid(armorMat, 0.095, 0.085, 0.1, 0, 0, 0);
      const foot = new THREE.Mesh(footGeo, lightMetal);
      foot.rotation.x = Math.PI;               // tip pointing down
      bug.add(femur, tibia, knee, kneeLight, coxa, foot);
      legs.push({
        side, femur, tibia, knee, kneeLight, coxa, foot,
        hip: new V3(side * 0.3, -0.02, r.hz),
        rest: new V3(side * r.fx, FOOT_Y, r.fz),
        // Tripod gait: front-left, middle-right, hind-left move together
        offset: ((row + (side > 0 ? 1 : 0)) % 2) * 0.5
      });
    });
  });

  const UP = new V3(0, 1, 0);
  const _dir = new V3(), _d = new V3(), _p = new V3(), _k = new V3(), _f = new V3(), _hip = new V3(), _foot = new V3();

  function placeLimb(grp: THREE.Group, a: THREE.Vector3, b: THREE.Vector3) {
    _dir.subVectors(b, a).normalize();
    grp.position.copy(a);
    grp.quaternion.setFromUnitVectors(UP, _dir);
  }

  function solveLeg(leg: Leg, hip: THREE.Vector3, foot: THREE.Vector3) {
    _d.subVectors(foot, hip);
    let dist = _d.length();
    dist = clamp(dist, Math.abs(L1 - L2) + 0.001, L1 + L2 - 0.001);
    _d.normalize();
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(L1 * L1 - a * a, 0));
    _p.set(leg.side * 0.8, 1, 0);              // knee bends up and outward
    _p.addScaledVector(_d, -_p.dot(_d)).normalize();
    _k.copy(hip).addScaledVector(_d, a).addScaledVector(_p, h);
    _f.copy(hip).addScaledVector(_d, dist);
    placeLimb(leg.femur, hip, _k);
    placeLimb(leg.tibia, _k, _f);
    leg.coxa.position.copy(hip);
    leg.knee.position.copy(_k);
    leg.kneeLight.position.copy(_k).addScaledVector(_p, 0.06);
    leg.foot.position.copy(_f).y += 0.065;
  }

  // ------------------------------------------------------------------
  // Soft shadow on the ground
  // ------------------------------------------------------------------
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  {
    const c = shadowCanvas.getContext('2d')!;
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,0.75)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  }
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.scale.set(2.8 * CONFIG.scale, 3.6 * CONFIG.scale, 1);
  const shadow = new THREE.Group();
  shadow.position.y = 0.01;
  shadow.add(shadowPlane);
  scene.add(shadow);



  const state = { speed: 0, phase: 0, moving: 0, lean: 0, headYaw: 0 };
  bug.position.y = 0.5 * CONFIG.scale;
  function animate(dt: number, now: number, speed: number, heading: number, diff: number, turn: number) {
    bug.rotation.y = heading;
    shadow.rotation.y = heading;
    // --- gait
    state.speed = speed;
    state.lean += (turn - state.lean) * Math.min(1, dt * 6);
    const localSpeed = state.speed / CONFIG.scale;
    state.phase = (state.phase + dt * localSpeed * STANCE / (2 * STRIDE)) % 1;
    const wantMoving = clamp(state.speed / 0.25, 0, 1);
    state.moving += (wantMoving - state.moving) * Math.min(1, dt * 5);
    const m = state.moving;

    const bob = Math.sin(state.phase * TAU * 2) * 0.01 * m;
    body.position.y = bob;
    body.rotation.z = Math.sin(state.phase * TAU) * 0.025 * m - state.lean * 0.1;
    body.rotation.y = Math.sin(state.phase * TAU) * 0.03 * m;

    legs.forEach(leg => {
      const t = (state.phase + leg.offset) % 1;
      let z, lift = 0;
      if (t < STANCE) {                          // stance
        z = STRIDE * (1 - 2 * (t / STANCE));
      } else {                                   // swing: crisp servo-like lift and reach
        const u = (t - STANCE) / (1 - STANCE);
        const e = u * u * (3 - 2 * u);
        z = -STRIDE + 2 * STRIDE * e;
        lift = Math.sin(Math.PI * u) * LIFT;
      }
      _foot.set(leg.rest.x, leg.rest.y + lift * m, leg.rest.z + z * m);
      _hip.copy(leg.hip);
      _hip.y += bob;
      solveLeg(leg, _hip, _foot);
    });

    // --- head scans; antennae sweep; lights pulse
    const sweep = Math.sin(now * 1.6) * (0.35 - 0.2 * m);
    const wantYaw = clamp(diff * 0.6, -0.5, 0.5) + sweep;
    state.headYaw += (wantYaw - state.headYaw) * Math.min(1, dt * 7);
    head.rotation.y = state.headYaw;

    antennae.forEach(({ g, s }, i) => {
      g.rotation.y = Math.sin(now * 2.6 + i * 1.7) * 0.25 * s + s * 0.1;
      g.rotation.x = Math.sin(now * 2.1 + i) * 0.12;
    });

    const pulse = 0.78 + 0.22 * Math.sin(now * 4);
    eyeGlow.color.copy(accent).multiplyScalar(pulse);


  }
  return { animate };
}

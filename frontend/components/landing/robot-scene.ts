import * as THREE from "three";
import { createRobotModel } from "./robot-model";

/** A small transparent viewport avoids repainting a screen-sized WebGL buffer. */
export function createRobotScene(canvas: HTMLCanvasElement, lowPower: boolean) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !lowPower, powerPreference: "low-power" });
  const scene = new THREE.Scene();
  let environment: THREE.WebGLRenderTarget | undefined;
  const dispose = () => {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    scene.environment = null;
    textures.forEach((texture) => texture.dispose());
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    environment?.dispose();
    scene.clear();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // Original camera direction; orthographic projection keeps a consistent
    // 100–150px footprint anywhere on the page, without perspective drift.
    const camera = new THREE.OrthographicCamera(-2.9, 2.9, 2.9, -2.9, 0.1, 100);
    camera.position.set(0, 7.5, 6.2);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x1a1c20, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(4, 8, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.8);
    rim.position.set(-5, 3, -4);
    scene.add(rim);

    // Original procedural studio reflections, with explicit temporary disposal.
    const ec = document.createElement("canvas");
    ec.width = 512; ec.height = 256;
    const context = ec.getContext("2d");
    if (context) {
      const gradient = context.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, "#9db8e8");
      gradient.addColorStop(0.45, "#e6ecf5");
      gradient.addColorStop(0.5, "#3a3f46");
      gradient.addColorStop(1, "#0c0e11");
      context.fillStyle = gradient; context.fillRect(0, 0, 512, 256);
      context.fillStyle = "#ffffff"; context.fillRect(60, 40, 110, 30);
      context.fillStyle = "#fff1d6"; context.fillRect(300, 28, 140, 26);
      context.fillStyle = "#cfeaff"; context.fillRect(200, 90, 40, 64);
      const texture = new THREE.CanvasTexture(ec);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      const pmrem = new THREE.PMREMGenerator(renderer);
      try {
        environment = pmrem.fromEquirectangular(texture);
        scene.environment = environment.texture;
      } finally {
        texture.dispose();
        pmrem.dispose();
      }
    }

    const robot = createRobotModel(scene);
    // Project the original mesh's full gait/heading envelope through this camera.
    camera.updateMatrixWorld();
    const box = new THREE.Box3(), corner = new THREE.Vector3();
    let extent = 0;
    for (let heading = 0; heading < 16; heading++) {
      for (let pose = 0; pose < 8; pose++) {
        robot.animate(.08, pose * .2, 1.5, heading * Math.PI / 8, .5, .5);
        box.setFromObject(robot.object);
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          corner.set(x, y, z).project(camera);
          extent = Math.max(extent, Math.abs(corner.x), Math.abs(corner.y));
        }
      }
    }
    const fit = Math.max(1, extent / .9);
    camera.left *= fit; camera.right *= fit; camera.top *= fit; camera.bottom *= fit;
    camera.updateProjectionMatrix();
    const footprintRatio = Math.min(.48, extent / fit / 2 + .02);
    robot.animate(0, 0, 0, 0, 0, 0);
    return {
      metrics(size: number) { return { radius: size * footprintRatio, pixelsPerUnit: size / (camera.right - camera.left) }; },
      reduceQuality() { renderer.setPixelRatio(1); },
      resize(size: number) { renderer.setSize(size, size, false); },
      render(dt: number, now: number, speed: number, heading: number, diff: number, turn: number) {
        robot.animate(dt, now, speed, heading, diff, turn);
        renderer.render(scene, camera);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}


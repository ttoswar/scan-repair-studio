import * as THREE from "three";
import { USDLoader } from "three/addons/loaders/USDLoader.js";

export interface LoadedUsdScene {
  scene: THREE.Group;
  loaderName: string;
  cleanup?: () => void;
}

export async function loadUsdScene(file: File): Promise<LoadedUsdScene> {
  if (!file.name.toLowerCase().endsWith(".usdz")) {
    throw new Error("请导入 .usdz 文件。");
  }

  try {
    const buffer = await file.arrayBuffer();
    const loader = new USDLoader();
    const parsed = loader.parse(buffer);
    const group = new THREE.Group();
    group.add(parsed);
    assertRenderable(group);
    return {
      scene: normalizeScene(group, file.name),
      loaderName: "three/examples USDLoader"
    };
  } catch (error) {
    throw new Error(`USDZ 解析失败：${toMessage(error)}`);
  }
}

function normalizeScene(scene: THREE.Group, name: string): THREE.Group {
  scene.name = name;
  scene.updateMatrixWorld(true);
  centerAndScale(scene);
  return scene;
}

function centerAndScale(scene: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(scene);
  if (box.isEmpty()) {
    return;
  }

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDimension = Math.max(size.x, size.y, size.z);
  if (maxDimension > 0) {
    const scale = 3 / maxDimension;
    scene.scale.multiplyScalar(scale);
    scene.position.copy(center).multiplyScalar(-scale);
  }

  scene.updateMatrixWorld(true);
}

function assertRenderable(scene: THREE.Object3D): void {
  let meshes = 0;
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      meshes += 1;
    }
  });

  if (meshes === 0) {
    throw new Error("文件已解析，但没有找到可渲染 mesh。");
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

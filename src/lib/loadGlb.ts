import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export async function loadGlbFromUrl(url: string): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const scene = gltf.scene || new THREE.Group();
  scene.name = "repaired-result.glb";
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

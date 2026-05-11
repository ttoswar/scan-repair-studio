import * as THREE from "three";
import type { SceneStats } from "../types";

export function computeSceneStats(scene: THREE.Object3D): SceneStats {
  const materialIds = new Set<string>();
  let meshes = 0;
  let vertices = 0;
  let triangles = 0;

  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) {
      return;
    }

    meshes += 1;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute("position");
    const vertexCount = position?.count ?? 0;
    vertices += vertexCount;
    triangles += geometry.index ? geometry.index.count / 3 : vertexCount / 3;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      if (material) {
        materialIds.add(material.uuid);
      }
    });
  });

  const box = new THREE.Box3().setFromObject(scene);
  const dimensions = new THREE.Vector3();
  if (!box.isEmpty()) {
    box.getSize(dimensions);
  }

  return {
    meshes,
    vertices,
    triangles: Math.round(triangles),
    materials: materialIds.size,
    animations: 0,
    dimensions
  };
}

export function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function formatVector(vector: THREE.Vector3): string {
  return `${vector.x.toFixed(2)} x ${vector.y.toFixed(2)} x ${vector.z.toFixed(2)}`;
}

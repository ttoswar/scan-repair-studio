import type { Object3D, Vector3 } from "three";

export type RenderMode = "solid" | "wireframe" | "points";
export type ViewMode = "original" | "repaired" | "compare" | "difference";
export type RepairQuality = "low" | "default" | "max";

export interface SceneStats {
  meshes: number;
  vertices: number;
  triangles: number;
  materials: number;
  animations: number;
  dimensions: Vector3;
}

export interface ScanAsset {
  id: string;
  file: File;
  name: string;
  size: number;
  scene: Object3D;
  loaderName: string;
  stats: SceneStats;
}

export interface RepairResult {
  taskId: string;
  assetUrl: string;
  scene: Object3D;
  stats: SceneStats;
}

export interface RepairOptions {
  quality: RepairQuality;
  bakeTextures: boolean;
  hollow: boolean;
}

export interface RepairStatus {
  status: string;
  progress: number;
  message: string;
}

import type { Object3D } from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

export async function exportSceneToGlb(scene: Object3D, fileName = "scan-repair-upload.glb"): Promise<File> {
  const exporter = new GLTFExporter();
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
          return;
        }
        reject(new Error("GLB 导出失败：导出器返回了 JSON glTF，而不是二进制 GLB。"));
      },
      (error) => reject(error),
      {
        binary: true,
        onlyVisible: true,
        trs: false
      }
    );
  });

  return new File([buffer], fileName, { type: "model/gltf-binary" });
}

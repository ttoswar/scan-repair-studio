import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { RenderMode, ViewMode } from "../types";

interface ViewerProps {
  original?: THREE.Object3D | null;
  repaired?: THREE.Object3D | null;
  renderMode: RenderMode;
  viewMode: ViewMode;
  resetToken: number;
}

interface ViewerState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  content: THREE.Group;
  animationId: number;
}

export function Viewer({ original, repaired, renderMode, viewMode, resetToken }: ViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<ViewerState | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121212);

    const camera = new THREE.PerspectiveCamera(45, host.clientWidth / Math.max(host.clientHeight, 1), 0.01, 1000);
    camera.position.set(3.2, 2.4, 4.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.35, 0);

    const content = new THREE.Group();
    scene.add(content);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x303030, 2.1));

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 6, 3);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xd0f7ff, 0.9);
    fill.position.set(-3, 2, -4);
    scene.add(fill);

    const grid = new THREE.GridHelper(8, 16, 0x384047, 0x25292e);
    grid.position.y = -1.5;
    scene.add(grid);

    const resize = () => {
      const width = host.clientWidth;
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      stateRef.current!.animationId = window.requestAnimationFrame(animate);
    };

    stateRef.current = { renderer, scene, camera, controls, content, animationId: 0 };
    animate();

    return () => {
      ro.disconnect();
      window.cancelAnimationFrame(stateRef.current?.animationId ?? 0);
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      disposeObject(content);
      stateRef.current = null;
    };
  }, []);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) {
      return;
    }

    replaceContent(state.content, buildView(original, repaired, renderMode, viewMode));
    fitCamera(state.camera, state.controls, state.content);
  }, [original, repaired, renderMode, viewMode, resetToken]);

  return (
    <div className="viewer" ref={hostRef}>
      {!original && (
        <div className="viewer-empty">
          <span>等待 USDZ 扫描文件</span>
        </div>
      )}
    </div>
  );
}

function buildView(
  original: THREE.Object3D | null | undefined,
  repaired: THREE.Object3D | null | undefined,
  renderMode: RenderMode,
  viewMode: ViewMode
): THREE.Object3D {
  const root = new THREE.Group();

  if (!original) {
    return root;
  }

  if (viewMode === "repaired" && repaired) {
    root.add(makeDisplayObject(repaired, renderMode));
    return root;
  }

  if (viewMode === "compare" && repaired) {
    const left = makeDisplayObject(original, renderMode);
    const right = makeDisplayObject(repaired, renderMode);
    const spacing = computeSpacing(original, repaired);
    left.position.x -= spacing / 2;
    right.position.x += spacing / 2;
    root.add(left, right);
    return root;
  }

  if (viewMode === "difference" && repaired) {
    const base = makeDisplayObject(original, "wireframe", new THREE.Color(0x58d6ff));
    const fixed = makeDisplayObject(repaired, renderMode, new THREE.Color(0xffb05c));
    base.scale.multiplyScalar(1.006);
    root.add(base, fixed);
    return root;
  }

  root.add(makeDisplayObject(original, renderMode));
  return root;
}

function makeDisplayObject(source: THREE.Object3D, mode: RenderMode, tint?: THREE.Color): THREE.Object3D {
  if (mode === "points") {
    return makePointCloud(source, tint);
  }

  const clone = source.clone(true);
  clone.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }

    mesh.geometry = mesh.geometry.clone();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = materials.map((material) => {
      const cloned = material.clone();
      if ("wireframe" in cloned) {
        cloned.wireframe = mode === "wireframe";
      }
      if (tint && "color" in cloned && cloned.color instanceof THREE.Color) {
        cloned.color.lerp(tint, 0.55);
      }
      cloned.transparent = mode === "wireframe" || Boolean(tint);
      cloned.opacity = mode === "wireframe" ? 0.78 : tint ? 0.82 : cloned.opacity;
      return cloned;
    });

    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
  return clone;
}

function makePointCloud(source: THREE.Object3D, tint?: THREE.Color): THREE.Object3D {
  const group = new THREE.Group();
  source.updateMatrixWorld(true);

  source.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) {
      return;
    }

    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: tint ?? 0x98f2cc,
        size: 0.018,
        sizeAttenuation: true
      })
    );
    group.add(points);
  });

  return group;
}

function computeSpacing(original: THREE.Object3D, repaired: THREE.Object3D): number {
  const a = new THREE.Box3().setFromObject(original).getSize(new THREE.Vector3());
  const b = new THREE.Box3().setFromObject(repaired).getSize(new THREE.Vector3());
  return Math.max(a.x, b.x, 1.8) + 0.9;
}

function replaceContent(content: THREE.Group, next: THREE.Object3D): void {
  disposeObject(content);
  content.clear();
  content.add(next);
}

function fitCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, object: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    camera.position.set(3.2, 2.4, 4.2);
    controls.target.set(0, 0.35, 0);
    controls.update();
    return;
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);
  const distance = maxSize / (2 * Math.tan((Math.PI * camera.fov) / 360));
  const direction = new THREE.Vector3(0.82, 0.54, 1).normalize();

  camera.position.copy(center).add(direction.multiplyScalar(distance * 1.7));
  camera.near = Math.max(distance / 100, 0.01);
  camera.far = Math.max(distance * 100, 100);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh && !(child as THREE.Points).isPoints) {
      return;
    }

    const renderable = child as THREE.Mesh | THREE.Points;
    renderable.geometry?.dispose();
    const material = renderable.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material?.dispose();
    }
  });
}

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileUp,
  KeyRound,
  Loader2,
  RotateCcw,
  ScanLine,
  Sparkles,
  SplitSquareHorizontal,
  WandSparkles
} from "lucide-react";
import * as THREE from "three";
import { Viewer } from "./components/Viewer";
import { exportSceneToGlb } from "./lib/exportGlb";
import { loadGlbFromUrl } from "./lib/loadGlb";
import { pollRepairTask, proxiedAssetUrl, submitRepairTask } from "./lib/repairApi";
import { computeSceneStats, formatFileSize, formatVector } from "./lib/sceneStats";
import { loadUsdScene } from "./lib/usdz";
import type { RenderMode, RepairOptions, RepairResult, RepairStatus, ScanAsset, ViewMode } from "./types";

const defaultRepairOptions: RepairOptions = {
  quality: "default",
  bakeTextures: true,
  hollow: false
};

function App() {
  const [asset, setAsset] = useState<ScanAsset | null>(null);
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [renderMode, setRenderMode] = useState<RenderMode>("solid");
  const [viewMode, setViewMode] = useState<ViewMode>("original");
  const [repairOptions, setRepairOptions] = useState<RepairOptions>(defaultRepairOptions);
  const [status, setStatus] = useState("导入一个 iPhone 3D Scanner 生成的 USDZ 文件开始。");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [repairStatus, setRepairStatus] = useState<RepairStatus | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const canRepair = Boolean(asset && apiKey.trim() && !busy);

  const activeStats = useMemo(() => {
    if (viewMode === "repaired" && repairResult) {
      return repairResult.stats;
    }
    return asset?.stats ?? null;
  }, [asset, repairResult, viewMode]);

  const repairDeltas = useMemo(() => {
    if (!asset || !repairResult) {
      return null;
    }

    return {
      meshes: repairResult.stats.meshes - asset.stats.meshes,
      vertices: repairResult.stats.vertices - asset.stats.vertices,
      triangles: repairResult.stats.triangles - asset.stats.triangles,
      vertexPct: percentDelta(asset.stats.vertices, repairResult.stats.vertices),
      trianglePct: percentDelta(asset.stats.triangles, repairResult.stats.triangles)
    };
  }, [asset, repairResult]);

  async function handleFiles(files: FileList | File[]) {
    const file = Array.from(files).find((entry) => entry.name.toLowerCase().endsWith(".usdz"));
    if (!file) {
      setError("请选择 .usdz 文件。");
      return;
    }

    setBusy(true);
    setError(null);
    setRepairResult(null);
    setRepairStatus(null);
    setViewMode("original");
    setStatus("正在解析 USDZ 文件。");

    try {
      const loaded = await loadUsdScene(file);
      const stats = computeSceneStats(loaded.scene);
      setAsset({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        scene: loaded.scene,
        loaderName: loaded.loaderName,
        stats
      });
      setStatus(`已加载 ${file.name}，使用 ${loaded.loaderName}。`);
    } catch (loadError) {
      setAsset(null);
      setError(toMessage(loadError));
      setStatus("USDZ 导入失败。");
    } finally {
      setBusy(false);
    }
  }

  async function handleRepair() {
    if (!asset) {
      setError("先导入 USDZ 文件。");
      return;
    }
    if (!apiKey.trim()) {
      setError("请输入 3D AI Studio API Key。");
      return;
    }

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setBusy(true);
    setError(null);
    setRepairResult(null);
    setRepairStatus({ status: "EXPORTING", progress: 0, message: "正在把 USDZ 场景转换为 GLB 上传文件。" });
    setStatus("正在准备修复任务。");

    try {
      const glbFile = await exportSceneToGlb(asset.scene, `${stripExtension(asset.name)}-repair-input.glb`);
      setRepairStatus({ status: "UPLOADING", progress: 5, message: `GLB 已生成：${formatFileSize(glbFile.size)}，正在上传。` });

      const task = await submitRepairTask(apiKey.trim(), glbFile, repairOptions, abort.signal);
      setRepairStatus({ status: "QUEUED", progress: 8, message: `任务已提交：${task.task_id}` });

      const finished = await pollRepairTask(apiKey.trim(), task.task_id, setRepairStatus, abort.signal);
      const assetUrl = finished.results?.find((result) => result.asset_type === "3D_MODEL")?.asset ?? finished.results?.[0]?.asset;
      if (!assetUrl) {
        throw new Error("修复完成，但没有返回模型 URL。");
      }

      const scene = await loadGlbFromUrl(proxiedAssetUrl(assetUrl));
      const stats = computeSceneStats(scene);
      setRepairResult({
        taskId: task.task_id,
        assetUrl,
        scene,
        stats
      });
      setViewMode("compare");
      setRenderMode("solid");
      setStatus("AI 修复完成，已加载修复后的 GLB。");
      setRepairStatus({
        status: "FINISHED",
        progress: 100,
        message: "修复结果已加载，已切到实体双列对比。左侧原始，右侧修复。"
      });
    } catch (repairError) {
      if ((repairError as DOMException).name !== "AbortError") {
        setError(toMessage(repairError));
        setStatus("AI 修复失败。");
      }
    } finally {
      setBusy(false);
    }
  }

  function stopRepair() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setRepairStatus({ status: "CANCELLED", progress: 0, message: "已取消当前修复任务。" });
    setStatus("修复已取消。");
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    void handleFiles(event.dataTransfer.files);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      void handleFiles(event.target.files);
    }
    event.target.value = "";
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Scan Repair Studio</p>
            <h1>USDZ 3D 扫描预览与 AI 修复</h1>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" onClick={() => setResetToken((value) => value + 1)} title="重置视角">
              <RotateCcw size={18} />
            </button>
          </div>
        </header>

        <Viewer
          original={asset?.scene}
          repaired={repairResult?.scene}
          renderMode={renderMode}
          viewMode={viewMode}
          resetToken={resetToken}
        />
      </section>

      <aside className="control-panel">
        <label className="dropzone" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
          <input type="file" accept=".usdz,model/vnd.usdz+zip" onChange={onFileChange} />
          <FileUp size={22} />
          <span>{asset ? asset.name : "拖拽或选择 USDZ 文件"}</span>
          <small>{asset ? `${formatFileSize(asset.size)} · ${asset.loaderName}` : "文件只在本地浏览器中解析"}</small>
        </label>

        <section className="panel-section">
          <div className="section-title">
            <KeyRound size={16} />
            <span>3D AI Studio API</span>
          </div>
          <input
            className="text-input"
            type="password"
            placeholder="粘贴 API Key，仅保存在当前页面"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="off"
          />
          <div className="option-grid">
            <label>
              质量
              <select
                value={repairOptions.quality}
                onChange={(event) => setRepairOptions((value) => ({ ...value, quality: event.target.value as RepairOptions["quality"] }))}
              >
                <option value="low">low</option>
                <option value="default">default</option>
                <option value="max">max</option>
              </select>
            </label>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={repairOptions.bakeTextures}
                onChange={(event) => setRepairOptions((value) => ({ ...value, bakeTextures: event.target.checked }))}
              />
              烘焙纹理
            </label>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={repairOptions.hollow}
                onChange={(event) => setRepairOptions((value) => ({ ...value, hollow: event.target.checked }))}
              />
              空心化
            </label>
          </div>
          <div className="repair-actions">
            <button className="primary-button" type="button" disabled={!canRepair} onClick={() => void handleRepair()}>
              {busy ? <Loader2 className="spin" size={17} /> : <WandSparkles size={17} />}
              AI 修复
            </button>
            {busy && (
              <button className="secondary-button" type="button" onClick={stopRepair}>
                取消
              </button>
            )}
          </div>
        </section>

        <section className="panel-section">
          <div className="section-title">
            <Eye size={16} />
            <span>预览</span>
          </div>
          <div className="segmented">
            <button className={viewMode === "original" ? "active" : ""} type="button" onClick={() => setViewMode("original")}>
              原始
            </button>
            <button
              className={viewMode === "repaired" ? "active" : ""}
              type="button"
              disabled={!repairResult}
              onClick={() => setViewMode("repaired")}
            >
              修复
            </button>
            <button
              className={viewMode === "compare" ? "active" : ""}
              type="button"
              disabled={!repairResult}
              onClick={() => setViewMode("compare")}
              title="双列对比"
            >
              <SplitSquareHorizontal size={15} />
            </button>
            <button
              className={viewMode === "difference" ? "active" : ""}
              type="button"
              disabled={!repairResult}
              onClick={() => setViewMode("difference")}
            >
              差异
            </button>
          </div>
          <button
            className="secondary-button full-width"
            type="button"
            disabled={!repairResult}
            onClick={() => {
              setViewMode("compare");
              setRenderMode("solid");
            }}
          >
            实体对比
          </button>
          <div className="segmented">
            <button className={renderMode === "solid" ? "active" : ""} type="button" onClick={() => setRenderMode("solid")}>
              实体
            </button>
            <button className={renderMode === "wireframe" ? "active" : ""} type="button" onClick={() => setRenderMode("wireframe")}>
              线框
            </button>
            <button className={renderMode === "points" ? "active" : ""} type="button" onClick={() => setRenderMode("points")}>
              点云
            </button>
          </div>
        </section>

        <section className="panel-section">
          <div className="section-title">
            <ScanLine size={16} />
            <span>模型统计</span>
          </div>
          <dl className="stats-list">
            <div>
              <dt>Meshes</dt>
              <dd>{activeStats?.meshes ?? "-"}</dd>
            </div>
            <div>
              <dt>Vertices</dt>
              <dd>{activeStats ? activeStats.vertices.toLocaleString() : "-"}</dd>
            </div>
            <div>
              <dt>Triangles</dt>
              <dd>{activeStats ? activeStats.triangles.toLocaleString() : "-"}</dd>
            </div>
            <div>
              <dt>Bounds</dt>
              <dd>{activeStats ? formatVector(activeStats.dimensions) : "-"}</dd>
            </div>
          </dl>
        </section>

        {repairResult && repairDeltas && (
          <section className="panel-section">
            <div className="section-title">
              <ScanLine size={16} />
              <span>修复对比</span>
            </div>
            <dl className="stats-list compare-list">
              <div>
                <dt>Task</dt>
                <dd className="mono-text">{repairResult.taskId}</dd>
              </div>
              <div>
                <dt>Meshes</dt>
                <dd>{asset?.stats.meshes.toLocaleString()} → {repairResult.stats.meshes.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Vertices</dt>
                <dd>
                  {asset?.stats.vertices.toLocaleString()} → {repairResult.stats.vertices.toLocaleString()}
                  <span className={deltaClass(repairDeltas.vertices)}>{formatSigned(repairDeltas.vertices)} / {formatPercent(repairDeltas.vertexPct)}</span>
                </dd>
              </div>
              <div>
                <dt>Triangles</dt>
                <dd>
                  {asset?.stats.triangles.toLocaleString()} → {repairResult.stats.triangles.toLocaleString()}
                  <span className={deltaClass(repairDeltas.triangles)}>{formatSigned(repairDeltas.triangles)} / {formatPercent(repairDeltas.trianglePct)}</span>
                </dd>
              </div>
            </dl>
            <p className="hint-text">
              Mesh repair 通常改的是法线、重复点、松散面和 watertight 拓扑；如果只看实体材质，外观可能几乎一样。
            </p>
          </section>
        )}

        <section className="panel-section">
          <div className="section-title">
            <Sparkles size={16} />
            <span>状态</span>
          </div>
          <div className="status-box">
            {error ? <AlertTriangle size={17} /> : repairStatus?.status === "FINISHED" ? <CheckCircle2 size={17} /> : <Sparkles size={17} />}
            <p>{error ?? repairStatus?.message ?? status}</p>
          </div>
          {repairStatus && (
            <div className="progress-track">
              <span style={{ width: `${Math.min(Math.max(repairStatus.progress, 0), 100)}%` }} />
            </div>
          )}
        </section>
      </aside>
    </main>
  );
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function percentDelta(before: number, after: number): number {
  if (before === 0) {
    return after === 0 ? 0 : 100;
  }
  return ((after - before) / before) * 100;
}

function formatSigned(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}

function formatPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function deltaClass(value: number): string {
  if (value > 0) {
    return "delta delta-positive";
  }
  if (value < 0) {
    return "delta delta-negative";
  }
  return "delta";
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default App;

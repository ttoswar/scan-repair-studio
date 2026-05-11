import type { RepairOptions, RepairStatus } from "../types";

const REPAIR_ENDPOINT = "/api/3dai/repair";

export interface RepairTaskResponse {
  task_id: string;
  created_at: string;
}

export interface RepairTaskResult {
  asset: string;
  asset_type: string;
  metadata: unknown;
}

export interface RepairTaskStatusResponse {
  status: string;
  progress?: number;
  failure_reason?: string | null;
  results?: RepairTaskResult[];
}

export async function submitRepairTask(
  apiKey: string,
  modelFile: File,
  options: RepairOptions,
  signal?: AbortSignal
): Promise<RepairTaskResponse> {
  const form = new FormData();
  form.append("model_file", modelFile);
  form.append("output_format", "glb");
  form.append("quality", options.quality);
  form.append("hollow", String(options.hollow));
  form.append("bake_textures", String(options.bakeTextures));

  const response = await guardedFetch(REPAIR_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form,
    signal
  });

  if (!response.ok) {
    throw new Error(await formatApiError(response));
  }

  return response.json() as Promise<RepairTaskResponse>;
}

export async function pollRepairTask(
  apiKey: string,
  taskId: string,
  onStatus: (status: RepairStatus) => void,
  signal?: AbortSignal
): Promise<RepairTaskStatusResponse> {
  while (true) {
    const response = await guardedFetch(`/api/3dai/status/${encodeURIComponent(taskId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      signal
    });

    if (!response.ok) {
      throw new Error(await formatApiError(response));
    }

    const payload = (await response.json()) as RepairTaskStatusResponse;
    const rawProgress = typeof payload.progress === "number" ? payload.progress : 0;
    const progress = rawProgress > 0 && rawProgress <= 1 ? rawProgress * 100 : rawProgress;
    onStatus({
      status: payload.status,
      progress,
      message: describeStatus(payload)
    });

    if (payload.status === "FINISHED") {
      const asset = payload.results?.find((result) => result.asset_type === "3D_MODEL")?.asset ?? payload.results?.[0]?.asset;
      if (!asset) {
        throw new Error("修复任务已完成，但接口没有返回可加载的模型文件。");
      }
      return payload;
    }

    if (["FAILED", "CANCELLED", "CANCELED", "ERROR"].includes(payload.status)) {
      throw new Error(payload.failure_reason || `修复任务失败：${payload.status}`);
    }

    await delay(3500, signal);
  }
}

export function proxiedAssetUrl(assetUrl: string): string {
  return `/api/3dai/asset?url=${encodeURIComponent(assetUrl)}`;
}

function describeStatus(payload: RepairTaskStatusResponse): string {
  if (payload.status === "FINISHED") {
    return "修复完成，正在加载结果。";
  }
  if (payload.failure_reason) {
    return payload.failure_reason;
  }
  return "3D AI Studio 正在修复模型。通常需要 35-80 秒。";
}

async function guardedFetch(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if ((error as DOMException).name === "AbortError") {
      throw error;
    }
    throw new Error("代理服务无法访问 3D AI Studio 接口，请确认本地开发服务仍在运行且网络可用。");
  }
}

async function formatApiError(response: Response): Promise<string> {
  let detail = "";
  try {
    const payload = await response.json();
    detail = payload.detail || payload.message || payload.error || payload.code || JSON.stringify(payload);
  } catch {
    detail = await response.text();
  }

  if (response.status === 401) {
    return "API Key 无效或缺失。";
  }
  if (response.status === 402) {
    return "3D AI Studio 余额不足，无法启动修复任务。";
  }
  if (response.status === 429) {
    return "请求过于频繁，稍后再试。";
  }
  if (response.status === 0 || response.type === "opaque") {
    return "本地代理访问修复接口失败，请确认网络、API Key 和 3D AI Studio 服务状态。";
  }

  return `API 请求失败：HTTP ${response.status}${detail ? ` - ${detail}` : ""}`;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

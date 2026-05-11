import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_BASE = "https://api.3daistudio.com";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "three-d-ai-studio-proxy",
      configureServer(server) {
        server.middlewares.use("/api/3dai/repair", async (incoming, outgoing) => {
          const req = incoming as any;
          const res = outgoing as any;
          if (req.method !== "POST") {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
          }

          await proxyUpload(req, res, `${API_BASE}/v1/tools/repair/`);
        });

        server.middlewares.use("/api/3dai/status/", async (incoming, outgoing) => {
          const req = incoming as any;
          const res = outgoing as any;
          if (req.method !== "GET") {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
          }

          const taskId = req.url?.replace(/^\//, "");
          if (!taskId) {
            sendJson(res, 400, { error: "Missing task id" });
            return;
          }

          await proxyJson(req, res, `${API_BASE}/v1/generation-request/${encodeURIComponent(taskId)}/status/`);
        });

        server.middlewares.use("/api/3dai/asset", async (incoming, outgoing) => {
          const req = incoming as any;
          const res = outgoing as any;
          if (req.method !== "GET") {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
          }

          const rawUrl = new URL(req.url ?? "", "http://local.proxy").searchParams.get("url");
          if (!rawUrl) {
            sendJson(res, 400, { error: "Missing asset URL" });
            return;
          }

          await proxyAsset(rawUrl, res);
        });
      }
    }
  ]
});

async function proxyUpload(req: any, res: any, target: string): Promise<void> {
  try {
    const body = await readBody(req);
    const upstream = await fetch(target, {
      method: "POST",
      headers: forwardHeaders(req, true),
      body: body as unknown as BodyInit
    });
    await pipeResponse(upstream, res);
  } catch (error) {
    sendJson(res, 502, { error: toMessage(error) });
  }
}

async function proxyJson(req: any, res: any, target: string): Promise<void> {
  try {
    const upstream = await fetch(target, {
      headers: forwardHeaders(req, false)
    });
    await pipeResponse(upstream, res);
  } catch (error) {
    sendJson(res, 502, { error: toMessage(error) });
  }
}

async function proxyAsset(rawUrl: string, res: any): Promise<void> {
  try {
    const target = new URL(rawUrl);
    if (target.protocol !== "https:") {
      sendJson(res, 400, { error: "Only HTTPS asset URLs are allowed" });
      return;
    }

    const upstream = await fetch(target);
    await pipeResponse(upstream, res);
  } catch (error) {
    sendJson(res, 502, { error: toMessage(error) });
  }
}

function forwardHeaders(req: any, includeContentType: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  const authorization = req.headers.authorization;
  const contentType = req.headers["content-type"];

  if (typeof authorization === "string") {
    headers.Authorization = authorization;
  }
  if (includeContentType && typeof contentType === "string") {
    headers["Content-Type"] = contentType;
  }

  return headers;
}

async function readBody(req: any): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes = chunk instanceof Uint8Array ? chunk : new TextEncoder().encode(String(chunk));
    chunks.push(bytes);
    total += bytes.byteLength;
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function pipeResponse(upstream: Response, res: any): Promise<void> {
  const contentType = upstream.headers.get("content-type");
  if (contentType) {
    res.setHeader("Content-Type", contentType);
  }

  res.statusCode = upstream.status;
  res.end(new Uint8Array(await upstream.arrayBuffer()));
}

function sendJson(res: any, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

# Architecture

## Overview

Scan Repair Studio is a Vite + React + TypeScript app using Three.js for 3D preview.

```text
User USDZ file
  -> Browser File API
  -> Three.js USDLoader
  -> Original preview scene
  -> GLTFExporter binary GLB
  -> Vite same-origin proxy
  -> 3D AI Studio Mesh Repair API
  -> Result GLB URL
  -> Vite asset proxy
  -> Three.js GLTFLoader
  -> Repaired preview scene
```

## Frontend

The frontend owns:

- File import and validation.
- USDZ scene parsing and normalization.
- Three.js viewer state.
- Render mode and comparison mode controls.
- GLB export before repair upload.
- Repair task polling.
- Repaired GLB loading.

## Proxy

The proxy is implemented in `vite.config.ts` as Vite development middleware.

Routes:

- `POST /api/3dai/repair`
- `GET /api/3dai/status/{task_id}`
- `GET /api/3dai/asset?url={encoded_asset_url}`

Why the proxy exists:

- Avoid browser CORS failures when calling 3D AI Studio.
- Keep third-party asset downloads same-origin for Three.js loaders.
- Centralize error handling for local development.

The current proxy forwards the user-provided API Key from the browser request. For production, move this proxy into a backend or serverless function and keep shared API credentials out of the browser.

## Repair Scope

The repair service is used as mesh repair/remesh. The app does not currently implement semantic point-cloud completion, large missing-part reconstruction, or learned shape generation.

That distinction matters: a repaired model may be visually similar in solid mode while still being better topologically.

## Deployment Notes

Static hosting alone is not enough if repair is enabled, because the app needs a proxy for third-party API and asset requests.

Production deployment options:

- Vercel/Netlify function proxy.
- Cloudflare Worker proxy.
- Small Node/Express service.
- Internal API gateway.

The frontend can still be built as static assets with `npm run build`; only the `/api/3dai/*` routes need server-side handling.

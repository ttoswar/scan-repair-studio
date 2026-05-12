# 架构说明

## 总览

Scan Repair Studio 是一个 Vite + React + TypeScript 应用，使用 Three.js 完成 3D 模型预览。

```text
用户导入 USDZ 文件
  -> Browser File API
  -> Three.js USDLoader
  -> 原始模型预览场景
  -> GLTFExporter 导出二进制 GLB
  -> Vite 同源代理
  -> 3D AI Studio Mesh Repair API
  -> 修复结果 GLB URL
  -> Vite 资源代理
  -> Three.js GLTFLoader
  -> 修复结果预览场景
```

## 前端职责

前端负责：

- 文件导入和格式校验。
- USDZ 场景解析与模型归一化。
- Three.js 预览器状态管理。
- 渲染模式和对比模式切换。
- 上传修复前导出 GLB。
- 轮询修复任务状态。
- 加载修复后的 GLB 模型。

## 代理层

代理实现在 `vite.config.ts` 中，作为 Vite 开发服务中间件运行。

代理路由：

- `POST /api/3dai/repair`
- `GET /api/3dai/status/{task_id}`
- `GET /api/3dai/asset?url={encoded_asset_url}`

为什么需要代理：

- 避免浏览器直接调用 3D AI Studio 时遇到 CORS 限制。
- 让 Three.js 通过同源地址加载第三方返回的 GLB 资源。
- 在本地开发时集中处理上游 API 错误。

当前代理会转发用户在页面输入的 API Key。正式部署时，建议把代理迁移到后端或 Serverless Function，并避免在浏览器端暴露共享 API 凭据。

## 修复能力边界

当前修复服务用于 mesh repair / remesh。项目暂未实现语义级点云补全、大块缺失重建或学习式形状生成。

因此修复结果在实体模式下可能与原始模型非常接近，但在拓扑、法线、松散面和封闭性上更适合后续展示或处理。

## 部署说明

如果启用 AI 修复功能，仅静态托管前端是不够的，因为项目需要 `/api/3dai/*` 代理来访问第三方 API 和结果文件。

可选部署方式：

- Vercel / Netlify Function。
- Cloudflare Worker。
- 小型 Node / Express 服务。
- 内部 API Gateway。

前端仍然可以通过 `npm run build` 构建为静态资源；需要服务端处理的只有 `/api/3dai/*` 代理路由。

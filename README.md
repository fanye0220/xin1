# MIU Web

这是从 `miu_v10` 抽出的纯 Web 部署版，只保留 Vite + React 前端源码，已移除 Android/Capacitor 原生工程目录。

## 本地运行

```bash
npm install
npm run dev
```

访问 `http://localhost:3000`。

## 本地预览生产包

```bash
npm run build
npm run preview
```

## 部署到 Vercel

1. 把这个文件夹推到 GitHub 仓库。
2. 在 [vercel.com](https://vercel.com) 导入该仓库。
3. Vercel 会自动识别为 Vite：
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. 部署完成后用 Vercel 提供的域名访问。

仓库里的 `vercel.json` 已经写好了默认配置。

## 部署到 Netlify

1. 把这个文件夹推到 GitHub 仓库。
2. 在 [netlify.com](https://netlify.com) 选择 “Import from Git”。
3. 配置：
   - Build command: `npm run build`
   - Publish directory: `dist`
4. 仓库里的 `netlify.toml` 已包含该配置。

## 环境变量

涉及 Gemini/云端功能时，在 Vercel/Netlify 的项目设置里添加：

```text
GEMINI_API_KEY=你的key
```

本地开发可复制 `.env.example` 为 `.env.local` 后填写。
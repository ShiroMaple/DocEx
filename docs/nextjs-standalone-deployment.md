# Next.js Standalone 生产部署依赖与文件遗漏优化指南

在采用 Next.js 的 `standalone`（独立打包）模式部署生产环境（如通过 PM2、Docker 容器或 K8s）时，经常会遇到文件或依赖遗漏的情况。本文档总结了此现象的底层成因、本项目（DocEx）中的实战修复方案以及通用的预防与最佳实践。

---

## 🔍 一、 现象成因剖析

Next.js 的 `standalone` 模式依靠 **AST 静态分析（Node File Trace）** 来分析代码中的 `import` 和 `require`，进而精简并只打包所需的依赖到 `.next/standalone/node_modules` 中。然而，以下两种情况静态分析器无法捕捉：

1. **动态按需加载（Dynamic Require）**：
   * **示例**：某些库（如 `pdfjs-dist`）为了兼容不同环境，会在 `try-catch` 中动态加载可选依赖（如 `@napi-rs/canvas`）。打包工具在编译期无法预知运行分支，因此默认不会拷贝这些可选的原生组件。
2. **运行时路径拼接（Runtime File Access）**：
   * **示例**：代码使用 `path.resolve(process.cwd(), 'node_modules/...')` 去读取某个物理文件（如 `pdf.worker.mjs`）。这种字符串拼接是在服务运行期间发生的，打包工具在编译期无法得知，导致对应的物理文件无法被带入 standalone 目录。

---

## 🛠️ 二、 DocEx 项目中的实战解决方案

在 DocEx 的部署优化中，我们通过以下组合拳完美解决了 PDF 解析所依赖的原生 Canvas 模块与 PDFJS Worker 丢失的问题：

### 1. 配置 `serverExternalPackages`（排除原生二进制打包）
对于包含 C++/Rust 编译的 Native Addon 二进制包，必须阻止构建工具去压缩或混淆它们。在 `next.config.js` 中将其声明为外部包，Next.js 在打包时会将其原样完整拷贝：
```javascript
// next.config.js
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // 声明为外部包，保留原样 node_modules 目录结构拷贝
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'pdf-to-png-converter'],
};

export default nextConfig;
```

### 2. 巧用静态导入（Static Import）强行拉入追踪链
对于隐藏较深的动态包依赖（如 `@napi-rs/canvas`），在服务端预处理主逻辑最上方写一行显式的静态导入，可以强制依赖追踪器将其及其所有子依赖带入 standalone 部署包：
```javascript
import '@napi-rs/canvas';
```

### 3. 全局绑定原生底层对象支撑运行
部分第三方库（如 `pdfjs-dist` 遗留 Node 版）需要特定 Canvas 全局变量，我们需要在模块评估时，将 `@napi-rs/canvas` 的导出对象绑定到 Node 的 `global` 作用域上：
```javascript
import * as canvas from '@napi-rs/canvas';

global.Canvas = canvas.Canvas;
global.Image = canvas.Image;
global.ImageData = canvas.ImageData;
global.Path2D = canvas.Path2D;
global.DOMMatrix = canvas.DOMMatrix;
```

### 4. 自动化构建管道拷贝 Worker 并通过 `public/` 访问
对于动态加载的 Worker 脚本等独立静态资源，依赖 `node_modules` 的物理层级在 standalone 下非常危险。最稳妥的办法是：
1. 编写独立脚本（`scripts/copy-worker.js`），在编译前将资源拷贝到 `public/` 目录下（`public` 目录必然会被完整带入部署包中）：
   ```javascript
   // scripts/copy-worker.js
   import fs from 'fs';
   import path from 'path';
   fs.copyFileSync(
     path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
     path.resolve('public/pdf.worker.mjs')
   );
   ```
2. 在 `package.json` 的 `build` 指令中前置该操作：
   ```json
   "scripts": {
     "build": "node scripts/copy-worker.js && next build"
   }
   ```
3. 代码中使用 `process.cwd()` 安全且具有可预测性地指向该路径：
   ```javascript
   const workerPath = path.resolve(process.cwd(), 'public/pdf.worker.mjs');
   ```

---

## 💡 三、 避免文件遗漏的通用黄金法则

在开发 Next.js Web 应用时，若需保证生产环境 Standalone 部署顺利，应遵循以下开发规范：

| 规范点 | 推荐方案 | 避免行为 |
| :--- | :--- | :--- |
| **路径定位** | 使用 `process.cwd()` 定位根目录 | 避免使用 `__dirname`，因为编译后相对层级会改变 |
| **缓存/临时写入** | 独立放置在构建包之外（如根目录的 `data/`） | 避免写入 `.next/` 目录内，每次部署都会被擦除 |
| **Native 依赖** | 显式声明到 `serverExternalPackages` 数组中 | 避免让 Turbopack/Webpack 尝试混淆打包底层 `.node` 模块 |
| **动态资源加载** | 在 build 阶段自动拷贝至 `public/` 目录进行分发 | 避免在代码中通过相对 `node_modules` 路径进行运行时读取 |

---

## 🚀 四、 生产环境 PM2 部署实战指南（以 4003 端口为例）

针对本项目，我们在生产环境中推荐使用 **PM2 (Process Manager 2)** 来管理 Next.js 独立运行实例。由于使用轻量本地 JSON 数据存储，PM2 必须以**单实例（Single instance）**模式运行以避免文件写入锁冲突。

以下是两种生产环境的部署方案：

### 1. 方案 A：Standalone 独立运行包启动（推荐 🌟）

此方案能极大精简包体体积，仅需将静态资源手动同步至独立包目录内即可启动。

#### 命令行步骤：
1. **运行生产环境构建**：
   ```bash
   pnpm build
   ```
2. **复制静态资源到部署包（Next.js standalone 限制，必须手动补齐）**：
   * **Linux / macOS**:
     ```bash
     cp -r public .next/standalone/
     cp -r .next/static .next/standalone/.next/
     ```
   * **Windows (PowerShell)**:
     ```powershell
     xcopy /E /I public .next\standalone\public
     xcopy /E /I .next\static .next\standalone\.next\static
     ```
3. **将项目根目录的 PM2 配置文件复制至部署包并运行**：
   项目内置的 `ecosystem.config.cjs` 已经配置好了单实例模式与 `4003` 监听端口。
   * **Linux / macOS**:
     ```bash
     cp ecosystem.config.cjs .next/standalone/
     cd .next/standalone
     pm2 start ecosystem.config.cjs
     ```
   * **Windows (PowerShell)**:
     ```powershell
     copy ecosystem.config.cjs .next\standalone\
     cd .next\standalone
     pm2 start ecosystem.config.cjs
     ```

---

### 2. 方案 B：项目根目录一键快捷启动（免拷贝）

如果不希望在构建后执行手动文件拷贝操作，可以直接在项目根目录下通过 PM2 调用 `pnpm` 包管理器的 `start` 脚本来执行部署，并显式指定端口。

#### 命令行步骤：
1. **运行生产环境构建**：
   ```bash
   pnpm build
   ```
2. **使用 PM2 启动生产服务（注入 4003 端口）**：
   * **Linux / macOS**:
     ```bash
     PORT=4003 pm2 start pnpm --name "docex" -- start
     ```
   * **Windows (PowerShell/CMD)**:
     ```bash
     pm2 start pnpm --name "docex" --env PORT=4003 -- start
     ```

### 3. 持久化保存进程

启动完毕后，请务必执行以下命令将进程信息写入磁盘，以保证服务器重启后 PM2 能自动恢复启动：
```bash
pm2 save
```


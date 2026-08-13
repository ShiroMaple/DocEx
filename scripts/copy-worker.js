/**
 * why this script exists:
 * 1. pdfjs-dist 在解析 PDF 时需要单独的 Web Worker 脚本 (pdf.worker.mjs)。
 * 2. 为了避免将大体积的第三方编译产物直接提交到 Git 仓库，选择在构建时动态提取。
 * 3. Next.js 生产环境打包（standalone 模式）无法自动追踪和拷贝通过动态路径引用的 node_modules 文件。
 * 4. 拷贝到 public 目录后，可确保本地开发 (dev) 与生产部署 (standalone) 都能以一致的路径静态读取该 Worker 文件。
 */

import fs from 'fs';
import path from 'path';

const src = path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
const destDir = path.resolve('public');
const dest = path.join(destDir, 'pdf.worker.mjs');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.copyFileSync(src, dest);
console.log('✅ pdf.worker.mjs copied to public directory successfully!');

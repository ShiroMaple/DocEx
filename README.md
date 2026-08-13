# DocEx (Document Extractor) - 智能结构化提取文档信息

DocEx 是一款基于 **大语言模型(Structured Outputs / Vision)** 开发的智能文档数据提取与校验系统。

能够自动识别、解析多页 PDF 、 Word (.docx) 以及图片，支持图文交织多模态理解，并支持将数据推送至云端多维表格。

---

## 🚀 核心功能特性

### 1. 📂 多模态预处理网关

* **PDF 图像化切片**：自动提取 PDF 文字层，并同步将每一页渲染为 PNG 截图，支持 Vision 多模态视觉理解。
* **Word 交织还原**：解析 Word 内部结构，提取文本的同时将内嵌图片提取为 Base64 二进制流，还原图文并茂的版面。

### 2. 🧙 三步向导式核对表工作流

* **步骤 1：文件上传与解析进度卡片**：
  * 支持拖拽及多文件批量上传，支持实时流式解析进度条。
  * 提供**文档单独重试按钮**，重试时可一键移除相关记录、重新解析并重新计算 Token。
* **步骤 2：字段定义与 AI 微调**：
  * **动态字段矩阵**：支持自由增删改提取的目标字段（项目名、类别、描述等）并支持“AI自动识别待提取字段”。
  * **提示词微调设置**：内置行业专家提示词，支持一键“AI 优化”，并配有“恢复默认”一键重置功能。
* **步骤 3：数据核对与推送**：
  * 支持就地双击编辑、手动添加空白行、以及删除不合规记录。
  * **多维对齐**：支持一键“已核对识别结果，推送至多维表格”。
  * **本地备份**：提供“导出为 Excel (xlsx)”一键下载功能。

### 3. 🛡️ 智能大模型网关 (Multi-Config & Rate Limit)

* **多配置管理**：支持“默认配置（只读）”与“自定义配置模板”的动态切换、命名保存及删除。
* **共享防护 (Rate Limiting)**：针对公共默认 AI 密钥，限制**每个 IP 地址每分钟最多请求 20 次**，超出则拦截并返回 `429` 状态码，防恶意滥用。

### 4. 📊 多平台云端多维表格网关

* **双平台对齐**：支持 WPS（金山文档）多维表和飞书多维表。
* **自定义凭证**：支持填写自定义 App ID / App Secret，实现一套凭证、通过不同链接推送多张表格。
* **Wiki 链接智能解析**：兼容飞书 `/base/` 及 `/wiki/` 知识库挂载型多维表链接，自动在后台完成 `wikiToken` 到 `appToken` 的无感解析与代理写入。
* **智能自增序号**：自带“自增序号列配置”开关（默认启用），写入数据前自动读取云端最后一行序号索引进行顺延递增。

### 5. 🧹 物理切片生命周期管理 (TTL & Cleanup)

* **手动删除联动**：删除历史文件记录时，同步清除其上传的源文件和所有的 PNG 图片切片文件夹，确保磁盘不残留多余碎图。
* **TTL 7天自动回收**：系统在每次上传文件时，自动执行 TTL 检查，物理销毁上传时间超过 7 天的文件及图片目录。

### 6. 👁️ 业务审计与可观测性体系

* **零侵入全链路追踪**：基于 `AsyncLocalStorage` (ALS) 实现，在入口统一解析真实客户端 IP 与 TraceID，底层 `pino` 日志在任意深度的代码中自动混入追踪信息。
* **操作人智能继承**：日志接口在加载滚动日志时，若同一 Trace 链路中的某一条关键业务审计日志记录了操作人（Operator），系统会自动为同链路的其它所有 API 访问日志继承该操作人，无缝兜底显示。
* **业务指标精细化**：在文档上传、字段识别、模型提取、表格推送的关键成功节点，执行 `AUDIT` 级别插桩，附带执行耗时及生成规模；其中大模型调用还显式记录了 Input/Output 详细 Token 开销，支撑运营核算。
* **可视化审计终端**：内置精美的 `/admin/logs` 终端大屏，支持按事件分类 (AUDIT/SYSTEM)、等级及关键字进行模糊词频组合过滤；并自研了一套无第三方依赖的极致轻量正则表达式 JSON 语法高亮器，解析并高亮附加 Metadata 负载。

---

## 🛠️ 技术栈

* **前端**：React 19, Next.js (App Router), Tailwind CSS, Framer Motion, Lucide React
* **后端**：Next.js Web API Routes, OpenAI NodeJS SDK (Structured Outputs), Mammoth, PDF-Parse, PDF2Pic
* **数据存储**：客户端 `localStorage` (管理密钥配置) + 后端本地轻量 `lowdb` (管理文件记录)
* **工具库**：XLSX (Excel 导出), Axios (网络请求)

---

## ⚡ 快速启动

### 1. 依赖安装

确保本地安装有 Node.js (推荐 v20+ LTS) 与 `pnpm` 包管理工具：

```bash
pnpm install
```

### 2. 环境变量配置

在项目根目录创建并配置 `.env` 文件（可参考现有的 `.env`）：

```ini

# 默认 LLM 凭证（后端安全读取）
# ── 大模型 API 敏感密钥 ──
OPENAI_API_KEY=your_openai_api_key_here
KIMI_API_KEY=your_kimi_api_key_here

# 默认飞书测试凭证
LARK_APP_ID=您的LARK_APP_ID
LARK_APP_SECRET=您的LARK_APP_SECRET

# 默认WPS测试凭证
WPS_APP_ID=您的WPS_APP_ID
WPS_APP_SECRET=您的WPS_APP_SECRET
```
> **💡 如何在配置中引用这些密钥？**
> 系统采用基于 `config.json` 的解耦式凭证读取。在您的 `config.json` 里，所有敏感凭证并不是直接写死，而是填写 `.env` 中声明的**键名**：
> - **大模型 (`llm.configs`)**: 指定 `"apiKey": "KIMI_API_KEY"`。
> - **多维表 (`tables.configs`)**: 指定 `"appIdEnv": "WPS_APP_ID"` 和 `"appSecretEnv": "WPS_APP_SECRET"`。
> 这样在服务器运转时，框架会自动安全地从对应环境变量中抽取出真实秘钥，保证 `config.json` 可以安全地被加入 Git 版本控制。

### 3. 本地启动开发服务器（支持热重载）

```bash
pnpm dev
```

打开浏览器访问 [http://localhost:3000](http://localhost:3000) 即可开始调试。

### 4. 生产环境构建与启动

```bash
pnpm build
pnpm start
```

---

## ⚙️ 核心配置文件指南

DocEx 采用轻量化、静态 JSON 驱动的设计理念，大部分核心环境均可通过修改根目录的配置中心实时生效：

### 1. `config.json` (系统与生态网关配置)
本文件负责全局运行参数、LLM（大语言模型）资源池、以及多维表格终端的定义：
* **`llm.configs`**: 配置默认模型与高速模型节点（支持 Kimi、OpenAI 兼容接口等）。API Key 推荐从 `.env` 中读取（如 `"apiKey": "KIMI_API_KEY"`）。
* **`tables.configs`**: 定义目标多维表格（支持 WPS 和飞书）。支持按项目环境维护多张表格的 ID 和环境变量鉴权（如 `WPS_APP_ID`）。
* **`rateLimit`** / **`paths`**: 配置防刷限流阈值与各物理输出的目录存放位置。

### 2. `fields.json` (基础提取字段库)
系统内置的各种“表单抽屉”的提取蓝本库。
* 它是一个 Array，每个对象定义了一套完整的特定场景提取规则（例如 `invoice` 负责发票，`hse` 负责安全问题）。
* 在前端的“一键引入内置字段”面板中展现给用户。您可以根据公司自身需求增删 `key`、`label`、`example` 从而为模型划定识别红线。

### 3. `presets/` 目录 (融合性预设模板)
当您需要为特定的业务系统打造“一键开箱即用”的功能时，这里是终极配置。
* **组合能力**：一个 preset JSON 会在内部组合特定的大模型 (`llmConfig`)、特定的表格 (`tableConfig`) 以及提取的特定字段集合 (`fields`)。
* **业务沉淀**：例如您可以创建一个 `presets/report.json`。用户在浏览器点击该预设链接后，将自动应用最高级大模型，自动套用项目所需的 20 个复杂字段，提取成功后点击推送也会直接落到对应的特定知识库表中。

---

## 🎛️ 生产环境部署建议（必读）

在正式将 DocEx 部署至生产服务器前，请务必阅读并调整以下环境参数：

### 1. PM2 启动限制：单进程模式运行

由于本项目使用基于本地文件的轻量 JSON 存储，为防多进程同时写入 `data/db.json` 发生文件锁死及冲突，**请确保 PM2 以单实例（Single instance）运行**：

```bash
pm2 start npm --name "docex" --run dev
```

### 2. Nginx 反向代理参数调整

大文档切片及 AI 解析属于长耗时、大文件操作，请确保 Nginx 配置了足够大的包体限制和读取超时：

```nginx
server {
    client_max_body_size 100M; # 允许大文件上传
  
    location / {
        proxy_read_timeout 300s; # 延长读取超时时间至5分钟
        proxy_send_timeout 300s;
        proxy_pass http://127.0.0.1:3000;
    }
}
```

### 3. 提示词防注入网关

项目在 `/api/extract` 设有提示词安全攻击防御过滤，如果用户输入的描述包含 `.env`、`passwd`、`api_key` 等词汇会被拦截。内测期间如遇正常字段误杀，可在 `src/app/api/extract/route.js` 的 `checkPromptSecurity` 正则规则中做针对性微调。

---

## 📄 开源协议

本项目基于 **GNU General Public License v3.0 (GPL-3.0)** 协议开源。详情请参阅 [LICENSE](file:///c:/Users/gaoft/Documents/CodeSpace/docex/LICENSE) 文件。

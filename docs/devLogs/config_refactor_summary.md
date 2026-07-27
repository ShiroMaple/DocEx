# 配置文件重构与优化总结

## 1. 核心目标
解决初期配置散落各处、环境变量与物理配置文件耦合过深、以及多环境/多部门预设导致凭据覆盖混乱的问题。通过构建统一的配置中心，实现配置的高内聚与低耦合。

## 2. 优化历程与关键调整

### 2.1 环境变量 (.env) 的安全剥离与精简
- **调整前**：大量的业务非敏感配置（如 WPS_BASE_ID, 测试表 URL 等）与真实的敏感凭证（如 AppSecret, API Key）混杂在 `.env` 中，难以维护且容易造成环境污染。
- **调整后**：`.env` 仅保留绝对核心的敏感凭据（大模型 API Key、Lark/WPS AppId & AppSecret）。所有业务级 ID（如 `tableId`）被安全剥离，转移至 `config.json` 进行统一集中管理。

### 2.2 构建层级化、统一的 config.json
- **结构化管理**：将零散的配置整合为统一的 JSON 树，包含 `system`、`rateLimit`、`paths`、`llm`（大模型配置）、`tables`（多维表格配置）。
- **平台解耦**：引入 `parsedTableConfigs`，支持在单一 JSON 中同时维护多个平台的表格配置，并通过 `id`（如 `wps_hse`, `feishu_test`）进行精准索引。

### 2.3 预设系统 (presets) 的继承与降级机制
- **动态寻址机制**：在 `presets.js` 中重构了 `getResolvedPreset` 的解析逻辑。
  - **凭据继承**：自动向 `.env` 中寻找特定前缀（如 `HSE_WPS_APP_ID`）的专属敏感凭据；若未配置，则无缝回退继承 `config.json` 或通用 `WPS_APP_ID`。
  - **表格 ID 解耦**：全面取缔原先 WPS 场景下特殊的 `baseId` 命名，统一规范为 `tableId`，并由预设文件中的 `tableConfigId: "wps_hse"` 自动定向到 `config.json` 获取对应的 Table ID，彻底解决预设文件与物理表的耦合。

### 2.4 连通性校验的全自动化
- 修复了预设加载时导致用户被“验证权限”强制弹窗阻断的问题。
- **优化点**：在页面切换预设或发起提取时，系统将在后台自动静默拉取对应的 AppId、AppSecret 与 TableId，调用 `/api/schema` 校验连通性并同步字段映射。实现了“零配置介入”的用户体验。

## 3. 最终架构
- **`.env`**：纯敏感环境密钥。
- **`config.json`**：系统行为与非敏感业务配置（表格清单、模型清单）。
- **`presets/xxx.json`**：具体的业务提取场景（字段定义、提示词模板、定向挂载的 tableConfigId），实现业务逻辑与底层环境的完全隔离。

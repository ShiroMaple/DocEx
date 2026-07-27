# 配置管理体系重构与物理 JSON 动态 Loader 规范

> **编写日期**：2026-07-25  
> **面向对象**：运维人员（Ops）、后端与前端开发人员  
> **关联模块**：`config.json`、`.env`、`src/config/index.js`、`src/config/presets.js`、`presets/*.json`

---

## 一、 重构背景与核心目标

在之前的版本中，项目的多维表格配置、大模型 API 网关地址、超时重试参数以及部门预设信息存在以下痛点：
1. **硬编码耦合**：部分默认参数硬编码在前端逻辑或路由服务中，编译为 Next.js Standalone 生产包后，运维人员无法在不重新编译的前提下动态调整配置；
2. **凭据与业务配置混杂**：敏感的 AppSecret / API Key 与公开的 TableID、URL 地址混在一起，缺乏明确的脱敏界限；
3. **命名规范与散落问题**：WPS 平台历史遗留了 `baseId` 与 `tableId` 两种叫法，且表格配置曾散落存在于 `presets/hse.json` 中，维护成本高；
4. **加载竞态与错误拦截体验**：访问专有预设页面（如 `/preset/hse`）时，存在全局默认配置覆盖专有配置的竞态 Bug，且缺少自动连通性自愈。

### 🎯 重构目标
- **敏感凭据归 `.env`**：绝对禁止在 JSON 或代码中出现明文秘钥；
- **业务配置归 `config.json`**：系统参数、路径、限流阈值及表格/模型矩阵统一集中放置在 `config.json`；
- **统一 Loader 收口**：建立 `src/config/index.js` 统一加载器，业务代码**严格禁止直接使用 `process.env.XXX`**；
- **全面规范命名**：彻底取缔 WPS 配置中 `baseId` 叫法，全平台统一命名为 `tableId`；`presets/*.json` 仅保留 `tableConfigId` 指针。

---

## 二、 三层架构设计

系统配置体系划分为以下三层结构：

```
                              ┌─────────────────────────┐
                              │     .env (敏感秘钥凭证)  │
                              └────────────┬────────────┘
                                           │ (秘钥注入)
                                           ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│     presets/*.json      │   │       config.json       │
│  (轻量预设/tableConfigId)│   │ (集中化业务与表格配置矩阵)│
└────────────┬────────────┘   └────────────┬────────────┘
             │                             │
             └──────────────┬──────────────┘
                            │ (装配与解析)
                            ▼
           ┌──────────────────────────────────┐
           │      src/config/index.js         │
           │    (统一 Config Loader 终极出口)   │
           └────────────────┬─────────────────┘
                            │
                            ▼
           ┌──────────────────────────────────┐
           │  前端页面 / API 路由 / 业务 Services │
           └──────────────────────────────────┘
```

### 1. 敏感层：`.env`
只保存极度敏感的开放平台应用密钥与 Token，受 `.gitignore` 保护：

```env
# ── 大模型 API 敏感密钥 ──
OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE

# ── 飞书开放平台敏感凭据 ──
LARK_APP_ID=cli_aac44e92a2b89bd5
LARK_APP_SECRET=YOUR_LARK_APP_SECRET_HERE

# ── WPS 开放平台敏感凭据 ──
WPS_APP_ID=AK20260709WHJKYS
WPS_APP_SECRET=YOUR_WPS_APP_SECRET_HERE

# ── 部门专有凭据覆盖 (按需配置) ──
HSE_WPS_APP_ID=AK20260724BVGJKT
HSE_WPS_APP_SECRET=YOUR_HSE_WPS_APP_SECRET_HERE
```

### 2. 业务集中层：`config.json`
放置全量非敏感业务参数，作为生产环境的热加载配置文件（纳入 Git 追踪）：

```json
{
  "system": {
    "nodeEnv": "development",
    "logLevel": "info"
  },
  "rateLimit": {
    "windowMs": 60000,
    "maxRequests": 5
  },
  "paths": {
    "inputDir": "data/input",
    "outputDir": "data/output",
    "uploadDir": "data/uploads",
    "preprocessDir": "data/preprocessed",
    "presetsDir": "presets"
  },
  "llm": {
    "timeoutMs": 60000,
    "maxRetries": 2,
    "configs": [
      {
        "id": "default",
        "name": "默认配置",
        "provider": "XiaoMi",
        "baseUrl": "https://token-plan-cn.xiaomimimo.com/v1",
        "model": "mimo-v2.5",
        "isDefault": true
      }
    ]
  },
  "tables": {
    "configs": [
      {
        "id": "wps_test",
        "name": "WPS测试配置",
        "platform": "wps",
        "baseUrl": "https://365.kdocs.cn/l/",
        "tableId": "cbGbLglUXASe",
        "isDefault": true
      },
      {
        "id": "feishu_test",
        "name": "飞书测试配置",
        "platform": "feishu",
        "baseUrl": "https://cli-aac44e92a2b89bd5.feishu.cn/base/",
        "appToken": "FJvNwbnCxi6ymuky8bTcRTu2nS6",
        "tableId": "tbla78TDmVdUqIyt",
        "isDefault": true
      },
      {
        "id": "wps_hse",
        "name": "安全环保部_WPS归档表",
        "platform": "wps",
        "baseUrl": "https://365.kdocs.cn/l/",
        "tableId": "caa23eb4LQBg",
        "appIdEnv": "HSE_WPS_APP_ID",
        "appSecretEnv": "HSE_WPS_APP_SECRET"
      }
    ]
  }
}
```

### 3. 专有预设层：`presets/*.json`
预设文件中**不再存储任何具体的表格 ID 或 AppSecret**，仅保留指针引用 `tableConfigId`：

```json
{
  "id": "hse",
  "name": "智能结构化提取 · 安全环保部",
  "department": "安全环保部",
  "tableConfigId": "wps_hse",
  "platform": "wps",
  "locked": false,
  "allowCustomModel": false,
  "allowCustomPlatform": false
}
```

---

## 三、 统一 Loader 装配与多级继承机制

核心解析库 `src/config/index.js` 与 `src/config/presets.js` 提供了严密的装配与多级继承降级算法：

### 1. 平台 URL 自动拼装算法
根据表格平台类型自动合成完整的物理协作链接：
- **WPS 平台**：`url = ${baseUrl}${tableId}`（例：`https://365.kdocs.cn/l/caa23eb4LQBg`）
- **飞书平台**：`url = ${baseUrl}${appToken}?table=${tableId}`（例：`https://cli-aac44e92a2b89bd5.feishu.cn/base/FJvNwbnCxi6ymuky8bTcRTu2nS6?table=tbla78TDmVdUqIyt`）

### 2. 预设参数多级继承顺序（以 `hse` 预设为例）

```
【第一优先级】 .env 显式环境变量 (例如 HSE_WPS_APP_ID / HSE_WPS_TABLE_ID)
      │
      ▼ (若无)
【第二优先级】 presets/hse.json 中的指针 (tableConfigId: "wps_hse") 关联的 config.json 配置
      │
      ▼ (若无)
【终极兜底】   config.json 中的默认测试配置 (wps_test / config.defaultWpsConf)
```

---

## 四、 关键经验与 Bug 防坑记录

### 1. 前端配置加载竞态覆盖 Bug 修复
* **现象**：访问 `/preset/hse` 专有预设时，虽然加载了 `wps_hse`，但随后被全局 `/api/config` 请求与 `localStorage` 恢复逻辑强行重置为了 `wps_test`。
* **解法**：在 `src/app/page.js` 的配置更新逻辑中增加 `!presetId` 路由防护，确保专有预设页面加载的表单 ID 与秘钥不被全局默认值覆盖。

2. **前端链接实时解析与错误提示优化**：
   - 当用户或系统传入分享链接时，前端 `verifyTableConnection` 函数实时从 `wpsUrl` 或 `feishuUrl` 正则匹配抽取 `tableId` 与 `appToken`，解决 Component State 异步更新延迟造成的连接报错；
   - 擦除面向底层的 `WPS File ID 不能为空` 等技术报错，替换为友好指引提示。

3. **预设加载全自动连通性校验**：
   - 切换预设（如访问 `/preset/hse`）加载完毕后，系统会在后台自动调用 `verifyTableConnection()` 连通并同步云端表头；
   - 避免锁定多维表格修改入口后，用户因未手动点击“验证权限并同步字段”而无法提取推送的问题。

---

## 五、 运维人员操作手册 (Ops Guide)

### 1. 如何新增一个专有部门页面并绑定 WPS 表格？
1. 在 `.env` 中追加专属的凭证秘钥（若与全局相同可省略）：
   ```env
   QA_WPS_APP_ID=AK2026xxxxxx
   QA_WPS_APP_SECRET=xxxxxxxxxx
   ```
2. 在 `config.json` 的 `tables.configs` 数组中追加表配置：
   ```json
   {
     "id": "wps_qa",
     "name": "质量管理部_WPS归档表",
     "platform": "wps",
     "baseUrl": "https://365.kdocs.cn/l/",
     "tableId": "qaTableId2026",
     "appIdEnv": "QA_WPS_APP_ID",
     "appSecretEnv": "QA_WPS_APP_SECRET"
   }
   ```
3. 在 `presets/` 目录下新建 `qa.json` 物理文件，声明指针：
   ```json
   {
     "id": "qa",
     "name": "智能结构化提取 · 质量管理部",
     "department": "质量管理部",
     "tableConfigId": "wps_qa",
     "platform": "wps"
   }
   ```
4. 保存文件即刻生效（支持零编译热重载）！通过 `https://domain/preset/qa` 即可直接访问。

---

## 六、 验证与构建情况

本重构方案经过完整的编译测试与生产打包验证：
- `pnpm build` 编译耗时 2.5s - 3.1s，零 TS 与 Webpack 警告；
- 成功验证静态与动态路由 `/api/config`、`/api/presets/[id]` 及 `/preset/[id]` 的全通路联动。

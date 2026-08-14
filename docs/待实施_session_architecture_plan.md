# 会话 (Session) 机制与全库数据库升级重构方案

> **状态**：方案储备 (Draft/Future Planning)
> **目的**：将当前离散的文档解析流程包装为具有完整生命周期的 `Session` 机制，支持断点续传、持久化分享与细粒度审计；同时从根本上解决平铺 JSON 文件带来的 I/O 瓶颈，实现底层存储的数据化升级。

## 1. 核心设计原则与存储减负

针对单次 Session 记录可能带来的存储压力，确立以下减负与安全原则：

### 1.1 提示词 (Prompts) 存储策略：MD5 占位符
在持久化记录中，**绝对不存储注入了完整文档长文本的 User Prompt**。对于携带大量文档原文的 Prompt 请求，内部统一使用文档的 `[MD5_PLACEHOLDER]` 进行占位替代。
* **优势**：单次即使包含 50 个复杂文档的 Session，其全量元数据与大模型 JSON 结果也将被严格压缩在 **50KB - 100KB** 范围内。
* **审计回溯**：如果日后需要完全 100% 还原当时的实际请求内容，可通过该 MD5 值从文件系统中拉取源文档再次拼装。

### 1.2 优雅的文件丢失断点续传机制
会话恢复（Hydration）最大的风险在于服务端缓存被清空导致的“无头（Headless）”状态。重构后，前端在拉取 Session 初始化数据时：
1. **状态校验**：对比 Session 中记录的文件 MD5 列表与当前服务器（或数据库）中实际存在的实体文件。
2. **只读保护与重构提示**：对于实体文件已不在服务器（过期或被清理）的条目，前端依然完整渲染其之前的解析结果以供查看与导出；但**禁用其“重新解析”按钮**。
3. **用户指引**：在禁用的按钮旁或文件卡片上，附加强提示文案：`“文档 [xxx.pdf] 已在云端过期。如需重新解析，请重新上传该文档。”`

## 2. 存储底层架构升级：全面引入数据库 (Database)

为彻底解决“分离 Session JSON 文件”造成的查询瓶颈以及复杂的“日志双写”逻辑，计划在引入 Session 机制的同时，进行一次**彻底的数据库底层升级**。

### 2.1 抛弃扁平化文件，一库统管
* 废弃现有的 `logs/docex.log` 逐行扫描统计。
* 废弃单独写入 `sessions/{id}.json` 文件的构想。
* **连带升级**：废弃现有的由文件锁互斥维护的 `data/db.json`（原用于记录文档上传与预处理状态）。

以上三个分散的存储载体将**合并升级为单一的轻量级关系型数据库**（如 SQLite 或 PostgreSQL，建议初始阶段采用 SQLite 以保持单体部署的轻快特性）。

### 2.2 数据库核心 E-R 模型 (Entity-Relationship)

1. **`Documents` 表** (接管原 `db.json`)
   * `md5` (PK)
   * `filename` (文档原名)
   * `file_path` (物理存储路径)
   * `status` (解析状态: pending, parsed, failed)
   * `created_at` (上传时间)

2. **`Sessions` 表** (会话主表)
   * `id` (PK, UUID)
   * `preset_id` (使用的预设类型)
   * `department` (所属部门)
   * `total_cost` (会话总计费)
   * `total_duration` (会话总耗时)
   * `created_at` (创建时间)
   * `updated_at` (最后操作时间)

3. **`Session_Documents` 表** (多对多中间表，记录单次任务流)
   * `session_id` (FK)
   * `document_md5` (FK)
   * `fields_config` (当前文档使用的特定字段映射 Schema, JSON)
   * `llm_raw_result` (单篇文档的大模型 JSON 结构化结果)
   * `prompt_tokens` / `completion_tokens` (精确的开销)
   * `status` (当前文档的解析状态)

### 2.3 数据库升级带来的压倒性优势

* **大盘统计降维打击**：现在的 `/api/stats` 接口需要通过 Node.js 逐行读取文件正则匹配。引入数据库后，统计某一天的部门开销、模型占比只需一条 SQL `SUM(total_cost) GROUP BY department` 即可，I/O 从数十秒降低至几毫秒。
* **并发原子性 (ACID)**：SQLite/PostgreSQL 原生自带高强度的事务（Transaction）与行级锁/表级锁，彻底消灭此前 `db.json` 在 Windows 平台上遇到的 EPERM 文件占用锁竞争 BUG，支持海量并发写入。
* **复杂的交叉查询**：管理员可轻易执行如：“找出所有使用过 [安全环保部] 预设，且包含 [XXX.pdf] 文档的失败会话”，这在原来的 JSON 存储体系下是几乎不可能完成的。

## 3. 重构演进路线图 (Roadmap)

考虑到数据库替换涉及全盘 API 改造，计划按以下三个里程碑稳步替换：

**Milestone 1: 基础设施替换 (Underlying Storage)**
* 引入 SQLite 驱动（如 `better-sqlite3` 或 Prisma ORM）。
* 将现有的文档上传与状态跟踪（`db.json`）平滑迁移至 `Documents` 表。
* 将现有的 `docex.log` 写入切换为直接写入数据库的日志归档表。

**Milestone 2: Session 后端逻辑落地 (Backend Session)**
* 建立 `Sessions` 表与 `Session_Documents` 表。
* `/api/extract` 接口改造，支持入参 `sessionId` 并向关联表中增量 Upsert 写入配置与解析结果（以 MD5 占位 Prompt）。
* 管理员大盘 API 切换为读取数据库 `GROUP BY` 进行聚合。

**Milestone 3: 前端交互颠覆 (Frontend Hydration)**
* 将大盘的主操作台路由改为 `/[sessionId]`。
* 当用户携带 `sessionId` 进入页面，调用 `/api/sessions/:id` 将整个页面恢复至历史状态。
* 编写丢失文档的比对逻辑，对失效文档展示“请重新上传”提示，封锁重算操作。

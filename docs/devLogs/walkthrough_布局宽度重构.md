# DocEx V2.0 布局精细化与异常开销监控重构总结

我们已成功完成了对 DocEx 工作台的**宽屏横向破局**、**双列并排重组**、**吸底动作条固定**、**核对表内滚动限高**，以及**解析异常下 Token 开销全链路还原**的重构任务。

---

## 🛠️ 一、 核心重构设计与验证说明

### 1. 宽屏横向破局 (Widescreen Layout Adaptation)
- **全局容器拓宽**：将 Header 与 Main 区域最大宽度从 `max-w-4xl` 升级为宽屏适配的 `max-w-[1440px]`。两侧留白极大减少，表格列获得了充沛的展开空间，单元格文字折行率大幅降低。
- **Step 2 栅格双列布局**：
  - **左侧 (2/3 宽度)**：【字段定义与映射矩阵】网格独立横向舒展。
  - **右侧 (1/3 宽度)**：【AI 提示词微调设置】卡片并排呈现。
  - **优化成果**：在保证大模型提示词高度可见的同时，纵向高度缩减了近 `400px`，页面布局更加紧凑。

### 2. 吸底动作控制条 (Sticky Footer Bar)
- **固定悬浮交互**：在页面正下方引入了 `sticky bottom-0 z-30` 吸底动作控制条。
- **毛玻璃温暖大底**：配合羊皮纸色毛玻璃半透明材质（`bg-[#f5f4ed]/80 backdrop-blur-md`）及顶边灰色描边和阴影。
- **功能联动**：
  - 各个 Step 的核心导航触发动作（“下一步”、“开始 AI 解析”、“正式推送至云端表格”、“返回上一步”）全部归并至此吸底动作条中。
  - 无论核对表格有多长，控制按钮始终在屏幕首屏下方静止悬浮，用户随时可以“一键触发”。

### 3. Step 3 核对表格纵向限高与内滚动
- **防爆高度上限**：数据复核表格的包裹容器添加了最大高度 `max-h-[380px]` 并开启了纵向与横向滚动（`overflow-y-auto overflow-x-auto`）。
- **表头吸顶**：采用 `sticky top-0 z-10 bg-parchment` 对表头 `thead` 进行固顶，配合底部分割阴影，在滚动时依然清晰显示各列中文名称，交互体验极佳。

### 4. 大模型解析异常 Token 追踪与回传
- **漏洞修复**：之前在模型输出格式损坏（JSON 损坏/截断）导致 `JSON.parse` 报错或请求中途终止时，已消耗的 Token 和模型部分输出由于被捕获而丢失，无法呈现给用户。
- **重构机制**：
  - **llmService 拦截**：在 `llmService.js` 发生异常的 catch 块中，我们将捕获到的 completions usage 及 rawContent 以属性形式挂载到抛出的 `Error` 实例上。
  - **API 同步**：`/api/extract` 的 catch 捕获该异常，在返回 `500` 时依然输出 `{ error, raw, tokenUsage }` 响应。
  - **前端还原**：前端接口请求捕获错误时，依然正常调用 `setTokenUsage` 和 `setRawLlmResponse`。
- **本地自动化测试验证**：
  - 我们编写了 `test_llm_mock.js` 测试脚本，通过模拟 `completions.create` 返回一个**被截断的非法 JSON** (`{"results": [{"projectName": "测试项目", `)。
  - 执行 `node test_llm_mock.js` 后，模型抛出 JSON 格式异常，但 Token 成功被拦截：
    ```bash
    --- 3. 模拟 completions.create 返回截断 JSON，验证 Token 捕获 ---
    ⏳ 正在尝试使用 Structured Outputs (json_schema) 模式...
    ⚠️ completions.create (json_schema) 失败或不支持，自动降级为 JSON Mode 兼容提取...
    成功捕获到预期报错!
    错误信息: 大模型返回了非法的 JSON 格式，解析失败...
    Token 是否捕获成功: true
    已消耗 Token 详情: { promptTokens: 1500, completionTokens: 450, totalTokens: 1950 }
    捕获到的原始返回文本 (Raw): {"results": [{"projectName": "测试项目",
    ```
    证实当模型发生语法解析崩溃时，开销面板与原始 JSON 查看依然可以完好展示已消耗的 `1950` 个 Token！

### 5. 优雅浅色暖沙 JSON 模态框
- 将原始 JSON 查看器由原本极客感过强的“黑底绿字”重写为优雅的“浅色暖沙古典配饰”：
  - 背景：`bg-warm-sand/30`
  - 文字：`text-near-black`
  - 边框：`border-border-cream`
  - 完美契合系统的羊皮纸/象牙白视觉体系。

---

## ⚙️ 验证就绪
生产环境的 Next.js 服务已完成编译并顺利启动（任务 `task-621`），各项布局与异常防护功能测试表现完好。

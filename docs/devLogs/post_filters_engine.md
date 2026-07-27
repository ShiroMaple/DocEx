# 智能后置过滤引擎 (Post-Extraction Filters) 使用指南

## 1. 引擎背景
大模型（LLM）擅长对非结构化文本进行信息提取，但在处理复杂的布尔逻辑（尤其是涉及外部黑白名单、特定字符串排除等）时容易产生幻觉或误判。
例如，单纯通过 Prompt 要求“如果提到承包商，则必须包含‘建安’才保留”，当文档中自然语言提到“已告知承包商...实际责任方为宁波工程公司”时，模型极易产生混淆。

为此，系统引入了**智能后置过滤引擎**。它的核心思想是：**“大模型只负责精准提取结构化数据，由后置程序化引擎负责逻辑过滤。”**

## 2. 运作原理
1. **显式字段提取**：在 `presets/[id].json` 中定义一个特定的字段（如 `contractor`），让大模型在阅读文本时将目标实体精准抽取出来。
2. **沙箱过滤执行**：在 `src/app/api/extract/route.js` 获得大模型的提取结果（`results` 数组）后，遍历执行预设文件中挂载的 `postFilters` 逻辑。
3. **数据清洗**：未通过校验的记录会被拦截并记录到系统日志中，只有 `return true` 的记录才会最终下发给客户端并写入多维表格。

## 3. 配置方式与语法
该引擎完全由 JSON 预设文件驱动，**无需硬编码修改后端逻辑代码**。

在 `presets/[id].json` (如 `hse.json`) 的根节点下增加 `postFilters` 数组：

```json
{
  "id": "hse",
  "fields": [
    {
      "key": "contractor",
      "label": "承包商/责任方",
      "desc": "问题涉及的具体承包商或责任方单位名称，若未明确提及具体单位名称，填'未提及'"
    }
  ],
  "postFilters": [
    {
      "name": "建安承包商白名单",
      "condition": "if (!record.contractor || record.contractor === '无' || record.contractor === '未提及') return true; return record.contractor.includes('建安');"
    }
  ]
}
```

### 属性说明
- `name`：过滤规则的名称（将在服务端日志中打印，方便追踪是哪一条规则拦截了数据）。
- `condition`：原生的 Javascript 代码片段。
  - **上下文变量**：在代码内部可以直接访问 `record` 对象，该对象即大模型提取出的单条隐患记录（例如 `record.projectName`, `record.contractor`）。
  - **返回值**：必须显式 `return true`（保留记录）或 `return false`（丢弃记录）。

## 4. 可维护性与扩展性
这种设计的优势在于：
1. **透明可感知**：所有的过滤逻辑直观地暴露在 JSON 预设中，业务人员或系统管理员可以随时修改白名单规则，而不需要开发人员重构后端代码。
2. **高度灵活**：由于 `condition` 是原生 JS，它可以实现极度复杂的条件交叉判断，例如：
   ```javascript
   if (record.issueType === '临时用电' && !record.inspector) return false; 
   return true;
   ```
3. **安全隔离**：不同部门的过滤规则完全独立，互不影响。HSE 预设的规则不会污染通用预设。

## 5. 日志与可观测性
当某条记录被过滤引擎拦截时，系统后台会输出一条 `INFO` 级别的日志，包含被拦截的记录原文与触发的过滤规则名称，方便运维时核对是否有误杀现象：
`[INFO] 记录被过滤引擎 [建安承包商白名单] 拦截`

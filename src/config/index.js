import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

// 1. 初始化 dotenv 加载 .env
const envPath = path.resolve(ROOT_DIR, '.env');
dotenv.config({ path: envPath });

// 2. 物理读取并解析 config.json
const configJsonPath = path.resolve(ROOT_DIR, 'config.json');
let rawConfigJson = {};

try {
  if (fs.existsSync(configJsonPath)) {
    const content = fs.readFileSync(configJsonPath, 'utf-8');
    rawConfigJson = JSON.parse(content);
  } else {
    console.warn(`⚠️ 警告: 配置文件 [${configJsonPath}] 未找到，将使用默认兜底配置。`);
  }
} catch (e) {
  console.error(`❌ 解析配置文件 [${configJsonPath}] 失败:`, e.message);
}

// 3. 构建规范化的配置对象
const system = {
  nodeEnv: process.env.NODE_ENV || rawConfigJson.system?.nodeEnv || 'development',
  logLevel: process.env.LOG_LEVEL || rawConfigJson.system?.logLevel || 'info'
};

const rateLimit = {
  windowMs: Number(rawConfigJson.rateLimit?.windowMs) || 60000,
  maxRequests: Number(rawConfigJson.rateLimit?.maxRequests) || 5
};

const paths = {
  inputDir: path.resolve(ROOT_DIR, rawConfigJson.paths?.inputDir || 'data/input'),
  outputDir: path.resolve(ROOT_DIR, rawConfigJson.paths?.outputDir || 'data/output'),
  uploadDir: path.resolve(ROOT_DIR, rawConfigJson.paths?.uploadDir || 'data/uploads'),
  preprocessDir: path.resolve(ROOT_DIR, rawConfigJson.paths?.preprocessDir || 'data/preprocessed'),
  presetsDir: path.resolve(ROOT_DIR, rawConfigJson.paths?.presetsDir || 'presets')
};

// 4. 解析表格平台及 LLM 配置列表 (给前端及网关 Popover 呈现)
const rawLLMConfigs = rawConfigJson.llm?.configs || [];
const defaultLlmItem = rawLLMConfigs.find(c => c.isDefault) || rawLLMConfigs[0] || {};

// 大模型默认凭据与参数
const llmProvider = process.env.LLM_PROVIDER || defaultLlmItem.provider || 'XiaoMi';
const openai = {
  apiKey: process.env.OPENAI_API_KEY || '',
  baseUrl: process.env.OPENAI_BASE_URL || defaultLlmItem.baseUrl || 'https://token-plan-cn.xiaomimimo.com/v1',
  model: process.env.OPENAI_MODEL || defaultLlmItem.model || 'mimo-v2.5'
};

// 飞书开放平台与测试表凭据
const lark = {
  appId: process.env.LARK_APP_ID || '',
  appSecret: process.env.LARK_APP_SECRET || '',
  appToken: process.env.LARK_APP_TOKEN || '',
  tableId: process.env.LARK_TABLE_ID || ''
};

// WPS 开放平台与测试表凭据
const wps = {
  appId: process.env.WPS_APP_ID || '',
  appSecret: process.env.WPS_APP_SECRET || '',
  tableId: process.env.WPS_TABLE_ID || ''
};

const defaultLLMList = rawLLMConfigs.map(c => {
  const apiKey = c.apiKeyEnv ? (process.env[c.apiKeyEnv] || '') : (c.isDefault ? openai.apiKey : (c.apiKey || ''));
  return {
    id: c.id || 'default',
    name: c.name || '默认配置',
    provider: c.provider || llmProvider,
    baseUrl: c.baseUrl || openai.baseUrl,
    model: c.model || openai.model,
    thinkingEffort: c.thinkingEffort || 'low',
    apiKey,
    isDefault: Boolean(c.isDefault)
  };
});

const defaultLLMConf = defaultLLMList.find(c => c.isDefault) || {
  id: 'default',
  name: '默认配置',
  provider: 'XiaoMi',
  baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
  model: 'mimo-v2.5',
  thinkingEffort: 'low',
  apiKey: openai.apiKey,
  isDefault: true
};

const rawTableConfigs = rawConfigJson.tables?.configs || [];

const parsedTableConfigs = rawTableConfigs.map(c => {
  const appId = c.appIdEnv ? (process.env[c.appIdEnv] || '') : (c.platform === 'wps' ? (wps.appId || c.appId || '') : (lark.appId || c.appId || ''));
  const appSecret = c.appSecretEnv ? (process.env[c.appSecretEnv] || '') : (c.platform === 'wps' ? (wps.appSecret || c.appSecret || '') : (lark.appSecret || c.appSecret || ''));
  
  let url = c.url || '';
  if (!url && c.baseUrl) {
    if (c.platform === 'wps') {
      url = `${c.baseUrl}${c.tableId || wps.tableId}`;
    } else if (c.platform === 'feishu') {
      url = `${c.baseUrl}${c.appToken || lark.appToken}?table=${c.tableId || lark.tableId}`;
    }
  }

  return {
    id: c.id,
    name: c.name,
    platform: c.platform,
    appId,
    appSecret,
    tableId: c.tableId || (c.platform === 'wps' ? wps.tableId : lark.tableId),
    appToken: c.appToken || (c.platform === 'feishu' ? lark.appToken : ''),
    url,
    isDefault: Boolean(c.isDefault)
  };
});

const defaultWpsConf = parsedTableConfigs.find(c => c.id === 'wps_test') || {
  id: 'wps_test',
  name: 'WPS测试配置',
  platform: 'wps',
  appId: wps.appId,
  appSecret: wps.appSecret,
  url: wps.tableId ? `https://365.kdocs.cn/l/${wps.tableId}` : 'https://365.kdocs.cn/l/cbGbLglUXASe',
  isDefault: true
};

const defaultFeishuConf = parsedTableConfigs.find(c => c.id === 'feishu_test') || {
  id: 'feishu_test',
  name: '飞书测试配置',
  platform: 'feishu',
  appId: lark.appId,
  appSecret: lark.appSecret,
  url: (lark.appToken && lark.tableId) ? `https://cli-aac44e92a2b89bd5.feishu.cn/base/${lark.appToken}?table=${lark.tableId}` : 'https://cli-aac44e92a2b89bd5.feishu.cn/base/[REDACTED_FEISHU_APP_TOKEN]?table=[REDACTED_FEISHU_TABLE_ID]',
  isDefault: true
};

/**
 * 统一导出的 Config 对象
 */
export const config = {
  system,
  rateLimit,
  paths,
  llmProvider,
  openai,
  lark,
  wps,
  defaultLLMConf,
  defaultWpsConf,
  defaultFeishuConf,
  defaultLLMList,
  parsedTableConfigs,
  
  /**
   * 安全获取环境变量的辅助方法
   */
  getEnv(key, defaultValue = '') {
    return process.env[key] !== undefined ? process.env[key] : defaultValue;
  }
};

export default config;

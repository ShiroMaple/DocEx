import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const PRESETS_DIR = path.resolve(process.cwd(), 'presets');

/**
 * 确认 presets 物理目录存在，若不存在则创建
 */
function ensurePresetsDir() {
  try {
    if (!fs.existsSync(PRESETS_DIR)) {
      fs.mkdirSync(PRESETS_DIR, { recursive: true });
    }
  } catch (e) {
    console.error('无法创建 presets 目录:', e);
  }
}

/**
 * 从物理磁盘Presets目录动态加载 ${id}.json 文件内容
 * @param {string} id 预设标识（如 'default', 'hse'）
 * @returns {object|null}
 */
export function loadRawPresetFromDisk(id) {
  ensurePresetsDir();
  const filePath = path.join(PRESETS_DIR, `${id}.json`);

  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error(`读取预设物理文件 [${filePath}] 失败:`, e);
  }

  return null;
}

/**
 * 获取经过物理 JSON 动态加载及 .env 变量强力合并后的完整预设对象
 * @param {string} id 预设标识（如 'hse'）
 * @returns {object|null}
 */
export function getResolvedPreset(id) {
  const targetId = id || 'default';
  const rawPreset = loadRawPresetFromDisk(targetId);

  if (!rawPreset) {
    return null;
  }

  const prefix = targetId.toUpperCase();

  // 读取与合并大模型 API 凭证 (格式如 HSE_OPENAI_API_KEY，无配置则自动回退至通用凭证)
  const provider = config.getEnv(`${prefix}_LLM_PROVIDER`, config.llmProvider || 'openai');
  const openai = {
    apiKey: config.getEnv(`${prefix}_OPENAI_API_KEY`, config.openai.apiKey || ''),
    baseUrl: config.getEnv(`${prefix}_OPENAI_BASE_URL`, config.openai.baseUrl || 'https://api.openai.com/v1'),
    model: config.getEnv(`${prefix}_OPENAI_MODEL`, config.openai.model || 'gpt-4o-mini')
  };

  // 优先按 rawPreset.tableConfigId (如 wps_hse) 查找 config.json 中的表格配置
  const targetTableConfigId = rawPreset.tableConfigId || '';
  const matchedTableConfig = (config.parsedTableConfigs || []).find(c => 
    (targetTableConfigId && c.id === targetTableConfigId) || 
    c.id === `wps_${targetId}` || 
    c.id === `feishu_${targetId}` || 
    c.id === `${targetId}_table`
  ) || (rawPreset.platform === 'feishu' ? config.defaultFeishuConf : config.defaultWpsConf);

  let fallbackWpsTableId = matchedTableConfig?.tableId || '';
  if (!fallbackWpsTableId && matchedTableConfig?.url) {
    const urlMatch = matchedTableConfig.url.match(/\/l\/([^?#/]+)/);
    fallbackWpsTableId = urlMatch ? urlMatch[1] : '';
  }
  if (!fallbackWpsTableId && config.defaultWpsConf?.url) {
    const urlMatch = config.defaultWpsConf.url.match(/\/l\/([^?#/]+)/);
    fallbackWpsTableId = urlMatch ? urlMatch[1] : '';
  }

  // 读取与合并多维表格凭证 (统一使用 tableId 命名)
  const lark = {
    appId: config.getEnv(`${prefix}_LARK_APP_ID`, matchedTableConfig?.appId || config.lark.appId || ''),
    appSecret: config.getEnv(`${prefix}_LARK_APP_SECRET`, matchedTableConfig?.appSecret || config.lark.appSecret || ''),
    appToken: config.getEnv(`${prefix}_LARK_APP_TOKEN`, matchedTableConfig?.appToken || config.lark.appToken || ''),
    tableId: config.getEnv(`${prefix}_LARK_TABLE_ID`, matchedTableConfig?.tableId || config.lark.tableId || ''),
    url: matchedTableConfig?.platform === 'feishu' ? matchedTableConfig.url : ''
  };

  const wpsTableId = config.getEnv(`${prefix}_WPS_TABLE_ID`, fallbackWpsTableId);

  const wps = {
    appId: config.getEnv(`${prefix}_WPS_APP_ID`, matchedTableConfig?.appId || config.wps.appId || ''),
    appSecret: config.getEnv(`${prefix}_WPS_APP_SECRET`, matchedTableConfig?.appSecret || config.wps.appSecret || ''),
    tableId: wpsTableId,
    url: matchedTableConfig?.platform === 'wps' ? matchedTableConfig.url : (wpsTableId ? `https://365.kdocs.cn/l/${wpsTableId}` : '')
  };

  const platform = config.getEnv(`${prefix}_TABLE_PLATFORM`, rawPreset.platform || matchedTableConfig?.platform || (lark.appToken && lark.tableId ? 'feishu' : 'wps'));

  return {
    ...rawPreset,
    llmProvider: provider,
    openai,
    lark,
    wps,
    platform
  };
}

/**
 * 获取物理 presets/ 目录下所有已注册的预设摘要列表（用于界面版本切换下拉菜单动态渲染）
 */
export function getAllPresetsList() {
  ensurePresetsDir();
  const list = [];

  try {
    const files = fs.readdirSync(PRESETS_DIR);
    for (const file of files) {
      if (file.endsWith('.json') && !file.startsWith('template')) {
        const id = path.basename(file, '.json');
        const raw = loadRawPresetFromDisk(id);
        if (raw) {
          list.push({
            id: raw.id || id,
            name: raw.name || `${id} 预设`,
            department: raw.department || id,
            subtitle: raw.subtitle || '',
            badgeText: raw.badgeText || raw.name,
            icon: raw.icon || (id === 'default' ? '🌐' : '⚙️'),
            locked: Boolean(raw.locked)
          });
        }
      }
    }
  } catch (e) {
    console.error('获取预设文件列表失败:', e);
  }

  return list;
}

/**
 * 客户端安全版本的预设导出一览
 */
export function getSafePresetForClient(id) {
  const resolved = getResolvedPreset(id);
  if (!resolved) return null;

  return {
    id: resolved.id,
    name: resolved.name,
    department: resolved.department,
    subtitle: resolved.subtitle,
    badgeText: resolved.badgeText,
    icon: resolved.icon || (resolved.id === 'default' ? '🌐' : '⚙️'),
    tableConfigId: resolved.tableConfigId || '',
    locked: resolved.locked,
    allowAutoDetectFields: Boolean(resolved.allowAutoDetectFields),
    allowCustomModel: resolved.allowCustomModel,
    allowCustomPlatform: resolved.allowCustomPlatform,
    allowCustomFields: resolved.allowCustomFields,
    allowCustomPrompt: resolved.allowCustomPrompt,
    systemPrompt: resolved.systemPrompt,
    userPrompt: resolved.userPrompt,
    fields: resolved.fields,
    fieldMapping: resolved.fieldMapping,
    postFilters: resolved.postFilters,
    platform: resolved.platform,
    llmConfig: {
      provider: resolved.llmProvider,
      baseUrl: resolved.openai.baseUrl,
      model: resolved.openai.model,
      hasApiKey: Boolean(resolved.openai.apiKey)
    },
    wps: resolved.wps ? {
      ...resolved.wps,
      appSecret: resolved.wps.appSecret ? '••••••••••••••••••••' : ''
    } : null,
    lark: resolved.lark ? {
      ...resolved.lark,
      appSecret: resolved.lark.appSecret ? '••••••••••••••••••••' : ''
    } : null,
    tableConfig: {
      platform: resolved.platform,
      url: resolved.platform === 'wps' ? resolved.wps.url : resolved.lark.url,
      tableId: resolved.platform === 'wps' ? resolved.wps.tableId : resolved.lark.tableId,
      hasLarkConfig: Boolean(resolved.lark.appToken && resolved.lark.tableId),
      hasWpsConfig: Boolean(resolved.wps.tableId)
    }
  };
}

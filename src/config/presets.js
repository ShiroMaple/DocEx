/*
 * Copyright (C) 2026 ShiroMaple <shiromaple@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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

  // 1. 优先按 rawPreset.llmConfigId (如 reco-standard) 查找 config.json 中的模型配置
  const targetLLMConfigId = rawPreset.llmConfigId || '';
  const matchedLLMConfig = (config.defaultLLMList || []).find(c => targetLLMConfigId && c.id === targetLLMConfigId) || config.defaultLLMConf;

  // 读取与合并大模型 API 凭证 (格式如 HSE_OPENAI_API_KEY，无环境变量配置则使用绑定的模型配置或默认凭证)
  const provider = config.getEnv(`${prefix}_LLM_PROVIDER`, matchedLLMConfig?.provider || config.llmProvider || 'openai');
  const openai = {
    apiKey: config.getEnv(`${prefix}_OPENAI_API_KEY`, matchedLLMConfig?.apiKey || config.openai.apiKey || ''),
    baseUrl: config.getEnv(`${prefix}_OPENAI_BASE_URL`, matchedLLMConfig?.baseUrl || config.openai.baseUrl || 'https://api.openai.com/v1'),
    model: config.getEnv(`${prefix}_OPENAI_MODEL`, matchedLLMConfig?.model || config.openai.model || 'kimi-k2.7-code'),
    thinkingEffort: matchedLLMConfig?.thinkingEffort || config.defaultLLMConf?.thinkingEffort || 'low'
  };

  // 2. 优先按 rawPreset.tableConfigId (如 wps_hse) 查找 config.json 中的表格配置
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

  // 动态读取并解析 fields.json 文件进行装配引用
  let resolvedFields = [];
  let availableFieldsList = [];
  try {
    const fieldsJsonPath = path.resolve(process.cwd(), 'fields.json');
    if (fs.existsSync(fieldsJsonPath)) {
      const fieldsRaw = fs.readFileSync(fieldsJsonPath, 'utf-8');
      const fieldsData = JSON.parse(fieldsRaw);

      if (Array.isArray(fieldsData)) {
        availableFieldsList = fieldsData.map(group => ({
          id: group.id,
          name: group.name,
          description: group.description || '',
          fieldCount: Array.isArray(group.fields) ? group.fields.length : 0
        }));

        const refKey = rawPreset.fieldsRef || targetId;
        const matchedGroup = fieldsData.find(g => g.id === refKey) || fieldsData.find(g => g.id === 'default');
        if (matchedGroup && Array.isArray(matchedGroup.fields)) {
          resolvedFields = matchedGroup.fields;
        }
      }
    }
  } catch (e) {
    console.error('加载 fields.json 失败:', e);
  }

  return {
    ...rawPreset,
    enabled: targetId === 'default' ? true : (rawPreset.enabled !== false),
    llmConfigId: targetLLMConfigId,
    fields: resolvedFields,
    availableFieldsList,
    llmProvider: provider,
    openai,
    lark,
    wps,
    platform
  };
}

/**
 * 获取物理 presets/ 目录下所有已注册的预设摘要列表（用于界面版本切换下拉菜单动态渲染，仅返回启用状态的预设）
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
        // 仅包含 enabled 不为 false 的预设（default 始终开启）
        if (raw && (id === 'default' || raw.enabled !== false)) {
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
    enabled: resolved.enabled !== false,
    llmConfigId: resolved.llmConfigId || '',
    tableConfigId: resolved.tableConfigId || '',
    locked: resolved.locked,
    allowAutoDetectFields: Boolean(resolved.allowAutoDetectFields),
    allowSwitchFields: Boolean(resolved.allowSwitchFields),
    allowViewCachedFiles: Boolean(resolved.allowViewCachedFiles),
    cacheRetentionDays: typeof resolved.cacheRetentionDays === 'number' ? resolved.cacheRetentionDays : (Number(resolved.cacheRetentionDays) || 7),
    availableFieldsList: resolved.availableFieldsList || [],
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
      thinkingEffort: resolved.openai.thinkingEffort || 'low',
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

/**
 * 获取 presets/ 目录下所有完整原始预设对象列表（排除 template.json）
 * @returns {Array<object>}
 */
export function getAllRawPresets() {
  ensurePresetsDir();
  const presets = [];

  try {
    const files = fs.readdirSync(PRESETS_DIR);
    for (const file of files) {
      if (file.endsWith('.json') && !file.startsWith('template')) {
        const id = path.basename(file, '.json');
        const raw = loadRawPresetFromDisk(id);
        if (raw) {
          presets.push({
            ...raw,
            id: raw.id || id
          });
        }
      }
    }
  } catch (e) {
    console.error('读取原始预设列表失败:', e);
    throw new Error(`读取预设列表失败: ${e.message}`);
  }

  return presets;
}

/**
 * 保存或更新特定预设至物理磁盘 presets/${id}.json（原子覆写）
 * @param {string} id 预设标识符
 * @param {object} presetData 预设完整数据对象
 */
export function savePresetToDisk(id, presetData) {
  if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('预设 ID 不合法，仅允许英文字母、数字、下划线及中划线');
  }

  if (!presetData || typeof presetData !== 'object') {
    throw new Error('预设配置内容必须为合法对象');
  }

  ensurePresetsDir();
  const targetPath = path.join(PRESETS_DIR, `${id}.json`);
  const tmpPath = path.join(PRESETS_DIR, `${id}.json.tmp-${Date.now()}`);

  const formattedData = {
    ...presetData,
    id: id // 强制确保内部 id 与文件名一致
  };

  const jsonString = JSON.stringify(formattedData, null, 2) + '\n';

  try {
    fs.writeFileSync(tmpPath, jsonString, 'utf-8');
    
    // Windows 环境下原子重命名带简单重试
    let renamed = false;
    let attempts = 0;
    while (!renamed && attempts < 5) {
      try {
        fs.renameSync(tmpPath, targetPath);
        renamed = true;
      } catch (err) {
        attempts++;
        if (attempts >= 5) {
          // 降级使用 copy + unlink
          fs.copyFileSync(tmpPath, targetPath);
          try { fs.unlinkSync(tmpPath); } catch (_) {}
          renamed = true;
        }
      }
    }
  } catch (e) {
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch (_) {}
    throw new Error(`写入预设物理文件失败: ${e.message}`);
  }

  return formattedData;
}

/**
 * 从物理磁盘删除指定预设 presets/${id}.json
 * @param {string} id 预设标识符
 */
export function deletePresetFromDisk(id) {
  if (!id || typeof id !== 'string') {
    throw new Error('未指定待删除的预设 ID');
  }

  // 保护核心内置预设禁止删除
  if (id === 'default') {
    throw new Error('系统内置核心预设 [default] 受保护，禁止删除');
  }

  ensurePresetsDir();
  const targetPath = path.join(PRESETS_DIR, `${id}.json`);

  if (!fs.existsSync(targetPath)) {
    throw new Error(`预设文件 [${id}.json] 不存在`);
  }

  try {
    fs.unlinkSync(targetPath);
  } catch (e) {
    throw new Error(`删除预设文件失败: ${e.message}`);
  }

  return true;
}

/**
 * 获取预设编辑器所需的关联辅助数据（fields.json 分组 + config.json 表格配置）
 */
export function getPresetAuxiliaryData() {
  let fieldsGroups = [];
  try {
    const fieldsJsonPath = path.resolve(process.cwd(), 'fields.json');
    if (fs.existsSync(fieldsJsonPath)) {
      const fieldsRaw = fs.readFileSync(fieldsJsonPath, 'utf-8');
      const fieldsData = JSON.parse(fieldsRaw);
      fieldsGroups = fieldsData.map(group => ({
        id: group.id,
        name: group.name,
        description: group.description || '',
        fieldCount: Array.isArray(group.fields) ? group.fields.length : 0,
        fields: group.fields || []
      }));
    }
  } catch (e) {
    console.error('读取 fields.json 失败:', e);
  }

  let tableConfigs = [];
  try {
    const rawTables = config.parsedTableConfigs || config.tables?.configs || [];
    tableConfigs = rawTables.map(t => ({
      id: t.id,
      name: t.name || t.id,
      platform: t.platform || 'wps',
      baseUrl: t.baseUrl || '',
      tableId: t.tableId || '',
      isDefault: Boolean(t.isDefault)
    }));
  } catch (e) {
    console.error('读取 tableConfigs 失败:', e);
  }

  let llmConfigs = [];
  try {
    const rawLlmList = config.defaultLLMList || [];
    llmConfigs = rawLlmList.map(c => ({
      id: c.id,
      name: c.name || c.id,
      provider: c.provider || 'openai',
      model: c.model || '',
      thinkingEffort: c.thinkingEffort || 'low',
      isDefault: Boolean(c.isDefault)
    }));
  } catch (e) {
    console.error('读取 llmConfigs 失败:', e);
  }

  return {
    fieldsGroups,
    tableConfigs,
    llmConfigs
  };
}


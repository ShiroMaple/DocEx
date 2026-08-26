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

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

/**
 * 实时读取物理 .env 环境变量文件
 */
export function readEnvFromDisk() {
  const envPath = path.resolve(ROOT_DIR, '.env');
  let parsedEnv = {};
  try {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      parsedEnv = dotenv.parse(content);
    }
  } catch (e) {
    console.error('❌ 实时读取 .env 失败:', e.message);
  }
  return parsedEnv;
}

/**
 * 通用磁盘配置动态加载器（方案 A 核心）
 * 每次调用时实时读取物理 config.json 及 .env 并映射，保障运维修改即时生效，免重启服务
 */
export function readConfigFromDisk() {
  const configJsonPath = path.resolve(ROOT_DIR, 'config.json');
  let rawConfigJson = {};

  try {
    if (fs.existsSync(configJsonPath)) {
      const content = fs.readFileSync(configJsonPath, 'utf-8');
      rawConfigJson = JSON.parse(content);
    }
  } catch (e) {
    console.error(`❌ 实时解析物理配置文件 [${configJsonPath}] 失败:`, e.message);
  }

  const parsedEnv = readEnvFromDisk();

  // 1. 系统及频次限制配置
  const system = {
    nodeEnv: process.env.NODE_ENV || rawConfigJson.system?.nodeEnv || 'development',
    logLevel: process.env.LOG_LEVEL || rawConfigJson.system?.logLevel || 'info'
  };

  const rateLimit = {
    windowMs: Number(rawConfigJson.rateLimit?.windowMs) || 60000,
    maxRequests: Number(rawConfigJson.rateLimit?.maxRequests) || 5
  };

  // 2. 物理目录结构配置
  const paths = {
    inputDir: path.resolve(ROOT_DIR, rawConfigJson.paths?.inputDir || 'data/input'),
    outputDir: path.resolve(ROOT_DIR, rawConfigJson.paths?.outputDir || 'data/output'),
    uploadDir: path.resolve(ROOT_DIR, rawConfigJson.paths?.uploadDir || 'data/uploads'),
    preprocessDir: path.resolve(ROOT_DIR, rawConfigJson.paths?.preprocessDir || 'data/preprocessed'),
    presetsDir: path.resolve(ROOT_DIR, rawConfigJson.paths?.presetsDir || 'presets')
  };

  // 3. 动态解析 LLM 配置列表，映射环境变量占位符
  const rawLLMConfigs = rawConfigJson.llm?.configs || [];
  const defaultLLMList = rawLLMConfigs.map(c => {
    let finalApiKey = c.apiKey || '';
    // 如果 apiKey 的值是占位符（即指向环境变量，如 KIMI_API_KEY），执行映射替换
    if (finalApiKey) {
      if (parsedEnv[finalApiKey] !== undefined) {
        finalApiKey = parsedEnv[finalApiKey];
      } else if (process.env[finalApiKey] !== undefined) {
        finalApiKey = process.env[finalApiKey];
      }
    }
    return {
      id: c.id || 'default',
      name: c.name || '默认配置',
      provider: c.provider || 'Kimi',
      baseUrl: c.baseUrl || 'https://api.moonshot.cn/v1',
      model: c.model || 'kimi-k2.7-code',
      thinkingEffort: c.thinkingEffort || 'low',
      apiKey: finalApiKey,
      isDefault: Boolean(c.isDefault)
    };
  });

  const defaultLLMConf = defaultLLMList.find(c => c.isDefault) || defaultLLMList[0] || {
    id: 'default',
    name: '默认配置',
    provider: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2.7-code',
    thinkingEffort: 'low',
    apiKey: '',
    isDefault: true
  };

  // 4. 动态解析多维表格平台配置
  const rawTableConfigs = rawConfigJson.tables?.configs || [];
  const parsedTableConfigs = rawTableConfigs.map(c => {
    let appId = c.appId || '';
    if (c.appIdEnv) {
      appId = parsedEnv[c.appIdEnv] || process.env[c.appIdEnv] || '';
    } else if (appId && (parsedEnv[appId] !== undefined || process.env[appId] !== undefined)) {
      appId = parsedEnv[appId] || process.env[appId] || '';
    }

    let appSecret = c.appSecret || '';
    if (c.appSecretEnv) {
      appSecret = parsedEnv[c.appSecretEnv] || process.env[c.appSecretEnv] || '';
    } else if (appSecret && (parsedEnv[appSecret] !== undefined || process.env[appSecret] !== undefined)) {
      appSecret = parsedEnv[appSecret] || process.env[appSecret] || '';
    }

    let url = c.url || '';
    if (!url && c.baseUrl) {
      if (c.platform === 'wps') {
        url = `${c.baseUrl}${c.tableId || ''}`;
      } else if (c.platform === 'feishu') {
        url = `${c.baseUrl}${c.appToken || ''}?table=${c.tableId || ''}`;
      }
    }

    return {
      id: c.id,
      name: c.name,
      platform: c.platform,
      appId,
      appSecret,
      tableId: c.tableId || '',
      appToken: c.appToken || '',
      url,
      isDefault: Boolean(c.isDefault)
    };
  });

  const defaultWpsConf = parsedTableConfigs.find(c => c.id === 'wps_test') || {};
  const defaultFeishuConf = parsedTableConfigs.find(c => c.id === 'feishu_test') || {};

  // 5. 补齐旧版本 config.wps 与 config.lark 全局默认参数（用于 presets 解析时的 Fallback 回退防报错）
  const lark = {
    appId: parsedEnv.LARK_APP_ID || process.env.LARK_APP_ID || '',
    appSecret: parsedEnv.LARK_APP_SECRET || process.env.LARK_APP_SECRET || '',
    appToken: parsedEnv.LARK_APP_TOKEN || process.env.LARK_APP_TOKEN || '',
    tableId: parsedEnv.LARK_TABLE_ID || process.env.LARK_TABLE_ID || ''
  };

  const wps = {
    appId: parsedEnv.WPS_APP_ID || process.env.WPS_APP_ID || '',
    appSecret: parsedEnv.WPS_APP_SECRET || process.env.WPS_APP_SECRET || '',
    tableId: parsedEnv.WPS_TABLE_ID || process.env.WPS_TABLE_ID || ''
  };

  const llmPricing = rawConfigJson.llm?.pricing || {};

  return {
    system,
    rateLimit,
    paths,
    defaultLLMConf,
    defaultWpsConf,
    defaultFeishuConf,
    defaultLLMList,
    parsedTableConfigs,
    lark,
    wps,
    llmPricing
  };
}

/**
 * 统一导出的静态代理代理 Config 对象 (Getter 拦截器模式)
 * 实现对旧版全局静态引用的完美兼容性，读取瞬间触发物理读盘重载
 */
export const config = {
  get system() { return readConfigFromDisk().system; },
  get rateLimit() { return readConfigFromDisk().rateLimit; },
  get paths() { return readConfigFromDisk().paths; },
  get defaultLLMConf() { return readConfigFromDisk().defaultLLMConf; },
  get defaultWpsConf() { return readConfigFromDisk().defaultWpsConf; },
  get defaultFeishuConf() { return readConfigFromDisk().defaultFeishuConf; },
  get defaultLLMList() { return readConfigFromDisk().defaultLLMList; },
  get parsedTableConfigs() { return readConfigFromDisk().parsedTableConfigs; },
  get llmPricing() { return readConfigFromDisk().llmPricing; },
  
  // 补齐 Getter 代理，防 presets 读取挂死
  get lark() { return readConfigFromDisk().lark; },
  get wps() { return readConfigFromDisk().wps; },

  // 为大模型消费保留的旧 OpenAI 对象兼容性 Getter
  get openai() {
    const conf = readConfigFromDisk().defaultLLMConf;
    return {
      apiKey: conf.apiKey,
      baseUrl: conf.baseUrl,
      model: conf.model
    };
  },

  /**
   * 动态安全获取环境变量的辅助方法
   */
  getEnv(key, defaultValue = '') {
    const parsedEnv = readEnvFromDisk();
    return parsedEnv[key] !== undefined ? parsedEnv[key] : (process.env[key] !== undefined ? process.env[key] : defaultValue);
  }
};

/**
 * 对敏感凭证（如 API Key, Token）进行安全首末掩码处理
 * 规则：
 * - 长度 >= 12: 保留前 4 位和后 4 位，中间固定 8 个圆点（如 sk-k••••••••3821）
 * - 长度 6~11: 保留前 2 位和后 2 位，中间固定 4 个圆点（如 sk••••89）
 * - 长度 < 6 或空: 返回全掩码或空字符串
 */
export function maskSecretKey(key) {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (!trimmed) return '';
  // 如果已经是掩码形式，直接返回
  if (trimmed.includes('••••')) return trimmed;

  if (trimmed.length >= 12) {
    const head = trimmed.slice(0, 4);
    const tail = trimmed.slice(-4);
    return `${head}••••••••${tail}`;
  }
  if (trimmed.length >= 6) {
    const head = trimmed.slice(0, 2);
    const tail = trimmed.slice(-2);
    return `${head}••••${tail}`;
  }
  return '••••••••';
}

export default config;

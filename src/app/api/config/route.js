import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../../../config.js';

const CONFIG_PATH = path.resolve(process.cwd(), 'config.json');

export async function GET() {
  let baseConfig = {
    defaultLLMConf: {
      id: 'default',
      name: '默认配置',
      provider: 'XiaoMi',
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
      model: 'mimo-v2.5',
      apiKey: '',
      isDefault: true
    },
    defaultWpsConf: {
      id: 'wps_test',
      name: 'WPS测试配置',
      platform: 'wps',
      appId: '',
      appSecret: '',
      url: 'https://365.kdocs.cn/l/cbGbLglUXASe',
      isDefault: true
    },
    defaultFeishuConf: {
      id: 'feishu_test',
      name: '飞书测试配置',
      platform: 'feishu',
      appId: '',
      appSecret: '',
      url: 'https://cli-aac44e92a2b89bd5.feishu.cn/base/[REDACTED_FEISHU_APP_TOKEN]?table=[REDACTED_FEISHU_TABLE_ID]',
      isDefault: true
    }
  };

  try {
    const content = await fs.readFile(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(content);
    baseConfig = { ...baseConfig, ...parsed };
  } catch (e) {
    console.warn('⚠️ 物理 config.json 未找到或解析异常，将使用内置回退配置:', e.message);
  }

  // ── .env 高优先级环境变量覆盖 ──
  if (process.env.OPENAI_API_KEY) {
    baseConfig.defaultLLMConf.apiKey = process.env.OPENAI_API_KEY;
  }
  if (process.env.OPENAI_BASE_URL) {
    baseConfig.defaultLLMConf.baseUrl = process.env.OPENAI_BASE_URL;
  }
  if (process.env.OPENAI_MODEL) {
    baseConfig.defaultLLMConf.model = process.env.OPENAI_MODEL;
  }
  if (process.env.LLM_PROVIDER) {
    baseConfig.defaultLLMConf.provider = process.env.LLM_PROVIDER;
  }

  if (process.env.WPS_BASE_ID) {
    const wpsBaseId = process.env.WPS_BASE_ID;
    baseConfig.defaultWpsConf.url = `https://365.kdocs.cn/l/${wpsBaseId}`;
  }
  if (process.env.WPS_APP_ID) {
    baseConfig.defaultWpsConf.appId = process.env.WPS_APP_ID;
  }
  if (process.env.WPS_APP_SECRET) {
    baseConfig.defaultWpsConf.appSecret = process.env.WPS_APP_SECRET;
  }

  if (process.env.LARK_APP_TOKEN && process.env.LARK_TABLE_ID) {
    const appToken = process.env.LARK_APP_TOKEN;
    const tableId = process.env.LARK_TABLE_ID;
    baseConfig.defaultFeishuConf.url = `https://feishu.cn/base/${appToken}?table=${tableId}`;
  }
  if (process.env.LARK_APP_ID) {
    baseConfig.defaultFeishuConf.appId = process.env.LARK_APP_ID;
  }
  if (process.env.LARK_APP_SECRET) {
    baseConfig.defaultFeishuConf.appSecret = process.env.LARK_APP_SECRET;
  }

  return NextResponse.json(baseConfig);
}

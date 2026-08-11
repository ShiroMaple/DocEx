import { NextResponse } from 'next/server';
import { readConfigFromDisk } from '../../../config/index.js';

/**
 * 敏感凭证脱敏辅助函数，确保大模型 API Key 与多维表格 appSecret 不会明文泄露到前端
 */
function maskSecrets(configObj) {
  const masked = JSON.parse(JSON.stringify(configObj));
  
  // 1. 大模型列表脱敏
  if (Array.isArray(masked.defaultLLMList)) {
    masked.defaultLLMList = masked.defaultLLMList.map(c => ({
      ...c,
      apiKey: c.apiKey ? '••••••••••••••••••••' : ''
    }));
  }
  if (masked.defaultLLMConf && masked.defaultLLMConf.apiKey) {
    masked.defaultLLMConf.apiKey = '••••••••••••••••••••';
  }

  // 2. 多维表格平台列表脱敏
  if (Array.isArray(masked.parsedTableConfigs)) {
    masked.parsedTableConfigs = masked.parsedTableConfigs.map(c => ({
      ...c,
      appSecret: c.appSecret ? '••••••••••••••••••••' : ''
    }));
  }
  if (masked.defaultWpsConf && masked.defaultWpsConf.appSecret) {
    masked.defaultWpsConf.appSecret = '••••••••••••••••••••';
  }
  if (masked.defaultFeishuConf && masked.defaultFeishuConf.appSecret) {
    masked.defaultFeishuConf.appSecret = '••••••••••••••••••••';
  }

  return masked;
}

export async function GET() {
  // 调用通用物理读盘方法动态读取，避免缓存挂起
  const activeConfig = readConfigFromDisk();
  const safeConfig = maskSecrets(activeConfig);

  return NextResponse.json({
    defaultLLMConf: safeConfig.defaultLLMConf,
    defaultWpsConf: safeConfig.defaultWpsConf,
    defaultFeishuConf: safeConfig.defaultFeishuConf,
    defaultLLMList: safeConfig.defaultLLMList,
    parsedTableConfigs: safeConfig.parsedTableConfigs
  });
}

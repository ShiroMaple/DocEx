import { NextResponse } from 'next/server';
import { config } from '../../../config/index.js';

export async function GET() {
  return NextResponse.json({
    defaultLLMConf: config.defaultLLMConf,
    defaultWpsConf: config.defaultWpsConf,
    defaultFeishuConf: config.defaultFeishuConf,
    defaultLLMList: config.defaultLLMList,
    parsedTableConfigs: config.parsedTableConfigs
  });
}

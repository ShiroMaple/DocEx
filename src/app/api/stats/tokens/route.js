import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { config } from '../../../../config/index.js';

const LOGS_DIR = path.resolve(process.cwd(), 'logs');

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '7', 10);
    const presetIdFilter = url.searchParams.get('presetId');
    const departmentFilter = url.searchParams.get('department');
    
    // 计算起始时间戳
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
    const startTimestamp = startDate.getTime();

    if (!fs.existsSync(LOGS_DIR)) {
      return NextResponse.json({ summary: {}, trendData: [], modelBreakdown: [] });
    }

    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.startsWith('docex') && f.endsWith('.log'))
      .map(f => {
        const filePath = path.join(LOGS_DIR, f);
        const stat = fs.statSync(filePath);
        return { path: filePath, mtime: stat.mtimeMs };
      })
      .sort((a, b) => a.mtime - b.mtime); // 时间正序

    const trendMap = {}; // { 'YYYY-MM-DD': { date, promptTokens, completionTokens, cost } }
    const modelMap = {}; // { 'model': { model, promptTokens, completionTokens, cost, requests } }
    let totalRequests = 0;
    let totalPrompt = 0;
    let totalCompletion = 0;
    let totalCost = 0;

    const pricing = config.llmPricing || {};
    const defaultPricePer1M = 12; // 默认 12 元/百万 Token

    for (const fileObj of files) {
      if (fileObj.mtime < startTimestamp - 86400000) {
        // 如果文件最后修改时间比 startTimestamp 还要早一天以上，大概率没用，跳过
        continue;
      }

      const content = fs.readFileSync(fileObj.path, 'utf-8');
      const lines = content.split('\n');
      
      for (const lineStr of lines) {
        if (!lineStr.trim()) continue;
        try {
          const logObj = JSON.parse(lineStr);
          
          if (logObj.time < startTimestamp) continue;
          
          const event = logObj.event;
          if (
            event === 'LLM_EXTRACTION_SUCCESS' ||
            event === 'LLM_EXTRACTION_SUCCESS_FALLBACK' ||
            event === 'LLM_STREAM_COMPLETE'
          ) {
            const metrics = logObj.metrics;
            if (!metrics || (!metrics.promptTokens && !metrics.completionTokens)) continue;

            const presetId = logObj.presetId || 'unknown';
            const department = logObj.department || 'unknown';

            if (presetIdFilter && presetIdFilter !== 'all' && presetId !== presetIdFilter) {
              continue;
            }
            if (departmentFilter && departmentFilter !== 'all' && department !== departmentFilter) {
              continue;
            }

            const model = logObj.model || 'unknown';
            const pTokens = metrics.promptTokens || 0;
            const cTokens = metrics.completionTokens || 0;
            
            // 费用估算
            const modelPrice = pricing[model] || { inputPer1M: defaultPricePer1M, outputPer1M: defaultPricePer1M };
            const cost = (pTokens / 1000000) * modelPrice.inputPer1M + (cTokens / 1000000) * modelPrice.outputPer1M;
            
            totalRequests++;
            totalPrompt += pTokens;
            totalCompletion += cTokens;
            totalCost += cost;

            // 聚合按天
            const logDate = new Date(logObj.time);
            const dateKey = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`;
            
            if (!trendMap[dateKey]) {
              trendMap[dateKey] = { date: dateKey, promptTokens: 0, completionTokens: 0, cost: 0 };
            }
            trendMap[dateKey].promptTokens += pTokens;
            trendMap[dateKey].completionTokens += cTokens;
            trendMap[dateKey].cost += cost;

            // 聚合按模型
            if (!modelMap[model]) {
              modelMap[model] = { model, promptTokens: 0, completionTokens: 0, cost: 0, requests: 0 };
            }
            modelMap[model].promptTokens += pTokens;
            modelMap[model].completionTokens += cTokens;
            modelMap[model].cost += cost;
            modelMap[model].requests += 1;
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }

    // 将 trendMap 转为数组并按日期补齐
    const trendData = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate.getTime() + i * 86400000);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      trendData.push(trendMap[k] || { date: k, promptTokens: 0, completionTokens: 0, cost: 0 });
    }

    const modelBreakdown = Object.values(modelMap).sort((a, b) => b.cost - a.cost);

    return NextResponse.json({
      summary: {
        totalRequests,
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        totalCost
      },
      trendData,
      modelBreakdown
    });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

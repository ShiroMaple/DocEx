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

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { resolveLLMConfig } from '../../../config/presets.js';
import { checkRateLimit } from '../../../lib/rateLimit.js';
import { withLogging, logger } from '../../../lib/logger.js';

/**
 * 大模型辅助一键优化提示词
 */
async function optimizePromptHandler(request) {
  try {
    const jsonBody = await request.json();
    const { prompt, fields, presetId } = jsonBody;
    const inputConfig = jsonBody.llmConfig || {
      apiKey: jsonBody.apiKey,
      baseUrl: jsonBody.baseUrl,
      model: jsonBody.model
    };

    // 1. 物理安全凭证统一解析与还原
    const resolvedLLM = resolveLLMConfig(inputConfig, presetId);

    if (resolvedLLM.isDefaultKey) {
      const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
      if (!checkRateLimit(ip)) {
        logger.warn({ event: 'RATE_LIMIT_EXCEEDED', ip }, '默认 API Key 频次超限被拦截');
        return NextResponse.json({ 
          error: '⚠️ 访问受限：您当前使用的是系统默认共享 AI 配置，调用太频繁。请稍候再试（限制为 5 次/分钟），或在配置中设置您自有的 API Key 以解除限制。' 
        }, { status: 429 });
      }
    }

    if (!resolvedLLM.apiKey || !resolvedLLM.model) {
      return NextResponse.json({ error: '未配置大模型 API Key 或模型名称，请先在 LLM 配置页中连接并验证' }, { status: 400 });
    }

    const openai = new OpenAI({
      apiKey: resolvedLLM.apiKey,
      baseURL: resolvedLLM.baseUrl || 'https://api.openai.com/v1'
    });

    const fieldsDesc = fields.map(f => `- 字段键名: ${f.key}, 描述: ${f.desc}, 示例: ${f.example}`).join('\n');

    const systemPrompt = `你是一个专业的提示词工程专家。
你的任务是：帮助用户优化用于大模型文档结构化数据提取的提示词（Prompt），使其更加精准、清晰，重点规避大模型的提取边界混淆与格式幻觉。

【目标提取字段列表】：
${fieldsDesc}

【当前提示词】：
"${prompt}"

【优化规范】：
1. 优化后的提示词必须能精确引导模型分析提取上述字段。
2. 保持语气专业、指示清晰明确，按合理的步骤进行引导。
3. 必须指导模型：如果字段缺失该如何处理（如留空，不可瞎编）。
4. 只返回优化后的提示词文本正文本身，不要包含任何 markdown 块或解释说明文字。`;

    const response = await openai.chat.completions.create({
      model: resolvedLLM.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '请帮我优化上述提示词：' }
      ]
    });

    const optimizedPrompt = response.choices[0]?.message?.content?.trim() || prompt;
    const usage = response.usage || {
      promptTokens: Math.round(JSON.stringify(systemPrompt).length / 1.5),
      completionTokens: Math.round(optimizedPrompt.length / 1.5),
      totalTokens: Math.round(JSON.stringify(systemPrompt).length / 1.5) + Math.round(optimizedPrompt.length / 1.5)
    };
    
    logger.info({
      event: 'PROMPT_OPTIMIZED',
      model: resolvedLLM.model,
      usage
    }, '提示词优化成功');

    return NextResponse.json({ success: true, optimizedPrompt, usage });

  } catch (err) {
    logger.error({
      event: 'OPTIMIZE_PROMPT_HANDLER_EXCEPTION',
      error: { message: err.message, stack: err.stack }
    }, '优化提示词失败');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const POST = withLogging(optimizePromptHandler);

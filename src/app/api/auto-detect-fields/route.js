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
import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';
import { getFileRecord } from '../../../lib/db.js';
import { resolveLLMConfig } from '../../../config/presets.js';
import { withLogging, logger } from '../../../lib/logger.js';

const PREPROCESS_DIR = path.resolve(process.cwd(), 'data/preprocessed');

/**
 * 智能判断大模型是否支持 Vision 多模态
 */
function isVisionModel(modelName) {
  if (!modelName) return false;
  const lower = modelName.toLowerCase();
  return lower.includes('vision') || lower.includes('gpt-4o') || lower.includes('k2.7') || lower.includes('kimi');
}

async function autoDetectFieldsHandler(request) {
  try {
    const startTime = Date.now();
    const jsonBody = await request.json();
    const { md5, presetId } = jsonBody;
    const llmConfig = jsonBody.llmConfig || {};

    if (!md5) {
      return NextResponse.json({ error: '缺少待识别文档的 md5 参数' }, { status: 400 });
    }

    // 1. 物理安全凭证统一解析与还原
    const resolvedLLM = resolveLLMConfig(llmConfig, presetId);

    if (!resolvedLLM.apiKey) {
      return NextResponse.json({ error: '模型 API Key 缺失，请先在顶部设置您的 API 凭证' }, { status: 400 });
    }

    // 2. 读取文档记录并确保已预处理完毕
    const record = await getFileRecord(md5);
    if (!record) {
      return NextResponse.json({ error: '未找到该文档的登记记录' }, { status: 404 });
    }
    if (record.status !== 'done') {
      return NextResponse.json({ error: `该文档当前状态为 [${record.status}]，请等待预处理完成。` }, { status: 400 });
    }

    const outputDir = path.join(PREPROCESS_DIR, md5);
    const ext = path.extname(record.fileName).toLowerCase();

    let textContent = '';
    let imageBase64 = null;
    let mimeType = 'image/png';

    // 3. 首页物理数据截取与 Vision 拼装 (上传数量多于 1 或页数大于 1 则只取首页)
    try {
      if (ext === '.pdf') {
        // 读取文字层并截取第 1 页
        const textPath = path.join(outputDir, 'text.txt');
        textContent = await fs.readFile(textPath, 'utf-8').catch(() => '');
        
        const secondPageIdx = textContent.indexOf('--- [PAGE_START: 2] ---');
        if (secondPageIdx !== -1) {
          textContent = textContent.substring(0, secondPageIdx);
        } else {
          textContent = textContent.substring(0, 4000); // 兜底截取前 4k 字符
        }

        // 读取第 1 页截图
        if (record.images && record.images.length > 0) {
          const firstImg = record.images[0];
          const imgFileName = path.basename(firstImg.path);
          const imgFullPath = path.join(outputDir, imgFileName);
          
          const imgBuffer = await fs.readFile(imgFullPath);
          imageBase64 = imgBuffer.toString('base64');
          mimeType = firstImg.mimeType || 'image/png';
        }

      } else if (ext === '.docx') {
        // 读取 DOCX 结构并截取前段数据
        const structurePath = path.join(outputDir, 'structure.json');
        const rawStr = await fs.readFile(structurePath, 'utf-8');
        const structure = JSON.parse(rawStr);
        
        // 仅截取前 15 项（以覆盖首面文字及主要属性），并提取第一个图片
        const limitedStructure = structure.slice(0, 15);
        const textParts = [];
        for (const part of limitedStructure) {
          if (part.type === 'text') {
            textParts.push(part.text);
          } else if (part.type === 'image' && !imageBase64) {
            const imgFileName = path.basename(part.path);
            const imgFullPath = path.join(outputDir, imgFileName);
            try {
              const imgBuffer = await fs.readFile(imgFullPath);
              imageBase64 = imgBuffer.toString('base64');
              mimeType = part.mimeType || 'image/png';
            } catch (err) {
              logger.warn({ event: 'AUTO_DETECT_READ_DOCX_IMAGE_FAILED', error: err.message });
            }
          }
        }
        textContent = textParts.join('\n');

      } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        // 单张图片：直接全量读取
        const imgName = `image${ext}`;
        const imgFullPath = path.join(outputDir, imgName);
        const imgBuffer = await fs.readFile(imgFullPath);
        
        textContent = `[图像文件: ${record.fileName}]`;
        imageBase64 = imgBuffer.toString('base64');
        mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
      }
    } catch (fsErr) {
      logger.error({
        event: 'AUTO_DETECT_READ_ARTIFACTS_FAILED',
        md5,
        error: fsErr.message
      }, '读取文档首面数据失败');
      return NextResponse.json({ error: `解析首面物理文件失败: ${fsErr.message}` }, { status: 500 });
    }

    // 4. 初始化大模型客户端
    const openai = new OpenAI({
      apiKey: resolvedLLM.apiKey,
      baseURL: resolvedLLM.baseUrl,
      timeout: 60000 // 放宽至 60 秒超时保护
    });

    const isVision = isVisionModel(resolvedLLM.model) && imageBase64;
    const messages = [
      {
        role: 'system',
        content: `你是一个专业的文档数据分析专家。请阅读并分析输入的文档首面内容。
你的核心任务是：识别文档的业务背景和类型（例如日报、合规检查单、发票合同、出仓记录等），推演并智能推荐出 5 到 8 个最适合用于做汇总整理和深度结构化提取的核心字段。

你必须严格以下 JSON 格式对象返回数据（禁止带有 Markdown 标记 \`\`\`json 或多余解释文字，保证可被 JSON.parse 解析）：
{
  "fields": [
    {
      "key": "字段英文Key，必须使用小驼峰命名法（如 projectName, issueDesc, checkerName），只允许英文字母和数字，严禁含有下划线或特殊字符",
      "label": "字段中文名称（如 项目名称、问题描述、检查人员）",
      "desc": "字段提取约束描述，说明该字段在文档中具体定义了哪些提取要求与判断准则",
      "example": "本字段的一个规范示例提取值"
    }
  ]
}`
      }
    ];

    if (isVision) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: `以下为该文档首面提取的文字参考层：\n\n${textContent}\n\n请结合以下文档首面的多模态视觉截图进行综合识别字段：` },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`
            }
          }
        ]
      });
    } else {
      messages.push({
        role: 'user',
        content: `以下为该文档首面提取的文字参考层：\n\n${textContent}\n\n请进行智能推荐提取字段：`
      });
    }

    // 5. 发送请求给大模型进行字段推演 (流式响应)

    logger.info({
      event: 'AUTO_DETECT_FIELDS_START',
      model: llmConfig.model,
      isVision
    }, `🔮 启动 AI 一键自动识别字段流式解析，文档: ${record.fileName}`);

    const stream = await openai.chat.completions.create({
      model: llmConfig.model || 'kimi-k2.7-code',
      messages,
      response_format: { type: 'json_object' },
      stream: true
    });

    const encoder = new TextEncoder();
    const customReadable = new ReadableStream({
      async start(controller) {
        let completeText = '';
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            completeText += content;
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'chunk', text: content }) + '\n'));
          }

          let parsedJson = null;
          try {
            parsedJson = JSON.parse(completeText.trim());
          } catch (parseErr) {
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: `大模型返回的 JSON 解析失败: ${parseErr.message}` }) + '\n'));
            controller.close();
            return;
          }

          const fieldsList = parsedJson.fields || [];
          if (!Array.isArray(fieldsList) || fieldsList.length === 0) {
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: '⚠️ 模型未能给出有效的字段定义。' }) + '\n'));
            controller.close();
            return;
          }

          const cleanedFields = fieldsList.map(f => ({
            key: (f.key || '').replace(/[^a-zA-Z0-9]/g, '') || `field_${Math.random().toString(36).substr(2, 5)}`,
            label: f.label || '新字段',
            desc: f.desc || '',
            example: f.example || '',
            isAdvancedOpen: false
          }));

          const promptTokens = Math.round(JSON.stringify(messages).length / 1.5);
          const completionTokens = Math.round(completeText.length / 1.5);
          const totalTokens = promptTokens + completionTokens;
          const durationMs = Date.now() - startTime;

          logger.info({
            event: 'AUDIT_FIELD_AUTO_DETECT',
            operator: request.headers.get('x-operator') || 'User',
            fileName: record.fileName,
            model: llmConfig.model || 'kimi-k2.7-code',
            isVision,
            durationMs,
            tokenUsage: { promptTokens, completionTokens, totalTokens },
            fieldsCount: cleanedFields.length
          }, `用户成功完成对文档 [${record.fileName}] 的 AI 字段自动识别推荐，生成字段 [${cleanedFields.length} 个]，耗时 [${durationMs}ms]。Token 用量: [输入: ${promptTokens}, 输出: ${completionTokens}, 总计: ${totalTokens}]`);

          controller.enqueue(encoder.encode(JSON.stringify({
            type: 'done',
            fields: cleanedFields,
            usage: {
              promptTokens,
              completionTokens,
              totalTokens
            }
          }) + '\n'));
          controller.close();

        } catch (streamErr) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: streamErr.message }) + '\n'));
          controller.close();
        }
      }
    });

    return new Response(customReadable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });

  } catch (err) {
    logger.error({
      event: 'AUTO_DETECT_FIELDS_EXCEPTION',
      error: { message: err.message, stack: err.stack }
    }, '智能自动识别提取字段过程发生异常');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const POST = withLogging(autoDetectFieldsHandler);

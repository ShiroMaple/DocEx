import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFileRecord } from '../../../lib/db.js';
import { extractCustomFieldsStream } from '../../../services/llmService.js';
import { readConfigFromDisk } from '../../../config/index.js';
import { checkRateLimit } from '../../../lib/rateLimit.js';
import { withLogging, logger } from '../../../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PREPROCESS_DIR = path.resolve(process.cwd(), 'data/preprocessed');

/**
 * 提示词攻击防御网关 (Prompt Injection & Privacy Leak Shield)
 */
function checkPromptSecurity(systemPrompt, userPrompt, fields) {
  const attackPatterns = [
    // 窃取环境变量与隐私
    /\.env/i,
    /env\b/i,
    /process\.env/i,
    /api_key/i,
    /apikey/i,
    /secret/i,
    /password/i,
    /credential/i,
    /token/i,
    // 窃取系统文件
    /\/etc\/passwd/i,
    /system files/i,
    /读取系统文件/i,
    /服务器配置/i,
    // Jailbreak 越狱指令
    /ignore previous/i,
    /bypass safety/i,
    /system prompt/i,
    /system instruction/i,
    /developer mode/i,
    /开发者模式/i,
    /越狱/i,
    /忽略之前的指令/i
  ];

  const contentsToValidate = [
    systemPrompt || '',
    userPrompt || '',
    ...fields.map(f => `${f.label} ${f.desc} ${f.example || ''}`)
  ];

  for (const text of contentsToValidate) {
    for (const pattern of attackPatterns) {
      if (pattern.test(text)) {
        logger.warn({
          event: 'PROMPT_SECURITY_ALERT',
          pattern: pattern.toString(),
          blockedSnippet: text.substring(0, 100)
        }, '🚨 Prompt Security Shield: 检测到潜在攻击模式被拦截');
        return true; // Detected attack!
      }
    }
  }
  return false;
}

/**
 * POST /api/extract
 * 运行大模型识别并提取数据
 */
async function extractHandler(request) {
  try {
    const jsonBody = await request.json();
    const { md5, systemPrompt, userPrompt, fields, postFilters } = jsonBody;
    const llmConfig = jsonBody.llmConfig || {};

    if (!md5) {
      return NextResponse.json({ error: '缺少 md5 参数' }, { status: 400 });
    }
    if (!fields || fields.length === 0) {
      return NextResponse.json({ error: '必须指定待提取的字段' }, { status: 400 });
    }

    // 掩码物理还原
    let activeApiKey = llmConfig.apiKey || '';
    const isMask = activeApiKey === '••••••••••••••••••••';
    const diskConfig = readConfigFromDisk();

    if (isMask) {
      const match = diskConfig.defaultLLMList.find(c => c.model === llmConfig.model && c.baseUrl === llmConfig.baseUrl);
      if (match && match.apiKey) {
        activeApiKey = match.apiKey;
      } else {
        activeApiKey = diskConfig.defaultLLMConf.apiKey;
      }
    }

    const targetLlmConfig = {
      ...llmConfig,
      apiKey: activeApiKey
    };

    const isDefaultKey = !activeApiKey || activeApiKey === diskConfig.defaultLLMConf.apiKey;
    if (isDefaultKey) {
      const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
      if (!checkRateLimit(ip)) {
        logger.warn({ event: 'RATE_LIMIT_EXCEEDED', ip }, '默认 API Key 频次超限被拦截');
        return NextResponse.json({ 
          error: '⚠️ 访问受限：您当前使用的是系统默认共享 AI 配置，调用太频繁。请稍候再试（限制为 5 次/分钟），或在配置中设置您自有的 API Key 以解除限制。' 
        }, { status: 429 });
      }
    }

    // ── 提示词安全拦截防护 ──
    const isMalicious = checkPromptSecurity(systemPrompt, userPrompt, fields);
    if (isMalicious) {
      return NextResponse.json({ 
        error: '⚠️ 安全拦截：检测到潜在的提示词注入攻击或敏感配置泄露风险（禁止索要 env 环境变量、系统文件或执行越狱指令）。' 
      }, { status: 403 });
    }

    // ── 读取预处理产物 ──
    const record = await getFileRecord(md5);
    if (!record) {
      return NextResponse.json({ error: '未找到文件 MD5 登记记录' }, { status: 404 });
    }
    if (record.status !== 'done') {
      return NextResponse.json({ error: `该文件当前状态为 [${record.status}]，请等待预处理完成。` }, { status: 400 });
    }

    const outputDir = path.join(PREPROCESS_DIR, md5);
    let multimodalData = null;

    const ext = path.extname(record.fileName).toLowerCase();

    try {
      if (ext === '.pdf') {
        // 读取 PDF 文字层
        const textPath = path.join(outputDir, 'text.txt');
        const textContent = await fs.readFile(textPath, 'utf-8').catch(() => '');

        // 读取 PNG 截图并转换为 Base64
        const images = [];
        if (record.images && record.images.length > 0) {
          for (const imgRecord of record.images) {
            const imgFileName = path.basename(imgRecord.path);
            const imgFullPath = path.join(outputDir, imgFileName);
            
            const imgBuffer = await fs.readFile(imgFullPath);
            images.push({
              data: imgBuffer.toString('base64'),
              mimeType: imgRecord.mimeType
            });
          }
        }
        multimodalData = { text: textContent, images };

      } else if (ext === '.docx') {
        // 读取 DOCX 结构
        const structurePath = path.join(outputDir, 'structure.json');
        const rawStructure = await fs.readFile(structurePath, 'utf-8');
        const structure = JSON.parse(rawStructure);

        // 读取图片文件转化为 Base64 二进制流，还原图文交织结构
        const parts = [];
        for (const part of structure) {
          if (part.type === 'text') {
            parts.push(part);
          } else if (part.type === 'image') {
            const imgFileName = path.basename(part.path);
            const imgFullPath = path.join(outputDir, imgFileName);
            
            const imgBuffer = await fs.readFile(imgFullPath);
            parts.push({
              type: 'image',
              data: imgBuffer.toString('base64'),
              mimeType: part.mimeType
            });
          }
        }
        multimodalData = parts;
      } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        // 读取图片文件转化为 Base64 二进制流
        const imgName = `image${ext}`;
        const imgFullPath = path.join(outputDir, imgName);

        const imgBuffer = await fs.readFile(imgFullPath);
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

        multimodalData = {
          text: `[图片文件: ${record.fileName}]`,
          images: [{
            data: imgBuffer.toString('base64'),
            mimeType
          }]
        };
      }
    } catch (fsErr) {
      logger.error({
        event: 'READ_PREPROCESSED_ARTIFACTS_FAILED',
        file: { md5, ext },
        error: { message: fsErr.message, stack: fsErr.stack }
      }, '读取文档预处理产物失败');
      return NextResponse.json({ 
        error: `读取文档预处理产物失败: ${fsErr.code === 'ENOENT' ? '缓存文件已失效或被物理清理，请在队列中点击 [X] 移除该文档后重新上传解析。' : fsErr.message}` 
      }, { status: 500 });
    }

    // ── 调用大模型 ──
    const startTime = Date.now();
    logger.info({
      event: 'LLM_EXTRACTION_START',
      file: { md5, name: record.fileName, type: ext },
      fieldsCount: fields.length
    }, `🤖 [MD5: ${md5}] 提交大模型流式提取，字段数: ${fields.length}...`);
    
    const generator = extractCustomFieldsStream(multimodalData, {
      systemPrompt,
      userPrompt,
      fields,
      llmConfig: targetLlmConfig
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        };

        try {
          let doneResult = null;
          for await (const message of generator) {
            if (message.type === 'chunk') {
              send({ type: 'chunk', text: message.text });
            } else if (message.type === 'estimated') {
              send({ type: 'estimated', promptTokens: message.promptTokens });
            } else if (message.type === 'done') {
              doneResult = message;
            }
          }

          if (doneResult) {
            const durationMs = Date.now() - startTime;
            const data = doneResult.data;
            
            // ── 应用后置过滤引擎 (postFilters) ──
            let filteredData = data;
            let originalCount = Array.isArray(data) ? data.length : 0;
            let filteredCount = 0;
            if (postFilters && Array.isArray(postFilters) && postFilters.length > 0 && Array.isArray(data)) {
              const validResults = [];
              const droppedResults = [];
              for (const record of data) {
                let passed = true;
                for (const filter of postFilters) {
                  if (filter.condition) {
                    try {
                      const filterFn = new Function('record', filter.condition);
                      const result = filterFn(record);
                      if (!result) {
                        passed = false;
                        logger.info({ event: 'POST_FILTER_DROPPED', filterName: filter.name, record }, `记录被过滤引擎 [${filter.name}] 拦截`);
                        break;
                      }
                    } catch (err) {
                      logger.error({ event: 'POST_FILTER_ERROR', filterName: filter.name, error: err.message }, '执行后置过滤条件报错');
                    }
                  }
                }
                if (passed) validResults.push(record);
                else droppedResults.push(record);
              }
              filteredData = validResults;
              filteredCount = droppedResults.length;
              logger.info({ event: 'POST_FILTER_COMPLETE', originalCount, finalCount: validResults.length, droppedCount: droppedResults.length }, '后置过滤引擎执行完毕');
            }

            logger.info({
              event: 'LLM_EXTRACTION_SUCCESS',
              model: targetLlmConfig.model || diskConfig.defaultLLMConf.model,
              durationMs,
              metrics: {
                promptTokens: doneResult.usage?.promptTokens,
                completionTokens: doneResult.usage?.completionTokens,
                totalTokens: doneResult.usage?.totalTokens,
                recordsCount: filteredData.length,
                filteredCount
              }
            }, `🎉 AI 文档结构化数据流式提取成功完成，总用时: ${durationMs}ms`);

            send({
              type: 'done',
              data: filteredData,
              raw: doneResult.raw,
              tokenUsage: doneResult.usage,
              originalCount,
              filteredCount,
              durationMs
            });
          } else {
            throw new Error('大模型未返回有效的结构化数据');
          }
        } catch (err) {
          logger.error({
            event: 'EXTRACTION_HANDLER_EXCEPTION',
            error: { message: err.message, stack: err.stack }
          }, '提取过程发生异常');
          send({ type: 'error', error: err.message });
        } finally {
          controller.close();
        }
      }
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked'
      }
    });

  } catch (err) {
    logger.error({
      event: 'EXTRACTION_HANDLER_PREFLIGHT_EXCEPTION',
      error: { message: err.message, stack: err.stack }
    }, '提取前置检查异常');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const POST = withLogging(extractHandler);

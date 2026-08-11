import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';
import { getFileRecord } from '../../../lib/db.js';
import { readConfigFromDisk } from '../../../config/index.js';
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
    const jsonBody = await request.json();
    const { md5 } = jsonBody;
    const llmConfig = jsonBody.llmConfig || {};

    if (!md5) {
      return NextResponse.json({ error: '缺少待识别文档的 md5 参数' }, { status: 400 });
    }

    // 1. 物理安全凭证还原
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

    if (!activeApiKey) {
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
      apiKey: activeApiKey,
      baseURL: llmConfig.baseUrl || 'https://api.moonshot.cn/v1',
      timeout: 20000 // 智能推演配置为 20 秒超时保护
    });

    const isVision = isVisionModel(llmConfig.model) && imageBase64;
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

    // 5. 发送请求给大模型进行字段推演
    logger.info({
      event: 'AUTO_DETECT_FIELDS_START',
      model: llmConfig.model,
      isVision
    }, `🔮 启动 AI 一键自动识别字段，文档: ${record.fileName}`);

    const response = await openai.chat.completions.create({
      model: llmConfig.model || 'kimi-k2.7-code',
      messages,
      response_format: { type: 'json_object' }
    });

    const rawResult = response.choices[0]?.message?.content || '';
    let parsedJson = null;

    try {
      parsedJson = JSON.parse(rawResult.trim());
    } catch (parseErr) {
      logger.error({
        event: 'AUTO_DETECT_JSON_PARSE_FAILED',
        rawResult
      }, '解析大模型返回的字段 JSON 格式失败');
      throw new Error(`模型返回的数据格式不合规: ${parseErr.message}`);
    }

    const fieldsList = parsedJson.fields || [];
    if (!Array.isArray(fieldsList) || fieldsList.length === 0) {
      return NextResponse.json({
        success: false,
        error: '⚠️ AI 智能推演结束，未能从当前上传的文档首页中分析出合适的提取字段，请尝试手动添加。'
      });
    }

    // 清洗和校验 fieldsList 字段 (保证 isAdvancedOpen 为 false)
    const cleanedFields = fieldsList.map(f => ({
      key: (f.key || '').replace(/[^a-zA-Z0-9]/g, '') || `field_${Math.random().toString(36).substr(2, 5)}`,
      label: f.label || '新字段',
      desc: f.desc || '',
      example: f.example || '',
      isAdvancedOpen: false
    }));

    logger.info({
      event: 'AUTO_DETECT_FIELDS_SUCCESS',
      detectedCount: cleanedFields.length
    }, `🔮 AI 一键自动识别字段成功，生成了 ${cleanedFields.length} 个字段`);

    return NextResponse.json({
      success: true,
      fields: cleanedFields
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

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { readConfigFromDisk } from '../../../config/index.js';
import { checkRateLimit } from '../../../lib/rateLimit.js';
import { withLogging, logger } from '../../../lib/logger.js';

/**
 * 验证大模型可用性及多模态 Vision 支持
 */
async function testLlmHandler(request) {
  try {
    let { apiKey, baseUrl, model } = await request.json();

    // 1. 如果传入的是前端安全脱敏掩码，则从物理磁盘配置中动态还原真实 Key
    const isMask = apiKey === '••••••••••••••••••••';
    const diskConfig = readConfigFromDisk();
    
    if (isMask) {
      const match = diskConfig.defaultLLMList.find(c => c.model === model && c.baseUrl === baseUrl);
      if (match && match.apiKey) {
        apiKey = match.apiKey;
      } else {
        apiKey = diskConfig.defaultLLMConf.apiKey;
      }
    }

    const isDefaultKey = !apiKey || apiKey === diskConfig.defaultLLMConf.apiKey;
    if (isDefaultKey) {
      const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
      if (!checkRateLimit(ip)) {
        logger.warn({ event: 'RATE_LIMIT_EXCEEDED', ip }, '默认 API Key 频次超限被拦截');
        return NextResponse.json({ 
          error: '⚠️ 访问受限：您当前使用的是系统默认共享 AI 配置，调用太频繁。请稍候再试（限制为 5 次/分钟），或在配置中设置您自有的 API Key 以解除限制。' 
        }, { status: 429 });
      }
    }

    if (!apiKey) {
      apiKey = diskConfig.defaultLLMConf.apiKey;
    }
    if (!baseUrl) {
      baseUrl = diskConfig.defaultLLMConf.baseUrl;
    }
    if (!model) {
      model = diskConfig.defaultLLMConf.model;
    }

    if (!apiKey || !model) {
      return NextResponse.json({ error: 'apiKey 和 model 为必填参数' }, { status: 400 });
    }

    // 2. 初始化 OpenAI 客户端，增加 8 秒超时限制保护防止代理或配置错误导致长时间挂起
    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: baseUrl || 'https://api.openai.com/v1',
      timeout: 8000
    });

    let supportVision = false;

    // 3. 首先尝试进行多模态图片识别测试 (1x1 像素透明 PNG)
    try {
      const visionResponse = await openai.chat.completions.create({
        model: model,
        max_tokens: 5,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hi' },
              {
                type: 'image_url',
                image_url: {
                  url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
                }
              }
            ]
          }
        ]
      });
      if (visionResponse.choices[0]) {
        supportVision = true;
      }
    } catch (visionError) {
      logger.warn({
        event: 'TEST_LLM_VISION_FAILED',
        model,
        error: visionError.message
      }, '多模态 Vision 测试失败，将尝试纯文本可用性测试');
    }

    // 4. 如果 Vision 测试失败，测试纯文本连通性
    if (!supportVision) {
      try {
        const textResponse = await openai.chat.completions.create({
          model: model,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Hi' }]
        });
        
        if (!textResponse.choices[0]) {
          throw new Error('未返回有效响应');
        }
      } catch (textError) {
        // 说明模型连通性彻底失败
        logger.error({
          event: 'TEST_LLM_TEXT_FAILED',
          model,
          error: textError.message
        }, '大模型连通测试彻底失败');
        return NextResponse.json({ 
          success: false, 
          error: `大模型连接失败: ${textError.message}` 
        }, { status: 500 });
      }
    }

    logger.info({
      event: 'TEST_LLM_SUCCESS',
      model,
      supportVision
    }, '大模型连通测试成功');

    return NextResponse.json({
      success: true,
      supportVision,
      model,
      message: supportVision ? '模型连通成功，支持 Vision 多模态' : '模型连通成功，仅支持纯文本识别'
    });

  } catch (err) {
    logger.error({
      event: 'TEST_LLM_HANDLER_EXCEPTION',
      error: { message: err.message, stack: err.stack }
    }, '大模型连通测试异常');
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export const POST = withLogging(testLlmHandler);

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

import { AsyncLocalStorage } from 'async_hooks';
import pino from 'pino';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import 'pino-roll';
import 'pino-pretty';


import { config } from '../config/index.js';

export const als = new AsyncLocalStorage();

const isProd = config.system.nodeEnv === 'production';

export const logger = pino({
  level: config.system.logLevel || 'info',
  // 🔒 Redaction: Safe masking of sensitive and large data fields
  redact: {
    paths: [
      // API keys
      '*.apiKey',
      '*.api_key',
      '*.openai.apiKey',
      '*.openai.api_key',
      '*.llmConfig.apiKey',
      '*.llmConfig.api_key',
      '*.apiKey*',
      '*.api_key*',
      
      // Access tokens / credentials
      '*.accessToken',
      '*.access_token',
      '*.appSecret',
      '*.app_secret',
      '*.client_secret',
      '*.tenant_access_token',
      '*.tokenCache.token',
      '*.Authorization',
      '*.headers.Authorization',
      '*.app_id',
      '*.app_secret',
      
      // Large binary / base64 content
      '*.images[*].data',
      '*.data[*].data',
      '*.image_url.url',
      '*.multimodalData[*].data',
      '*.rawContent',
      '*.raw'
    ],
    censor: '[REDACTED]'
  },
  // Auto-merge context traceId
  mixin() {
    const store = als.getStore();
    return store ? { traceId: store.traceId, ip: store.ip } : {};
  },
  transport: isProd
    ? {
        target: 'pino-roll',
        options: {
          file: './logs/docex',
          frequency: 'daily',
          size: '10m',
          mkdir: true
        }
      }
    : {
        targets: [
          {
            target: 'pino-pretty',
            options: { colorize: true }
          },
          {
            target: 'pino-roll',
            options: {
              file: './logs/docex',
              frequency: 'daily',
              size: '10m',
              mkdir: true
            }
          }
        ]
      }
});

// Process-level fatal exception handlers
if (typeof process !== 'undefined') {
  process.on('uncaughtException', (err) => {
    logger.fatal({
      event: 'UNCAUGHT_EXCEPTION',
      error: {
        message: err.message,
        stack: err.stack
      }
    }, '💥 Uncaught Exception detected! Process will terminate.');
    // Force write
    logger.flush();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error({
      event: 'UNHANDLED_REJECTION',
      error: {
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined
      }
    }, '💥 Unhandled Rejection detected!');
  });
}

// Next.js Route Handler Wrapper
export function withLogging(handler) {
  return async (request, context) => {
    const traceId = request.headers.get('x-trace-id') || crypto.randomUUID();
    let ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    if (ip && ip.includes(',')) {
      ip = ip.split(',')[0].trim();
    }
    if (!ip) ip = '127.0.0.1';

    return als.run({ traceId, ip }, async () => {
      const url = new URL(request.url);
      
      // Ingress Log
      logger.info({
        event: 'API_INGRESS',
        method: request.method,
        path: url.pathname
      }, `📥 API Ingress: ${request.method} ${url.pathname}`);

      const startTime = Date.now();
      try {
        const response = await handler(request, context);
        const durationMs = Date.now() - startTime;

        // Success Log
        logger.info({
          event: 'API_SUCCESS',
          method: request.method,
          path: url.pathname,
          status: response.status,
          durationMs
        }, `📤 API Success: ${request.method} ${url.pathname} (${response.status}) in ${durationMs}ms`);

        // Propagate traceId back to frontend via response headers
        if (response instanceof Response) {
          try {
            response.headers.set('x-trace-id', traceId);
          } catch (e) {
            // Ignore if headers are read-only
          }
        }

        return response;
      } catch (error) {
        const durationMs = Date.now() - startTime;

        // Exception Log (Physical Boundary)
        logger.error({
          event: 'API_EXCEPTION',
          method: request.method,
          path: url.pathname,
          durationMs,
          error: {
            message: error.message,
            stack: error.stack,
            rawContent: error.raw || error.rawContent || null,
            usage: error.usage || null
          }
        }, `❌ API Exception: ${request.method} ${url.pathname} in ${durationMs}ms`);

        return NextResponse.json({
          error: `服务器内部错误，Trace ID: ${traceId}`,
          message: error.message
        }, { 
          status: 500,
          headers: { 'x-trace-id': traceId }
        });
      }
    });
  };
}

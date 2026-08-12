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
import wpsService from '../../../services/wpsService.js';
import { appendToFeishu, getFeishuSchema, getFeishuLastSerialNumber } from '../../../services/feishuService.js';
import { withLogging, logger } from '../../../lib/logger.js';
import { readConfigFromDisk } from '../../../config/index.js';

async function pushHandler(request) {
  try {
    const startTime = Date.now();
    const jsonBody = await request.json();
    const { provider, fileId, appToken, tableId, issues, fieldMapping, autoNumber, appId } = jsonBody;
    let appSecret = jsonBody.appSecret;

    // 掩码还原逻辑
    if (appSecret === '••••••••••••••••••••') {
      const diskConfig = readConfigFromDisk();
      const match = diskConfig.parsedTableConfigs.find(c => c.appId === appId);
      if (match && match.appSecret) {
        appSecret = match.appSecret;
      }
    }

    if (!issues || issues.length === 0) {
      return NextResponse.json({ error: '没有需要推送的记录' }, { status: 400 });
    }

    const targetProvider = provider || 'wps';
    const resolvedMapping = { ...fieldMapping };
    const modifiedIssues = issues.map(item => ({ ...item }));

    // ── 自动编号逻辑 ──
    if (autoNumber) {
      let serialFieldName = null;

      // 1. 获取目标表的字段，检索是否存在“序号”列
      try {
        if (targetProvider === 'wps' && fileId) {
          wpsService.setFileId(fileId);
          const sheet = await wpsService.getSchema(null, false, appId, appSecret);
          const serialField = sheet.fields.find(f => 
            ['序号', 'no', 'no.', 'id', 'index'].includes(f.name.toLowerCase())
          );
          if (serialField) serialFieldName = serialField.name;
        } else if (targetProvider === 'feishu' && appToken && tableId) {
          const sheet = await getFeishuSchema(appToken, tableId, appId, appSecret);
          const serialField = sheet.fields.find(f => 
            ['序号', 'no', 'no.', 'id', 'index'].includes(f.name.toLowerCase())
          );
          if (serialField) serialFieldName = serialField.name;
        }
      } catch (e) {
        logger.warn({
          event: 'GET_SERIAL_FIELD_FAILED',
          provider: targetProvider,
          error: e.message
        }, '获取自动编号字段失败，跳过自增');
      }

      // 2. 如果存在“序号”列，获取最新值并自动编号
      if (serialFieldName) {
        let lastNum = 0;
        try {
          if (targetProvider === 'wps' && fileId) {
            lastNum = await wpsService.getWpsLastSerialNumber(fileId, serialFieldName, appId, appSecret);
          } else if (targetProvider === 'feishu' && appToken && tableId) {
            lastNum = await getFeishuLastSerialNumber(appToken, tableId, serialFieldName, appId, appSecret);
          }
        } catch (e) {
          logger.warn({
            event: 'GET_LAST_SERIAL_NUM_FAILED',
            provider: targetProvider,
            fieldName: serialFieldName,
            error: e.message
          }, '查询最后一行序号值出错，从0开始自增');
        }

        // 为每行分配新编号并绑定映射
        modifiedIssues.forEach((issue, idx) => {
          const nextVal = lastNum + idx + 1;
          // 新增一个内部自增字段 key 'autoSerialVal'
          issue['autoSerialVal'] = String(nextVal);
        });

        // 强行插入列名映射
        resolvedMapping[serialFieldName] = 'autoSerialVal';
        logger.info({
          event: 'AUTO_NUMBER_ACTIVE',
          fieldName: serialFieldName,
          startNumber: lastNum + 1
        }, `ℹ️ [自动编号] 激活，自动匹配表格列 "${serialFieldName}"，起始编号: ${lastNum + 1}`);
      }
    }

    // ── 执行数据追加 ──
    if (targetProvider === 'wps') {
      if (!fileId) return NextResponse.json({ error: '缺少 fileId' }, { status: 400 });
      wpsService.setFileId(fileId);
      const result = await wpsService.appendRecords(modifiedIssues, null, resolvedMapping, appId, appSecret);
      
      const durationMs = Date.now() - startTime;
      logger.info({
        event: 'AUDIT_DATA_PUSH',
        operator: request.headers.get('x-operator') || 'User',
        provider: 'wps',
        fileId,
        sheetName: wpsService.sheetName || '默认数据表',
        insertedCount: issues.length,
        durationMs
      }, `成功将提取的数据 [${issues.length} 条] 推送至云端 WPS 多维表格 [${wpsService.sheetName || '默认数据表'}]，表格 ID: [${fileId}]，耗时 [${durationMs}ms]`);

      return NextResponse.json({ success: true, insertedCount: issues.length, result });

    } else if (targetProvider === 'feishu') {
      if (!appToken || !tableId) {
        return NextResponse.json({ error: '缺少 appToken 或 tableId' }, { status: 400 });
      }
      const result = await appendToFeishu(modifiedIssues, appToken, tableId, resolvedMapping, appId, appSecret);
      
      const durationMs = Date.now() - startTime;
      logger.info({
        event: 'AUDIT_DATA_PUSH',
        operator: request.headers.get('x-operator') || 'User',
        provider: 'feishu',
        appToken,
        tableId,
        insertedCount: issues.length,
        durationMs
      }, `成功将提取的数据 [${issues.length} 条] 推送至云端飞书多维表格，数据表 ID: [${tableId}]，耗时 [${durationMs}ms]`);

      return NextResponse.json({ success: true, insertedCount: issues.length, result });

    } else {
      return NextResponse.json({ error: '不支持的 provider' }, { status: 400 });
    }

  } catch (err) {
    const detailMsg = err.response?.data?.msg || err.response?.data?.message || err.message;
    logger.error({
      event: 'PUSH_HANDLER_EXCEPTION',
      provider,
      error: { message: err.message, stack: err.stack, detail: detailMsg }
    }, '❌ 推送数据到多维表格失败');
    return NextResponse.json({ error: detailMsg }, { status: 500 });
  }
}

export const POST = withLogging(pushHandler);

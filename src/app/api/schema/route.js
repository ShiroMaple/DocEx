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
import { getFeishuSchema } from '../../../services/feishuService.js';
import { withLogging, logger } from '../../../lib/logger.js';
import { readConfigFromDisk } from '../../../config/index.js';

async function schemaHandler(request) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider')?.trim() || 'wps';
  const force = searchParams.get('force') === 'true';

  try {
    if (provider === 'wps') {
      const fileId = searchParams.get('fileId')?.trim();
      let appId = searchParams.get('appId')?.trim() || null;
      let appSecret = searchParams.get('appSecret')?.trim() || null;
      
      // 掩码还原逻辑
      if (appSecret === '••••••••••••••••••••') {
        const diskConfig = readConfigFromDisk();
        const match = diskConfig.parsedTableConfigs.find(c => c.appId === appId);
        if (match && match.appSecret) {
          appSecret = match.appSecret;
        }
      }

      if (!fileId) {
        return NextResponse.json({ error: '缺少 fileId 参数' }, { status: 400 });
      }
      
      wpsService.setFileId(fileId);
      const sheet = await wpsService.getSchema(null, force, appId, appSecret);
      const fields = sheet.fields.map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        isReadOnly: ['CreatedTime', 'CreatedBy', 'Creator', 'LastModifiedTime', 'LastModifiedBy', 'Modifier'].includes(f.type)
      }));
      return NextResponse.json({ sheetName: sheet.name, fields });

    } else if (provider === 'feishu') {
      const appToken = searchParams.get('appToken')?.trim();
      const tableId = searchParams.get('tableId')?.trim();
      let appId = searchParams.get('appId')?.trim() || null;
      let appSecret = searchParams.get('appSecret')?.trim() || null;

      // 掩码还原逻辑
      if (appSecret === '••••••••••••••••••••') {
        const diskConfig = readConfigFromDisk();
        const match = diskConfig.parsedTableConfigs.find(c => c.appId === appId);
        if (match && match.appSecret) {
          appSecret = match.appSecret;
        }
      }

      if (!appToken || !tableId) {
        return NextResponse.json({ error: '缺少 appToken 或 tableId 参数' }, { status: 400 });
      }
      
      const sheet = await getFeishuSchema(appToken, tableId, appId, appSecret);
      return NextResponse.json({ sheetName: sheet.name, fields: sheet.fields });

    } else {
      return NextResponse.json({ error: '不支持的 provider' }, { status: 400 });
    }
  } catch (err) {
    logger.error({
      event: 'SCHEMA_HANDLER_EXCEPTION',
      provider,
      error: { message: err.message, stack: err.stack }
    }, '获取 Schema 失败');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const GET = withLogging(schemaHandler);

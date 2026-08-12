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
import { getResolvedPreset, getSafePresetForClient } from '../../../../config/presets.js';
import { withLogging, logger } from '../../../../lib/logger.js';

/**
 * GET /api/presets/[id]
 * 获取特定 ID 的预设完整配置（服务端合并 .env 之后）
 */
async function getPresetHandler(request, context) {
  try {
    const params = await context.params;
    const presetId = params.id;

    if (!presetId) {
      return NextResponse.json({ error: '缺少 presetId 参数' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const safeOnly = searchParams.get('safe') === 'true';

    if (safeOnly) {
      const safePreset = getSafePresetForClient(presetId);
      if (!safePreset) {
        return NextResponse.json({ error: `未找到预设 [${presetId}]` }, { status: 404 });
      }
      return NextResponse.json({ preset: safePreset });
    }

    const resolvedPreset = getResolvedPreset(presetId);
    if (!resolvedPreset) {
      return NextResponse.json({ error: `未找到预设 [${presetId}]` }, { status: 404 });
    }

    logger.info({
      event: 'PRESET_LOADED',
      presetId,
      department: resolvedPreset.department
    }, `加载预设配置成功: ${resolvedPreset.name}`);

    return NextResponse.json({ preset: resolvedPreset });

  } catch (err) {
    logger.error({
      event: 'GET_PRESET_EXCEPTION',
      error: { message: err.message, stack: err.stack }
    }, '获取预设配置失败');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const GET = withLogging(getPresetHandler);

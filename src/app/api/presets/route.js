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
import { getAllPresetsList } from '../../../config/presets.js';
import { withLogging, logger } from '../../../lib/logger.js';

/**
 * GET /api/presets
 * 获取物理磁盘 presets/ 目录下所有已注册的预设列表信息
 */
async function getAllPresetsHandler() {
  try {
    const list = getAllPresetsList();
    logger.info({
      event: 'PRESETS_LIST_LOADED',
      count: list.length
    }, `成功加载物理预设列表，共 ${list.length} 个`);

    return NextResponse.json({ presets: list });
  } catch (err) {
    logger.error({
      event: 'GET_PRESETS_LIST_EXCEPTION',
      error: { message: err.message, stack: err.stack }
    }, '获取预设列表失败');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const GET = withLogging(getAllPresetsHandler);

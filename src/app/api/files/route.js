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
import { readDb, deleteFileRecord } from '../../../lib/db.js';
import { withLogging, logger } from '../../../lib/logger.js';
import { loadRawPresetFromDisk } from '../../../config/presets.js';

/**
 * 获取文件解析历史列表（按当前 presetId 隔离并受 allowViewCachedFiles 权限限制）
 */
async function getFilesHandler(request) {
  try {
    const { searchParams } = new URL(request.url);
    const presetId = searchParams.get('presetId') || 'default';

    // 读取当前预设的配置
    const presetConf = loadRawPresetFromDisk(presetId);
    const allowViewCachedFiles = Boolean(presetConf?.allowViewCachedFiles);

    // 如果未开启历史缓存可见性，直接返回空列表
    if (!allowViewCachedFiles) {
      return NextResponse.json({
        files: [],
        allowViewCachedFiles: false,
        presetId
      });
    }

    const db = await readDb();
    // 仅过滤出包含当前 presetId 标签的文件，并按上传时间倒序返回
    const files = (db.files || [])
      .filter(f => Array.isArray(f.presets) && f.presets.includes(presetId))
      .sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime));

    return NextResponse.json({
      files,
      allowViewCachedFiles: true,
      presetId
    });
  } catch (err) {
    logger.error({
      event: 'GET_FILES_HANDLER_EXCEPTION',
      error: { message: err.message, stack: err.stack }
    }, '获取文件列表失败');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * 手动删除特定 MD5 记录：若多预设引用则摘除标签，无其他引用则彻底物理清理
 */
async function deleteFileHandler(request) {
  try {
    const { searchParams } = new URL(request.url);
    const md5 = searchParams.get('md5');
    const presetId = searchParams.get('presetId') || undefined;

    if (!md5) {
      return NextResponse.json({ error: '缺少 md5 参数' }, { status: 400 });
    }

    const result = await deleteFileRecord(md5, presetId);
    if (!result.success) {
      return NextResponse.json({ error: result.error || '未找到该 MD5 记录' }, { status: 404 });
    }

    if (result.physicallyDeleted) {
      logger.info({
        event: 'FILE_RECORD_DELETED',
        md5,
        presetId
      }, `彻底删除 MD5 记录及物理文件成功: ${md5}`);
      return NextResponse.json({
        success: true,
        physicallyDeleted: true,
        message: '文件已彻底从服务器清理'
      });
    } else {
      logger.info({
        event: 'FILE_TAG_REMOVED',
        md5,
        removedPreset: presetId,
        remainingPresets: result.remainingPresets
      }, `已从预设 [${presetId}] 移除文档关联 (仍被其他预设引用): ${md5}`);
      return NextResponse.json({
        success: true,
        removedTagOnly: true,
        remainingPresets: result.remainingPresets,
        message: `已从当前预设中移除，物理文件因其他预设引用已保留`
      });
    }
  } catch (err) {
    logger.error({
      event: 'DELETE_FILE_HANDLER_EXCEPTION',
      error: { message: err.message, stack: err.stack }
    }, '删除文件记录失败');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const GET = withLogging(getFilesHandler);
export const DELETE = withLogging(deleteFileHandler);

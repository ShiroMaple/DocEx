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
import { fileURLToPath } from 'url';
import { calculateMd5, triggerPreprocessing } from '../../../lib/preprocess.js';
import { getFileRecord, saveFileRecord, runTtlCleanup } from '../../../lib/db.js';
import { withLogging, logger } from '../../../lib/logger.js';
import { getAllRawPresets, loadRawPresetFromDisk } from '../../../config/presets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.resolve(process.cwd(), 'data/uploads');

async function uploadHandler(request) {
  try {
    // 动态获取各预设设定的缓存天数并执行 TTL 清理
    try {
      const allPresets = getAllRawPresets();
      const presetsDaysMap = {};
      allPresets.forEach(p => {
        presetsDaysMap[p.id] = typeof p.cacheRetentionDays === 'number' ? p.cacheRetentionDays : (Number(p.cacheRetentionDays) || 7);
      });
      await runTtlCleanup(presetsDaysMap);
    } catch (e) {
      logger.error({ 
        event: 'TTL_CLEANUP_ERROR', 
        error: { message: e.message, stack: e.stack } 
      }, 'TTL cleanup failed');
    }

    const startTime = Date.now();
    const formData = await request.formData();
    const file = formData.get('file');
    const presetId = formData.get('presetId') || 'default';

    // 获取当前预设设定的缓存天数 (默认 7 天，0 为不缓存)
    let cacheRetentionDays = 7;
    try {
      const presetConf = loadRawPresetFromDisk(presetId);
      if (presetConf && presetConf.cacheRetentionDays !== undefined) {
        cacheRetentionDays = Number(presetConf.cacheRetentionDays);
      }
    } catch (_) {}

    if (!file) {
      return NextResponse.json({ error: '未上传文件' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: '上传的文件不能为空（0字节）' }, { status: 400 });
    }

    const fileName = file.name;
    const ext = path.extname(fileName).toLowerCase();

    if (!['.pdf', '.docx', '.jpg', '.jpeg', '.png'].includes(ext)) {
      return NextResponse.json({ error: '仅支持 PDF、DOCX 及图片 (JPG/JPEG/PNG) 格式' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // 1. 计算 MD5
    const md5 = calculateMd5(buffer);
    
    // 2. 检查 MD5 是否已存在且物理文件完备
    const existing = await getFileRecord(md5);
    let physicalExists = false;
    if (existing && existing.status === 'done') {
      const PREPROCESS_DIR = path.resolve(process.cwd(), 'data/preprocessed');
      const targetDir = path.join(PREPROCESS_DIR, md5);
      try {
        if (ext === '.pdf') {
          await fs.access(path.join(targetDir, 'text.txt'));
        } else if (ext === '.docx') {
          await fs.access(path.join(targetDir, 'structure.json'));
        } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
          await fs.access(path.join(targetDir, `image${ext}`));
        }
        physicalExists = true;
      } catch {
        logger.warn({
          event: 'PREPROCESS_PHYSICAL_MISSING',
          file: { md5, ext }
        }, `⚠️ [MD5: ${md5}] 数据库标记已处理，但物理文件缺失，将重新触发解析。`);
      }
    }

    if (existing && (existing.status !== 'done' || physicalExists)) {
      // 补充/更新当前 preset 标签关联（若 cacheRetentionDays > 0）
      const updatedExisting = await saveFileRecord(existing, presetId, cacheRetentionDays);

      const durationMs = Date.now() - startTime;
      logger.info({
        event: 'AUDIT_DOCUMENT_UPLOAD',
        operator: request.headers.get('x-operator') || 'User',
        fileName,
        fileSize: file.size,
        md5,
        presetId,
        cacheHit: true,
        durationMs
      }, `用户上传了文档 [${fileName}]，大小为 [${(file.size / 1024 / 1024).toFixed(2)} MB]，耗时 [${durationMs}ms] (已复用历史预处理缓存)`);

      logger.info({
        event: 'PREPROCESS_CACHE_HIT',
        file: { md5, ext },
        presetId,
        status: existing.status
      }, `🎯 [MD5: ${md5}] 文件已存在且已被预处理，直接复用记录。`);
      return NextResponse.json({ 
        success: true, 
        isDuplicate: true, 
        record: updatedExisting 
      });
    }

    // 3. 物理保存原始文件
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const originalPath = path.join(UPLOAD_DIR, `${md5}${ext}`);
    await fs.writeFile(originalPath, buffer);

    // 4. 创建初始数据库登记（带预设标签）
    const record = await saveFileRecord({
      md5,
      fileName,
      uploadTime: new Date().toISOString(),
      status: 'processing',
      progress: 0,
      originalPath,
      error: null
    }, presetId, cacheRetentionDays);

    // 5. 后台启动异步预处理脚本
    triggerPreprocessing(md5);

    const durationMs = Date.now() - startTime;
    logger.info({
      event: 'AUDIT_DOCUMENT_UPLOAD',
      operator: request.headers.get('x-operator') || 'User',
      fileName,
      fileSize: file.size,
      md5,
      presetId,
      cacheHit: false,
      durationMs
    }, `用户上传了新文档 [${fileName}]，大小为 [${(file.size / 1024 / 1024).toFixed(2)} MB]，耗时 [${durationMs}ms]，后台异步预处理中`);

    return NextResponse.json({ 
      success: true, 
      isDuplicate: false, 
      record 
    });

  } catch (err) {
    logger.error({
      event: 'UPLOAD_PROCESSING_ERROR',
      error: { message: err.message, stack: err.stack }
    }, '上传与解析失败');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const POST = withLogging(uploadHandler);

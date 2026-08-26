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

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(process.cwd(), 'data/db.json');
const PREPROCESS_DIR = path.resolve(process.cwd(), 'data/preprocessed');
const UPLOAD_DIR = path.resolve(process.cwd(), 'data/uploads');

// Ensure database file and directories exist
async function initDb() {
  await fs.mkdir(PREPROCESS_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify({ files: [] }, null, 2), 'utf-8');
  }
}

let dbMutex = Promise.resolve();

async function enqueue(op) {
  return new Promise((resolve, reject) => {
    dbMutex = dbMutex.then(async () => {
      try {
        const res = await op();
        resolve(res);
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Windows EPERM/EBUSY retry helper
async function renameWithRetry(oldPath, newPath, retries = 5, delay = 50) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.rename(oldPath, newPath);
      return;
    } catch (err) {
      if ((err.code === 'EPERM' || err.code === 'EBUSY') && i < retries - 1) {
        console.warn(`⚠️ Rename failed with ${err.code}, retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
}

// Internal raw read/write helpers (NOT enqueued)
function _normalizeFile(file) {
  if (!file) return file;
  const uploadTime = file.uploadTime || new Date().toISOString();
  let presetMap = file.presetMap;

  if (!presetMap || typeof presetMap !== 'object' || Object.keys(presetMap).length === 0) {
    presetMap = {};
    if (Array.isArray(file.presets) && file.presets.length > 0) {
      file.presets.forEach(p => {
        presetMap[p] = uploadTime;
      });
    } else {
      presetMap['default'] = uploadTime;
    }
  }

  const presets = Object.keys(presetMap);
  return {
    ...file,
    uploadTime,
    presetMap,
    presets
  };
}

async function _readDb() {
  await initDb();
  const content = await fs.readFile(DB_PATH, 'utf-8');
  const parsed = JSON.parse(content);
  parsed.files = (parsed.files || []).map(_normalizeFile);
  return parsed;
}

async function _writeDb(data) {
  await initDb();
  const tempPath = `${DB_PATH}.tmp`;
  const normalizedData = {
    ...data,
    files: (data.files || []).map(_normalizeFile)
  };
  const jsonStr = JSON.stringify(normalizedData, null, 2);
  await fs.writeFile(tempPath, jsonStr, 'utf-8');
  await renameWithRetry(tempPath, DB_PATH);
}

// Public APIs (enqueued to prevent race conditions and lock errors)
export async function readDb() {
  return enqueue(async () => {
    return _readDb();
  });
}

export async function writeDb(data) {
  return enqueue(async () => {
    return _writeDb(data);
  });
}

/**
 * 增加或更新文件记录，并根据当前 preset 及其缓存天数维护标签引用
 * @param {object} record 文件记录对象
 * @param {string|null} [currentPresetId] 当前上传使用的预设 ID (仅在上传/绑定时显式传入，内部更新进度时传 null)
 * @param {number} [cacheRetentionDays] 预设设定的缓存有效期(天)，0 为不缓存
 */
export async function saveFileRecord(record, currentPresetId = null, cacheRetentionDays = 7) {
  return enqueue(async () => {
    const db = await _readDb();
    const index = db.files.findIndex(f => f.md5 === record.md5);
    const now = new Date().toISOString();

    let existingFile = index >= 0 ? db.files[index] : null;
    let presetMap = existingFile ? { ...existingFile.presetMap } : {};

    // 仅当显式传入了 currentPresetId 且 cacheRetentionDays > 0 时，才添加/更新该预设标签
    if (currentPresetId && Number(cacheRetentionDays) !== 0) {
      presetMap[currentPresetId] = now;
    }

    const newRecord = _normalizeFile({
      ...(existingFile || {}),
      ...record,
      uploadTime: (existingFile && existingFile.uploadTime) || record.uploadTime || now,
      presetMap
    });

    if (index >= 0) {
      db.files[index] = newRecord;
    } else {
      db.files.push(newRecord);
    }

    await _writeDb(db);
    return newRecord;
  });
}

/**
 * 获取特定 MD5 的记录
 */
export async function getFileRecord(md5) {
  return enqueue(async () => {
    const db = await _readDb();
    return db.files.find(f => f.md5 === md5) || null;
  });
}

/**
 * 删除文件记录或摘除特定预设标签：
 * - 若文件关联多个预设标签且指定了 currentPresetId，仅摘除该 presetId 标签；
 * - 若文件仅剩 1 个标签或未指定 currentPresetId，彻底物理清理文件并删除记录。
 * @param {string} md5 文件 MD5
 * @param {string} [currentPresetId] 当前操作所在的预设 ID
 */
export async function deleteFileRecord(md5, currentPresetId) {
  return enqueue(async () => {
    const db = await _readDb();
    const record = db.files.find(f => f.md5 === md5);
    
    if (!record) {
      return { success: false, error: '未找到该 MD5 记录' };
    }

    const normalized = _normalizeFile(record);
    let presetMap = { ...normalized.presetMap };

    if (currentPresetId && presetMap[currentPresetId]) {
      delete presetMap[currentPresetId];
    }

    const remainingPresets = Object.keys(presetMap);

    // 若还存在其他预设引用，仅摘标签更新记录
    if (currentPresetId && remainingPresets.length > 0) {
      normalized.presetMap = presetMap;
      normalized.presets = remainingPresets;
      const index = db.files.findIndex(f => f.md5 === md5);
      db.files[index] = normalized;
      await _writeDb(db);
      return {
        success: true,
        removedTagOnly: true,
        removedPreset: currentPresetId,
        remainingPresets
      };
    }

    // 否则无任何引用，彻底物理清理
    if (normalized.originalPath) {
      await fs.unlink(normalized.originalPath).catch(() => {});
    }
    
    const dirPath = path.join(PREPROCESS_DIR, md5);
    await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {});
    
    db.files = db.files.filter(f => f.md5 !== md5);
    await _writeDb(db);

    return {
      success: true,
      physicallyDeleted: true
    };
  });
}

/**
 * 动态 TTL 清理任务：根据各预设配置的 cacheRetentionDays 自动清理超期标签与无引用物理文件
 * @param {object} [presetRetentionDaysMap] 各预设的天数映射，如 { default: 7, hse: 3 }
 */
export async function runTtlCleanup(presetRetentionDaysMap = {}) {
  return enqueue(async () => {
    const db = await _readDb();
    const now = Date.now();
    const keptFiles = [];

    for (const file of db.files) {
      const normalized = _normalizeFile(file);
      const presetMap = { ...normalized.presetMap };
      let hasChanges = false;

      // 检查每个预设标签是否过期
      for (const [presetId, tagTime] of Object.entries(presetMap)) {
        const retentionDays = typeof presetRetentionDaysMap[presetId] === 'number'
          ? presetRetentionDaysMap[presetId]
          : 7; // 默认 7 天

        const tagTimestamp = new Date(tagTime).getTime();
        const maxDurationMs = retentionDays * 24 * 60 * 60 * 1000;

        // 0 天或超期 -> 移除该预设标签
        if (retentionDays === 0 || (now - tagTimestamp > maxDurationMs)) {
          delete presetMap[presetId];
          hasChanges = true;
        }
      }

      const remainingPresets = Object.keys(presetMap);

      if (remainingPresets.length === 0) {
        // 无任何有效预设引用，执行物理删除
        logger.info({
          event: 'TTL_DOCUMENT_PURGED',
          md5: normalized.md5,
          fileName: normalized.fileName
        }, `🧹 TTL 清理任务：文档 [${normalized.fileName}] (${normalized.md5}) 失去所有预设引用，已彻底物理清理`);

        if (normalized.originalPath) {
          await fs.unlink(normalized.originalPath).catch(() => {});
        }
        const dirPath = path.join(PREPROCESS_DIR, normalized.md5);
        await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {});
      } else {
        if (hasChanges) {
          normalized.presetMap = presetMap;
          normalized.presets = remainingPresets;
        }
        keptFiles.push(normalized);
      }
    }

    if (keptFiles.length !== db.files.length || keptFiles.some(f => f.presets.length !== (db.files.find(o => o.md5 === f.md5)?.presets?.length))) {
      db.files = keptFiles;
      await _writeDb(db);
    }
  });
}

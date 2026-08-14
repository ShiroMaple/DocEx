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
async function _readDb() {
  await initDb();
  const content = await fs.readFile(DB_PATH, 'utf-8');
  return JSON.parse(content);
}

async function _writeDb(data) {
  await initDb();
  const tempPath = `${DB_PATH}.tmp`;
  const jsonStr = JSON.stringify(data, null, 2);
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
 * 增加或更新文件记录
 */
export async function saveFileRecord(record) {
  return enqueue(async () => {
    const db = await _readDb();
    const index = db.files.findIndex(f => f.md5 === record.md5);
    
    const newRecord = {
      ...record,
      uploadTime: record.uploadTime || new Date().toISOString()
    };

    if (index >= 0) {
      db.files[index] = { ...db.files[index], ...newRecord };
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
 * 删除文件记录并清理物理文件
 */
export async function deleteFileRecord(md5) {
  return enqueue(async () => {
    const db = await _readDb();
    const record = db.files.find(f => f.md5 === md5);
    
    if (record) {
      // 1. 删除上传的原始文件
      if (record.originalPath) {
        await fs.unlink(record.originalPath).catch(() => {});
      }
      
      // 2. 删除预处理文件夹及其内容
      const dirPath = path.join(PREPROCESS_DIR, md5);
      await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {});
      
      // 3. 从 db.json 中移除
      db.files = db.files.filter(f => f.md5 !== md5);
      await _writeDb(db);
      return true;
    }
    return false;
  });
}

/**
 * 7天 TTL 清理任务：自动清理超期的记录和预处理产物
 */
export async function runTtlCleanup() {
  return enqueue(async () => {
    const db = await _readDb();
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    
    const keptFiles = [];
    
    for (const file of db.files) {
      const uploadTime = new Date(file.uploadTime).getTime();
      if (now - uploadTime > SEVEN_DAYS_MS) {
        console.log(`🧹 TTL Cleanup: 文件 ${file.fileName} (${file.md5}) 已超期 7 天，自动清理中...`);
        // 清理原始文件
        if (file.originalPath) {
          await fs.unlink(file.originalPath).catch(() => {});
        }
        // 清理预处理文件夹
        const dirPath = path.join(PREPROCESS_DIR, file.md5);
        await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {});
      } else {
        keptFiles.push(file);
      }
    }

    if (keptFiles.length !== db.files.length) {
      db.files = keptFiles;
      await _writeDb(db);
    }
  });
}

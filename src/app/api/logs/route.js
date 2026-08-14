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
import fs from 'fs';
import path from 'path';

const LOGS_DIR = path.resolve(process.cwd(), 'logs');

// 判定日志类别
function getLogCategory(event) {
  if (!event) return 'SYSTEM';
  const ev = event.toUpperCase();
  if (
    ev.startsWith('AUDIT_') ||
    ev === 'FILE_RECORD_DELETED' ||
    ev.startsWith('WPS_') ||
    ev.startsWith('FEISHU_') ||
    ev === 'PRESET_LOADED' ||
    ev === 'PRESETS_LIST_LOADED'
  ) {
    return 'AUDIT';
  }
  return 'SYSTEM';
}

// 转换级别为文本
function getLogLevelName(levelNum) {
  if (levelNum >= 60) return 'fatal';
  if (levelNum >= 50) return 'error';
  if (levelNum >= 40) return 'warn';
  if (levelNum >= 30) return 'info';
  return 'debug';
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const keyword = (url.searchParams.get('keyword') || '').trim().toLowerCase();
    const level = (url.searchParams.get('level') || '').trim().toLowerCase();
    const type = (url.searchParams.get('type') || '').trim().toUpperCase(); // ALL, AUDIT, SYSTEM
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);

    if (!fs.existsSync(LOGS_DIR)) {
      return NextResponse.json({ data: [], total: 0, page, pageSize });
    }

    // 1. 读取并按 mtime 倒序排列所有日志文件
    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.startsWith('docex') && f.endsWith('.log'))
      .map(f => {
        const filePath = path.join(LOGS_DIR, f);
        const stat = fs.statSync(filePath);
        return { path: filePath, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    const allLines = [];
    const MAX_LINES = 5000;

    for (const fileObj of files) {
      if (allLines.length >= MAX_LINES) break;
      const content = fs.readFileSync(fileObj.path, 'utf-8');
      const lines = content.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line) {
          allLines.push(line);
          if (allLines.length >= MAX_LINES) break;
        }
      }
    }

    // 2. 解析 JSON 并关联 traceId 下的 operator
    const parsedLogs = [];
    const traceOperatorMap = {};

    allLines.forEach(lineStr => {
      try {
        const logObj = JSON.parse(lineStr);
        const traceId = logObj.traceId;
        const operatorObj = logObj.operator;

        if (traceId && operatorObj && operatorObj !== 'User' && operatorObj !== 'Guest') {
          traceOperatorMap[traceId] = operatorObj;
        }

        parsedLogs.push(logObj);
      } catch (e) {
        // 忽略非法行
      }
    });

    // 3. 结构化标准化字段
    const formattedLogs = parsedLogs.map(log => {
      const levelName = getLogLevelName(log.level || 30);
      const category = getLogCategory(log.event);
      const traceId = log.traceId || '';
      
      const operator = log.operator || traceOperatorMap[traceId] || 'User';

      const metadata = { ...log };
      const excludeKeys = ['level', 'time', 'pid', 'hostname', 'msg', 'traceId', 'event', 'operator', 'ip'];
      excludeKeys.forEach(k => delete metadata[k]);

      return {
        time: log.time,
        level: levelName,
        type: category,
        action: log.event || log.method || 'SYSTEM_EVENT',
        msg: log.msg || '',
        traceId,
        ip: log.ip || '127.0.0.1',
        operator,
        metadata
      };
    });

    // 4. 进行多重条件过滤
    let filtered = formattedLogs;

    if (type && type !== 'ALL') {
      filtered = filtered.filter(item => item.type === type);
    }

    if (level && level !== 'all') {
      filtered = filtered.filter(item => item.level === level);
    }

    if (keyword) {
      filtered = filtered.filter(item => {
        return (
          item.msg.toLowerCase().includes(keyword) ||
          item.ip.toLowerCase().includes(keyword) ||
          item.operator.toLowerCase().includes(keyword) ||
          item.traceId.toLowerCase().includes(keyword) ||
          item.action.toLowerCase().includes(keyword)
        );
      });
    }

    const total = filtered.length;
    const startIdx = (page - 1) * pageSize;
    const paginatedData = filtered.slice(startIdx, startIdx + pageSize);

    return NextResponse.json({
      data: paginatedData,
      total,
      page,
      pageSize
    });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

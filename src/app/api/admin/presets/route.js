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
import { withLogging, logger } from '../../../../lib/logger.js';
import {
  getAllRawPresets,
  savePresetToDisk,
  deletePresetFromDisk,
  getPresetAuxiliaryData,
  loadRawPresetFromDisk
} from '../../../../config/presets.js';

/**
 * GET: 获取所有物理原始预设列表及关联辅助数据 (fields/tables)
 */
export const GET = withLogging(async (request) => {
  const presets = getAllRawPresets();
  const { fieldsGroups, tableConfigs, llmConfigs, availableEnvKeys } = getPresetAuxiliaryData();

  logger.info({
    event: 'ADMIN_PRESETS_FETCHED',
    operator: 'Admin',
    count: presets.length
  }, `🛠️ 管理员获取预设列表成功，共 ${presets.length} 个预设`);

  return NextResponse.json({
    success: true,
    presets,
    fieldsGroups,
    tableConfigs,
    llmConfigs,
    availableEnvKeys
  });
});

/**
 * POST: 创建全新预设 (支持基于现有预设克隆或模板创建)
 */
export const POST = withLogging(async (request) => {
  const body = await request.json();
  const { id, name, department, cloneFromId, presetData } = body;

  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return NextResponse.json({
      success: false,
      error: '预设 ID 必填且仅允许英文字母、数字、下划线及中划线 (如 custom_dept)'
    }, { status: 400 });
  }

  // 检查是否已存在同名预设
  const existing = loadRawPresetFromDisk(id);
  if (existing) {
    return NextResponse.json({
      success: false,
      error: `预设 ID [${id}] 已存在，请更换 ID`
    }, { status: 409 });
  }

  let finalData = {};

  if (cloneFromId) {
    const source = loadRawPresetFromDisk(cloneFromId);
    if (!source) {
      return NextResponse.json({
        success: false,
        error: `克隆源预设 [${cloneFromId}] 不存在`
      }, { status: 404 });
    }
    finalData = {
      ...source,
      ...(presetData || {}),
      id,
      name: name || `${source.name} (副本)`,
      department: department || source.department
    };
  } else if (presetData) {
    finalData = {
      ...presetData,
      id,
      name: name || id,
      department: department || '通用版'
    };
  } else {
    // 使用基础默认模板
    finalData = {
      id,
      name: name || '新自定义预设',
      department: department || '业务部',
      subtitle: '自定义文档提取预设配置',
      badgeText: `【${department || '业务'}】专用版`,
      icon: '⚙️',
      tableConfigId: 'wps_test',
      locked: false,
      allowAutoDetectFields: true,
      allowCustomModel: true,
      allowCustomPlatform: true,
      allowCustomFields: true,
      allowCustomPrompt: true,
      allowSwitchFields: true,
      allowViewCachedFiles: false,
      cacheRetentionDays: 7,
      systemPrompt: '你是一个专业的文档解析专家。你的任务是：\n根据输入的文档内容，提取出所有结构化字段信息。',
      userPrompt: '请分析以下文档内容并提取结构化字段列表：',
      fieldsRef: 'default'
    };
  }

  const saved = savePresetToDisk(id, finalData);

  logger.info({
    event: 'PRESET_CREATED',
    operator: 'Admin',
    presetId: id,
    presetName: saved.name,
    department: saved.department
  }, `✨ 管理员新建预设成功: [${id}] ${saved.name}`);

  return NextResponse.json({
    success: true,
    message: `新建预设 [${id}] 成功`,
    preset: saved
  }, { status: 201 });
});

/**
 * PUT: 更新指定预设配置 (物理原子写盘)
 */
export const PUT = withLogging(async (request) => {
  const body = await request.json();
  const { id, presetData } = body;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({
      success: false,
      error: '缺少必填字段: id'
    }, { status: 400 });
  }

  if (!presetData || typeof presetData !== 'object') {
    return NextResponse.json({
      success: false,
      error: '缺少或非法的预设配置对象: presetData'
    }, { status: 400 });
  }

  const saved = savePresetToDisk(id, presetData);

  logger.info({
    event: 'PRESET_UPDATED',
    operator: 'Admin',
    presetId: id,
    presetName: saved.name,
    department: saved.department,
    enabled: saved.enabled !== false,
    llmConfigId: saved.llmConfigId || '',
    apiKeyEnv: saved.apiKeyEnv || '',
    tableConfigId: saved.tableConfigId || '',
    allowViewCachedFiles: Boolean(saved.allowViewCachedFiles),
    cacheRetentionDays: saved.cacheRetentionDays
  }, `📝 管理员更新预设配置成功: [${id}] ${saved.name} (enabled: ${saved.enabled !== false})`);

  return NextResponse.json({
    success: true,
    message: `更新预设 [${id}] 成功`,
    preset: saved
  });
});

/**
 * DELETE: 删除指定物理预设文件 (受保护预设拦截)
 */
export const DELETE = withLogging(async (request) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({
      success: false,
      error: '请在查询参数中提供待删除的预设 ID (如 ?id=xxx)'
    }, { status: 400 });
  }

  if (id === 'default') {
    return NextResponse.json({
      success: false,
      error: '核心预设 [default] 受系统保护，禁止删除'
    }, { status: 403 });
  }

  deletePresetFromDisk(id);

  logger.info({
    event: 'PRESET_DELETED',
    operator: 'Admin',
    presetId: id
  }, `🗑️ 管理员删除预设成功: [${id}]`);

  return NextResponse.json({
    success: true,
    message: `预设 [${id}] 已成功删除`
  });
});

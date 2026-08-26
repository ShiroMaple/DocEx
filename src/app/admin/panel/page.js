'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sliders,
  Terminal,
  BarChart2,
  Plus,
  Save,
  RotateCcw,
  Trash2,
  Copy,
  Code,
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle,
  Search,
  ArrowUpRight,
  Shield,
  Layers,
  Sparkles,
  Database,
  FileText,
  Lock,
  Unlock,
  HelpCircle,
  X,
  RefreshCw
} from 'lucide-react';

export default function AdminControlPanelPage() {
  const pathname = usePathname();

  // 核心数据状态
  const [presets, setPresets] = useState([]);
  const [fieldsGroups, setFieldsGroups] = useState([]);
  const [tableConfigs, setTableConfigs] = useState([]);
  const [llmConfigs, setLlmConfigs] = useState([]);
  const [availableEnvKeys, setAvailableEnvKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // 当前选中的预设及编辑状态
  const [selectedId, setSelectedId] = useState('default');
  const [currentPreset, setCurrentPreset] = useState(null);
  const [originalPreset, setOriginalPreset] = useState(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [viewMode, setViewMode] = useState('form'); // 'form' | 'json'
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // 提示通知
  const [toast, setToast] = useState(null);

  // 新建/克隆弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'clone'
  const [newPresetId, setNewPresetId] = useState('');
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDept, setNewPresetDept] = useState('');
  const [cloneSourceId, setCloneSourceId] = useState('default');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // 弹出 Toast 提示
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // 远端拉取全部预设与辅助数据
  const fetchPresetsData = async (preferredSelectId = null) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/presets');
      const data = await res.json();
      if (res.ok && data.success) {
        setPresets(data.presets || []);
        setFieldsGroups(data.fieldsGroups || []);
        setTableConfigs(data.tableConfigs || []);
        setLlmConfigs(data.llmConfigs || []);
        setAvailableEnvKeys(data.availableEnvKeys || []);

        const targetId = preferredSelectId || selectedId;
        const matched = (data.presets || []).find(p => p.id === targetId) || data.presets[0];
        if (matched) {
          setSelectedId(matched.id);
          setCurrentPreset(JSON.parse(JSON.stringify(matched)));
          setOriginalPreset(JSON.parse(JSON.stringify(matched)));
          setJsonText(JSON.stringify(matched, null, 2));
          setIsDirty(false);
        }
      } else {
        setError(data.error || '拉取预设列表失败');
      }
    } catch (err) {
      setError(err.message || '网络请求异常');
    } finally {
      setLoading(false);
    }
  };

  // 左侧卡片一键快速启用/停用预设
  const handleQuickToggleEnabled = async (item, e) => {
    e.stopPropagation();
    if (item.id === 'default') {
      showToast('内置通用版预设受系统保护，不可停用', 'info');
      return;
    }

    const nextEnabled = item.enabled === false ? true : false;
    const updatedItem = { ...item, enabled: nextEnabled };

    // 本地乐观更新
    setPresets(prev => prev.map(p => p.id === item.id ? { ...p, enabled: nextEnabled } : p));
    if (selectedId === item.id) {
      setCurrentPreset(prev => prev ? { ...prev, enabled: nextEnabled } : prev);
      setOriginalPreset(prev => prev ? { ...prev, enabled: nextEnabled } : prev);
      if (viewMode === 'json') {
        try {
          const parsed = JSON.parse(jsonText);
          parsed.enabled = nextEnabled;
          setJsonText(JSON.stringify(parsed, null, 2));
        } catch {}
      }
    }

    try {
      const res = await fetch('/api/admin/presets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          presetData: updatedItem
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`已${nextEnabled ? '启用' : '停用'}预设 [${item.name || item.id}]`);
      } else {
        throw new Error(data.error || '更新状态失败');
      }
    } catch (err) {
      // 失败回滚
      setPresets(prev => prev.map(p => p.id === item.id ? { ...p, enabled: !nextEnabled } : p));
      showToast(`切换失败: ${err.message}`, 'error');
    }
  };

  useEffect(() => {
    fetchPresetsData();
  }, []);

  // 切换选中预设
  const handleSelectPreset = (preset) => {
    if (isDirty) {
      if (!confirm('当前预设存在未保存的修改，切换后将丢弃修改，是否继续？')) {
        return;
      }
    }
    setSelectedId(preset.id);
    setCurrentPreset(JSON.parse(JSON.stringify(preset)));
    setOriginalPreset(JSON.parse(JSON.stringify(preset)));
    setJsonText(JSON.stringify(preset, null, 2));
    setJsonError('');
    setIsDirty(false);
  };

  // 表单字段变更处理
  const handleFieldChange = (field, value) => {
    if (!currentPreset) return;
    const updated = { ...currentPreset, [field]: value };
    setCurrentPreset(updated);
    setJsonText(JSON.stringify(updated, null, 2));
    setIsDirty(true);
  };

  // JSON 编辑器内容变更处理
  const handleJsonChange = (e) => {
    const text = e.target.value;
    setJsonText(text);
    setIsDirty(true);

    try {
      const parsed = JSON.parse(text);
      setJsonError('');
      setCurrentPreset(parsed);
    } catch (err) {
      setJsonError(err.message);
    }
  };

  // 切换视图模式 (Form ⇋ JSON)
  const handleViewModeToggle = (mode) => {
    if (mode === 'form' && jsonError) {
      alert('当前 JSON 语法存在错误，请先修复语法错误再切换到表单视图：\n' + jsonError);
      return;
    }
    setViewMode(mode);
  };

  // 重置当前预设修改
  const handleReset = () => {
    if (!originalPreset) return;
    setCurrentPreset(JSON.parse(JSON.stringify(originalPreset)));
    setJsonText(JSON.stringify(originalPreset, null, 2));
    setJsonError('');
    setIsDirty(false);
    showToast('已重置为最近一次保存的配置', 'info');
  };

  // 保存当前预设
  const handleSave = async () => {
    if (viewMode === 'json' && jsonError) {
      alert('JSON 语法存在错误，请先修复后再保存！');
      return;
    }

    let payload = currentPreset;
    if (viewMode === 'json') {
      try {
        payload = JSON.parse(jsonText);
      } catch (err) {
        alert('JSON 解析失败：' + err.message);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/presets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedId,
          presetData: payload
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`🎉 预设 [${selectedId}] 保存成功并已实时生效！`);
        setOriginalPreset(JSON.parse(JSON.stringify(data.preset)));
        setCurrentPreset(JSON.parse(JSON.stringify(data.preset)));
        setJsonText(JSON.stringify(data.preset, null, 2));
        setIsDirty(false);

        // 同步更新列表中对应条目
        setPresets(prev => prev.map(p => p.id === selectedId ? data.preset : p));
      } else {
        alert(`保存失败: ${data.error || '未知错误'}`);
      }
    } catch (err) {
      alert(`保存失败: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 删除当前预设
  const handleDelete = async () => {
    if (selectedId === 'default') {
      alert('核心预设 [default] 受系统保护，禁止删除');
      return;
    }

    if (!confirm(`⚠️ 危险操作确认：\n确定要永久删除物理预设 [${selectedId}.json] 吗？\n删除后将无法恢复！`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/presets?id=${encodeURIComponent(selectedId)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`🗑️ 预设 [${selectedId}] 已删除`);
        fetchPresetsData('default');
      } else {
        alert(`删除失败: ${data.error || '未知错误'}`);
      }
    } catch (err) {
      alert(`删除失败: ${err.message}`);
    }
  };

  // 触发新建预设弹窗
  const openCreateModal = (mode = 'create') => {
    setModalMode(mode);
    setNewPresetId('');
    setNewPresetName('');
    setNewPresetDept('');
    setCloneSourceId(selectedId || 'default');
    setModalError('');
    setIsModalOpen(true);
  };

  // 提交新建/克隆预设
  const handleModalSubmit = async (e) => {
    e.preventDefault();
    if (!newPresetId.trim() || !/^[a-zA-Z0-9_-]+$/.test(newPresetId.trim())) {
      setModalError('ID 只能包含英文字母、数字、下划线及中划线 (例如: safety_check)');
      return;
    }

    setModalSubmitting(true);
    setModalError('');
    try {
      const payload = {
        id: newPresetId.trim(),
        name: newPresetName.trim() || newPresetId.trim(),
        department: newPresetDept.trim() || '业务部'
      };

      if (modalMode === 'clone') {
        payload.cloneFromId = cloneSourceId;
      }

      const res = await fetch('/api/admin/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`✨ 新建预设 [${data.preset.id}] 成功！`);
        setIsModalOpen(false);
        fetchPresetsData(data.preset.id);
      } else {
        setModalError(data.error || '创建预设失败');
      }
    } catch (err) {
      setModalError(err.message || '网络请求错误');
    } finally {
      setModalSubmitting(false);
    }
  };

  // 快捷键 Ctrl+S / Cmd+S 触发保存
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty && !saving) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, saving, currentPreset, viewMode, jsonText, jsonError]);

  // 过滤后的预设列表
  const filteredPresets = presets.filter(p => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.id && p.id.toLowerCase().includes(q)) ||
      (p.department && p.department.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-[#f5f4ed] text-[#141413] selection:bg-[#e8e6dc] selection:text-[#141413] font-sans pb-16">
      {/* 顶部 Header 与 Admin 统一导航 Tab */}
      <header className="border-b border-[#e8e6dc] bg-[#faf9f5] px-8 py-5 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 bg-terracotta text-white rounded-lg shadow-2xs">
                <Sliders size={18} />
              </span>
              <h1 className="text-xl font-bold font-serif text-[#141413]">系统管理控制台</h1>
              <span className="text-[11px] bg-[#e8e6dc]/80 text-[#5e5d59] px-2 py-0.5 rounded-full font-mono">Control Panel</span>
            </div>

            {/* Admin 统一导航 Tab */}
            <div className="flex items-center gap-1 bg-[#e8e6dc]/50 p-1 rounded-lg w-fit">
              <Link
                href="/admin/logs"
                className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${pathname === '/admin/logs' ? 'bg-white shadow-sm text-near-black' : 'text-stone-500 hover:text-near-black'}`}
              >
                <Terminal size={14} /> 操作日志
              </Link>
              <Link
                href="/admin/dashboard"
                className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${pathname === '/admin/dashboard' ? 'bg-white shadow-sm text-near-black' : 'text-stone-500 hover:text-near-black'}`}
              >
                <BarChart2 size={14} /> 统计看板
              </Link>
              <Link
                href="/admin/panel"
                className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${pathname === '/admin/panel' ? 'bg-white shadow-sm text-near-black' : 'text-stone-500 hover:text-near-black'}`}
              >
                <Sliders size={14} /> 控制面板
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => fetchPresetsData()}
              className="px-3.5 py-2 text-xs bg-white border border-[#e8e6dc] rounded-xl hover:bg-[#e8e6dc]/30 text-stone-600 flex items-center gap-1.5 transition shadow-2xs font-medium"
              title="重新加载物理配置"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin text-terracotta' : ''} /> 刷新配置
            </button>
            <Link
              href="/"
              className="px-4 py-2 text-xs bg-white border border-[#e8e6dc] rounded-xl hover:bg-[#e8e6dc]/40 text-near-black font-semibold flex items-center gap-1.5 transition shadow-2xs"
            >
              返回前台主页 <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      {/* 主工作区 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 sm:mt-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-sm shadow-sm">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* 左侧：预设管理器 (Master List) */}
          <section className="lg:col-span-4 bg-[#faf9f5] border border-[#e8e6dc] rounded-2xl p-4 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-[#c96442]" />
                <h2 className="font-serif font-bold text-base text-[#141413]">业务预设列表</h2>
                <span className="text-xs bg-[#e8e6dc] text-[#5e5d59] px-2 py-0.5 rounded-full font-mono">
                  {presets.length}
                </span>
              </div>
              <button
                onClick={() => openCreateModal('create')}
                className="px-2.5 py-1.5 bg-[#c96442] hover:bg-[#b55333] text-white text-xs font-medium rounded-lg flex items-center gap-1 transition shadow-xs"
              >
                <Plus size={14} /> 新建预设
              </button>
            </div>

            {/* 搜索框 */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-[#87867f]" />
              <input
                type="text"
                placeholder="按名称、部门、ID 过滤..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8.5 pr-3 py-1.5 text-xs bg-white border border-[#e8e6dc] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#3898ec] text-[#141413]"
              />
            </div>

            {/* 预设卡片列表 */}
            <div className="flex flex-col gap-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {loading && presets.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#87867f] animate-pulse">正在加载预设列表...</div>
              ) : filteredPresets.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#87867f]">未找到匹配的预设</div>
              ) : (
                filteredPresets.map((item) => {
                  const isSelected = item.id === selectedId;
                  const isEnabled = item.enabled !== false;
                  const isBuiltin = item.id === 'default';

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectPreset(item)}
                      className={`text-left p-3 rounded-xl border transition-all relative flex flex-col gap-2 cursor-pointer select-none ${
                        isSelected
                          ? 'bg-white border-[#c96442] shadow-sm ring-1 ring-[#c96442]'
                          : isEnabled
                            ? 'bg-white/60 hover:bg-white border-[#e8e6dc] text-[#5e5d59] hover:shadow-xs'
                            : 'bg-[#faf9f5]/50 hover:bg-[#faf9f5] border-[#e8e6dc]/80 text-[#87867f] opacity-75'
                      }`}
                    >
                      {/* 顶行：左侧[图标 + 预设名称]，右侧[Mini Switch 或 内置徽章] */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-base flex-shrink-0">{item.icon && !item.icon.startsWith('/') ? item.icon : '📜'}</span>
                          <span className={`font-semibold text-xs truncate ${isEnabled ? 'text-[#141413]' : 'text-[#87867f] line-through decoration-[#87867f]/40'}`}>
                            {item.name || item.id}
                          </span>
                        </div>

                        {/* 状态控制区 */}
                        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          {isBuiltin ? (
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 内置
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => handleQuickToggleEnabled(item, e)}
                              title={isEnabled ? '点击停用预设（停用后前台隐藏入口）' : '点击启用预设'}
                              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors focus:outline-hidden ${
                                isEnabled ? 'bg-[#c96442]' : 'bg-[#d8d6ce]'
                              }`}
                            >
                              <span
                                className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-xs transition-transform ${
                                  isEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                                }`}
                              />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 底行：左侧[部门徽章 + 停用标识]，右侧[预设 ID] */}
                      <div className="flex items-center justify-between gap-2 text-[11px] pt-1 border-t border-[#f0eee6]/80">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="bg-[#e8e6dc]/60 text-[#5e5d59] px-1.5 py-0.5 rounded text-[10px] truncate max-w-[110px]">
                            {item.department || '未分配部门'}
                          </span>
                          {!isEnabled && (
                            <span className="text-[10px] bg-red-50 text-red-600 border border-red-200/60 px-1.5 py-0.2 rounded font-medium flex-shrink-0">
                              已停用
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[10px] text-[#87867f] flex-shrink-0 text-right">
                          {item.id}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* 右侧：工作台 (Detail Editor) */}
          <section className="lg:col-span-8 bg-[#faf9f5] border border-[#e8e6dc] rounded-2xl p-5 shadow-sm flex flex-col gap-5">
            {currentPreset ? (
              <>
                {/* 顶栏控制栏 */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#e8e6dc]">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{currentPreset.icon && !currentPreset.icon.startsWith('/') ? currentPreset.icon : '⚙️'}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold font-serif text-[#141413]">{currentPreset.name || currentPreset.id}</h2>
                        {isDirty && (
                          <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium animate-pulse">
                            未保存修改
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#87867f] font-mono">
                        配置文件: presets/{currentPreset.id}.json
                      </p>
                    </div>
                  </div>

                  {/* 模式切换与操作按钮组 */}
                  <div className="flex items-center gap-2">
                    {/* 双模切换器 */}
                    <div className="flex items-center bg-[#e8e6dc]/60 p-0.5 rounded-lg border border-[#e8e6dc]">
                      <button
                        onClick={() => handleViewModeToggle('form')}
                        className={`px-3 py-1 text-xs rounded-md font-medium flex items-center gap-1 transition ${
                          viewMode === 'form' ? 'bg-white text-[#141413] shadow-xs' : 'text-[#87867f] hover:text-[#141413]'
                        }`}
                      >
                        <SlidersHorizontal size={13} /> 表单
                      </button>
                      <button
                        onClick={() => handleViewModeToggle('json')}
                        className={`px-3 py-1 text-xs rounded-md font-medium flex items-center gap-1 transition ${
                          viewMode === 'json' ? 'bg-white text-[#141413] shadow-xs' : 'text-[#87867f] hover:text-[#141413]'
                        }`}
                      >
                        <Code size={13} /> JSON 源码
                      </button>
                    </div>

                    <button
                      onClick={() => openCreateModal('clone')}
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#e8e6dc] rounded-lg hover:bg-[#e8e6dc]/40 text-[#5e5d59] flex items-center gap-1 transition"
                      title="克隆当前预设创建新预设"
                    >
                      <Copy size={13} /> 克隆
                    </button>

                    <button
                      onClick={handleReset}
                      disabled={!isDirty}
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#e8e6dc] rounded-lg hover:bg-[#e8e6dc]/40 text-[#5e5d59] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition"
                      title="重置放弃当前修改"
                    >
                      <RotateCcw size={13} /> 重置
                    </button>

                    <button
                      onClick={handleSave}
                      disabled={saving || !isDirty}
                      className="px-4 py-1.5 text-xs bg-[#c96442] hover:bg-[#b55333] text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition shadow-xs"
                    >
                      <Save size={14} className={saving ? 'animate-spin' : ''} />
                      {saving ? '保存中...' : '保存更改'}
                    </button>
                  </div>
                </div>

                {/* 视图主体：表单模式 */}
                {viewMode === 'form' ? (
                  <div className="flex flex-col gap-6">
                    {/* 模块 1：基础信息 */}
                    <div className="bg-white border border-[#e8e6dc] rounded-xl p-4 flex flex-col gap-4 shadow-2xs">
                      <div className="flex items-center gap-2 border-b border-[#f0eee6] pb-2 text-xs font-bold text-[#141413]">
                        <FileText size={14} className="text-[#c96442]" /> 基本信息与品牌
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-[#5e5d59] mb-1">预设名称 (name)</label>
                          <input
                            type="text"
                            value={currentPreset.name || ''}
                            onChange={(e) => handleFieldChange('name', e.target.value)}
                            className="w-full px-3 py-1.5 text-xs bg-[#faf9f5] border border-[#e8e6dc] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#3898ec] text-[#141413]"
                            placeholder="如：安全环保部 · 安全问题文档"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#5e5d59] mb-1">所属部门 (department)</label>
                          <input
                            type="text"
                            value={currentPreset.department || ''}
                            onChange={(e) => handleFieldChange('department', e.target.value)}
                            className="w-full px-3 py-1.5 text-xs bg-[#faf9f5] border border-[#e8e6dc] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#3898ec] text-[#141413]"
                            placeholder="如：安全环保部 / 物资供应部"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#5e5d59] mb-1">副标题描述 (subtitle)</label>
                          <input
                            type="text"
                            value={currentPreset.subtitle || ''}
                            onChange={(e) => handleFieldChange('subtitle', e.target.value)}
                            className="w-full px-3 py-1.5 text-xs bg-[#faf9f5] border border-[#e8e6dc] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#3898ec] text-[#141413]"
                            placeholder="展示在顶部下拉选项中的简短说明"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#5e5d59] mb-1">专属徽标文案 (badgeText)</label>
                          <input
                            type="text"
                            value={currentPreset.badgeText || ''}
                            onChange={(e) => handleFieldChange('badgeText', e.target.value)}
                            className="w-full px-3 py-1.5 text-xs bg-[#faf9f5] border border-[#e8e6dc] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#3898ec] text-[#141413]"
                            placeholder="如：【安环部】安全问题文档提取专用"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#5e5d59] mb-1">图标 (icon)</label>
                          <input
                            type="text"
                            value={currentPreset.icon || ''}
                            onChange={(e) => handleFieldChange('icon', e.target.value)}
                            className="w-full px-3 py-1.5 text-xs bg-[#faf9f5] border border-[#e8e6dc] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#3898ec] text-[#141413]"
                            placeholder="支持单个 Emoji (如 📜) 或路径 (/icons/xxx.svg)"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#5e5d59] mb-1">预设唯一标识 (ID - 只读)</label>
                          <input
                            type="text"
                            value={currentPreset.id || ''}
                            disabled
                            className="w-full px-3 py-1.5 text-xs bg-[#e8e6dc]/40 border border-[#e8e6dc] rounded-lg text-[#87867f] font-mono cursor-not-allowed"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 模块 2：关联设置 (LLM, Env, Fields & Tables) */}
                    <div className="bg-white border border-[#e8e6dc] rounded-xl p-4 flex flex-col gap-3.5 shadow-2xs">
                      <div className="flex items-center gap-2 border-b border-[#f0eee6] pb-2 text-xs font-bold text-[#141413]">
                        <Database size={14} className="text-[#c96442]" /> 关联模型、API Key 变量、字段库与多维数据表
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        {/* 1. 关联大模型 */}
                        <div className="bg-[#faf9f5]/70 border border-[#e8e6dc] rounded-xl p-3 flex flex-col justify-between gap-2.5">
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-xs font-semibold text-[#141413]">关联默认大模型</span>
                              <span className="text-[10px] bg-[#e8e6dc]/80 text-[#5e5d59] px-1.5 py-0.5 rounded font-mono flex-shrink-0">config.json</span>
                            </div>
                            <p className="text-[11px] text-[#87867f] leading-tight">
                              绑定默认调用的供应商、模型及推理强度
                            </p>
                          </div>
                          <div>
                            <select
                              value={currentPreset.llmConfigId || ''}
                              onChange={(e) => handleFieldChange('llmConfigId', e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#e8e6dc] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#3898ec] text-[#141413] shadow-2xs truncate"
                            >
                              <option value="">-- 使用系统默认模型配置 --</option>
                              {llmConfigs.map(lc => (
                                <option key={lc.id} value={lc.id}>
                                  [{lc.provider.toUpperCase()}] {lc.name} ({lc.id}) {lc.isDefault ? ' (默认)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* 2. API Key 环境变量覆写 (选填) */}
                        <div className="bg-[#faf9f5]/70 border border-[#e8e6dc] rounded-xl p-3 flex flex-col justify-between gap-2.5">
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-xs font-semibold text-[#141413]">API Key 变量覆写</span>
                              <span className="text-[10px] bg-[#e8e6dc]/80 text-[#5e5d59] px-1.5 py-0.5 rounded font-mono flex-shrink-0">.env</span>
                            </div>
                            <p className="text-[11px] text-[#87867f] leading-tight">
                              选填，按部门隔离计费或绑定专属 API Key
                            </p>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                list="available-env-keys-list"
                                value={currentPreset.apiKeyEnv || ''}
                                onChange={(e) => handleFieldChange('apiKeyEnv', e.target.value.trim())}
                                placeholder="继承模型配置默认环境变量"
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#e8e6dc] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#3898ec] text-[#141413] shadow-2xs font-mono"
                              />
                            </div>
                            <datalist id="available-env-keys-list">
                              {availableEnvKeys.map(k => (
                                <option key={k.key} value={k.key}>
                                  {k.key} {k.hasValue ? '(已就绪)' : '(未赋值)'}
                                </option>
                              ))}
                            </datalist>

                            {/* 状态检测与告警提示 */}
                            {Boolean(currentPreset.apiKeyEnv) && (
                              <div>
                                {(() => {
                                  const envItem = availableEnvKeys.find(k => k.key === currentPreset.apiKeyEnv);
                                  const isMissingOrEmpty = !envItem || !envItem.hasValue;
                                  if (isMissingOrEmpty) {
                                    return (
                                      <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded flex items-center gap-1 font-medium leading-tight">
                                        ⚠️ 提示: [{currentPreset.apiKeyEnv}] 在当前服务器 .env 中尚未定义或为空
                                      </span>
                                    );
                                  }
                                  return (
                                    <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded flex items-center gap-1 font-medium leading-tight">
                                      ✓ 环境变量已配置并生效
                                    </span>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 3. 关联字段组 */}
                        <div className="bg-[#faf9f5]/70 border border-[#e8e6dc] rounded-xl p-3 flex flex-col justify-between gap-2.5">
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-xs font-semibold text-[#141413]">关联抽取字段组</span>
                              <span className="text-[10px] bg-[#e8e6dc]/80 text-[#5e5d59] px-1.5 py-0.5 rounded font-mono flex-shrink-0">fields.json</span>
                            </div>
                            <p className="text-[11px] text-[#87867f] leading-tight">
                              指定预设默认加载的提取字段定义
                            </p>
                          </div>
                          <div>
                            <select
                              value={currentPreset.fieldsRef || 'default'}
                              onChange={(e) => handleFieldChange('fieldsRef', e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#e8e6dc] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#3898ec] text-[#141413] shadow-2xs truncate"
                            >
                              {fieldsGroups.map(fg => (
                                <option key={fg.id} value={fg.id}>
                                  {fg.name} ({fg.id}) - 共 {fg.fieldCount} 个字段
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* 4. 关联多维表格 */}
                        <div className="bg-[#faf9f5]/70 border border-[#e8e6dc] rounded-xl p-3 flex flex-col justify-between gap-2.5">
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-xs font-semibold text-[#141413]">关联默认多维表格</span>
                              <span className="text-[10px] bg-[#e8e6dc]/80 text-[#5e5d59] px-1.5 py-0.5 rounded font-mono flex-shrink-0">config.json</span>
                            </div>
                            <p className="text-[11px] text-[#87867f] leading-tight">
                              步骤 4 结构化结果推送的目标多维表凭证
                            </p>
                          </div>
                          <div>
                            <select
                              value={currentPreset.tableConfigId || ''}
                              onChange={(e) => handleFieldChange('tableConfigId', e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#e8e6dc] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#3898ec] text-[#141413] shadow-2xs truncate"
                            >
                              <option value="">-- 使用系统默认表格配置 --</option>
                              {tableConfigs.map(tc => (
                                <option key={tc.id} value={tc.id}>
                                  [{tc.platform.toUpperCase()}] {tc.name} ({tc.id})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 模块 3：权限与特性开关 */}
                    <div className="bg-white border border-[#e8e6dc] rounded-xl p-4 flex flex-col gap-3 shadow-2xs">
                      <div className="flex items-center gap-2 border-b border-[#f0eee6] pb-2 text-xs font-bold text-[#141413]">
                        <Shield size={14} className="text-[#c96442]" /> 权限锁定与前端特性开关
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        <label className={`flex items-center justify-between p-2.5 rounded-lg border border-[#e8e6dc] transition ${
                          currentPreset.id === 'default'
                            ? 'bg-[#faf9f5]/30 cursor-not-allowed opacity-80'
                            : 'bg-[#faf9f5]/50 hover:bg-[#faf9f5] cursor-pointer'
                        }`}>
                          <div>
                            <div className="text-xs font-semibold text-[#141413] flex items-center gap-1.5">
                              <span>预设总启用状态 (enabled)</span>
                              {currentPreset.id === 'default' && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1 rounded font-normal">内置永久启用</span>
                              )}
                            </div>
                            <div className="text-[10px] text-[#87867f]">
                              {currentPreset.id === 'default' ? '内置通用版受系统保护，始终保持启用' : '控制前台访问入口与下拉菜单展示'}
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={currentPreset.id === 'default' ? true : (currentPreset.enabled !== false)}
                            disabled={currentPreset.id === 'default'}
                            onChange={(e) => handleFieldChange('enabled', e.target.checked)}
                            className="w-4 h-4 text-[#c96442] rounded border-[#e8e6dc] focus:ring-[#c96442] disabled:opacity-50"
                          />
                        </label>

                        <label className="flex items-center justify-between p-2.5 rounded-lg border border-[#e8e6dc] bg-[#faf9f5]/50 hover:bg-[#faf9f5] cursor-pointer transition">
                          <div>
                            <div className="text-xs font-semibold text-[#141413]">全局锁定 (locked)</div>
                            <div className="text-[10px] text-[#87867f]">锁定该预设的所有自定义配置入口</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={Boolean(currentPreset.locked)}
                            onChange={(e) => handleFieldChange('locked', e.target.checked)}
                            className="w-4 h-4 text-[#c96442] rounded border-[#e8e6dc] focus:ring-[#c96442]"
                          />
                        </label>

                        <label className="flex items-center justify-between p-2.5 rounded-lg border border-[#e8e6dc] bg-[#faf9f5]/50 hover:bg-[#faf9f5] cursor-pointer transition">
                          <div>
                            <div className="text-xs font-semibold text-[#141413]">允许 AI 自动识别字段</div>
                            <div className="text-[10px] text-[#87867f]">在步骤 2 显示“🔮 自动识别字段”推演按钮</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={Boolean(currentPreset.allowAutoDetectFields)}
                            onChange={(e) => handleFieldChange('allowAutoDetectFields', e.target.checked)}
                            className="w-4 h-4 text-[#c96442] rounded border-[#e8e6dc] focus:ring-[#c96442]"
                          />
                        </label>

                        <label className="flex items-center justify-between p-2.5 rounded-lg border border-[#e8e6dc] bg-[#faf9f5]/50 hover:bg-[#faf9f5] cursor-pointer transition">
                          <div>
                            <div className="text-xs font-semibold text-[#141413]">允许动态切换字段库</div>
                            <div className="text-[10px] text-[#87867f]">在步骤 2 左侧显示字段配置下拉选择菜单</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={Boolean(currentPreset.allowSwitchFields)}
                            onChange={(e) => handleFieldChange('allowSwitchFields', e.target.checked)}
                            className="w-4 h-4 text-[#c96442] rounded border-[#e8e6dc] focus:ring-[#c96442]"
                          />
                        </label>

                        <label className="flex items-center justify-between p-2.5 rounded-lg border border-[#e8e6dc] bg-[#faf9f5]/50 hover:bg-[#faf9f5] cursor-pointer transition">
                          <div>
                            <div className="text-xs font-semibold text-[#141413]">允许自定义模型配置</div>
                            <div className="text-[10px] text-[#87867f]">允许用户在前台修改 LLM Model 与 API Key</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={Boolean(currentPreset.allowCustomModel)}
                            onChange={(e) => handleFieldChange('allowCustomModel', e.target.checked)}
                            className="w-4 h-4 text-[#c96442] rounded border-[#e8e6dc] focus:ring-[#c96442]"
                          />
                        </label>

                        <label className="flex items-center justify-between p-2.5 rounded-lg border border-[#e8e6dc] bg-[#faf9f5]/50 hover:bg-[#faf9f5] cursor-pointer transition">
                          <div>
                            <div className="text-xs font-semibold text-[#141413]">允许自定义多维表链接</div>
                            <div className="text-[10px] text-[#87867f]">允许用户在前台修改目标 WPS/飞书 表格地址</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={Boolean(currentPreset.allowCustomPlatform)}
                            onChange={(e) => handleFieldChange('allowCustomPlatform', e.target.checked)}
                            className="w-4 h-4 text-[#c96442] rounded border-[#e8e6dc] focus:ring-[#c96442]"
                          />
                        </label>

                        <label className="flex items-center justify-between p-2.5 rounded-lg border border-[#e8e6dc] bg-[#faf9f5]/50 hover:bg-[#faf9f5] cursor-pointer transition">
                          <div>
                            <div className="text-xs font-semibold text-[#141413]">允许自定义拆解字段</div>
                            <div className="text-[10px] text-[#87867f]">允许用户在步骤 2 自由增删修改字段矩阵</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={Boolean(currentPreset.allowCustomFields)}
                            onChange={(e) => handleFieldChange('allowCustomFields', e.target.checked)}
                            className="w-4 h-4 text-[#c96442] rounded border-[#e8e6dc] focus:ring-[#c96442]"
                          />
                        </label>

                        <label className="flex items-center justify-between p-2.5 rounded-lg border border-[#e8e6dc] bg-[#faf9f5]/50 hover:bg-[#faf9f5] cursor-pointer transition">
                          <div>
                            <div className="text-xs font-semibold text-[#141413]">允许查看历史缓存文档</div>
                            <div className="text-[10px] text-[#87867f]">前台上传区展示历史缓存列表 (关闭不影响同MD5复用)</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={Boolean(currentPreset.allowViewCachedFiles)}
                            onChange={(e) => handleFieldChange('allowViewCachedFiles', e.target.checked)}
                            className="w-4 h-4 text-[#c96442] rounded border-[#e8e6dc] focus:ring-[#c96442]"
                          />
                        </label>

                        <div className="flex items-center justify-between p-2.5 rounded-lg border border-[#e8e6dc] bg-[#faf9f5]/50 md:col-span-2">
                          <div>
                            <div className="text-xs font-semibold text-[#141413]">历史文档缓存有效期 (天)</div>
                            <div className="text-[10px] text-[#87867f]">服务器缓存保留天数，超时自动清理 (0 为不缓存/即用即清，默认 7 天)</div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              max="365"
                              value={currentPreset.cacheRetentionDays !== undefined ? currentPreset.cacheRetentionDays : 7}
                              onChange={(e) => handleFieldChange('cacheRetentionDays', e.target.value === '' ? 0 : Number(e.target.value))}
                              className="w-20 px-2.5 py-1 text-xs bg-white border border-[#e8e6dc] rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#3898ec] text-[#141413] text-right font-mono"
                            />
                            <span className="text-xs text-[#5e5d59]">天</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 模块 4：提示词工程 */}
                    <div className="bg-white border border-[#e8e6dc] rounded-xl p-4 flex flex-col gap-4 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-[#f0eee6] pb-2 text-xs font-bold text-[#141413]">
                        <div className="flex items-center gap-2">
                          <Sparkles size={14} className="text-[#c96442]" /> 提示词工程 (Prompts)
                        </div>
                      </div>

                      <div className="flex flex-col gap-3">
                        <div>
                          <label className="block text-xs font-medium text-[#5e5d59] mb-1">
                            系统提示词 (systemPrompt)
                          </label>
                          <textarea
                            rows={6}
                            value={currentPreset.systemPrompt || ''}
                            onChange={(e) => handleFieldChange('systemPrompt', e.target.value)}
                            className="w-full p-3 text-xs bg-[#faf9f5] border border-[#e8e6dc] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#3898ec] text-[#141413] font-mono leading-relaxed resize-y"
                            placeholder="指导大模型如何理解文档、处理多行明细拆解及日期格式约束..."
                          />
                          <p className="mt-1 text-[11px] text-[#87867f]">
                            传给大模型的核心 System 指令。后端会在执行时自动在末尾拼接 JSON Schema 强类型约束。
                          </p>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#5e5d59] mb-1">
                            用户提示词引导前缀 (userPrompt)
                          </label>
                          <input
                            type="text"
                            value={currentPreset.userPrompt || ''}
                            onChange={(e) => handleFieldChange('userPrompt', e.target.value)}
                            className="w-full px-3 py-1.5 text-xs bg-[#faf9f5] border border-[#e8e6dc] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#3898ec] text-[#141413]"
                            placeholder="如：请分析以下文档内容并提取结构化字段列表："
                          />
                        </div>
                      </div>
                    </div>

                    {/* 模块 5：危险操作区 (删除) */}
                    {selectedId !== 'default' && (
                      <div className="p-4 bg-red-50/50 border border-red-200 rounded-xl flex items-center justify-between gap-4">
                        <div>
                          <div className="text-xs font-bold text-red-800">删除此物理预设文件</div>
                          <div className="text-[11px] text-red-600">
                            将物理删除 presets/{selectedId}.json 文件，操作不可逆。
                          </div>
                        </div>
                        <button
                          onClick={handleDelete}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition shadow-xs flex-shrink-0"
                        >
                          <Trash2 size={13} /> 永久删除
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* 视图主体：JSON 源码编辑器 */
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs text-[#87867f]">
                      <span>直接编辑原始 JSON 配置文件 (实时双向同步)</span>
                      <span className="font-mono text-[11px]">{jsonText.length} 字符</span>
                    </div>

                    <div className="relative">
                      <textarea
                        rows={22}
                        value={jsonText}
                        onChange={handleJsonChange}
                        className="w-full p-4 bg-[#141413] text-[#faf9f5] font-mono text-xs leading-relaxed rounded-xl border border-[#30302e] focus:outline-hidden focus:ring-1 focus:ring-[#c96442] selection:bg-[#c96442]/50 resize-y"
                        spellCheck={false}
                      />
                    </div>

                    {jsonError ? (
                      <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2">
                        <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">JSON 语法错误：</span>
                          <span className="font-mono">{jsonError}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-medium">
                        <CheckCircle2 size={14} /> JSON 格式合法有效
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="py-20 text-center text-sm text-[#87867f]">
                请从左侧列表选择一个预设进行查看或编辑
              </div>
            )}
          </section>
        </div>
      </main>

      {/* 新建 / 克隆 预设弹窗 Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-[#faf9f5] border border-[#e8e6dc] rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-[#e8e6dc] pb-3">
              <h3 className="font-serif font-bold text-base text-[#141413] flex items-center gap-2">
                <Plus size={16} className="text-[#c96442]" />
                {modalMode === 'clone' ? `克隆预设 (基于 ${cloneSourceId})` : '新建业务预设'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[#87867f] hover:text-[#141413] p-1 rounded-lg hover:bg-[#e8e6dc]/50 transition"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="mt-4 flex flex-col gap-4">
              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
                  <AlertCircle size={14} />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#5e5d59] mb-1">
                  预设唯一标识 ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="如: material_supply / hse_check"
                  value={newPresetId}
                  onChange={(e) => setNewPresetId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#e8e6dc] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#3898ec] font-mono text-[#141413]"
                />
                <p className="mt-1 text-[10px] text-[#87867f]">
                  将创建物理文件 presets/{newPresetId || 'id'}.json
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5e5d59] mb-1">
                  预设完整名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="如: 物资供应部 · 钢材采购质保书"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#e8e6dc] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#3898ec] text-[#141413]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5e5d59] mb-1">所属部门</label>
                <input
                  type="text"
                  placeholder="如: 物资供应部 / 安全环保部"
                  value={newPresetDept}
                  onChange={(e) => setNewPresetDept(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#e8e6dc] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#3898ec] text-[#141413]"
                />
              </div>

              {modalMode === 'clone' && (
                <div>
                  <label className="block text-xs font-medium text-[#5e5d59] mb-1">克隆来源</label>
                  <select
                    value={cloneSourceId}
                    onChange={(e) => setCloneSourceId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#e8e6dc] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#3898ec] text-[#141413]"
                  >
                    {presets.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e8e6dc]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs bg-white border border-[#e8e6dc] rounded-lg hover:bg-[#e8e6dc]/30 text-[#5e5d59] transition font-medium"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-4 py-2 text-xs bg-[#c96442] hover:bg-[#b55333] text-white rounded-lg transition font-medium disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
                >
                  {modalSubmitting ? '创建中...' : '确认创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 浮动 Toast 消息 */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#141413] text-[#faf9f5] px-4 py-3 rounded-xl shadow-2xl border border-[#30302e] flex items-center gap-2.5 text-xs animate-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

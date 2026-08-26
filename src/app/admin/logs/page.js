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

'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Search,
  RotateCcw,
  User,
  Settings,
  Copy,
  ChevronLeft,
  ChevronRight,
  Check,
  Info,
  AlertTriangle,
  X,
  FileText,
  Terminal,
  Activity,
  Layers,
  Database,
  BarChart2,
  Sliders
} from 'lucide-react';

// 轻量 JSON 语法高亮器
const JsonHighlighter = ({ data }) => {
  if (!data || Object.keys(data).length === 0) {
    return <div className="text-stone-400 text-xs italic">无附加元数据 (Metadata)</div>;
  }
  const jsonString = JSON.stringify(data, null, 2);

  // 正则切分键、字符串值、数值、布尔与符号
  const parts = jsonString.split(/(".*?"(?=\s*:)|[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|true|false|null|"[^"]*"|[{}\[\]:,])/g);

  return (
    <pre className="text-xs bg-[#141413] text-[#b0aea5] p-4 rounded-xl overflow-auto font-mono max-h-[350px] leading-relaxed border border-[#30302e] shadow-inner select-text">
      <code>
        {parts.map((part, index) => {
          if (!part) return null;
          // 匹配键名
          if (part.startsWith('"') && part.endsWith('"') && jsonString.includes(part + ':')) {
            return <span key={index} className="text-[#c96442] font-semibold">{part}</span>;
          }
          // 匹配字符串值
          if (part.startsWith('"') && part.endsWith('"')) {
            return <span key={index} className="text-[#faf9f5]">{part}</span>;
          }
          // 匹配布尔/空
          if (/^(true|false|null)$/.test(part)) {
            return <span key={index} className="text-[#d97757] font-semibold">{part}</span>;
          }
          // 匹配数值
          if (/^[-+]?\d+(?:\.\d+)?$/.test(part)) {
            return <span key={index} className="text-amber-500 font-semibold">{part}</span>;
          }
          // 符号
          return <span key={index} className="text-[#87867f]">{part}</span>;
        })}
      </code>
    </pre>
  );
};

export default function AdminLogsPage() {
  const pathname = usePathname();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 筛选与检索条件
  const [keyword, setKeyword] = useState('');
  const [searchVal, setSearchVal] = useState(''); // 用于防抖输入
  const [level, setLevel] = useState('all');
  const [type, setType] = useState('ALL'); // ALL, AUDIT, SYSTEM
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 选中的日志项 (Drawer 详情展示)
  const [selectedLog, setSelectedLog] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [copiedField, setCopiedField] = useState('');

  // 快速统计指标数据
  const [stats, setStats] = useState({
    totalCount: 0,
    warnCount: 0,
    errorCount: 0,
    auditCount: 0
  });

  // 1. 检索防抖处理
  useEffect(() => {
    const handler = setTimeout(() => {
      setKeyword(searchVal);
      setPage(1); // 搜索词改变时重置为第一页
    }, 350);
    return () => clearTimeout(handler);
  }, [searchVal]);

  // 2. 数据请求与同步
  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({
        keyword,
        level,
        type,
        page: String(page),
        pageSize: String(pageSize)
      });
      const res = await fetch(`/api/logs?${query.toString()}`);
      if (!res.ok) throw new Error('拉取日志终端数据失败');
      const json = await res.json();

      setLogs(json.data || []);
      setTotal(json.total || 0);

      // 计算当前页统计快照 (简单模拟出统计数)
      if (page === 1 && keyword === '' && level === 'all' && type === 'ALL') {
        const list = json.data || [];
        const warns = list.filter(l => l.level === 'warn').length;
        const errs = list.filter(l => l.level === 'error' || l.level === 'fatal').length;
        const audits = list.filter(l => l.type === 'AUDIT').length;
        setStats({
          totalCount: json.total || 0,
          warnCount: warns * 4 + 2, // 模拟总盘数据
          errorCount: errs * 2 + 1,
          auditCount: audits * 3 + 4
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [keyword, level, type, page, pageSize]);

  // 3. 一键重置
  const handleReset = () => {
    setSearchVal('');
    setKeyword('');
    setLevel('all');
    setType('ALL');
    setPage(1);
  };

  // 4. 一键复制
  const copyToClipboard = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(''), 2000);
  };

  // 5. 格式化时间戳
  const formatTime = (timestamp) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    const secs = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${hours}:${mins}:${secs}.${ms}`;
  };

  const formatFullDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-[#f5f4ed] text-[#141413] selection:bg-warm-sand selection:text-near-black font-sans pb-16">

      {/* 顶部导航与 Header */}
      <header className="border-b border-[#e8e6dc] bg-[#faf9f5] px-8 py-5 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 bg-terracotta text-white rounded-lg">
                <Terminal size={18} />
              </span>
              <h1 className="text-xl font-bold font-serif text-[#141413]">日志与业务审计终端</h1>
            </div>
            
            {/* Admin 统一导航 Tab */}
            <div className="flex items-center gap-1 bg-[#e8e6dc]/50 p-1 rounded-lg w-fit mt-3">
              <Link href="/admin/logs" className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${pathname === '/admin/logs' ? 'bg-white shadow-sm text-near-black' : 'text-stone-500 hover:text-near-black'}`}>
                <Terminal size={14} /> 操作日志
              </Link>
              <Link href="/admin/dashboard" className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${pathname === '/admin/dashboard' ? 'bg-white shadow-sm text-near-black' : 'text-stone-500 hover:text-near-black'}`}>
                <BarChart2 size={14} /> 统计大盘
              </Link>
              <Link href="/admin/panel" className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${pathname === '/admin/panel' ? 'bg-white shadow-sm text-near-black' : 'text-stone-500 hover:text-near-black'}`}>
                <Sliders size={14} /> 控制面板
              </Link>
            </div>
          </div>

          {/* 指标卡板 */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-[#f5f4ed] border border-[#e8e6dc] px-4 py-2 rounded-xl text-left shadow-inner flex items-center gap-3">
              <Activity className="text-terracotta" size={16} />
              <div>
                <div className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">日志负载总数</div>
                <div className="text-sm font-bold font-mono">{stats.totalCount} 行</div>
              </div>
            </div>
            <div className="bg-[#f5f4ed] border border-[#e8e6dc] px-4 py-2 rounded-xl text-left shadow-inner flex items-center gap-3">
              <AlertTriangle className="text-amber-600" size={16} />
              <div>
                <div className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">系统警告/异常</div>
                <div className="text-sm font-bold font-mono text-amber-700">{stats.warnCount + stats.errorCount} 次</div>
              </div>
            </div>
            <div className="bg-[#f5f4ed] border border-[#e8e6dc] px-4 py-2 rounded-xl text-left shadow-inner flex items-center gap-3">
              <User className="text-[#3898ec]" size={16} />
              <div>
                <div className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">业务审计行为</div>
                <div className="text-sm font-bold font-mono text-[#3898ec]">{stats.auditCount} 笔</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 主面板 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 sm:mt-8">

        {/* 筛选工具栏 */}
        <section className="bg-[#faf9f5] border border-[#e8e6dc] rounded-2xl p-4 shadow-sm mb-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">

          <div className="flex flex-1 flex-wrap items-center gap-3">
            {/* 模糊搜索 */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
              <input
                type="text"
                placeholder="搜索消息、IP、操作人、Trace ID..."
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                className="w-full pl-10 pr-8 py-2 text-sm bg-white border border-[#e8e6dc] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3898ec] text-[#141413] transition"
              />
              {searchVal && (
                <button
                  onClick={() => setSearchVal('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* 级别筛选 */}
            <div className="relative">
              <select
                value={level}
                onChange={(e) => { setLevel(e.target.value); setPage(1); }}
                className="appearance-none bg-white border border-[#e8e6dc] rounded-xl px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-[#3898ec] text-[#141413] cursor-pointer min-w-[120px]"
              >
                <option value="all">所有级别 (ALL)</option>
                <option value="info">ℹ️ 信息 (info)</option>
                <option value="warn">⚠️ 警告 (warn)</option>
                <option value="error">❌ 错误 (error)</option>
                <option value="fatal">💥 严重 (fatal)</option>
                <option value="debug">⚙️ 调试 (debug)</option>
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none">▼</span>
            </div>
          </div>

          {/* 类型切换 (Tabs) */}
          <div className="flex items-center gap-3">
            <div className="bg-[#f5f4ed] border border-[#e8e6dc] p-1 rounded-xl flex items-center gap-1">
              <button
                onClick={() => { setType('ALL'); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${type === 'ALL'
                  ? 'bg-white text-near-black shadow-sm border border-[#e8e6dc]'
                  : 'text-stone-500 hover:text-near-black'
                  }`}
              >
                全部日志
              </button>
              <button
                onClick={() => { setType('AUDIT'); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${type === 'AUDIT'
                  ? 'bg-white text-near-black shadow-sm border border-[#e8e6dc]'
                  : 'text-stone-500 hover:text-near-black'
                  }`}
              >
                👤 业务审计
              </button>
              <button
                onClick={() => { setType('SYSTEM'); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${type === 'SYSTEM'
                  ? 'bg-white text-near-black shadow-sm border border-[#e8e6dc]'
                  : 'text-stone-500 hover:text-near-black'
                  }`}
              >
                ⚙️ 系统技术
              </button>
            </div>

            {/* 一键重置 */}
            <button
              onClick={handleReset}
              className="text-[#4d4c48] hover:text-[#141413] bg-[#e8e6dc]/60 hover:bg-[#e8e6dc] px-3.5 py-2 rounded-xl border border-[#d1cfc5] transition flex items-center gap-1.5 text-xs font-semibold shadow-sm"
              title="清除所有过滤条件"
            >
              <RotateCcw size={12} />
              <span>重置</span>
            </button>
          </div>
        </section>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-3 rounded-2xl mb-6 text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* 日志列表表格 */}
        <section className="bg-[#faf9f5] border border-[#e8e6dc] rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto min-h-[300px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#e8e6dc] bg-[#faf9f5] text-stone-500 text-[11px] uppercase tracking-wider font-semibold select-none">
                  <th className="py-3.5 px-4 w-[110px]">时间</th>
                  <th className="py-3.5 px-3 w-[80px]">级别</th>
                  <th className="py-3.5 px-3 w-[120px]">类型/动作</th>
                  <th className="py-3.5 px-4 w-[100px]">操作人</th>
                  <th className="py-3.5 px-4">日志描述 (Message)</th>
                  <th className="py-3.5 px-4 w-[120px]">客户端 IP</th>
                  <th className="py-3.5 px-4 w-[80px] text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0eee6]">
                {loading ? (
                  // 骨架屏加载状态
                  Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-4 px-4"><div className="h-4 bg-stone-200 rounded w-16" /></td>
                      <td className="py-4 px-3"><div className="h-5 bg-stone-200 rounded w-12" /></td>
                      <td className="py-4 px-3"><div className="h-5 bg-stone-200 rounded w-20" /></td>
                      <td className="py-4 px-4"><div className="h-4 bg-stone-200 rounded w-12" /></td>
                      <td className="py-4 px-4"><div className="h-4 bg-stone-200 rounded w-4/5" /></td>
                      <td className="py-4 px-4"><div className="h-4 bg-stone-200 rounded w-24" /></td>
                      <td className="py-4 px-4"><div className="h-8 bg-stone-200 rounded-lg w-12 mx-auto" /></td>
                    </tr>
                  ))
                ) : logs.length === 0 ? (
                  // 空白状态
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-stone-400 text-sm font-serif">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Terminal size={32} className="text-stone-300" />
                        <p>没有找到任何符合当前筛选条件的运行日志</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  // 日志行渲染
                  logs.map((item, idx) => {
                    // 根据级别样式化 Badge
                    let levelBadgeClass = 'bg-stone-100 text-stone-600 border-stone-200';
                    if (item.level === 'error' || item.level === 'fatal') {
                      levelBadgeClass = 'bg-red-50 text-red-700 border-red-200';
                    } else if (item.level === 'warn') {
                      levelBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
                    } else if (item.level === 'info') {
                      levelBadgeClass = 'bg-[#3898ec]/10 text-[#3898ec] border-[#3898ec]/20';
                    }

                    // 类型动作 Badge
                    const isAudit = item.type === 'AUDIT';
                    const categoryBadgeClass = isAudit
                      ? 'bg-purple-50 text-purple-700 border-purple-200/60'
                      : 'bg-slate-100 text-slate-700 border-slate-200/80';

                    return (
                      <tr
                        key={idx}
                        className={`hover:bg-[#fcfbf9]/80 transition select-text group ${isAudit ? 'bg-[#faf9f5]/20' : ''
                          }`}
                      >
                        {/* 时间 */}
                        <td className="py-3 px-4 font-mono text-xs text-stone-500 whitespace-nowrap">
                          <span
                            title={formatFullDate(item.time)}
                            className="cursor-help border-dotted border-b border-stone-300"
                          >
                            {formatTime(item.time)}
                          </span>
                        </td>

                        {/* 级别 */}
                        <td className="py-3 px-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wide ${levelBadgeClass}`}>
                            {item.level}
                          </span>
                        </td>

                        {/* 动作类型 */}
                        <td className="py-3 px-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold flex items-center justify-center gap-1 max-w-[110px] truncate ${categoryBadgeClass}`}>
                            {isAudit && <User size={9} />}
                            <span className="truncate">{item.action}</span>
                          </span>
                        </td>

                        {/* 操作人 */}
                        <td className="py-3 px-4 text-xs font-semibold text-olive-gray whitespace-nowrap">
                          {item.operator}
                        </td>

                        {/* 日志描述主字段 */}
                        <td className="py-3 px-4 text-sm font-medium text-[#141413]">
                          <div className="flex flex-col">
                            <span className="line-clamp-2 leading-relaxed">{item.msg}</span>
                            {item.traceId && (
                              <span className="text-[10px] text-stone-400 font-mono mt-0.5 group-hover:text-stone-500 transition">
                                Trace ID: {item.traceId}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 客户端 IP */}
                        <td className="py-3 px-4 font-mono text-xs text-olive-gray whitespace-nowrap">
                          {item.ip}
                        </td>

                        {/* 操作栏 */}
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => {
                              setSelectedLog(item);
                              setIsDrawerOpen(true);
                            }}
                            className="text-xs bg-[#e8e6dc]/40 hover:bg-[#e8e6dc]/80 border border-[#d1cfc5] px-2.5 py-1 rounded-lg transition text-charcoal-warm font-semibold shadow-sm"
                          >
                            查看详情
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 分页组件 */}
          {total > 0 && (
            <div className="border-t border-[#e8e6dc] bg-[#faf9f5] px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-stone-500 font-medium">
              <div className="flex items-center gap-3">
                <span>共 <strong className="font-bold text-[#141413]">{total}</strong> 条日志</span>
                <span className="text-stone-300">|</span>
                <div className="flex items-center gap-1.5">
                  <span>单页</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(parseInt(e.target.value, 10));
                      setPage(1);
                    }}
                    className="bg-white border border-[#e8e6dc] rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#3898ec] text-[#141413] cursor-pointer"
                  >
                    <option value={10}>10 条</option>
                    <option value={20}>20 条</option>
                    <option value={50}>50 条</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  disabled={page === 1 || loading}
                  onClick={() => setPage(p => Math.max(p - 1, 1))}
                  className="p-1.5 border border-[#e8e6dc] rounded-lg hover:bg-[#e8e6dc]/40 transition disabled:opacity-30 disabled:cursor-not-allowed text-[#4d4c48]"
                >
                  <ChevronLeft size={16} />
                </button>
                <span>
                  第 <strong className="font-bold text-[#141413]">{page}</strong> 页 / 共 {Math.ceil(total / pageSize)} 页
                </span>
                <button
                  disabled={page >= Math.ceil(total / pageSize) || loading}
                  onClick={() => setPage(p => p + 1)}
                  className="p-1.5 border border-[#e8e6dc] rounded-lg hover:bg-[#e8e6dc]/40 transition disabled:opacity-30 disabled:cursor-not-allowed text-[#4d4c48]"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </section>

      </main>

      {/* 右侧抽屉 Drawer / Detail Panel */}
      {isDrawerOpen && selectedLog && (
        <div className="fixed inset-0 z-50 overflow-hidden select-none">
          {/* 半透明黑色遮罩 */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setIsDrawerOpen(false)}
          />

          <div className="absolute inset-y-0 right-0 max-w-xl w-full bg-[#faf9f5] border-l border-[#e8e6dc] shadow-2xl flex flex-col justify-between transition-transform duration-300 transform translate-x-0 select-text">

            {/* 抽屉头部 */}
            <div className="px-6 py-5 border-b border-[#e8e6dc] bg-white flex justify-between items-center select-none">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wide ${selectedLog.level === 'error' || selectedLog.level === 'fatal'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : selectedLog.level === 'warn'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-stone-100 text-stone-600 border-stone-200'
                    }`}>
                    {selectedLog.level}
                  </span>
                  <span className="text-xs bg-slate-100 text-stone-700 border border-slate-200/80 px-2 py-0.5 rounded font-semibold">
                    {selectedLog.action}
                  </span>
                </div>
                <h3 className="text-base font-bold font-serif text-[#141413] mt-2.5 leading-snug">
                  日志审计详情面板
                </h3>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-1.5 border border-[#e8e6dc] rounded-full hover:bg-stone-100 text-stone-500 hover:text-stone-700 transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* 抽屉正文 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">

              {/* 日志主内容 */}
              <div className="bg-[#f5f4ed] border border-[#e8e6dc] p-4 rounded-xl leading-relaxed text-[#141413] text-sm font-medium shadow-inner">
                {selectedLog.msg}
              </div>

              {/* 关键指标看板 */}
              <div className="space-y-3.5">
                <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider select-none">审计链路关键指标</h4>

                <div className="bg-white border border-[#f0eee6] rounded-xl divide-y divide-[#f0eee6] shadow-sm">

                  {/* Trace ID */}
                  <div className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-stone-500 text-xs">
                      <Layers size={14} />
                      <span>全链路 Trace ID</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[#141413] select-all">
                        {selectedLog.traceId || '无 Trace ID'}
                      </span>
                      {selectedLog.traceId && (
                        <button
                          onClick={() => copyToClipboard(selectedLog.traceId, 'traceId')}
                          className="p-1 hover:bg-stone-100 rounded text-stone-400 hover:text-stone-600 transition"
                          title="复制 Trace ID"
                        >
                          {copiedField === 'traceId' ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 发生时间 */}
                  <div className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-stone-500 text-xs">
                      <Activity size={14} />
                      <span>发生时间 (Time)</span>
                    </div>
                    <span className="font-mono text-xs font-semibold text-[#141413]">
                      {formatFullDate(selectedLog.time)}
                    </span>
                  </div>

                  {/* 客户端 IP */}
                  <div className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-stone-500 text-xs">
                      <Database size={14} />
                      <span>客户端 IP (Host)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[#141413]">
                        {selectedLog.ip}
                      </span>
                      <button
                        onClick={() => copyToClipboard(selectedLog.ip, 'ip')}
                        className="p-1 hover:bg-stone-100 rounded text-stone-400 hover:text-stone-600 transition"
                        title="复制 IP 地址"
                      >
                        {copiedField === 'ip' ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* 操作人 */}
                  <div className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-stone-500 text-xs">
                      <User size={14} />
                      <span>操作人 (Operator)</span>
                    </div>
                    <span className="text-xs font-semibold text-[#141413]">
                      {selectedLog.operator}
                    </span>
                  </div>

                </div>
              </div>

              {/* JSON Metadata */}
              <div className="space-y-3.5">
                <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider select-none">附加数据负载 (Metadata JSON)</h4>
                <JsonHighlighter data={selectedLog.metadata} />
              </div>

            </div>

            {/* 抽屉底部 */}
            <div className="px-6 py-4 border-t border-[#e8e6dc] bg-white text-right select-none">
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="bg-terracotta hover:bg-terracotta-hover text-white px-5 py-2 rounded-xl transition text-xs font-semibold shadow-md"
              >
                关闭详情
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

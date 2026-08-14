'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Terminal,
  BarChart2,
  JapaneseYen,
  Cpu,
  Layers,
  Calendar,
  AlertTriangle,
  FileText
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart
} from 'recharts';

export default function AdminDashboardPage() {
  const pathname = usePathname();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(7); // default 7 days

  // 新增联动过滤状态与源数据
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedPreset, setSelectedPreset] = useState('all');
  const [presets, setPresets] = useState([]);
  const [departments, setDepartments] = useState([]);

  // 动态计算在当前选中部门下可见的预设
  const visiblePresets = selectedDept === 'all'
    ? presets
    : presets.filter(p => p.department === selectedDept);

  // 部门切换处理（联动重置预设）
  const handleDeptChange = (e) => {
    const val = e.target.value;
    setSelectedDept(val);
    setSelectedPreset('all');
  };

  // 预设切换处理（联动更新部门）
  const handlePresetChange = (e) => {
    const val = e.target.value;
    setSelectedPreset(val);
    if (val !== 'all') {
      const p = presets.find(item => item.id === val);
      if (p && p.department) {
        setSelectedDept(p.department);
      }
    }
  };

  // 获取物理预设列表
  useEffect(() => {
    fetch('/api/presets')
      .then(res => res.json())
      .then(data => {
        if (data.presets) {
          setPresets(data.presets);
          const depts = Array.from(new Set(data.presets.map(p => p.department).filter(Boolean)));
          setDepartments(depts);
        }
      })
      .catch(err => console.error('获取预设失败:', err));
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/stats/tokens?days=${days}&presetId=${selectedPreset}&department=${selectedDept}`);
      const data = await res.json();
      if (res.ok) {
        setStats(data);
      } else {
        setError(data.error || '获取统计数据失败');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [days, selectedDept, selectedPreset]);

  // 工具函数：数值格式化 (1k, 1M等)
  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  return (
    <div className="min-h-screen bg-[#f5f4ed] text-[#141413] selection:bg-warm-sand selection:text-near-black font-sans pb-16">
      {/* 顶部导航与 Header */}
      <header className="border-b border-[#e8e6dc] bg-[#faf9f5] px-8 py-5 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 bg-terracotta text-white rounded-lg">
                <BarChart2 size={18} />
              </span>
              <h1 className="text-xl font-bold font-serif text-[#141413]">统计与开销看板</h1>
            </div>

            {/* Admin 统一导航 Tab */}
            <div className="flex items-center gap-1 bg-[#e8e6dc]/50 p-1 rounded-lg w-fit">
              <Link href="/admin/logs" className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${pathname === '/admin/logs' ? 'bg-white shadow-sm text-near-black' : 'text-stone-500 hover:text-near-black'}`}>
                <Terminal size={14} /> 操作日志
              </Link>
              <Link href="/admin/dashboard" className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${pathname === '/admin/dashboard' ? 'bg-white shadow-sm text-near-black' : 'text-stone-500 hover:text-near-black'}`}>
                <BarChart2 size={14} /> 统计看板
              </Link>
            </div>
          </div>

          {/* 指标卡板 (Header区域快捷信息) */}
          {stats && !loading && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="bg-[#f5f4ed] border border-[#e8e6dc] px-4 py-2 rounded-xl text-left shadow-inner flex items-center gap-3">
                <JapaneseYen className="text-terracotta" size={16} />
                <div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">区间总开销</div>
                  <div className="text-sm font-bold font-mono">{stats.summary.totalCost.toFixed(2)}</div>
                </div>
              </div>
              <div className="bg-[#f5f4ed] border border-[#e8e6dc] px-4 py-2 rounded-xl text-left shadow-inner flex items-center gap-3">
                <Activity className="text-emerald-600" size={16} />
                <div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">大模型请求数</div>
                  <div className="text-sm font-bold font-mono text-emerald-700">{stats.summary.totalRequests} 次</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* 页面主内容 */}
      <main className="max-w-7xl mx-auto px-8 mt-8 flex flex-col gap-6">

        {/* 控制台 */}
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-serif font-bold text-near-black">模型使用明细</h2>
          <div className="flex items-center gap-2">
            {/* 部门筛选 */}
            <select
              className="bg-white border border-[#e8e6dc] text-xs font-semibold rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-terracotta cursor-pointer"
              value={selectedDept}
              onChange={handleDeptChange}
            >
              <option value="all">全部部门</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>

            {/* 预设筛选 */}
            <select
              className="bg-white border border-[#e8e6dc] text-xs font-semibold rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-terracotta cursor-pointer"
              value={selectedPreset}
              onChange={handlePresetChange}
            >
              <option value="all">全部预设</option>
              {visiblePresets.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <Calendar size={16} className="text-stone-400 ml-1" />
            <select
              className="bg-white border border-[#e8e6dc] text-xs font-semibold rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-terracotta cursor-pointer"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={1}>今天</option>
              <option value={7}>近 7 天</option>
              <option value={30}>近 30 天</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm flex items-center gap-2 border border-red-100">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-stone-400 gap-2">
            <Activity className="animate-pulse" />
            <span className="text-sm font-semibold">正在计算聚合数据...</span>
          </div>
        ) : stats ? (
          <div className="flex flex-col gap-6">

            {/* 核心指标 4 Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-[#e8e6dc] shadow-sm flex flex-col gap-2 relative overflow-hidden group">
                <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider z-10">大模型请求次数</div>
                <div className="text-3xl font-mono font-bold text-near-black z-10">{stats.summary.totalRequests}</div>
                <Layers className="absolute -right-4 -bottom-4 text-stone-100 opacity-50 group-hover:scale-110 transition-transform duration-500" size={100} />
              </div>
              <div className="bg-white p-5 rounded-2xl border border-[#e8e6dc] shadow-sm flex flex-col gap-2 relative overflow-hidden group">
                <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider z-10">输入 Tokens </div>
                <div className="text-3xl font-mono font-bold text-near-black z-10">{formatNumber(stats.summary.promptTokens)}</div>
                <Cpu className="absolute -right-4 -bottom-4 text-stone-100 opacity-50 group-hover:scale-110 transition-transform duration-500" size={100} />
              </div>
              <div className="bg-white p-5 rounded-2xl border border-[#e8e6dc] shadow-sm flex flex-col gap-2 relative overflow-hidden group">
                <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider z-10">输出 Tokens </div>
                <div className="text-3xl font-mono font-bold text-near-black z-10">{formatNumber(stats.summary.completionTokens)}</div>
                <FileText className="absolute -right-4 -bottom-4 text-stone-100 opacity-50 group-hover:scale-110 transition-transform duration-500" size={100} />
              </div>
              <div className="bg-white p-5 rounded-2xl border border-[#e8e6dc] shadow-sm flex flex-col gap-2 relative overflow-hidden group">
                <div className="text-xs font-semibold text-terracotta uppercase tracking-wider z-10">总预估开销 (CNY)</div>
                <div className="text-3xl font-mono font-bold text-terracotta z-10">{stats.summary.totalCost.toFixed(2)}</div>
                <JapaneseYen className="absolute -right-4 -bottom-4 text-terracotta/5 opacity-50 group-hover:scale-110 transition-transform duration-500" size={100} />
              </div>
            </div>

            {/* 趋势图表区 */}
            <div className="bg-white p-6 rounded-2xl border border-[#e8e6dc] shadow-sm flex flex-col gap-6">
              <h3 className="text-sm font-semibold text-stone-600">每日 Tokens 消耗趋势 (近 {days} 天)</h3>
              <div className="w-full h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={stats.trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e6dc" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#87867f' }} axisLine={false} tickLine={false} dy={10} />
                    <YAxis yAxisId="left" tickFormatter={formatNumber} tick={{ fontSize: 10, fill: '#87867f' }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `¥${v}`} tick={{ fontSize: 10, fill: '#c96442' }} axisLine={false} tickLine={false} />
                    <RechartsTooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: '12px' }}
                      formatter={(value, name) => {
                        if (name === '预估开销') return `${Number(value).toFixed(2)}`;
                        return formatNumber(value);
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} iconType="circle" />
                    <Bar yAxisId="left" dataKey="promptTokens" name="输入 Tokens" stackId="a" fill="#3898ec" radius={[0, 0, 4, 4]} barSize={32} />
                    <Bar yAxisId="left" dataKey="completionTokens" name="输出 Tokens" stackId="a" fill="#5db7a1" radius={[4, 4, 0, 0]} barSize={32} />
                    <Line yAxisId="right" type="monotone" dataKey="cost" name="预估开销" stroke="#c96442" strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 模型占比列表 */}
            <div className="bg-white p-6 rounded-2xl border border-[#e8e6dc] shadow-sm flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-stone-600">按模型统计排名</h3>
              {stats.modelBreakdown.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#e8e6dc] text-stone-500 uppercase tracking-wider text-[10px]">
                        <th className="py-3 font-semibold">大模型标识 (Model)</th>
                        <th className="py-3 font-semibold text-right">请求数</th>
                        <th className="py-3 font-semibold text-right">输入 Tokens</th>
                        <th className="py-3 font-semibold text-right">输出 Tokens</th>
                        <th className="py-3 font-semibold text-right text-terracotta">总开销</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e8e6dc]">
                      {stats.modelBreakdown.map((m, idx) => (
                        <tr key={idx} className="hover:bg-[#faf9f5] transition">
                          <td className="py-3 font-mono text-near-black font-semibold flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#3898ec]"></span>
                            {m.model}
                          </td>
                          <td className="py-3 text-right font-mono text-stone-600">{m.requests}</td>
                          <td className="py-3 text-right font-mono text-stone-600">{m.promptTokens.toLocaleString()}</td>
                          <td className="py-3 text-right font-mono text-stone-600">{m.completionTokens.toLocaleString()}</td>
                          <td className="py-3 text-right font-mono font-bold text-terracotta">{m.cost.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-stone-400 py-4 text-center">暂无模型调用数据</div>
              )}
            </div>

          </div>
        ) : null}
      </main>
    </div>
  );
}

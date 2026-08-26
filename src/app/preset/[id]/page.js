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

import Link from 'next/link';
import { getResolvedPreset } from '../../../config/presets.js';
import DocumentExtractor from '../../page.js';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const preset = getResolvedPreset(id);
  const name = preset?.name || `${id} 预设`;
  const description = preset?.subtitle || '智能文档数据结构化提取系统';

  return {
    title: `DocEx · ${name}`,
    description
  };
}

export default async function PresetPage({ params }) {
  const { id } = await params;
  const preset = getResolvedPreset(id);

  // 若预设不存在或被管理员停用，提供友好拦截提示
  if (!preset || (id !== 'default' && preset.enabled === false)) {
    return (
      <main className="min-h-screen bg-[#f5f4ed] flex items-center justify-center p-6 text-[#141413]">
        <div className="max-w-md w-full bg-[#faf9f5] border border-[#e8e6dc] rounded-2xl p-8 shadow-sm text-center flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-2xl shadow-xs">
            ⚠️
          </div>
          <div>
            <h1 className="text-xl font-bold font-serif text-[#141413] mb-1.5">
              预设已停用或不存在
            </h1>
            <p className="text-xs text-[#87867f] leading-relaxed">
              业务预设【{preset?.name || id}】当前已被管理员暂停访问。如需使用请联系管理员在控制面板中重新启用。
            </p>
          </div>
          <div className="pt-2 w-full">
            <Link
              href="/"
              className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-[#c96442] hover:bg-[#b55333] text-white text-xs font-semibold rounded-xl transition shadow-xs"
            >
              返回通用版
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-parchment">
      <DocumentExtractor presetId={id} />
    </main>
  );
}

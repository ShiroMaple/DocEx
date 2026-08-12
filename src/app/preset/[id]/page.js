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

import DocumentExtractor from '../../page.js';

export async function generateMetadata({ params }) {
  const { id } = await params;
  if (id === 'hse') {
    return {
      title: 'DocEx · 安全环保部专属版 - 隐患排查结构化提取',
      description: '面向安全检查与隐患排查报告的结构化数据提取与对齐平台'
    };
  }
  return {
    title: `DocEx · ${id} 专属预设版`,
    description: '智能文档数据结构化提取系统'
  };
}

export default async function PresetPage({ params }) {
  const { id } = await params;

  return (
    <main className="min-h-screen bg-parchment">
      <DocumentExtractor presetId={id} />
    </main>
  );
}

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

  return (
    <main className="min-h-screen bg-parchment">
      <DocumentExtractor presetId={id} />
    </main>
  );
}

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

import { config } from '../config/index.js';

// In-memory rate limiter for default LLM key
const ipRequestLogs = {};

// Clean up expired logs every 1 minute to prevent memory leak
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    const windowMs = config.rateLimit.windowMs;
    for (const ip of Object.keys(ipRequestLogs)) {
      ipRequestLogs[ip] = ipRequestLogs[ip].filter(timestamp => now - timestamp < windowMs);
      if (ipRequestLogs[ip].length === 0) {
        delete ipRequestLogs[ip];
      }
    }
  }, config.rateLimit.windowMs);
}

/**
 * 校验默认 AI 配置的使用频次限制
 * @param {string} ip - 客户端 IP
 * @returns {boolean} 是否允许访问
 */
export function checkRateLimit(ip) {
  const now = Date.now();
  const cleanIp = ip ? ip.split(',')[0].trim() : '127.0.0.1';
  const windowMs = config.rateLimit.windowMs;
  const maxRequests = config.rateLimit.maxRequests;
  
  if (!ipRequestLogs[cleanIp]) {
    ipRequestLogs[cleanIp] = [];
  }
  
  // 仅保留过去的窗口时间内的请求时间戳
  ipRequestLogs[cleanIp] = ipRequestLogs[cleanIp].filter(timestamp => now - timestamp < windowMs);
  
  if (ipRequestLogs[cleanIp].length >= maxRequests) {
    return false; // 触发限流
  }
  
  ipRequestLogs[cleanIp].push(now);
  return true;
}

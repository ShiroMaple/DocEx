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

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Plus,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Wand2,
  Database,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Loader2,
  FileText,
  FileCheck,
  X,
  ArrowRight,
  ArrowLeft,
  Download,
  Eye,
  RotateCcw,
  Copy,
  FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';



const PdfIcon = ({ className = "w-6 h-6" }) => (
  <img src="/icons/pdf.svg" alt="PDF" className={className} />
);

const WordIcon = ({ className = "w-6 h-6" }) => (
  <img src="/icons/word.svg" alt="Word" className={className} />
);

const ImageIcon = ({ className = "w-6 h-6" }) => (
  <span className={`inline-flex items-center justify-center rounded bg-sky-100 text-sky-700 font-bold text-[9px] select-none ${className}`}>
    IMG
  </span>
);

/**
 * 动态计算列宽：
 * 根据该列表头名称与表格所有数据行的最长内容计算；
 * 规则：最大宽度不超过 10 个中文字符 (~184px)，超出时内容换行；最小宽度保证短字段 (如日期 1972-03-25 / 姓名) 不换行 (min 115px)。
 */
const getColWidthPx = (fieldKey, labelText, issues = []) => {
  let maxUnits = 0;

  // 计算表头长度 (1 中文字符 = 1 单元, 1 ASCII 字符 = 0.6 单元)
  const labelStr = labelText || '';
  let labelUnits = 0;
  for (let i = 0; i < labelStr.length; i++) {
    labelUnits += labelStr.charCodeAt(i) > 255 ? 1 : 0.6;
  }
  maxUnits = Math.max(maxUnits, labelUnits);

  // 计算表格内容行的最长长度
  if (Array.isArray(issues)) {
    for (const issue of issues) {
      if (!issue) continue;
      const val = issue[fieldKey];
      if (val !== undefined && val !== null && val !== '') {
        const str = String(val);
        let len = 0;
        for (let i = 0; i < str.length; i++) {
          len += str.charCodeAt(i) > 255 ? 1 : 0.6;
        }
        if (len > maxUnits) maxUnits = len;
      }
    }
  }

  // 1 中文字符 ≈ 14px，基础 padding/border 偏移 = 44px
  // 最小列宽 115px (保证如 1972-03-25 或 4字表头 绝不换行)
  // 最大列宽 184px (严格对应 10 个中文字符 10 * 14 + 44px)
  const calcPx = Math.ceil(maxUnits * 14 + 44);
  return Math.min(184, Math.max(115, calcPx));
};

export default function DocumentExtractor({ presetId = null }) {
  // ── Preset State ──
  const [preset, setPreset] = useState(null);
  const [allPresetsList, setAllPresetsList] = useState([]);

  // ── Granular Permission Controls ──
  const canCustomModel = preset ? preset.allowCustomModel !== false : true;
  const canCustomPlatform = preset ? preset.allowCustomPlatform !== false : true;
  const canCustomFields = preset ? preset.allowCustomFields !== false : true;
  const canCustomPrompt = preset ? preset.allowCustomPrompt !== false : true;

  // ── Tab Navigation State ──
  const [activeStep, setActiveStep] = useState(1); // 1 | 2 | 3
  const [activePopover, setActivePopover] = useState(null); // 'table' | 'llm' | null
  const [toast, setToast] = useState('');

  // ── Enter step 4 auto open table popover ──
  useEffect(() => {
    if (activeStep === 4) {
      setTimeout(() => {
        setActivePopover('table');
      }, 50);
    }
  }, [activeStep]);

  // ── Fetch all available presets list on mount ──
  useEffect(() => {
    fetch('/api/presets')
      .then(res => res.json())
      .then(data => {
        if (data.presets && data.presets.length > 0) {
          setAllPresetsList(data.presets);
        }
      })
      .catch(err => {
        console.error('获取预设列表失败:', err);
      });
  }, []);



  // ── Popover: Table Connection ──
  const [platform, setPlatform] = useState('wps'); // 'wps' | 'feishu'
  const [wpsUrl, setWpsUrl] = useState('');
  const [feishuUrl, setFeishuUrl] = useState('');
  const [wpsFileId, setWpsFileId] = useState('');
  const [feishuAppToken, setFeishuAppToken] = useState('');
  const [feishuTableId, setFeishuTableId] = useState('');

  const [isTableConnected, setIsTableConnected] = useState(false);
  const [tableName, setTableName] = useState('');
  const [schemaFields, setSchemaFields] = useState([]); // Array of { id, name, type, isReadOnly }
  const [autoNumber, setAutoNumber] = useState(true);
  const [isConnectingTable, setIsConnectingTable] = useState(false);
  const [tableConnectionError, setTableConnectionError] = useState('');

  const [tableConfigList, setTableConfigList] = useState([]);
  const [selectedTableConfigId, setSelectedTableConfigId] = useState('wps_test');
  const [customTableConfigName, setCustomTableConfigName] = useState('');
  const [tableAppId, setTableAppId] = useState('');
  const [tableAppSecret, setTableAppSecret] = useState('');

  // ── Popover: LLM Connection ──
  const [llmConfig, setLlmConfig] = useState({
    provider: '',
    baseUrl: '',
    model: '',
    apiKey: '',
    thinkingEffort: ''
  });
  const [llmConnected, setLlmConnected] = useState(false);
  const [llmSupportVision, setLlmSupportVision] = useState(false);
  const [activeModelLabel, setActiveModelLabel] = useState('');
  const [isTestingLlm, setIsTestingLlm] = useState(false);
  const [llmTestError, setLlmTestError] = useState('');

  const [configList, setConfigList] = useState([]);
  const [selectedConfigId, setSelectedConfigId] = useState('default');
  const [customConfigName, setCustomConfigName] = useState('');

  // ── Step 1: Upload & Queue ──
  const [filesQueue, setFilesQueue] = useState([]); // Array of { md5, fileName, size, progress, status, error }
  const [historyFiles, setHistoryFiles] = useState([]); // Array of { md5, fileName, uploadTime }
  const [selectedMd5, setSelectedMd5] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const fileInputRef = useRef(null);

  // ── Step 2: Unified Matrix Schema ──
  const [customPrompt, setCustomPrompt] = useState('');
  const [fields, setFields] = useState([]);
  const [selectedFieldsId, setSelectedFieldsId] = useState('');
  const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);
  const [fieldMappings, setFieldMappings] = useState({}); // { spreadsheetColumnName: docexFieldKey }
  const [isSchemaLoading, setIsSchemaLoading] = useState(false);

  // ── Step 3: Extraction & Pushing ──
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractingProgress, setExtractingProgress] = useState(null); // { percent, currentFile, currentIndex, totalFiles }
  const [fileStatusMap, setFileStatusMap] = useState({}); // { [md5]: 'pending' | 'processing' | 'success' | 'error' }
  const [extractionError, setExtractionError] = useState('');
  const [extractedIssues, setExtractedIssues] = useState([]);
  const [isLlmOutputExpanded, setIsLlmOutputExpanded] = useState(true);
  const [customColWidths, setCustomColWidths] = useState({});

  useEffect(() => {
    setCustomColWidths({});
  }, [preset, fields]);
  const [fileFilteredCountMap, setFileFilteredCountMap] = useState({});
  const totalFilteredCount = Object.values(fileFilteredCountMap).reduce((sum, count) => sum + count, 0);
  const [fileEstPromptTokensMap, setFileEstPromptTokensMap] = useState({});
  const [elapsedTime, setElapsedTime] = useState(null);
  const [prepTokenUsage, setPrepTokenUsage] = useState({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  const [historicalTokenUsage, setHistoricalTokenUsage] = useState({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  const [activeFileTokenUsage, setActiveFileTokenUsage] = useState({});

  const tokenUsage = useMemo(() => {
    const activePrompt = Object.values(activeFileTokenUsage).reduce((sum, item) => sum + (item.promptTokens || 0), 0);
    const activeCompletion = Object.values(activeFileTokenUsage).reduce((sum, item) => sum + (item.completionTokens || 0), 0);

    const totalPrompt = prepTokenUsage.promptTokens + historicalTokenUsage.promptTokens + activePrompt;
    const totalCompletion = prepTokenUsage.completionTokens + historicalTokenUsage.completionTokens + activeCompletion;
    const totalTotal = totalPrompt + totalCompletion;

    if (totalTotal === 0) return null;
    return {
      promptTokens: totalPrompt,
      completionTokens: totalCompletion,
      totalTokens: totalTotal
    };
  }, [prepTokenUsage, historicalTokenUsage, activeFileTokenUsage]);
  const [validationErrors, setValidationErrors] = useState({}); // { rowIndex_fieldKey: errorText }
  const [activeReviewIndex, setActiveReviewIndex] = useState(null);
  const [detailFormState, setDetailFormState] = useState({});

  const handleDetailFieldChange = (key, val) => {
    setDetailFormState(prev => ({ ...prev, [key]: val }));
    updateIssueCell(activeReviewIndex, key, val);
  };

  // ── Dynamic Column Widths for Step 3 and Step 4 ──
  const step4FieldWidths = fields.map((f, idx) => getColWidthPx(f.key || `field_${idx + 1}`, f.label || `列_${idx + 1}`, extractedIssues));
  const step4TotalWidth = 50 + 120 + step4FieldWidths.reduce((a, b) => a + b, 0);

  const step3FieldWidths = fields.map((f, idx) => {
    if (customColWidths[idx] !== undefined) return customColWidths[idx];
    return getColWidthPx(f.key || `field_${idx + 1}`, f.label || `列_${idx + 1}`, extractedIssues);
  });
  const step3TotalWidth = 50 + 100 + step3FieldWidths.reduce((a, b) => a + b, 0) + 80;
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState(null);
  const [isPushMenuOpen, setIsPushMenuOpen] = useState(false);
  const pushMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pushMenuRef.current && !pushMenuRef.current.contains(event.target)) {
        setIsPushMenuOpen(false);
      }
    };
    if (isPushMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPushMenuOpen]);

  useEffect(() => {
    if (filesQueue.length === 0) {
      setPrepTokenUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
      setHistoricalTokenUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
      setActiveFileTokenUsage({});
      setPushResult(null);
      setExtractedIssues([]);
    }
  }, [filesQueue.length]);

  const [rawLlmResponse, setRawLlmResponse] = useState('');
  const [isLlmModalOpen, setIsLlmModalOpen] = useState(false);
  const [isDetectingFields, setIsDetectingFields] = useState(false);
  const [detectingStreamText, setDetectingStreamText] = useState('');
  const [detectAbortController, setDetectAbortController] = useState(null);

  const cancelAutoDetect = () => {
    if (detectAbortController) {
      detectAbortController.abort();
      setDetectAbortController(null);
    }
    setIsDetectingFields(false);
    setDetectingStreamText('');
    showToast('已主动停止自动识别字段过程。', 'info');
  };

  const autoDetectFields = () => {
    if (!llmConnected) {
      showToast('⚠️ 智能分析受阻：请先在右上角AI模型网关配置中进行测试连接通过', 'error');
      return;
    }
    const doneFiles = filesQueue.filter(f => f.status === 'done');
    if (doneFiles.length === 0) {
      showToast('⚠️ 智能分析受阻：请先在步骤 1 中上传并就绪至少一个待分析文档！', 'error');
      return;
    }
    const firstFile = doneFiles[0];

    const controller = new AbortController();
    setDetectAbortController(controller);
    setDetectingStreamText('');
    setIsDetectingFields(true);
    showToast('🔮 AI 正在尝试智能分析文档首页以推演最佳字段定义...');

    fetch('/api/auto-detect-fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        md5: firstFile.md5,
        llmConfig
      }),
      signal: controller.signal
    })
      .then(async (res) => {
        if (!res.ok) {
          const errText = await res.text().catch(() => '分析自动识别失败');
          throw new Error(errText);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line.trim());
              if (data.type === 'chunk') {
                setDetectingStreamText(prev => prev + data.text);
              } else if (data.type === 'done') {
                if (data.fields && data.fields.length > 0) {
                  setFields(data.fields);
                  showToast(`🔮 智能推荐成功！一键生成并覆盖了 ${data.fields.length} 个核心字段定义。`);

                  if (data.usage) {
                    setPrepTokenUsage(prev => ({
                      promptTokens: prev.promptTokens + (data.usage.promptTokens || 0),
                      completionTokens: prev.completionTokens + (data.usage.completionTokens || 0),
                      totalTokens: prev.totalTokens + (data.usage.totalTokens || 0)
                    }));
                  }
                } else {
                  showToast('⚠️ 智能推演完毕，模型未能从文档中识别到合适的提取字段。', 'error');
                }
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (jsonErr) {
              console.error('解析流数据失败:', jsonErr);
            }
          }
        }
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        console.error('智能提取失败:', err);
        showToast(`❌ 字段自动分析出错: ${err.message}`, 'error');
      })
      .finally(() => {
        setIsDetectingFields(false);
        setDetectAbortController(null);
      });
  };

  // ── Load Preset Config (Default or Specific) ──
  useEffect(() => {
    const targetPresetId = presetId || 'default';

    fetch(`/api/presets/${targetPresetId}`)
      .then(res => res.json())
      .then(data => {
        if (data.preset) {
          const p = data.preset;
          setPreset(p);
          if (p.fields && p.fields.length > 0) setFields(p.fields);
          setSelectedFieldsId(p.fieldsRef || 'default');
          if (p.systemPrompt) setCustomPrompt(p.systemPrompt);
          if (p.fieldMapping) setFieldMappings(p.fieldMapping);
          if (p.platform) setPlatform(p.platform);

          if (p.llmConfig) {
            setLlmConfig({
              provider: p.llmConfig.provider || 'openai',
              baseUrl: p.llmConfig.baseUrl,
              model: p.llmConfig.model,
              apiKey: p.llmConfig.hasApiKey ? '••••••••••••••••••••' : ''
            });
            if (p.llmConfig.hasApiKey) {
              setLlmConnected(true);
            }
            // 联动大模型下拉框当前生效 ID，防止 UI 不同步
            const match = configList.find(c => c.model === p.llmConfig.model && c.baseUrl === p.llmConfig.baseUrl);
            if (match) {
              setSelectedConfigId(match.id);
            }
          }

          const activeTableId = p.tableConfigId || p.tableConfig?.id || (p.platform === 'feishu' ? 'feishu_test' : 'wps_test');
          setSelectedTableConfigId(activeTableId);

          if (p.platform === 'feishu') {
            const token = p.lark?.appToken || p.tableConfig?.appToken || '';
            const tid = p.lark?.tableId || p.tableConfig?.tableId || '';
            const appId = p.lark?.appId || '';
            const appSecret = p.lark?.appSecret || '';
            setFeishuAppToken(token);
            setFeishuTableId(tid);
            setTableAppId(appId);
            setTableAppSecret(appSecret);
            const url = p.tableConfig?.url || (token ? `https://cli-aac44e92a2b89bd5.feishu.cn/base/${token}?table=${tid}` : '');
            setFeishuUrl(url);

            verifyTableConnection({
              platform: 'feishu',
              feishuAppToken: token,
              feishuTableId: tid,
              feishuUrl: url,
              appId,
              appSecret,
              fields: p.fields || [],
              fieldMapping: p.fieldMapping
            });
          } else if (p.platform === 'wps') {
            const fid = p.wps?.tableId || p.tableConfig?.tableId || '';
            const appId = p.wps?.appId || '';
            const appSecret = p.wps?.appSecret || '';
            setWpsFileId(fid);
            setTableAppId(appId);
            setTableAppSecret(appSecret);
            const url = p.tableConfig?.url || (fid ? `https://365.kdocs.cn/l/${fid}` : '');
            setWpsUrl(url);

            verifyTableConnection({
              platform: 'wps',
              wpsFileId: fid,
              wpsUrl: url,
              appId,
              appSecret,
              fields: p.fields || [],
              fieldMapping: p.fieldMapping
            });
          }
        }
      })
      .catch(err => {
        console.error(`加载预设 [${presetId}] 失败:`, err);
      });
  }, [presetId]);

  // ── Load credentials & configurations dynamically from /api/config ──
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(configData => {
        if (!configData) return;

        const defaultLLMConf = configData.defaultLLMConf;
        const defaultWpsConf = configData.defaultWpsConf;
        const defaultFeishuConf = configData.defaultFeishuConf;
        const defaultUrls = configData.defaultUrls || {};

        // 1. Load LLM Credentials from dynamic configuration
        const loadedList = configData.defaultLLMList || [];
        setConfigList(loadedList);

        // 优先匹配当前 preset 锁定的模型，防止竞态条件干扰
        let activeConfig = null;
        if (preset && preset.llmConfig) {
          activeConfig = loadedList.find(c => c.model === preset.llmConfig.model && c.baseUrl === preset.llmConfig.baseUrl);
        }
        if (!activeConfig) {
          const activeId = localStorage.getItem('docex_active_llm_config_id') || 'default';
          activeConfig = loadedList.find(c => c.id === activeId) || loadedList.find(c => c.isDefault) || loadedList[0] || defaultLLMConf;
        }

        // 防御式重刷：如果激活的是“默认配置”（default），强制使用服务器 config.json 最新拉取的 model 与 baseUrl，消除 localStorage 脏缓存干扰
        if (activeConfig && activeConfig.id === 'default') {
          activeConfig.model = defaultLLMConf.model;
          activeConfig.baseUrl = defaultLLMConf.baseUrl;
        }

        setLlmConfig({
          provider: activeConfig.provider,
          baseUrl: activeConfig.baseUrl,
          model: activeConfig.model,
          apiKey: activeConfig.apiKey,
          thinkingEffort: activeConfig.thinkingEffort || ''
        });
        setSelectedConfigId(activeConfig.id);

        // 2. Load Table Configurations
        const serverTableConfigs = configData.parsedTableConfigs || [];
        const cachedTableList = localStorage.getItem('docex_table_config_list');
        let loadedTableList = [];
        if (cachedTableList) {
          try { loadedTableList = JSON.parse(cachedTableList); } catch { }
        }

        // Merge server-defined configs from config.json into loadedTableList
        serverTableConfigs.forEach(stc => {
          const idx = loadedTableList.findIndex(c => c.id === stc.id);
          if (idx < 0) {
            loadedTableList.push(stc);
          } else {
            loadedTableList[idx] = { ...stc, url: loadedTableList[idx].url || stc.url };
          }
        });

        if (!loadedTableList.some(c => c.id === 'wps_test')) loadedTableList.push(defaultWpsConf);
        if (!loadedTableList.some(c => c.id === 'feishu_test')) loadedTableList.push(defaultFeishuConf);

        setTableConfigList(loadedTableList);

        if (!presetId) {
          const activeTableId = localStorage.getItem('docex_active_table_config_id') || 'wps_test';
          const activeTableConfig = loadedTableList.find(c => c.id === activeTableId) || defaultWpsConf;

          setPlatform(activeTableConfig.platform || 'wps');

          // 直接使用后端物理 config.json 的默认配置，不再受 localStorage 脏数据交叉污染
          const resolvedWpsUrl = defaultWpsConf?.url || '';
          const resolvedFeishuUrl = defaultFeishuConf?.url || '';

          setWpsUrl(resolvedWpsUrl);
          setFeishuUrl(resolvedFeishuUrl);

          setTableAppId(activeTableConfig.appId || '');
          setTableAppSecret(activeTableConfig.appSecret || '');
          setSelectedTableConfigId(activeTableConfig.id);
          setCustomTableConfigName(activeTableConfig.isDefault ? '' : activeTableConfig.name);
        }
      })
      .catch(err => {
        console.error('加载外部 config.json 失败:', err);
      });

    fetchHistoryFiles();

    // Click outside popovers handler
    const handleClickOutside = (e) => {
      if (!e.target.closest('.popover-container')) {
        setActivePopover(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Auto-connect default LLM presets
  useEffect(() => {
    const isDefaultLlm = selectedConfigId === 'default';
    if (isDefaultLlm) {
      setLlmConnected(true);
      setLlmSupportVision(true);
      setActiveModelLabel('mimo-v2.5 (默认已测试)');
    }
  }, [selectedConfigId]);

  useEffect(() => {
    const isDefaultWps = platform === 'wps' && wpsFileId === 'cbGbLglUXASe';
    const isDefaultFeishu = platform === 'feishu' && feishuAppToken === '[REDACTED_FEISHU_APP_TOKEN]' && feishuTableId === '[REDACTED_FEISHU_TABLE_ID]';

    if (isDefaultWps || isDefaultFeishu) {
      verifyTableConnection();
    }
  }, [platform, wpsFileId, feishuAppToken, feishuTableId]);

  // Toast notifier helper
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  // URL parsing link reactions
  useEffect(() => {
    if (wpsUrl) {
      const match = wpsUrl.match(/\/l\/([^?#/]+)/);
      setWpsFileId(match ? match[1] : wpsUrl.trim());
      // localStorage.setItem('docex_wps_url', wpsUrl);
    } else {
      setWpsFileId('');
    }
    resetTableAlignment();
  }, [wpsUrl]);

  useEffect(() => {
    if (feishuUrl) {
      const tokenMatch = feishuUrl.match(/\/(base|wiki)\/([a-zA-Z0-9_-]+)/);
      setFeishuAppToken(tokenMatch ? tokenMatch[2] : '');

      try {
        const urlObj = new URL(feishuUrl);
        setFeishuTableId(urlObj.searchParams.get('table') || '');
      } catch (e) {
        const tableMatch = feishuUrl.match(/[?&]table=([a-zA-Z0-9]+)/);
        setFeishuTableId(tableMatch ? tableMatch[1] : '');
      }
      // localStorage.setItem('docex_feishu_url', feishuUrl);
    } else {
      setFeishuAppToken('');
      setFeishuTableId('');
    }
    resetTableAlignment();
  }, [feishuUrl]);

  // Monitor platform toggle change
  useEffect(() => {
    resetTableAlignment();
  }, [platform]);

  const resetTableAlignment = () => {
    setIsTableConnected(false);
    setTableName('');
    setSchemaFields([]);
  };

  // ── Sync spreadsheet schema ──
  const verifyTableConnection = async (overrideParams = null) => {
    setIsConnectingTable(true);
    setIsSchemaLoading(true);
    setTableConnectionError('');
    setIsTableConnected(false);

    const activePlatform = overrideParams?.platform || platform;
    const activeAppId = overrideParams?.appId || tableAppId;
    const activeAppSecret = overrideParams?.appSecret || tableAppSecret;

    let query = `provider=${activePlatform}&force=true`;

    if (activePlatform === 'wps') {
      let targetFileId = overrideParams?.wpsFileId || wpsFileId;
      const targetUrl = overrideParams?.wpsUrl || wpsUrl;

      if (!targetFileId && targetUrl) {
        const match = targetUrl.match(/\/l\/([^?#/]+)/);
        targetFileId = match ? match[1] : targetUrl.trim();
      }

      if (!targetFileId) {
        setTableConnectionError('请先输入有效的 WPS 协作分享链接');
        setIsConnectingTable(false);
        setIsSchemaLoading(false);
        return false;
      }
      query += `&fileId=${encodeURIComponent(targetFileId)}`;
    } else {
      let targetAppToken = overrideParams?.feishuAppToken || feishuAppToken;
      let targetTableId = overrideParams?.feishuTableId || feishuTableId;
      const targetUrl = overrideParams?.feishuUrl || feishuUrl;

      if ((!targetAppToken || !targetTableId) && targetUrl) {
        const tokenMatch = targetUrl.match(/\/(base|wiki)\/([a-zA-Z0-9_-]+)/);
        if (tokenMatch) targetAppToken = tokenMatch[2];
        try {
          const urlObj = new URL(targetUrl);
          targetTableId = urlObj.searchParams.get('table') || '';
        } catch (e) {
          const tableMatch = targetUrl.match(/[?&]table=([a-zA-Z0-9]+)/);
          if (tableMatch) targetTableId = tableMatch[1];
        }
      }

      if (!targetAppToken || !targetTableId) {
        setTableConnectionError('请先输入有效的飞书多维表格链接（包含 table 参数）');
        setIsConnectingTable(false);
        setIsSchemaLoading(false);
        return false;
      }
      query += `&appToken=${encodeURIComponent(targetAppToken)}&tableId=${encodeURIComponent(targetTableId)}`;
    }

    if (activeAppId) query += `&appId=${encodeURIComponent(activeAppId)}`;
    if (activeAppSecret) query += `&appSecret=${encodeURIComponent(activeAppSecret)}`;

    try {
      const res = await fetch(`/api/schema?${query}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || '连接多维表格失败');

      setSchemaFields(data.fields || []);
      setTableName(data.sheetName || '数据表');
      setIsTableConnected(true);

      const fieldsToUse = overrideParams?.fields || fields;
      const initMappings = {};
      fieldsToUse.forEach(f => {
        const match = fuzzyMatchField(f.label, data.fields);
        if (match) {
          initMappings[match] = f.key;
        }
      });

      if (overrideParams?.fieldMapping) {
        Object.assign(initMappings, overrideParams.fieldMapping);
      } else {
        const targetId = activePlatform === 'wps' ? (overrideParams?.wpsFileId || wpsFileId) : `${overrideParams?.feishuAppToken || feishuAppToken}_${overrideParams?.feishuTableId || feishuTableId}`;
        const saved = localStorage.getItem(`docex_mapping_${targetId}`);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            Object.keys(parsed).forEach(col => {
              const schemaField = data.fields.find(sf => sf.name === col);
              if (schemaField && !schemaField.isReadOnly) {
                initMappings[col] = parsed[col];
              }
            });
          } catch { }
        }
      }

      setFieldMappings(initMappings);
      return true;
    } catch (err) {
      setTableConnectionError(err.message);
      return false;
    } finally {
      setIsConnectingTable(false);
      setIsSchemaLoading(false);
    }
  };

  const handleTableConfigChange = (id) => {
    setSelectedTableConfigId(id);
    if (id === 'new') {
      setPlatform('wps');
      setWpsUrl('');
      setFeishuUrl('');
      setTableAppId('');
      setTableAppSecret('');
      setCustomTableConfigName('');
      resetTableAlignment();
    } else {
      const selected = tableConfigList.find(c => c.id === id);
      if (selected) {
        setPlatform(selected.platform || 'wps');
        if (selected.platform === 'wps') {
          setWpsUrl(selected.url || '');
        } else {
          setFeishuUrl(selected.url || '');
        }
        setTableAppId(selected.appId || '');
        setTableAppSecret(selected.appSecret || '');
        setCustomTableConfigName(selected.isDefault ? '' : selected.name);
        resetTableAlignment();
      }
    }
  };

  const handleDeleteTableConfig = (id) => {
    if (id === 'wps_test' || id === 'feishu_test') return;
    if (!confirm('确定要删除此表格配置吗？')) return;

    const updatedList = tableConfigList.filter(c => c.id !== id);
    setTableConfigList(updatedList);
    localStorage.setItem('docex_table_config_list', JSON.stringify(updatedList));

    setSelectedTableConfigId('wps_test');
    handleTableConfigChange('wps_test');
    showToast('🗑️ 表格配置删除成功，已恢复为默认测试配置');
  };

  const fuzzyMatchField = (label, schemaFieldsList) => {
    const writeable = schemaFieldsList.filter(f => !f.isReadOnly);
    for (const f of writeable) {
      if (f.name.toLowerCase().includes(label.toLowerCase()) || label.toLowerCase().includes(f.name.toLowerCase())) {
        return f.name;
      }
    }
    return '';
  };

  const handleMappingChange = (colName, value) => {
    const newMappings = { ...fieldMappings };
    if (value) {
      newMappings[colName] = value;
    } else {
      delete newMappings[colName];
    }
    setFieldMappings(newMappings);

    const targetId = platform === 'wps' ? wpsFileId : `${feishuAppToken}_${feishuTableId}`;
    localStorage.setItem(`docex_mapping_${targetId}`, JSON.stringify(newMappings));
  };

  const createTableColumn = async (columnName, skipVerify = false) => {
    // 幂等校验：若此列已存在则不重复创建，自动建立映射
    const exists = schemaFields.some(sf => sf.name === columnName);
    if (exists) {
      const matchedField = fields.find(f => f.label === columnName);
      if (matchedField) {
        const currentKey = matchedField.key;
        setFieldMappings(prev => {
          const updated = { ...prev, [columnName]: currentKey };
          const targetId = platform === 'wps' ? wpsFileId : `${feishuAppToken}_${feishuTableId}`;
          localStorage.setItem(`docex_mapping_${targetId}`, JSON.stringify(updated));
          return updated;
        });
      }
      return;
    }

    try {
      const res = await fetch('/api/create-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: platform,
          fileId: wpsFileId,
          appToken: feishuAppToken,
          tableId: feishuTableId,
          fieldName: columnName
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '云端建列失败');

      if (!skipVerify) {
        showToast(`已在云端创建列 "${columnName}"，正在重刷表头结构...`);
        await verifyTableConnection();
      }
    } catch (e) {
      alert(`创建失败: ${e.message}`);
      throw e;
    }
  };

  // ── Smart Redirection for Step 3 Push to Step 4 ──
  const handleStep3Push = async () => {
    if (isTableConnected) {
      showToast('多维表连接已就绪，正在直接推送数据，请稍候...');
      pushToSpreadsheet();
    } else {
      showToast('正在检查多维表格连接状态...');
      const autoOk = await verifyTableConnection();
      if (autoOk) {
        showToast('自动连通成功！正在推送数据，请稍候...');
        pushToSpreadsheet();
      } else {
        showToast('⚠️ 未检测到多维表配置或已连通的表格，已为您自动切换到 [步骤四] 进行设置！');
        setActiveStep(4);
      }
    }
  };

  // ── LLM Connection verification ──
  const verifyLlmConnection = async () => {
    setIsTestingLlm(true);
    setLlmTestError('');
    setLlmConnected(false);

    try {
      const res = await fetch('/api/test-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(llmConfig)
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || '连接测试大模型失败');

      setLlmSupportVision(data.supportVision);
      setLlmConnected(true);
      setActiveModelLabel(data.model);

      // 只提供测试连通性，不提供保存
      showToast(`🎉 模型 [${data.model || llmConfig.model}] 连接测试成功！`);

    } catch (err) {
      setLlmTestError(err.message);
    } finally {
      setIsTestingLlm(false);
    }
  };

  const handleConfigChange = (id) => {
    setSelectedConfigId(id);
    localStorage.setItem('docex_active_llm_config_id', id);
    const selected = configList.find(c => c.id === id);
    if (selected) {
      setLlmConfig({
        provider: selected.provider,
        baseUrl: selected.baseUrl,
        model: selected.model,
        apiKey: selected.apiKey,
        thinkingEffort: selected.thinkingEffort || ''
      });
    }
  };

  const handleDeleteConfig = (id) => {
    if (id === 'default') return;
    if (!confirm('确定要删除此模型配置吗？')) return;

    const updatedList = configList.filter(c => c.id !== id);
    setConfigList(updatedList);
    localStorage.setItem('docex_llm_config_list', JSON.stringify(updatedList));

    setSelectedConfigId('default');
    const defaultLLMConf = updatedList.find(c => c.id === 'default');
    if (defaultLLMConf) {
      setLlmConfig({
        provider: defaultLLMConf.provider,
        baseUrl: defaultLLMConf.baseUrl,
        model: defaultLLMConf.model,
        apiKey: defaultLLMConf.apiKey,
        thinkingEffort: defaultLLMConf.thinkingEffort || ''
      });
      setCustomConfigName('');
      localStorage.setItem('docex_active_llm_config_id', 'default');
      localStorage.setItem('docex_llm_config', JSON.stringify(defaultLLMConf));
    }
    showToast('🗑️ 配置删除成功，已恢复为默认配置');
  };

  const optimizePrompt = async () => {
    setIsOptimizingPrompt(true);
    try {
      const res = await fetch('/api/optimize-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: llmConfig.apiKey,
          baseUrl: llmConfig.baseUrl,
          model: llmConfig.model,
          prompt: customPrompt,
          fields: fields.map((f, idx) => ({
            key: f.key || `field_${idx + 1}`,
            desc: f.desc || '',
            example: f.example || ''
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '优化提示词失败');

      setCustomPrompt(data.optimizedPrompt);
      showToast('AI 提示词优化成功！');
      if (data.usage) {
        setPrepTokenUsage(prev => ({
          promptTokens: prev.promptTokens + (data.usage.promptTokens || 0),
          completionTokens: prev.completionTokens + (data.usage.completionTokens || 0),
          totalTokens: prev.totalTokens + (data.usage.totalTokens || 0)
        }));
      }
    } catch (e) {
      alert(`优化失败: ${e.message}`);
    } finally {
      setIsOptimizingPrompt(false);
    }
  };

  // ── Step 1: Upload & Queue list ──
  const fetchHistoryFiles = async () => {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      if (data.files) {
        setHistoryFiles(data.files);
      }
    } catch (e) {
      console.error('获取历史记录失败:', e);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFilesUpload(e.dataTransfer.files);
    }
  };

  const handleFilesUpload = async (fileList) => {
    const allowedExtensions = ['pdf', 'docx', 'jpg', 'jpeg', 'png'];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const ext = file.name.split('.').pop().toLowerCase();

      if (!allowedExtensions.includes(ext)) {
        alert(`不支持的文件格式: ${file.name}`);
        continue;
      }
      if (file.size === 0) {
        alert(`不能上传空文件: ${file.name}`);
        continue;
      }
      if (file.size > 50 * 1024 * 1024) {
        alert(`文件过大（最大 50MB）: ${file.name}`);
        continue;
      }

      const tempId = Math.random().toString(36).substring(7);
      const queueItem = {
        tempId,
        fileName: file.name,
        size: file.size,
        progress: 10,
        status: 'uploading',
        error: null,
        md5: ''
      };

      setFilesQueue(prev => [queueItem, ...prev]);
      uploadAndPreprocessFile(file, tempId);
    }
  };

  const uploadAndPreprocessFile = async (file, tempId) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || '上传或计算 MD5 失败');

      const md5 = data.record.md5;

      // MD5 Deduplication Check
      const isDuplicateInQueue = filesQueue.some(item => item.md5 === md5);
      if (isDuplicateInQueue) {
        showToast('该文档已在队列中，已自动排重');
        setFilesQueue(prev => prev.filter(item => item.tempId !== tempId));
        return;
      }

      setFilesQueue(prev => prev.map(item => {
        if (item.tempId === tempId) {
          return {
            ...item,
            md5,
            status: data.isDuplicate ? 'done' : 'preprocessing',
            progress: data.isDuplicate ? 100 : 20
          };
        }
        return item;
      }));

      setSelectedMd5(md5);
      await fetchHistoryFiles();

      if (!data.isDuplicate) {
        pollPreprocessingStatus(md5, tempId);
      }

    } catch (err) {
      setFilesQueue(prev => prev.map(item => {
        if (item.tempId === tempId) {
          return { ...item, status: 'failed', error: err.message, progress: 100 };
        }
        return item;
      }));
    }
  };

  const pollPreprocessingStatus = async (md5, tempId) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/files/${md5}/status`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || '获取预处理进度失败');

        setFilesQueue(prev => prev.map(item => {
          if (item.tempId === tempId || item.md5 === md5) {
            return {
              ...item,
              status: data.status,
              progress: data.progress,
              error: data.error
            };
          }
          return item;
        }));

        if (data.status === 'done' || data.status === 'failed') {
          clearInterval(interval);
          fetchHistoryFiles();
        }
      } catch (err) {
        clearInterval(interval);
        setFilesQueue(prev => prev.map(item => {
          if (item.tempId === tempId || item.md5 === md5) {
            return { ...item, status: 'failed', error: err.message };
          }
          return item;
        }));
      }
    }, 1000);
  };

  const deleteHistoryFile = async (md5, e) => {
    e.stopPropagation();

    try {
      const res = await fetch(`/api/files?md5=${md5}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除失败');
      }

      if (selectedMd5 === md5) setSelectedMd5('');
      setFilesQueue(prev => prev.filter(f => f.md5 !== md5));
      await fetchHistoryFiles();
      showToast('历史缓存清理成功');
    } catch (e) {
      alert(`删除失败: ${e.message}`);
    }
  };

  const reuseHistoryFile = (file) => {
    // Check duplication in queue
    const exists = filesQueue.some(f => f.md5 === file.md5);
    if (exists) {
      showToast('该文档已在队列中，已自动排重');
      setSelectedMd5(file.md5);
      return;
    }

    const newItem = {
      tempId: Math.random().toString(36).substring(7),
      md5: file.md5,
      fileName: file.fileName,
      size: 0,
      progress: 100,
      status: 'done',
      error: null
    };

    setFilesQueue(prev => [newItem, ...prev]);
    setSelectedMd5(file.md5);
  };

  // ── Step 2: Unified Matrix Field Methods ──
  const updateFieldCell = (index, key, val) => {
    const updated = [...fields];
    updated[index][key] = val;
    setFields(updated);
  };

  const toggleAdvancedConfig = (index) => {
    const updated = [...fields];
    updated[index].isAdvancedOpen = !updated[index].isAdvancedOpen;
    setFields(updated);
  };

  const removeFieldItem = (index) => {
    setFields(prev => prev.filter((_, i) => i !== index));
  };

  const addFieldItem = () => {
    setFields(prev => [...prev, { key: '', label: '', desc: '', example: '', isAdvancedOpen: false }]);
  };

  const moveFieldItem = (index, direction) => {
    const newFields = [...fields];
    if (direction === 'up' && index > 0) {
      const temp = newFields[index];
      newFields[index] = newFields[index - 1];
      newFields[index - 1] = temp;
    } else if (direction === 'down' && index < newFields.length - 1) {
      const temp = newFields[index];
      newFields[index] = newFields[index + 1];
      newFields[index + 1] = temp;
    } else if (direction === 'top' && index > 0) {
      const [item] = newFields.splice(index, 1);
      newFields.unshift(item);
    } else if (direction === 'bottom' && index < newFields.length - 1) {
      const [item] = newFields.splice(index, 1);
      newFields.push(item);
    }
    setFields(newFields);
  };

  // ── Step 3: LLM Extraction & Safety Guard ──
  const checkPromptSecurityLocal = (promptText) => {
    const patterns = [
      /\.env/i, /env\b/i, /process\.env/i, /api_key/i, /apikey/i, /secret/i,
      /password/i, /credential/i, /token/i, /\/etc\/passwd/i, /system files/i,
      /ignore previous/i, /bypass safety/i, /system prompt/i, /developer mode/i
    ];
    return patterns.some(pat => pat.test(promptText));
  };

  const startExtraction = async () => {
    const readyFiles = filesQueue.filter(f => f.status === 'done');
    if (readyFiles.length === 0) {
      alert('请先上传文件或从历史记录中选择至少一个已准备就绪的文档！');
      return;
    }

    // 校验配置字段是否为空（过滤掉无名称的空字段记录）
    const validFields = fields.filter(f => f && f.label && f.label.trim() !== '');
    if (validFields.length === 0) {
      alert('请至少配置一个有效的字段（字段名不可为空）再开始解析！');
      return;
    }

    // 解耦后，大模型解析前不再阻断校验多维表格连接

    setExtractionError('');
    setExtractedIssues([]);
    setFileFilteredCountMap({});
    setFileEstPromptTokensMap({});
    setElapsedTime(null);
    // 将上一次执行（若有）的流式临时开销归档合并至历史累加值中，实现持续累加模式
    const activePrompt = Object.values(activeFileTokenUsage).reduce((sum, item) => sum + (item.promptTokens || 0), 0);
    const activeCompletion = Object.values(activeFileTokenUsage).reduce((sum, item) => sum + (item.completionTokens || 0), 0);
    const activeTotal = Object.values(activeFileTokenUsage).reduce((sum, item) => sum + (item.totalTokens || 0), 0);

    setHistoricalTokenUsage(prev => ({
      promptTokens: prev.promptTokens + activePrompt,
      completionTokens: prev.completionTokens + activeCompletion,
      totalTokens: prev.totalTokens + activeTotal
    }));
    setActiveFileTokenUsage({});
    setPushResult(null);
    setRawLlmResponse('');

    // Prompt Security Shield Local Check
    if (checkPromptSecurityLocal(customPrompt)) {
      setExtractionError('⚠️ 安全拦截：检测到潜在的提示词注入攻击或敏感配置泄露风险（禁止索要环境变量、系统文件或执行越狱指令）。');
      setActiveStep(3);
      return;
    }

    // Check fields prompt injection
    const fieldLeak = fields.some(f => checkPromptSecurityLocal(f.label) || checkPromptSecurityLocal(f.desc) || checkPromptSecurityLocal(f.example));
    if (fieldLeak) {
      setExtractionError('⚠️ 安全拦截：检测到提取字段属性描述中含有潜在的越狱或隐私嗅探词汇。');
      setActiveStep(3);
      return;
    }

    // Initialize files status map
    const initialStatus = {};
    readyFiles.forEach(f => {
      initialStatus[f.md5] = 'pending';
    });
    setFileStatusMap(initialStatus);

    // Immediate page transition
    setActiveStep(3);
    setIsExtracting(true);
    setExtractingProgress({
      percent: 0,
      currentFile: readyFiles[0].fileName,
      currentIndex: 1,
      totalFiles: readyFiles.length
    });

    // Precompile keys dynamically if empty
    const processedFields = fields.map((f, idx) => ({
      key: f.key ? f.key.trim() : `field_${idx + 1}`,
      label: f.label || `未命名_${idx + 1}`,
      desc: f.desc || '',
      example: f.example || ''
    }));

    let allExtractedIssues = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTotalTokens = 0;
    let finalError = null;

    const batchStartTime = Date.now();

    for (let i = 0; i < readyFiles.length; i++) {
      const file = readyFiles[i];
      setFileStatusMap(prev => Object.assign({}, prev, { [file.md5]: 'processing' }));
      setExtractingProgress({
        percent: Math.round((i / readyFiles.length) * 100),
        currentFile: file.fileName,
        currentIndex: i + 1,
        totalFiles: readyFiles.length
      });

      // 步骤 1：本地输入 Token 粗估
      const estPromptTokens = Math.max(1000, Math.round((file.size || 0) * 0.4));
      setFileEstPromptTokensMap(prev => {
        const updated = Object.assign({}, prev, { [file.md5]: estPromptTokens });
        return updated;
      });
      setActiveFileTokenUsage(prev => ({
        ...prev,
        [file.md5]: { promptTokens: estPromptTokens, completionTokens: 0 }
      }));

      try {
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            md5: file.md5,
            systemPrompt: customPrompt,
            userPrompt: '请分析该文档并提取结构化字段：',
            fields: processedFields,
            llmConfig,
            postFilters: preset?.postFilters,
            presetId: preset?.id || 'unknown',
            department: preset?.department || 'unknown'
          })
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error("请求失败: " + (errText || res.statusText));
        }

        // 步骤 2：流式响应读取
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fileRawContent = '';
        let fileDoneResult = null;
        let lastEstCompletion = 0;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const lineStr of lines) {
            if (!lineStr.trim()) continue;
            try {
              const line = JSON.parse(lineStr);
              if (line.type === 'chunk') {
                fileRawContent += line.text;
                setRawLlmResponse(prev => {
                  const header = "/* === 文件: " + file.fileName + " (" + file.md5 + ") === */";
                  let cleaned = prev || '';
                  const idx = cleaned.indexOf(header);
                  if (idx !== -1) {
                    const nextIdx = cleaned.indexOf('/* === 文件:', idx + header.length);
                    if (nextIdx !== -1) {
                      cleaned = cleaned.slice(0, idx) + cleaned.slice(nextIdx);
                    } else {
                      cleaned = cleaned.slice(0, idx);
                    }
                  }
                  return (cleaned.trim() + "\n\n" + header + "\n" + fileRawContent).trim();
                });

                // 输出 Token 随字数增长动态计算逻辑
                const estCompletion = Math.round(fileRawContent.length * 1.3);
                setActiveFileTokenUsage(prev => {
                  const existing = prev[file.md5] || { promptTokens: 0, completionTokens: 0 };
                  return {
                    ...prev,
                    [file.md5]: {
                      ...existing,
                      completionTokens: estCompletion
                    }
                  };
                });

              } else if (line.type === 'estimated') {
                // 精准估算输入 Token 并实时覆盖更新
                const realEst = line.promptTokens || 0;
                setActiveFileTokenUsage(prev => {
                  const existing = prev[file.md5] || { promptTokens: 0, completionTokens: 0 };
                  return {
                    ...prev,
                    [file.md5]: {
                      ...existing,
                      promptTokens: realEst
                    }
                  };
                });
                setFileEstPromptTokensMap(prev => {
                  const updated = Object.assign({}, prev, { [file.md5]: realEst });
                  return updated;
                });

              } else if (line.type === 'done') {
                fileDoneResult = line;
              } else if (line.type === 'error') {
                throw new Error(line.error);
              }
            } catch (e) {
              console.error('流解析帧出错:', e);
            }
          }
        }

        if (fileDoneResult) {
          const realPrompt = fileDoneResult.tokenUsage?.promptTokens || 0;
          const realCompletion = fileDoneResult.tokenUsage?.completionTokens || 0;
          const realTotal = fileDoneResult.tokenUsage?.totalTokens || 0;

          // 纠偏并累加进完成用量
          setHistoricalTokenUsage(prev => ({
            promptTokens: prev.promptTokens + realPrompt,
            completionTokens: prev.completionTokens + realCompletion,
            totalTokens: prev.totalTokens + realTotal
          }));
          setFileEstPromptTokensMap(prev => {
            const updated = Object.assign({}, prev, { [file.md5]: realPrompt });
            return updated;
          });

          const rawItems = fileDoneResult.data || [];
          const filtered = rawItems.filter(item => {
            return Object.values(item).some(val => val && val.toString().trim() !== '');
          }).map(item => ({
            ...item,
            _fileMd5: file.md5
          }));

          setExtractedIssues(prev => [...prev, ...filtered]);
          allExtractedIssues = [...allExtractedIssues, ...filtered];
          setFileStatusMap(prev => {
            const updated = Object.assign({}, prev, { [file.md5]: 'success' });
            return updated;
          });
          setFileFilteredCountMap(prev => {
            const updated = Object.assign({}, prev, { [file.md5]: fileDoneResult.filteredCount || 0 });
            return updated;
          });
        } else {
          throw new Error('未获取到流式完成消息，数据可能不完整');
        }

      } catch (err) {
        console.error("解析文件 " + file.fileName + " 失败:", err);
        finalError = err.message;
        setFileStatusMap(prev => {
          const updated = Object.assign({}, prev, { [file.md5]: 'error' });
          return updated;
        });
        break;
      } finally {
        setActiveFileTokenUsage(prev => {
          const updated = { ...prev };
          delete updated[file.md5];
          return updated;
        });
      }
    }

    const batchEndTime = Date.now();
    const elapsed = (batchEndTime - batchStartTime) / 1000;
    setElapsedTime(elapsed);

    setIsExtracting(false);

    if (finalError) {
      setExtractionError(finalError);
      setExtractingProgress(prev => {
        if (!prev) return null;
        return {
          ...prev,
          currentFile: finalError
        };
      });
      showToast(`⚠️ 解析中断：${finalError}`);
      return;
    }

    setExtractingProgress(prev => {
      if (!prev) return null;
      return {
        ...prev,
        percent: 100,
        currentFile: '所有文档处理完毕'
      };
    });

    if (allExtractedIssues.length > 0) {
      showToast('所有文档提取成功！');
    } else {
      showToast('⚠️ 大模型解析结果为空，已安全熔断！');
    }
  };

  const retryExtractionForFile = async (file) => {
    const confirmRetry = window.confirm('将移除下表中相关记录，由大模型重新解析，是否确认？');
    if (!confirmRetry) return;

    // 解耦后，单文件重试不再检验多维表连接状态

    setIsExtracting(true);
    setExtractionError('');

    // Clear old issues for this specific file
    setExtractedIssues(prev => prev.filter(item => item._fileMd5 !== file.md5));
    setFileFilteredCountMap(prev => {
      const updated = { ...prev };
      delete updated[file.md5];
      return updated;
    });

    // Update status mapping for the file
    setFileStatusMap(prev => Object.assign({}, prev, { [file.md5]: 'processing' }));

    const readyFiles = filesQueue.filter(f => f.status === 'done');
    const fileIdx = readyFiles.findIndex(f => f.md5 === file.md5);
    setExtractingProgress({
      percent: Math.round((fileIdx >= 0 ? fileIdx : 0) / readyFiles.length * 100),
      currentFile: file.fileName,
      currentIndex: (fileIdx >= 0 ? fileIdx : 0) + 1,
      totalFiles: readyFiles.length
    });

    const processedFields = fields.map((f, idx) => ({
      key: f.key ? f.key.trim() : `field_${idx + 1}`,
      label: f.label || `未命名_${idx + 1}`,
      desc: f.desc || '',
      example: f.example || ''
    }));

    const singleStartTime = Date.now();

    // 步骤 1：预估输入 Token 并累加展示
    const estPromptTokens = Math.max(1000, Math.round((file.size || 0) * 0.4));
    setFileEstPromptTokensMap(prev => {
      const updated = Object.assign({}, prev, { [file.md5]: estPromptTokens });
      return updated;
    });
    setActiveFileTokenUsage(prev => ({
      ...prev,
      [file.md5]: { promptTokens: estPromptTokens, completionTokens: 0 }
    }));

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          md5: file.md5,
          systemPrompt: customPrompt,
          userPrompt: '请分析该文档并提取结构化字段：',
          fields: processedFields,
          llmConfig,
          postFilters: preset?.postFilters,
          presetId: preset?.id || 'unknown',
          department: preset?.department || 'unknown'
        })
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || res.statusText);
      }

      // 步骤 2：流式响应读取
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fileRawContent = '';
      let fileDoneResult = null;
      let lastEstCompletion = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const lineStr of lines) {
          if (!lineStr.trim()) continue;
          try {
            const line = JSON.parse(lineStr);
            if (line.type === 'chunk') {
              fileRawContent += line.text;
              setRawLlmResponse(prev => {
                const header = "/* === 文件: " + file.fileName + " (" + file.md5 + ") === */";
                let cleaned = prev || '';
                const idx = cleaned.indexOf(header);
                if (idx !== -1) {
                  const nextIdx = cleaned.indexOf('/* === 文件:', idx + header.length);
                  if (nextIdx !== -1) {
                    cleaned = cleaned.slice(0, idx) + cleaned.slice(nextIdx);
                  } else {
                    cleaned = cleaned.slice(0, idx);
                  }
                }
                return (cleaned.trim() + "\n\n" + header + "\n" + fileRawContent).trim();
              });

              // 输出 Token随字数增长动态计算逻辑
              const estCompletion = Math.round(fileRawContent.length * 1.3);
              setActiveFileTokenUsage(prev => {
                const existing = prev[file.md5] || { promptTokens: 0, completionTokens: 0 };
                return {
                  ...prev,
                  [file.md5]: {
                    ...existing,
                    completionTokens: estCompletion
                  }
                };
              });

            } else if (line.type === 'estimated') {
              // 精准估算输入 Token 并实时覆盖更新
              const realEst = line.promptTokens || 0;
              setActiveFileTokenUsage(prev => {
                const existing = prev[file.md5] || { promptTokens: 0, completionTokens: 0 };
                return {
                  ...prev,
                  [file.md5]: {
                    ...existing,
                    promptTokens: realEst
                  }
                };
              });
              setFileEstPromptTokensMap(prev => {
                const updated = Object.assign({}, prev, { [file.md5]: realEst });
                return updated;
              });

            } else if (line.type === 'done') {
              fileDoneResult = line;
            } else if (line.type === 'error') {
              throw new Error(line.error);
            }
          } catch (e) {
            console.error('流解析帧出错:', e);
          }
        }
      }

      if (fileDoneResult) {
        const realPrompt = fileDoneResult.tokenUsage?.promptTokens || 0;
        const realCompletion = fileDoneResult.tokenUsage?.completionTokens || 0;
        const realTotal = fileDoneResult.tokenUsage?.totalTokens || 0;

        // 纠偏并累加进完成用量
        setHistoricalTokenUsage(prev => ({
          promptTokens: prev.promptTokens + realPrompt,
          completionTokens: prev.completionTokens + realCompletion,
          totalTokens: prev.totalTokens + realTotal
        }));

        const rawItems = fileDoneResult.data || [];
        const filtered = rawItems.filter(item => {
          return Object.values(item).some(val => val && val.toString().trim() !== '');
        }).map(item => ({
          ...item,
          _fileMd5: file.md5
        }));

        // Append new issues
        setExtractedIssues(prev => [...prev, ...filtered]);
        setFileStatusMap(prev => {
          const updated = Object.assign({}, prev, { [file.md5]: 'success' });
          return updated;
        });
        setFileFilteredCountMap(prev => {
          const updated = Object.assign({}, prev, { [file.md5]: fileDoneResult.filteredCount || 0 });
          return updated;
        });

        const singleEndTime = Date.now();
        setElapsedTime((singleEndTime - singleStartTime) / 1000);
        showToast("文档 [" + file.fileName + "] 重新解析成功！");
      } else {
        throw new Error('未获取到流式完成消息，数据可能不完整');
      }

    } catch (err) {
      console.error(`重新解析文件 ${file.fileName} 失败:`, err);
      setFileStatusMap(prev => ({ ...prev, [file.md5]: 'error' }));
      setExtractionError(err.message);
      showToast(`⚠️ 重新解析失败: ${err.message}`);
    } finally {
      setIsExtracting(false);
      setExtractingProgress(prev => {
        if (!prev) return null;
        return {
          ...prev,
          percent: 100,
          currentFile: '所有文档处理完毕'
        };
      });
      setActiveFileTokenUsage(prev => {
        const updated = { ...prev };
        delete updated[file.md5];
        return updated;
      });
    }
  };

  const exportToExcel = () => {
    if (extractedIssues.length === 0) {
      alert('没有可导出的解析结果！');
      return;
    }

    try {
      const dataToExport = extractedIssues.map((issue, idx) => {
        const row = { '序号': idx + 1 };

        // 增加信息来源和页码列导出到 Excel
        const fileObj = filesQueue.find(f => f.md5 === issue._fileMd5);
        row['信息来源'] = fileObj ? fileObj.fileName : '手动添加';
        row['所在页码'] = issue._page ? ("第 " + issue._page + " 页") : '第 1 页';

        fields.forEach((f, colIdx) => {
          const key = f.key || `field_${colIdx + 1}`;
          row[f.label || `列_${colIdx + 1}`] = issue[key] || '';
        });
        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "解析结果");

      XLSX.writeFile(workbook, `DocEx_解析结果_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast('🎉 Excel 导出成功！');
    } catch (err) {
      console.error('导出 Excel 失败:', err);
      alert(`导出 Excel 失败: ${err.message}`);
    }
  };

  // ── Step 3: Result editing & Pushing ──
  const updateIssueCell = (rowIndex, key, val) => {
    const updated = [...extractedIssues];
    updated[rowIndex][key] = val;
    setExtractedIssues(updated);

    const rowErrors = { ...validationErrors };
    const errKey = `${rowIndex}_${key}`;

    if (key.toLowerCase().includes('date') || key.toLowerCase().includes('日期')) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (val && !dateRegex.test(val)) {
        rowErrors[errKey] = '格式需为 YYYY-MM-DD';
      } else {
        delete rowErrors[errKey];
      }
    }
    setValidationErrors(rowErrors);
  };

  const removeIssueRow = (rowIndex) => {
    setExtractedIssues(prev => prev.filter((_, i) => i !== rowIndex));
  };

  const addIssueRow = () => {
    const blank = {};
    fields.forEach((f, idx) => {
      const key = f.key ? f.key : `field_${idx + 1}`;
      blank[key] = (f.label.includes('日期') || f.key.includes('Date')) ? getTodayString() : '';
    });
    setExtractedIssues(prev => [...prev, blank]);
  };

  const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const pushToSpreadsheet = async () => {
    if (extractedIssues.length === 0) {
      alert('⚠️ 推送已拦截：检测到解析或表格数据为空，无法将空数据推送到云表。');
      return;
    }
    if (Object.keys(validationErrors).length > 0) {
      alert('数据表格中存在不合规字段，请先根据红色标记修正。');
      return;
    }

    setIsPushing(true);
    setPushResult(null);

    // Mapping build
    const customKeyMappings = {};
    fields.forEach((f, idx) => {
      const key = f.key ? f.key : `field_${idx + 1}`;
      customKeyMappings[f.label] = key;
    });

    // Translate mappings matching database schema columns
    const resolves = {};
    Object.keys(fieldMappings).forEach(col => {
      const fieldKey = fieldMappings[col];
      resolves[col] = fieldKey;
    });

    try {
      const res = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: platform,
          fileId: wpsFileId,
          appToken: feishuAppToken,
          tableId: feishuTableId,
          issues: extractedIssues,
          fieldMapping: resolves,
          autoNumber,
          appId: tableAppId,
          appSecret: tableAppSecret
        })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || '多维表格追加数据失败');

      setPushResult({
        success: true,
        count: data.insertedCount,
        message: `成功写入 ${data.insertedCount} 条增量行！`,
        link: platform === 'wps' ? `https://365.kdocs.cn/l/${wpsFileId}` : feishuUrl
      });

    } catch (e) {
      setPushResult({
        success: false,
        message: `写入崩溃: ${e.message}`
      });
    } finally {
      setIsPushing(false);
    }
  };

  const getTargetTableLink = () => {
    if (pushResult?.link) return pushResult.link;
    if (platform === 'wps') {
      return wpsFileId ? `https://365.kdocs.cn/l/${wpsFileId}` : '';
    } else {
      return feishuUrl || '';
    }
  };

  const renderPushActionGroup = (onPrimaryClick, primaryText, primaryDisabled) => {
    const isSuccess = pushResult?.success === true;
    const link = getTargetTableLink();

    return (
      <div className="relative inline-flex items-center" ref={pushMenuRef}>
        {/* Left Side: Main button or link */}
        {isSuccess ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-green-700 hover:bg-green-800 text-white text-xs font-semibold pl-5 pr-4 py-2.5 rounded-l border-r border-green-600/50 transition flex items-center gap-1.5 shadow-md hover:scale-[1.01] duration-150 whitespace-nowrap"
          >
            <CheckCircle2 size={13} className="text-green-200" />
            <span>🎉 推送成功！点击前往多维表格 </span>
          </a>
        ) : (
          <button
            onClick={onPrimaryClick}
            disabled={primaryDisabled || isPushing}
            className="bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold pl-5 pr-4 py-2.5 rounded-l border-r border-terracotta-hover/50 transition flex items-center gap-1.5 shadow-sm disabled:opacity-40 whitespace-nowrap"
          >
            {isPushing && <Loader2 size={12} className="animate-spin" />}
            <span>{isPushing ? '正在推送数据...' : primaryText}</span>
          </button>
        )}

        {/* Right Side: Caret Drop-up Trigger */}
        <button
          onClick={() => setIsPushMenuOpen(!isPushMenuOpen)}
          disabled={isPushing}
          className={`text-white text-xs font-semibold px-3 py-2.5 rounded-r transition flex items-center shadow-md hover:scale-[1.01] duration-150 disabled:opacity-40 ${isSuccess
              ? 'bg-[#6fcf97] hover:bg-[#5bbd84]'
              : 'bg-terracotta hover:bg-terracotta-hover'
            }`}
          title="展开操作菜单"
        >
          <ChevronUp size={14} className={`transition-transform duration-200 ${isPushMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Drop-up Popover Menu */}
        <AnimatePresence>
          {isPushMenuOpen && !isPushing && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full right-0 mb-2 w-48 bg-ivory border border-warm-sand rounded-xl shadow-[0_4px_24px_rgba(20,20,19,0.08)] py-1.5 z-50 text-near-black flex flex-col"
            >
              {/* Item 1: 重新推送数据 (Only visible after a successful push) */}
              {isSuccess && (
                <button
                  onClick={() => {
                    setIsPushMenuOpen(false);
                    if (activeStep === 3) {
                      handleStep3Push();
                    } else if (activeStep === 4) {
                      pushToSpreadsheet();
                    }
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-warm-sand/40 flex items-center gap-2.5 text-near-black font-medium transition-colors duration-150"
                >
                  <RotateCcw size={13} className="text-olive-gray" />
                  <span>重新推送数据</span>
                </button>
              )}

              {/* Item 2: 复制多维表格链接 (Visible always) */}
              <button
                onClick={() => {
                  setIsPushMenuOpen(false);
                  if (link) {
                    navigator.clipboard.writeText(link);
                    showToast('📋 已复制多维表格链接到剪贴板！');
                  } else {
                    showToast('⚠️ 暂无有效的多维表格链接，请先在步骤四配置。');
                  }
                }}
                className={`w-full text-left px-4 py-2.5 text-xs hover:bg-warm-sand/40 flex items-center gap-2.5 text-near-black font-medium transition-colors duration-150 ${isSuccess ? 'border-t border-border-cream' : ''
                  }`}
              >
                <Copy size={13} className="text-olive-gray" />
                <span>复制多维表格链接</span>
              </button>

              {/* Item 3: 导出为 Excel */}
              <button
                onClick={() => {
                  setIsPushMenuOpen(false);
                  exportToExcel();
                }}
                className="w-full text-left px-4 py-2.5 text-xs hover:bg-warm-sand/40 flex items-center gap-2.5 text-near-black font-medium transition-colors duration-150 border-t border-border-cream"
              >
                <FileSpreadsheet size={13} className="text-olive-gray" />
                <span>导出为 Excel </span>
              </button>

              {/* Item 4: 解析下一批文档 */}
              <button
                onClick={() => {
                  setIsPushMenuOpen(false);
                  if (window.confirm("将清空当前缓存，请确认已保存结果")) {
                    setActiveStep(1);
                    setFilesQueue([]);
                  }
                }}
                className="w-full text-left px-4 py-2.5 text-xs hover:bg-terracotta/10 flex items-center gap-2.5 text-terracotta font-semibold transition-colors duration-150 border-t border-border-cream"
              >
                <Plus size={13} className="text-terracotta" />
                <span>解析下一批文档</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const kb = bytes / 1024;
    return kb < 1024 ? kb.toFixed(1) + ' KB' : (kb / 1024).toFixed(1) + ' MB';
  };

  // ── Render Header progress indicators (Wizard Nodes) ──
  const renderWizardIndicator = () => {
    const isStep1Done = filesQueue.length > 0;
    const isStep2Done = extractedIssues.length > 0;
    const isStep3Done = pushResult?.success === true;

    const isStep4Done = pushResult?.success === true;

    const steps = [
      { number: 1, label: '上传文档', done: isStep1Done },
      { number: 2, label: '配置字段', done: isStep2Done },
      { number: 3, label: '解析结果', done: isStep3Done },
      { number: 4, label: '推送多维表格', done: isStep4Done },
    ];

    let progressWidth = '0%';
    if (activeStep === 2) progressWidth = '33.3%';
    if (activeStep === 3) progressWidth = '66.6%';
    if (activeStep === 4) progressWidth = '100%';

    return (
      <div className="w-[600px] relative select-none">
        {/* Background connector line */}
        <div className="absolute top-5 left-5 right-5 h-0.5 bg-warm-sand -translate-y-1/2 z-0">
          {/* Active progress connector line */}
          <div
            className="h-full bg-terracotta transition-all duration-500 ease-in-out"
            style={{ width: progressWidth }}
          />
        </div>

        {/* Circles container */}
        <div className="relative z-10 flex justify-between items-center h-10">
          {steps.map((step) => {
            const isActive = activeStep === step.number;
            const isDone = step.done;

            return (
              <div
                key={step.number}
                onClick={() => {
                  if (step.number === 3 && extractedIssues.length === 0 && !extractionError && !isExtracting) {
                    showToast('请先按步骤执行信息解析提取！');
                    return;
                  }
                  setActiveStep(step.number);
                }}
                className="flex flex-col items-center justify-center cursor-pointer group w-10 h-10 relative"
              >
                <div
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all duration-300 ${isDone
                    ? 'border-green-600 bg-green-50 text-green-700'
                    : isActive
                      ? 'border-terracotta bg-ivory text-terracotta shadow-[0_0_8px_rgba(201,100,66,0.35)]'
                      : 'border-border-cream bg-warm-sand/30 text-stone-gray group-hover:border-stone-gray'
                    }`}
                >
                  {isDone ? (
                    <CheckCircle2 size={14} className="text-green-600" />
                  ) : (
                    <span>{step.number}</span>
                  )}
                </div>

                <div className="absolute top-12 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                  <span
                    className={`text-xs transition-all duration-300 tracking-wider ${isActive
                      ? 'text-near-black font-bold'
                      : isDone
                        ? 'text-green-700 font-semibold'
                        : 'text-stone-gray font-semibold'
                      }`}
                  >
                    {step.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-parchment text-near-black font-sans pb-20">
      {/* ── Toast Alert Component ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className="fixed top-6 left-1/2 z-50 bg-ivory shadow-lg border border-warm-sand rounded px-6 py-3 text-near-black text-sm font-medium flex items-center gap-2"
          >
            <span className="text-terracotta">💡</span>
            <span>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sticky Global Header Bar ── */}
      <header className="sticky top-0 z-40 bg-parchment/85 backdrop-blur-md border-b border-border-cream">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 hover:opacity-90 transition">
              <FileText className="w-5 h-5 text-terracotta" />
              <span className="font-serif font-bold text-lg leading-none tracking-tight">DocEx 智能结构化提取文档信息</span>
            </a>

            {/* Version / Preset Selector Dropdown */}
            <div className="relative popover-container">
              <button
                onClick={() => setActivePopover(activePopover === 'version' ? null : 'version')}
                className="text-l font-bold tracking-wider text-olive-black bg-warm-sand hover:bg-warm-sand/80 border border-transparent hover:border-stone-gray/30 px-3 py-1 rounded-full flex items-center gap-1.5 transition select-none shadow-xs"
                title="点击切换页面版本或专有部门预设"
              >
                <span>
                  {preset
                    ? (preset.badgeText || preset.subtitle || preset.name)
                    : (allPresetsList.find(p => p.id === 'default')?.badgeText || '')}
                </span>
                <ChevronDown size={12} className={`text-stone-gray transition-transform duration-200 ${activePopover === 'version' ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {activePopover === 'version' && (
                <div className="absolute left-0 mt-2 w-64 bg-ivory border border-border-cream rounded-xl shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="text-[12px] font-bold text-stone-gray uppercase tracking-wider px-3 py-1.5">
                    选择系统应用预设版本
                  </div>

                  {allPresetsList.length > 0 ? (
                    allPresetsList.map((item, idx) => {
                      const isSelected = (!preset && item.id === 'default') || (preset?.id === item.id);
                      const targetHref = item.id === 'default' ? '/' : `/preset/${item.id}`;
                      const displayIcon = item.icon || (item.id === 'default' ? '🌐' : '⚙️');
                      const titleText = item.name || item.id;

                      return (
                        <React.Fragment key={item.id}>
                          {idx > 0 && <div className="my-1 border-t border-border-cream" />}
                          <a
                            href={targetHref}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${isSelected
                              ? 'bg-warm-sand text-near-black font-bold border border-border-warm'
                              : 'text-olive-gray hover:bg-warm-sand/30 hover:text-near-black'
                              }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="flex items-center justify-center text-sm w-4 h-4">
                                {typeof displayIcon === 'string' && displayIcon.endsWith('.svg') ? (
                                  <span
                                    className={`inline-block w-3.5 h-3.5 ${isSelected ? 'bg-near-black' : 'bg-terracotta'}`}
                                    style={{
                                      maskImage: `url(${displayIcon})`,
                                      WebkitMaskImage: `url(${displayIcon})`,
                                      maskSize: 'contain',
                                      WebkitMaskSize: 'contain',
                                      maskPosition: 'center',
                                      WebkitMaskPosition: 'center',
                                      maskRepeat: 'no-repeat',
                                      WebkitMaskRepeat: 'no-repeat'
                                    }}
                                  />
                                ) : (
                                  displayIcon
                                )}
                              </span>
                              <div className="flex flex-col">
                                <span>{titleText}</span>
                                <span className="text-[10px] text-stone-gray font-normal">{item.subtitle || '预设数据提取配置'}</span>
                              </div>
                            </div>
                            {isSelected && <CheckCircle2 size={13} className="text-green-600" />}
                          </a>
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <div className="p-3 text-center text-xs text-stone-gray">
                      正在加载物理预设列表...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Popover 1: Table State Dropdown Badge */}
            <div className="relative popover-container">
              <button
                onClick={() => setActivePopover(activePopover === 'table' ? null : 'table')}
                className={`status-badge px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 border bg-ivory shadow-sm transition ${isTableConnected
                  ? 'border-green-200 bg-green-50/50 text-green-700'
                  : 'border-border-cream text-olive-gray'
                  }`}
              >
                <span className={`w-2 h-2 rounded-full ${isTableConnected ? 'bg-green-600 shadow-[0_0_6px_#16a34a]' : 'bg-stone-gray'}`} />
                <span>{isTableConnected ? `📊 多维表格已连接: ${platform} ${tableName}` : '📊 多维表格未连接'}</span>
              </button>

              <AnimatePresence>
                {activePopover === 'table' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-80 bg-ivory border border-warm-sand rounded-lg p-5 shadow-lg z-50 text-near-black"
                  >
                    <h4 className="font-serif font-medium text-sm border-b border-border-cream pb-2 mb-3">多维表格网关</h4>

                    {!canCustomPlatform && (
                      <div className="p-2.5 mb-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs flex items-center gap-1.5 font-medium">
                        🔒 配置已由【{preset?.name || '通用预设'}】统一预设。
                      </div>
                    )}

                    <div className="flex flex-col gap-3 mb-4">
                      {/* Table config selector */}
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">选择表格配置</label>
                        <div className="flex gap-1.5">
                          <select
                            value={selectedTableConfigId}
                            onChange={(e) => handleTableConfigChange(e.target.value)}
                            disabled={!canCustomPlatform}
                            className="flex-1 bg-warm-sand border border-border-warm rounded px-2 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue transition text-near-black disabled:opacity-60"
                          >
                            {tableConfigList.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                            <option value="new">➕ 新建自定义配置</option>
                          </select>
                          {selectedTableConfigId !== 'wps_test' && selectedTableConfigId !== 'feishu_test' && selectedTableConfigId !== 'new' && (
                            <button
                              onClick={() => handleDeleteTableConfig(selectedTableConfigId)}
                              disabled={!canCustomPlatform}
                              className="p-1.5 rounded border border-border-cream bg-white hover:bg-red-50 text-stone-gray hover:text-error-crimson transition disabled:opacity-50"
                              title="删除该配置"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {selectedTableConfigId !== 'wps_test' && selectedTableConfigId !== 'feishu_test' && (
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">配置命名</label>
                          <input
                            type="text"
                            value={customTableConfigName}
                            onChange={(e) => setCustomTableConfigName(e.target.value)}
                            disabled={!canCustomPlatform}
                            className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue transition w-full disabled:opacity-60"
                            placeholder="自定义表格配置名称"
                          />
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => setPlatform('wps')}
                          disabled={!canCustomPlatform}
                          className={`flex-1 py-1.5 rounded text-xs font-semibold border transition disabled:opacity-50 ${platform === 'wps'
                            ? 'bg-warm-sand border-stone-gray text-near-black'
                            : 'bg-ivory border-border-cream text-olive-gray hover:bg-warm-sand/50'
                            }`}
                        >
                          WPS 表格
                        </button>
                        <button
                          onClick={() => setPlatform('feishu')}
                          disabled={!canCustomPlatform}
                          className={`flex-1 py-1.5 rounded text-xs font-semibold border transition disabled:opacity-50 ${platform === 'feishu'
                            ? 'bg-warm-sand border-stone-gray text-near-black'
                            : 'bg-ivory border-border-cream text-olive-gray hover:bg-warm-sand/50'
                            }`}
                        >
                          飞书表格
                        </button>
                      </div>

                      {platform === 'wps' ? (
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">WPS 协作分享链接</label>
                          <input
                            type="text"
                            value={wpsUrl}
                            onChange={(e) => setWpsUrl(e.target.value)}
                            disabled={!canCustomPlatform}
                            placeholder="https://365.kdocs.cn/l/xxx"
                            className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full disabled:opacity-50"
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">飞书表格分享链接</label>
                          <input
                            type="text"
                            value={feishuUrl}
                            onChange={(e) => setFeishuUrl(e.target.value)}
                            disabled={!canCustomPlatform}
                            placeholder="https://xxx.feishu.cn/base/xxx"
                            className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full disabled:opacity-50"
                          />
                        </div>
                      )}

                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">App ID (可选)</label>
                        <input
                          type="text"
                          value={tableAppId}
                          onChange={(e) => setTableAppId(e.target.value)}
                          disabled={!canCustomPlatform}
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full disabled:opacity-60"
                          placeholder="自定凭证 App ID"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">App Secret (可选)</label>
                        <input
                          type="password"
                          value={tableAppSecret}
                          onChange={(e) => setTableAppSecret(e.target.value)}
                          disabled={!canCustomPlatform}
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full disabled:opacity-60"
                          placeholder="自定凭证 App Secret"
                        />
                        <div className="mt-1 flex flex-col gap-1">
                          {platform === 'wps' ? (
                            <a
                              href="https://365.kdocs.cn/3rd/open/developer/home"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[12px] text-terracotta hover:underline flex items-center gap-0.5 font-semibold"
                            >
                              <span>WPS开放平台应用配置</span>
                              <ExternalLink size={9} />
                            </a>
                          ) : (
                            <a
                              href="https://open.feishu.cn/app?lang=zh-CN"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[12px] text-terracotta hover:underline flex items-center gap-0.5 font-semibold"
                            >
                              <span>飞书开放平台应用配置</span>
                              <ExternalLink size={9} />
                            </a>
                          )}
                          <p className="text-[12px] text-stone-gray leading-tight">
                            💡 提示：文档写入时显示身份为应用或应用所有者
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-4 border-t border-border-cream pt-3">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold">自增序号列配置</span>
                        <span className="text-xs text-stone-gray">自动填充云端最后一行索引号</span>
                      </div>
                      <button
                        onClick={() => setAutoNumber(!autoNumber)}
                        className={`w-10 h-5 rounded-full relative transition ${autoNumber ? 'bg-green-600' : 'bg-warm-sand border border-border-warm'}`}
                      >
                        <span className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[2px] left-[3px] transition-transform ${autoNumber ? 'translate-x-5' : ''}`} />
                      </button>
                    </div>

                    <button
                      onClick={verifyTableConnection}
                      disabled={isConnectingTable || !canCustomPlatform}
                      className="w-full bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold py-2 rounded transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isConnectingTable && <Loader2 size={12} className="animate-spin" />}
                      {isConnectingTable ? '同步校验中...' : '验证权限并同步字段'}
                    </button>

                    {tableConnectionError && (
                      <p className="text-xs text-error-crimson mt-2 bg-red-50 border border-red-100 p-2 rounded">{tableConnectionError}</p>
                    )}

                    {isTableConnected && (
                      <div className="mt-3 flex justify-end">
                        <a
                          href={platform === 'wps' ? `https://365.kdocs.cn/l/${wpsFileId}` : feishuUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-terracotta font-bold flex items-center gap-1 hover:underline"
                        >
                          打开多维表格页面 <ExternalLink size={10} />
                        </a>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Popover 2: LLM Connection Dropdown Badge */}
            <div className="relative popover-container">
              <button
                onClick={() => setActivePopover(activePopover === 'llm' ? null : 'llm')}
                className={`status-badge px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 border bg-ivory shadow-sm transition ${llmConnected
                  ? 'border-green-200 bg-green-50/50 text-green-700'
                  : 'border-border-cream text-olive-gray'
                  }`}
              >
                <span className={`w-2 h-2 rounded-full ${llmConnected ? 'bg-green-600 shadow-[0_0_6px_#16a34a]' : 'bg-stone-gray'}`} />
                <span>{llmConnected ? `🤖 模型已验证: ${llmConfig.provider} ${llmConfig.model} (${llmSupportVision ? '多模态模型' : '纯文本模型'})` : '🤖 模型未验证'}</span>
              </button>

              <AnimatePresence>
                {activePopover === 'llm' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-80 bg-ivory border border-warm-sand rounded-lg p-5 shadow-lg z-50 text-near-black"
                  >
                    <h4 className="font-serif font-medium text-sm border-b border-border-cream pb-2 mb-3">AI模型网关配置</h4>

                    {!canCustomModel && (
                      <div className="p-2.5 mb-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs flex items-center gap-1.5 font-medium">
                        🔒 配置已由【{preset?.name || '通用预设'}】统一预设。
                      </div>
                    )}

                    <div className="flex flex-col gap-3 mb-4">
                      {/* Configuration selector */}
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">选择模型配置</label>
                        <div className="flex gap-1.5">
                          <select
                            value={selectedConfigId}
                            onChange={(e) => handleConfigChange(e.target.value)}
                            disabled={!canCustomModel}
                            className="flex-1 bg-warm-sand border border-border-warm rounded px-2 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue transition text-near-black disabled:opacity-60"
                          >
                            {configList.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name} {c.isDefault ? '(默认)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">Provider</label>
                        <input
                          type="text"
                          value={llmConfig.provider}
                          onChange={(e) => setLlmConfig({ ...llmConfig, provider: e.target.value })}
                          disabled={!canCustomModel || selectedConfigId === 'default'}
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full disabled:opacity-60"
                          placeholder="openai"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">API Base URL</label>
                        <input
                          type="text"
                          value={llmConfig.baseUrl}
                          onChange={(e) => setLlmConfig({ ...llmConfig, baseUrl: e.target.value })}
                          disabled={!canCustomModel || selectedConfigId === 'default'}
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full disabled:opacity-60"
                          placeholder="https://api.openai.com/v1"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">Model</label>
                        <input
                          type="text"
                          value={llmConfig.model}
                          onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })}
                          disabled={!canCustomModel || selectedConfigId === 'default'}
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full disabled:opacity-60"
                          placeholder="gpt-4o-mini"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">API Key</label>
                        <input
                          type="password"
                          value={llmConfig.apiKey}
                          onChange={(e) => setLlmConfig({ ...llmConfig, apiKey: e.target.value })}
                          disabled={!canCustomModel || selectedConfigId === 'default'}
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full disabled:opacity-60"
                          placeholder="••••••••••••••••••••"
                        />
                      </div>
                    </div>

                    <button
                      onClick={verifyLlmConnection}
                      disabled={isTestingLlm}
                      className="w-full bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold py-2 rounded transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isTestingLlm && <Loader2 size={12} className="animate-spin" />}
                      {isTestingLlm ? '正在验证连接...' : '测试连接'}
                    </button>

                    {llmTestError && (
                      <p className="text-xs text-error-crimson mt-2 bg-red-50 border border-red-100 p-2 rounded">{llmTestError}</p>
                    )}

                    {!llmSupportVision && llmConnected && (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 p-2 rounded mt-2">
                        ⚠️ 提示: 目标大模型不支持多模态视觉识图，系统将自动降级为基于纯文字层内容提取。
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>



      {/* ── Main Stream Workspace with Framer Motion Page Switching ── */}
      <main className="max-w-[1440px] mx-auto px-6 mt-4">

        <AnimatePresence mode="wait">
          {activeStep === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-6"
            >
              {/* STEP 1 Card */}
              <section className="bg-ivory border border-border-cream rounded-xl p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-terracotta">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <h2 className="font-serif font-medium text-lg">步骤 1: 上传或选择待解析文档</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch mb-6">
                  {/* Left side: Upload area (1/2 width) */}
                  <div className="flex flex-col">
                    <div
                      onClick={() => fileInputRef.current.click()}
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`border border-dashed rounded-lg py-24 px-6 flex flex-col items-center justify-center cursor-pointer transition select-none flex-1 min-h-[400px] ${dragActive
                        ? 'border-terracotta bg-terracotta/[0.02]'
                        : 'border-stone-gray hover:border-terracotta hover:bg-terracotta/[0.01]'
                        }`}
                    >
                      <UploadCloud className="w-10 h-10 text-stone-gray mb-3" />
                      <p className="text-xs font-semibold text-near-black text-center leading-relaxed">
                        拖拽文件到此处，或点击卡片选取，支持同时上传多个文档
                      </p>
                      <p className="text-xs text-stone-gray mt-1 text-center">
                        支持 PDF / Word (.docx) / 图片 (.jpg, .jpeg, .png) 格式，最高支持容量 50MB
                      </p>
                    </div>
                  </div>

                  {/* Right side: Pending Documents list (1/2 width) */}
                  <div className="flex flex-col bg-warm-sand/15 border border-border-cream rounded-lg p-5">
                    <h3 className="text-xs font-bold text-near-black mb-3">待处理文档队列 ({filesQueue.length})</h3>
                    {filesQueue.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-stone-gray py-8">
                        <span className="text-2xl mb-1">📂</span>
                        <span className="text-xs">暂无待处理文档，请从左侧上传或在下方历史中复用</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-3 overflow-y-auto max-h-[390px] custom-scrollbar">
                        {filesQueue.map(item => (
                          <div
                            key={item.tempId || item.md5}
                            className="relative bg-white border border-border-cream rounded-lg p-2 flex flex-col items-center justify-between text-center shadow-xs group hover:border-terracotta/40 transition h-[88px] w-full"
                          >
                            {/* Delete button top right */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFilesQueue(prev => prev.filter(f => f.md5 !== item.md5));
                              }}
                              className="absolute top-1 right-1 p-1 text-stone-gray hover:text-error-crimson rounded opacity-0 group-hover:opacity-100 transition"
                            >
                              <X size={10} />
                            </button>

                            {/* File Icon */}
                            {item.fileName.toLowerCase().endsWith('.pdf') ? (
                              <PdfIcon className="w-5 h-5 mb-1 flex-shrink-0" />
                            ) : item.fileName.toLowerCase().endsWith('.docx') ? (
                              <WordIcon className="w-5 h-5 mb-1 flex-shrink-0" />
                            ) : (
                              <ImageIcon className="w-5 h-5 mb-1 flex-shrink-0" />
                            )}

                            {/* File Name (line-clamp-2 allows 2-line wrap) */}
                            <p
                              className="text-[10px] font-semibold text-near-black line-clamp-2 break-all px-1 leading-tight flex-1 flex items-center justify-center"
                              title={item.fileName}
                            >
                              {item.fileName}
                            </p>

                            {/* Status / Progress */}
                            {item.status === 'processing' || item.status === 'uploading' || item.status === 'preprocessing' ? (
                              <div className="w-full mt-0.5 px-1 flex-shrink-0">
                                <div className="w-full bg-warm-sand h-1 rounded-full overflow-hidden">
                                  <div className="bg-terracotta h-full transition-all duration-300" style={{ width: `${item.progress}%` }} />
                                </div>
                                <span className="text-[10px] text-stone-gray font-medium block">
                                  {item.progress}%
                                </span>
                              </div>
                            ) : (
                              <div className="w-full flex flex-col items-center flex-shrink-0 min-h-[22px]">
                                <span
                                  className={`text-xs font-bold flex items-center gap-0.5 cursor-help ${item.status === 'done' ? 'text-green-600' : 'text-error-crimson'
                                    }`}
                                  title={item.status === 'failed' ? `失败详情: ${item.error || '解析失败'}` : undefined}
                                >
                                  {item.status === 'done' ? (
                                    '就绪'
                                  ) : (
                                    <>
                                      <span>失败</span>
                                      <AlertTriangle size={10} className="text-error-crimson animate-pulse" />
                                    </>
                                  )}
                                </span>
                                {item.status === 'failed' && (
                                  <span
                                    className="text-[9px] text-error-crimson truncate w-full px-1 text-center font-medium block max-w-[80px]"
                                    title={item.error}
                                  >
                                    {item.error || '解析失败'}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  accept=".pdf,.docx,.jpg,.jpeg,.png"
                  onChange={(e) => handleFilesUpload(e.target.files)}
                />
                {historyFiles.length > 0 && (
                  <div className="mt-6 border-t border-border-cream pt-4">
                    <h3 className="text-xs font-semibold text-olive-gray mb-3 flex items-center gap-1.5">
                      <span>📄 历史已缓存文档 (点击复用无需重复上传)</span>
                    </h3>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                      {historyFiles.map(file => (
                        <div
                          key={file.md5}
                          onClick={() => reuseHistoryFile(file)}
                          className="flex items-center justify-between p-3 rounded-lg border border-border-cream bg-warm-sand/20 hover:bg-warm-sand/40 cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {file.fileName.toLowerCase().endsWith('.pdf') ? (
                              <PdfIcon className="w-5 h-5 flex-shrink-0" />
                            ) : file.fileName.toLowerCase().endsWith('.docx') ? (
                              <WordIcon className="w-5 h-5 flex-shrink-0" />
                            ) : (
                              <ImageIcon className="w-5 h-5 flex-shrink-0" />
                            )}
                            <span className="text-xs font-semibold text-near-black truncate" title={file.fileName}>{file.fileName}</span>
                          </div>
                          <div className="flex items-center gap-2 text-stone-gray flex-shrink-0">
                            <button
                              onClick={(e) => deleteHistoryFile(file.md5, e)}
                              className="p-1 rounded text-stone-gray hover:text-error-crimson transition"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>


            </motion.div>
          )}

          {activeStep === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                {/* Left column: Matrix Grid (2/3 width) */}
                <div className="lg:col-span-2 relative">
                  <section className="bg-ivory border border-border-cream rounded-xl p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                      <div className="flex items-center gap-3">
                        <Sparkles className="w-5 h-5 text-terracotta" />
                        <h2 className="font-serif font-medium text-lg">步骤 2: 配置字段</h2>
                      </div>

                      <div className="flex items-center gap-2">
                        {preset?.allowSwitchFields && preset?.availableFieldsList?.length > 0 && (
                          <div className="flex items-center gap-1.5 text-xs text-olive-gray mr-2">
                            <span className="font-semibold whitespace-nowrap">📋 字段配置：</span>
                            <select
                              value={selectedFieldsId || preset.fieldsRef || 'default'}
                              onChange={(e) => {
                                const newId = e.target.value;
                                if (extractedIssues.length > 0) {
                                  if (!confirm('切换字段配置将清除当前已解析的隐患结果，是否确定切换？')) {
                                    return;
                                  }
                                }
                                const selectedGroup = preset.availableFieldsList.find(g => g.id === newId);
                                if (selectedGroup) {
                                  setSelectedFieldsId(newId);
                                  setFields(selectedGroup.fields);
                                  setExtractedIssues([]); // 清空解析结果以防结构错位
                                  showToast(`📋 已成功切换为【${selectedGroup.name}】字段配置`);
                                }
                              }}
                              className="bg-ivory border border-border-cream/80 text-near-black rounded px-2.5 py-1.5 text-xs font-semibold outline-none transition focus:border-terracotta focus:ring-1 focus:ring-terracotta cursor-pointer max-w-[160px]"
                            >
                              {preset.availableFieldsList.map(group => (
                                <option key={group.id} value={group.id} title={group.description}>
                                  {group.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {preset?.allowAutoDetectFields && (
                          <button
                            onClick={autoDetectFields}
                            disabled={isDetectingFields || filesQueue.filter(f => f.status === 'done').length === 0}
                            className="text-xs font-semibold text-terracotta hover:text-terracotta-hover bg-warm-sand/50 hover:bg-warm-sand px-3 py-1.5 rounded transition border border-border-warm flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="让 AI 自动分析首张文档，智能推演并覆写字段定义"
                          >
                            {isDetectingFields && <Loader2 size={11} className="animate-spin text-terracotta" />}
                            <span>{isDetectingFields ? '分析推荐中...' : '🔮 自动识别字段'}</span>
                          </button>
                        )}

                        {canCustomFields && (
                          <button
                            onClick={() => {
                              const defaultId = `${preset?.id || 'default'}_custom`;
                              const customId = prompt('请输入新配置的 ID（仅支持英文字母、数字和下划线）：', defaultId);
                              if (customId === null) return; // 取消
                              if (!customId.trim()) {
                                showToast('配置 ID 不能为空！');
                                return;
                              }

                              const customName = prompt('请输入新配置的名称（用于下拉菜单显示）：', '自定义提取字段');
                              if (customName === null) return;
                              if (!customName.trim()) {
                                showToast('配置名称不能为空！');
                                return;
                              }

                              const exportData = {
                                id: customId.trim(),
                                name: customName.trim(),
                                description: `由用户在步骤2自定义并导出的字段配置，生成自 ${preset?.name || '通用版'}，导出时间：${new Date().toLocaleDateString()}`,
                                fields: fields.map((f, idx) => ({
                                  key: f.key || `field_${idx + 1}`,
                                  label: f.label || '',
                                  desc: f.desc || '',
                                  example: f.example || '',
                                  isAdvancedOpen: false
                                }))
                              };

                              const jsonStr = JSON.stringify(exportData, null, 2);
                              const blob = new Blob([jsonStr], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `${exportData.id}.json`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                              showToast('📤 字段配置导出成功！已保存为 JSON 文件，可直接发送给管理员。');
                            }}
                            className="text-xs font-semibold hover:text-black-hover bg-warm-sand/50 hover:bg-warm-sand px-3 py-1.5 rounded transition border border-border-warm flex items-center gap-1.5"
                            title="将当前已定义字段集导出为 JSON 配置文件，方便管理员收录"
                          >
                            <Download size={11} />
                            <span>导出字段配置</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {!canCustomFields && (
                      <div className="mb-4 p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs flex items-center gap-1.5 font-semibold">
                        🔒 解析字段配置已使用【{preset?.name || '通用预设'}】标准化预设。
                      </div>
                    )}

                    <p className="text-xs text-olive-gray mb-6 leading-relaxed">
                      配置您想让大模型提取的字段，并与云端多维表格的目标列进行匹配映射。
                    </p>

                    <div className="border border-border-cream rounded-lg overflow-hidden bg-white mb-6">
                      <table className="w-full border-collapse text-left text-xs table-fixed">
                        <thead>
                          <tr className="bg-parchment border-b border-border-cream">
                            <th className="p-4 font-bold text-near-black w-[22%] whitespace-nowrap">提取字段</th>
                            <th className="p-4 font-bold text-near-black w-[38%] whitespace-nowrap">描述</th>
                            <th className="p-4 font-bold text-near-black w-[28%] whitespace-nowrap">示例</th>
                            <th className="p-4 font-bold text-near-black text-center w-[12%] whitespace-nowrap">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-cream">
                          {fields.map((f, index) => {
                            const currentKey = f.key || `field_${index + 1}`;
                            const mappedCol = Object.keys(fieldMappings).find(col => fieldMappings[col] === currentKey);
                            const showMissingAlert = isTableConnected && !mappedCol && f.label;

                            return (
                              <tr key={index} className="hover:bg-ivory/40 transition">
                                {/* Column 1: Label */}
                                <td className="p-4 align-top">
                                  <input
                                    type="text"
                                    value={f.label}
                                    onChange={(e) => updateFieldCell(index, 'label', e.target.value)}
                                    disabled={!canCustomFields}
                                    placeholder="例如: 问题描述"
                                    className="bg-warm-sand/30 border border-border-warm rounded px-2.5 py-1.5 text-xs outline-none focus:bg-white focus:border-terracotta focus:ring-1 focus:ring-terracotta transition w-full font-semibold disabled:opacity-60"
                                  />
                                </td>

                                {/* Column 2: Description */}
                                <td className="p-4 align-top">
                                  <textarea
                                    value={f.desc}
                                    onChange={(e) => updateFieldCell(index, 'desc', e.target.value)}
                                    disabled={!canCustomFields}
                                    placeholder="该字段的提取要求和约束描述"
                                    rows={2}
                                    className="bg-warm-sand/30 border border-border-warm rounded px-2.5 py-1.5 text-xs outline-none focus:bg-white focus:border-terracotta focus:ring-1 focus:ring-terracotta transition w-full resize-none font-sans disabled:opacity-60"
                                  />
                                </td>

                                {/* Column 3: Example */}
                                <td className="p-4 align-top">
                                  <textarea
                                    value={f.example}
                                    onChange={(e) => updateFieldCell(index, 'example', e.target.value)}
                                    disabled={!canCustomFields}
                                    placeholder="该字段的规范样例值"
                                    rows={2}
                                    className="bg-warm-sand/30 border border-border-warm rounded px-2.5 py-1.5 text-xs outline-none focus:bg-white focus:border-terracotta focus:ring-1 focus:ring-terracotta transition w-full resize-none font-sans disabled:opacity-60"
                                  />
                                </td>

                                <td className="p-4 align-top text-center">
                                  <div className="flex items-center justify-center gap-2 flex-nowrap w-full">
                                    {/* 2x2 控制盘 */}
                                    <div className="grid grid-cols-2 gap-0.5 w-[46px] flex-shrink-0">
                                      <button
                                        onClick={() => moveFieldItem(index, 'top')}
                                        disabled={index === 0}
                                        className="w-5 h-5 flex items-center justify-center text-stone-gray hover:text-near-black hover:bg-warm-sand/50 disabled:opacity-10 disabled:pointer-events-none rounded transition p-0"
                                        title="一键置顶"
                                      >
                                        <ChevronsUp size={11} />
                                      </button>

                                      <button
                                        onClick={() => moveFieldItem(index, 'up')}
                                        disabled={index === 0}
                                        className="w-5 h-5 flex items-center justify-center text-stone-gray hover:text-near-black hover:bg-warm-sand/50 disabled:opacity-10 disabled:pointer-events-none rounded transition p-0"
                                        title="上移"
                                      >
                                        <ChevronUp size={11} />
                                      </button>

                                      <button
                                        onClick={() => moveFieldItem(index, 'bottom')}
                                        disabled={index === fields.length - 1}
                                        className="w-5 h-5 flex items-center justify-center text-stone-gray hover:text-near-black hover:bg-warm-sand/50 disabled:opacity-10 disabled:pointer-events-none rounded transition p-0"
                                        title="一键置底"
                                      >
                                        <ChevronsDown size={11} />
                                      </button>

                                      <button
                                        onClick={() => moveFieldItem(index, 'down')}
                                        disabled={index === fields.length - 1}
                                        className="w-5 h-5 flex items-center justify-center text-stone-gray hover:text-near-black hover:bg-warm-sand/50 disabled:opacity-10 disabled:pointer-events-none rounded transition p-0"
                                        title="下移"
                                      >
                                        <ChevronDown size={11} />
                                      </button>
                                    </div>

                                    {/* 删除/锁定 */}
                                    <div className="w-6 flex items-center justify-center flex-shrink-0">
                                      {canCustomFields ? (
                                        <button
                                          onClick={() => removeFieldItem(index)}
                                          className="p-1 text-stone-gray hover:text-error-crimson hover:bg-warm-sand/40 rounded transition"
                                          title="删除字段"
                                        >
                                          <X size={13} />
                                        </button>
                                      ) : (
                                        <span className="text-stone-gray/50 text-[10px] select-none cursor-default" title="预设锁定，不可删除">🔒</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {canCustomFields && (
                      <button
                        onClick={addFieldItem}
                        className="w-full border border-dashed border-stone-gray text-olive-gray hover:text-near-black hover:border-near-black py-2 rounded text-xs font-semibold flex items-center justify-center gap-1 transition"
                      >
                        <Plus size={12} />
                        <span>新增自定义提取字段</span>
                      </button>
                    )}
                  </section>

                  {/* 🔮 自动识别半透明加载浮层 */}
                  {isDetectingFields && (
                    <div className="absolute inset-0 bg-white/75 backdrop-blur-[1.5px] rounded-xl z-20 flex flex-col p-8 select-none animate-fade-in">
                      <div className="flex items-center justify-between mb-4 border-b border-border-cream pb-3 flex-shrink-0">
                        <div className="flex items-center gap-2.5 text-terracotta font-serif font-bold text-sm">
                          <Loader2 size={16} className="animate-spin text-terracotta" />
                          <span>AI 正在自动识别配置字段...</span>
                        </div>
                        <button
                          onClick={cancelAutoDetect}
                          className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold rounded-lg shadow-sm transition hover:scale-[1.01] active:scale-95 duration-100 flex items-center gap-1.5"
                        >
                          <span>🛑 停止自动识别</span>
                        </button>
                      </div>

                      <div className="flex-1 bg-parchment/60 border border-border-cream rounded-lg p-5 flex flex-col gap-2 min-h-0">
                        <div className="flex items-center justify-between text-[10px] font-bold text-stone-gray uppercase tracking-wider">
                          <span>AI 实时推理输出：</span>
                          {detectingStreamText && (
                            <span className="text-terracotta animate-pulse">● STREAMING</span>
                          )}
                        </div>
                        <div className="flex-1 overflow-auto custom-scrollbar bg-white/40 border border-border-cream/50 rounded p-3">
                          <pre className="text-xs font-mono text-near-black whitespace-pre-wrap break-all leading-relaxed select-text">
                            {detectingStreamText || '正在分析文档首页并推演提取属性定义...'}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right column: AI Prompt config (1/3 width) */}
                <div className="lg:col-span-1">
                  <section className="bg-ivory border border-border-cream rounded-xl p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-serif font-medium text-sm flex items-center gap-2">
                        <Sparkles size={16} className="text-terracotta" />
                        AI 提示词微调设置
                      </h3>
                      {canCustomPrompt ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (confirm('是否将系统提示词恢复为默认值？')) {
                                if (preset?.systemPrompt) setCustomPrompt(preset.systemPrompt);
                              }
                            }}
                            className="text-xs font-semibold text-olive-gray hover:text-near-black bg-warm-sand/50 hover:bg-warm-sand px-3 py-1 rounded transition border border-border-warm"
                          >
                            恢复默认
                          </button>
                          <button
                            onClick={optimizePrompt}
                            disabled={isOptimizingPrompt || !llmConnected}
                            className="text-xs font-semibold text-terracotta hover:text-terracotta-hover border border-terracotta/30 bg-terracotta/[0.02] px-3 py-1 rounded transition flex items-center gap-1 disabled:opacity-40"
                          >
                            {isOptimizingPrompt ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                            <span>AI 优化</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
                          🔒 提示词已使用【{preset?.name || '通用预设'}】标准化预设
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-3">
                      <textarea
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        disabled={!canCustomPrompt}
                        className="bg-warm-sand/30 border border-border-warm rounded-lg p-4 text-xs outline-none focus:bg-white focus:border-terracotta transition w-full min-h-[300px] font-sans disabled:opacity-60"
                        placeholder="请输入大模型解析提示词..."
                      />
                      <span className="text-xs text-stone-gray leading-normal">
                        * 提示词在输入给大模型之前，会自动追加防注入审查语句规范约束。
                      </span>
                    </div>
                  </section>
                </div>

              </div>
            </motion.div>
          )}

          {activeStep === 4 && (
            <motion.div
              key="step-4"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                {/* Left column: Data preview (2/3 width) */}
                <div className="lg:col-span-2 min-w-0 w-full">
                  <section className="bg-ivory border border-border-cream rounded-xl p-8 shadow-sm w-full min-w-0 overflow-hidden">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <Sparkles className="w-5 h-5 text-terracotta" />
                        <h2 className="font-serif font-medium text-lg">步骤 4: 推送多维表格</h2>
                      </div>
                      <span className="text-xs text-stone-gray font-semibold bg-warm-sand/40 px-3 py-1 rounded">
                        共 {extractedIssues.length} 条识别记录
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-1 bg-terracotta h-3 rounded-full" />
                      <span className="text-xs font-bold text-olive-gray uppercase tracking-wider">推送信息预览</span>
                    </div>

                    {extractedIssues.length === 0 ? (
                      <div className="border border-dashed border-border-cream rounded-lg bg-white py-16 flex flex-col items-center justify-center gap-3 text-stone-gray">
                        <span className="text-3xl">⏳</span>
                        <span className="text-xs font-semibold">暂无解析结果</span>
                        <span className="text-xs font-semibold">请完成步骤 3 的提取后再在此处查看</span>
                      </div>
                    ) : (
                      <div className="border border-border-cream rounded-lg bg-white max-h-[500px] overflow-x-auto overflow-y-auto custom-scrollbar w-full">
                        <table
                          className="w-full border-collapse text-left text-xs table-fixed"
                          style={{ minWidth: `${step4TotalWidth}px` }}
                        >
                          <thead>
                            <tr className="bg-parchment border-b border-border-cream">
                              <th className="p-3 font-bold text-near-black w-[50px] text-center sticky top-0 bg-parchment border-r border-border-cream">#</th>
                              <th className="p-3 font-bold text-near-black w-[120px] text-left sticky top-0 bg-parchment border-r-2 border-r-stone-200">信息来源</th>
                              {fields.map((f, idx) => (
                                <th key={idx} style={{ width: `${step4FieldWidths[idx]}px` }} className="p-3 font-bold text-near-black truncate sticky top-0 bg-parchment" title={f.label}>
                                  {f.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-cream">
                            {extractedIssues.map((issue, rowIndex) => (
                              <tr key={rowIndex} className="hover:bg-ivory/30 transition">
                                <td className="p-3 font-bold text-stone-gray text-center sticky left-0 z-10 bg-white border-r border-border-cream w-[50px]">{rowIndex + 1}</td>
                                <td className="p-2 align-top sticky left-[50px] z-10 bg-stone-50/90 border-r-2 border-r-stone-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-l-3 border-l-terracotta/40 w-[120px]">
                                  <div className="flex flex-col items-center justify-center gap-1 text-[10px] leading-tight w-full text-center">
                                    {(() => {
                                      const fileObj = filesQueue.find(f => f.md5 === issue._fileMd5);
                                      const fileName = fileObj ? fileObj.fileName : '手动添加';
                                      const isManual = !issue._fileMd5;
                                      const displayName = fileName.length > 100 ? (fileName.slice(0, 100) + '...') : fileName;
                                      const ext = fileName.split('.').pop().toLowerCase();
                                      let iconUrl = '';
                                      if (ext === 'pdf') {
                                        iconUrl = '/icons/pdf.svg';
                                      } else if (ext === 'docx' || ext === 'doc') {
                                        iconUrl = '/icons/word.svg';
                                      }
                                      return (
                                        <span
                                          className={"px-1.5 py-0.5 rounded border font-medium inline-block align-middle break-all whitespace-normal leading-normal text-[9px] " + (
                                            isManual
                                              ? 'bg-stone-100 text-stone-500 border-stone-200'
                                              : 'bg-warm-sand/50 text-olive-gray border-border-cream/80'
                                          )}
                                          title={fileName}
                                        >
                                          {iconUrl ? (
                                            <img
                                              src={iconUrl}
                                              alt={ext}
                                              className="w-3.5 h-3.5 inline-block align-middle mr-1.5 object-contain"
                                            />
                                          ) : (
                                            <span className="inline-block align-middle mr-1">📄</span>
                                          )}
                                          <span className="align-middle">{displayName}</span>
                                        </span>
                                      );
                                    })()}
                                    {(() => {
                                      const hasMd5 = !!issue._fileMd5;
                                      if (!hasMd5) return null;
                                      const rawPage = issue._page;
                                      const displayPage = rawPage ? ("第" + rawPage + "页") : '第1页';
                                      return (
                                        <span className="bg-orange-50 text-orange-700 border border-orange-200/60 px-2 py-0.5 rounded font-bold w-max text-[10px] inline-block mt-0.5 shadow-2xs">
                                          {displayPage}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </td>
                                {fields.map((f, colIndex) => {
                                  const key = f.key || `field_${colIndex + 1}`;
                                  return (
                                    <td key={colIndex} className="p-3 align-top max-w-[200px] truncate" title={issue[key] || ''}>
                                      {issue[key] || ''}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                </div>

                {/* Right column: Table credentials & mappings (1/3 width) */}
                <div className="lg:col-span-1">
                  <section className="bg-ivory border border-border-cream rounded-xl p-8 shadow-sm">
                    <h3 className="font-serif font-bold text-base border-b border-border-cream pb-3 mb-4 flex items-center gap-2">
                      <span>📊</span> 推送配置面板
                    </h3>

                    {!canCustomPlatform && (
                      <div className="p-2.5 mb-4 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs flex items-center gap-1.5 font-medium leading-relaxed">
                        🔒 配置已由部门预设锁定。
                      </div>
                    )}

                    <div className="flex flex-col gap-4">
                      {/* 3. Field mappings */}
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">推送字段映射</label>
                          {isTableConnected && (
                            <button
                              onClick={async () => {
                                const missingFields = fields.filter(f => !schemaFields.some(sf => sf.name === f.label));
                                if (missingFields.length === 0) {
                                  let autoMappedCount = 0;
                                  setFieldMappings(prev => {
                                    const updated = { ...prev };
                                    fields.forEach(f => {
                                      const matchedColName = schemaFields.find(sf => sf.name === f.label)?.name;
                                      if (matchedColName && !updated[matchedColName]) {
                                        updated[matchedColName] = f.key;
                                        autoMappedCount++;
                                      }
                                    });
                                    if (autoMappedCount > 0) {
                                      const targetId = platform === 'wps' ? wpsFileId : `${feishuAppToken}_${feishuTableId}`;
                                      localStorage.setItem(`docex_mapping_${targetId}`, JSON.stringify(updated));
                                    }
                                    return updated;
                                  });
                                  showToast(autoMappedCount > 0 ? `🎉 成功自动建立 ${autoMappedCount} 个已有列的映射！` : '🎉 所有字段已在多维表中存在并映射完毕！');
                                  return;
                                }

                                showToast(`正在同步 ${missingFields.length} 个缺失列至多维表，请稍候...`);
                                try {
                                  for (const f of missingFields) {
                                    await createTableColumn(f.label, true);
                                  }
                                  showToast('🎉 云端列头创建成功，正在刷新表头结构...');
                                  await verifyTableConnection();
                                  showToast('🎉 所有缺失列同步并映射成功！');
                                } catch (err) {
                                  showToast(`❌ 同步失败: ${err.message}`, 'error');
                                  await verifyTableConnection();
                                }
                              }}
                              className="text-[10px] font-bold text-terracotta hover:underline"
                            >
                              [一键同步字段至云端]
                            </button>
                          )}
                        </div>

                        {isTableConnected ? (
                          <div className="flex flex-col gap-2.5 border border-border-cream/50 p-3 rounded bg-white/40">
                            {fields.map((f, idx) => {
                              const currentKey = f.key || `field_${idx + 1}`;
                              const mappedCol = Object.keys(fieldMappings).find(col => fieldMappings[col] === currentKey);

                              return (
                                <div key={idx} className="flex items-center justify-between gap-3 bg-white p-2 rounded border border-border-cream shadow-2xs">
                                  <span className="text-xs font-semibold text-near-black truncate max-w-[100px]" title={f.label}>{f.label}</span>
                                  <div className="flex-1 flex flex-col gap-1 max-w-[150px]">
                                    <select
                                      value={mappedCol || ''}
                                      onChange={(e) => {
                                        const oldCol = Object.keys(fieldMappings).find(k => fieldMappings[k] === currentKey);
                                        const newMappings = { ...fieldMappings };
                                        if (oldCol) delete newMappings[oldCol];

                                        if (e.target.value) {
                                          newMappings[e.target.value] = currentKey;
                                        }
                                        setFieldMappings(newMappings);

                                        const targetId = platform === 'wps' ? wpsFileId : `${feishuAppToken}_${feishuTableId}`;
                                        localStorage.setItem(`docex_mapping_${targetId}`, JSON.stringify(newMappings));
                                      }}
                                      className="bg-warm-sand/30 border border-border-warm rounded pl-1 pr-5 py-1 text-[11px] outline-none cursor-pointer focus:bg-white truncate"
                                    >
                                      <option value="">❌ 不推送</option>
                                      {schemaFields.filter(sf => !sf.isReadOnly).map(sf => (
                                        <option value={sf.name} key={sf.id || sf.name}>
                                          {sf.name}
                                        </option>
                                      ))}
                                    </select>
                                    {!mappedCol && (
                                      <button
                                        onClick={() => createTableColumn(f.label)}
                                        className="text-[9px] text-terracotta text-left font-semibold hover:underline"
                                      >
                                        [一键在云端新建列]
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-4 bg-stone-50 border border-dashed border-border-cream rounded text-stone-gray text-xs italic">
                            请先在上方连接多维表以载入列定义进行映射
                          </div>
                        )}
                      </div>

                    </div>
                  </section>
                </div>

              </div>
            </motion.div>
          )}

          {activeStep === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-6"
            >
              {/* STEP 3 results card */}
              <section className="bg-ivory border border-border-cream rounded-xl p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <FileCheck className="w-5 h-5 text-terracotta" />
                  <h2 className="font-serif font-medium text-lg">步骤 3: 解析结果</h2>
                </div>

                {/* ⏳ Real-time Extraction Progress indicator */}
                {extractingProgress && (
                  <div className="border border-border-warm bg-warm-sand/10 rounded-xl p-5 mb-6 flex flex-col gap-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-olive-gray font-semibold">
                      <div className="flex items-center gap-2">
                        {isExtracting ? (
                          <Loader2 className="w-4 h-4 text-terracotta animate-spin" />
                        ) : extractionError ? (
                          <AlertTriangle className="w-4 h-4 text-error-crimson" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        )}
                        <span>
                          {isExtracting
                            ? ' AI 正在认真解析...'
                            : extractionError
                              ? '⚠️ AI 解析发生异常中断：'
                              : '🎉 所有文档已成功解析！'}
                        </span>
                        <span className="text-near-black font-bold">
                          第 {extractingProgress.currentIndex} / {extractingProgress.totalFiles} 个文档
                        </span>
                      </div>
                      <span className={`${extractionError ? 'text-error-crimson' : isExtracting ? 'text-terracotta' : 'text-green-600'} font-bold text-sm`}>
                        {extractingProgress.percent}%
                      </span>
                    </div>

                    {/* Progress Bar Container */}
                    <div className="w-full bg-warm-sand/40 h-2 rounded-full overflow-hidden border border-border-warm/30">
                      <div
                        className={`h-full transition-all duration-500 ease-out ${extractionError
                          ? 'bg-error-crimson'
                          : isExtracting
                            ? 'bg-terracotta'
                            : 'bg-green-600'
                          }`}
                        style={{ width: `${extractingProgress.percent}%` }}
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-xs text-olive-gray flex items-center gap-1.5">
                        {isExtracting && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-terracotta animate-ping" />
                        )}
                        <span>
                          {isExtracting
                            ? '当前文档: '
                            : extractionError
                              ? '原因描述: '
                              : '处理结果: '}
                        </span>
                        <strong className={`${extractionError ? 'text-error-crimson' : 'text-near-black'} truncate max-w-md`}>
                          {extractingProgress.currentFile}
                        </strong>
                      </span>

                      {/* File Queue Mini Matrix Status */}
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        {filesQueue.filter(f => f.status === 'done').map((file, fIdx) => {
                          const status = fileStatusMap[file.md5] || 'pending';
                          let badgeBg = 'bg-stone-gray/10 text-stone-gray';
                          let badgeLabel = '等待中';
                          if (status === 'processing') {
                            badgeBg = 'bg-terracotta/10 text-terracotta border border-terracotta/20 animate-pulse';
                            badgeLabel = '解析中 ⏳';
                          } else if (status === 'success') {
                            badgeBg = 'bg-green-100 text-green-700';
                            badgeLabel = '成功就绪 ';
                          } else if (status === 'error') {
                            badgeBg = 'bg-red-100 text-red-700';
                            badgeLabel = '失败 ❌';
                          }
                          return (
                            <div key={file.md5} className="flex items-center gap-1.5 bg-white border border-border-cream rounded px-2.5 py-1 text-[11px] font-semibold shadow-sm">
                              {file.fileName.toLowerCase().endsWith('.pdf') ? (
                                <PdfIcon className="w-3.5 h-3.5 flex-shrink-0" />
                              ) : (
                                <WordIcon className="w-3.5 h-3.5 flex-shrink-0" />
                              )}
                              <span className="text-near-black truncate max-w-[120px]">{file.fileName}</span>
                              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${badgeBg}`}>
                                {badgeLabel}
                              </span>
                              {!isExtracting && (
                                <button
                                  onClick={() => retryExtractionForFile(file)}
                                  title="重新解析此文档"
                                  className="ml-1 p-0.5 rounded text-stone-gray hover:text-terracotta hover:bg-warm-sand/50 transition flex items-center justify-center"
                                >
                                  <RefreshCw size={10} className="hover:rotate-180 transition duration-500" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {isExtracting && rawLlmResponse && (
                  <div className="border border-border-cream rounded-lg bg-parchment p-4 mb-6 shadow-inner animate-fade-in">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-xs font-bold text-olive-gray flex items-center gap-1.5 animate-pulse">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-terracotta animate-ping" />
                        <span>🤖 大模型实时解析输出中...</span>
                      </p>
                      <button
                        onClick={() => setIsLlmOutputExpanded(!isLlmOutputExpanded)}
                        className="p-1 hover:bg-[#e8e6dc]/40 rounded text-[#87867f] hover:text-[#141413] transition flex items-center gap-1 text-[10px] font-semibold"
                      >
                        {isLlmOutputExpanded ? (
                          <>
                            <span>收起</span>
                            <ChevronUp size={12} />
                          </>
                        ) : (
                          <>
                            <span>展开</span>
                            <ChevronDown size={12} />
                          </>
                        )}
                      </button>
                    </div>
                    {isLlmOutputExpanded && (
                      <pre className="text-[11px] font-mono text-near-black overflow-auto max-h-72 p-3 bg-white rounded border border-border-cream whitespace-pre-wrap break-words leading-relaxed animate-fade-in">
                        {rawLlmResponse}
                      </pre>
                    )}
                  </div>
                )}

                {/* Local validation warning / LLM error response */}
                {extractionError && (
                  <div className="border border-red-200 bg-red-50/50 rounded-lg p-5 flex gap-3 text-xs text-error-crimson mb-6">
                    <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                    <div>
                      <p className="font-bold">安全审查拦截或请求异常</p>
                      <p className="mt-1 leading-relaxed">{extractionError}</p>
                    </div>
                  </div>
                )}

                {/* Circuit Breaker Warning Card */}
                {extractedIssues.length === 0 && !isExtracting && !extractionError && (
                  <div className="border border-red-200 bg-red-50/50 rounded-lg p-5 flex flex-col gap-3 text-xs text-error-crimson mb-6">
                    <div className="flex gap-3">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                      <div>
                        <p className="font-bold">数据零推送熔断保护已激活</p>
                        <p className="mt-1 leading-relaxed">
                          ❌ 深度提取未命中任何有效记录（大模型可能生成了空数据或触发了拒绝回答机制）。
                          为防止多维表格被写入空行垃圾数据，系统已自动熔断。
                          请检查您的文件内容、提取字段中文名或提示词配置是否精准。
                        </p>
                      </div>
                    </div>
                    {rawLlmResponse && (
                      <div className="border-t border-red-100 pt-3 flex justify-start">
                        <button
                          onClick={() => setIsLlmModalOpen(true)}
                          className="bg-red-100/50 hover:bg-red-100 text-error-crimson border border-red-200/50 px-3 py-1.5 rounded font-semibold flex items-center gap-1.5 transition"
                        >
                          <span>🔍 查看AI原始 JSON 输出</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {(extractedIssues.length > 0 || isExtracting) && (
                  <div className="flex flex-col gap-6">

                    {/* Clean Token stats */}
                    {tokenUsage && (
                      <div className="flex items-center gap-6 bg-warm-sand/20 border border-border-cream rounded-lg p-4 text-xs font-semibold text-olive-gray">
                        <div className="flex items-center gap-2">
                          <span>📊 AI模型开销统计:</span>
                        </div>
                        <div>
                          输入 Tokens <span className="text-near-black font-bold">{tokenUsage.promptTokens?.toLocaleString()}</span>
                        </div>
                        <div className="w-px h-3 bg-border-warm" />
                        <div>
                          输出 Tokens <span className="text-near-black font-bold">{tokenUsage.completionTokens?.toLocaleString()}</span>
                        </div>
                        <div className="w-px h-3 bg-border-warm" />
                        <div>
                          共计 Tokens <span className="text-near-black font-bold">{tokenUsage.totalTokens?.toLocaleString()}</span>
                        </div>
                        {elapsedTime !== null && (
                          <>
                            <div className="w-px h-3 bg-border-warm" />
                            <div>
                              总耗时 <span className="text-near-black font-bold">{elapsedTime.toFixed(1)}</span> 秒
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Action Toolbar above table header */}
                    <div className="flex justify-between items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {extractedIssues.length > 0 && (
                          <span className="text-xs bg-warm-sand/80 text-olive-gray font-semibold px-3 py-1.5 rounded border border-border-cream mr-1">
                            共 {extractedIssues.length} 条记录
                          </span>
                        )}
                        <button
                          onClick={addIssueRow}
                          className="border border-stone-gray hover:border-near-black text-olive-gray hover:text-near-black px-3.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1 transition bg-white shadow-xs"
                        >
                          <Plus size={12} />
                          <span>添加空白行记录</span>
                        </button>

                        {rawLlmResponse && (
                          <button
                            onClick={() => setIsLlmModalOpen(true)}
                            className="border border-stone-gray hover:border-near-black text-olive-gray hover:text-near-black px-3.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition bg-white shadow-xs"
                          >
                            <span>🤖 查看 LLM 原始输出</span>
                          </button>
                        )}

                        {extractedIssues.length > 0 && (
                          <button
                            onClick={exportToExcel}
                            className="bg-terracotta hover:bg-terracotta-hover text-ivory px-3.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1 transition shadow-sm border border-transparent"
                          >
                            <Download size={12} />
                            <span>导出为 Excel</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Results grid */}
                    <div className="border border-border-cream rounded-lg bg-white shadow-sm max-h-[650px] overflow-auto custom-scrollbar">
                      <table
                        className="w-full border-collapse text-left text-xs table-fixed"
                        style={{ minWidth: `${step3TotalWidth}px` }}
                      >
                        <thead className="bg-parchment border-b border-border-cream shadow-[0_1px_0_0_#e8e6dc] [&_th:first-child]:rounded-tl-lg [&_th:last-child]:rounded-tr-lg">
                          <tr>
                            <th className="p-3 font-bold text-near-black w-[50px] text-center whitespace-nowrap sticky left-0 top-0 z-40 bg-parchment border-r border-border-cream shadow-[0_1px_0_0_#e8e6dc]">#</th>
                            <th className="p-3 font-bold text-near-black w-[100px] text-left whitespace-nowrap sticky left-[50px] top-0 z-40 bg-parchment border-r-2 border-r-stone-200 shadow-[2px_1px_0_0_#e8e6dc] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">信息来源</th>
                            {fields.map((f, idx) => (
                              <th key={idx} style={{ width: `${step3FieldWidths[idx]}px` }} className="p-3 font-bold text-near-black truncate sticky top-0 z-30 bg-parchment relative group" title={f.label}>
                                {f.label || `列_${idx + 1}`}
                                <div
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    const startX = e.clientX;
                                    const startWidth = step3FieldWidths[idx];
                                    const doDrag = (moveEvent) => {
                                      const deltaX = moveEvent.clientX - startX;
                                      const newWidth = Math.max(80, startWidth + deltaX);
                                      setCustomColWidths(prev => ({
                                        ...prev,
                                        [idx]: newWidth
                                      }));
                                    };
                                    const stopDrag = () => {
                                      document.removeEventListener('mousemove', doDrag);
                                      document.removeEventListener('mouseup', stopDrag);
                                    };
                                    document.addEventListener('mousemove', doDrag);
                                    document.addEventListener('mouseup', stopDrag);
                                  }}
                                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize select-none bg-transparent hover:bg-terracotta/40 group-hover:bg-[#e8e6dc]/80 active:bg-terracotta transition-colors"
                                  style={{ zIndex: 10 }}
                                />
                              </th>
                            ))}
                            <th className="p-3 font-bold text-near-black text-center whitespace-nowrap sticky right-0 top-0 z-40 bg-parchment border-l border-border-cream shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[80px]">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-cream">
                          {extractedIssues.map((issue, rowIndex) => (
                            <tr key={rowIndex} className="hover:bg-ivory/30 transition">
                              <td className="p-3 font-bold text-stone-gray text-center sticky left-0 z-10 bg-white border-r border-border-cream w-[50px]">{rowIndex + 1}</td>

                              {/* 只读冻结列：数据源与页码 */}
                              <td className="p-2 align-top sticky left-[50px] z-10 bg-stone-50/90 border-r-2 border-r-stone-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-l-3 border-l-terracotta/40 w-[100px]">
                                <div className="flex flex-col items-center justify-center gap-1 text-[10px] leading-tight w-full text-center">
                                  {(() => {
                                    const fileObj = filesQueue.find(f => f.md5 === issue._fileMd5);
                                    const fileName = fileObj ? fileObj.fileName : '手动添加';
                                    const isManual = !issue._fileMd5;
                                    // 100 个字符以上触发 truncate 截断，且支持文件名较长时折行换行显示
                                    const displayName = fileName.length > 100 ? (fileName.slice(0, 100) + '...') : fileName;
                                    // 根据文件后缀判定渲染 pdf.svg 或者是 word.svg
                                    const ext = fileName.split('.').pop().toLowerCase();
                                    let iconUrl = '';
                                    if (ext === 'pdf') {
                                      iconUrl = '/icons/pdf.svg';
                                    } else if (ext === 'docx' || ext === 'doc') {
                                      iconUrl = '/icons/word.svg';
                                    }
                                    return (
                                      <span
                                        className={"px-1.5 py-0.5 rounded border font-medium inline-block align-middle break-all whitespace-normal leading-normal text-[9px] " + (
                                          isManual
                                            ? 'bg-stone-100 text-stone-500 border-stone-200'
                                            : 'bg-warm-sand/50 text-olive-gray border-border-cream/80'
                                        )}
                                        title={fileName}
                                      >
                                        {iconUrl ? (
                                          <img
                                            src={iconUrl}
                                            alt={ext}
                                            className="w-3.5 h-3.5 inline-block align-middle mr-1.5 object-contain"
                                          />
                                        ) : (
                                          <span className="inline-block align-middle mr-1">📄</span>
                                        )}
                                        <span className="align-middle">{displayName}</span>
                                      </span>
                                    );
                                  })()}
                                  {(() => {
                                    const hasMd5 = !!issue._fileMd5;
                                    if (!hasMd5) return null;
                                    const rawPage = issue._page;
                                    const displayPage = rawPage ? ("第" + rawPage + "页") : '第1页';
                                    return (
                                      <span className="bg-orange-50 text-orange-700 border border-orange-200/60 px-2 py-0.5 rounded font-bold w-max text-[10px] inline-block mt-0.5 shadow-2xs">
                                        {displayPage}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </td>

                              {fields.map((f, colIndex) => {
                                const key = f.key || `field_${colIndex + 1}`;
                                const errKey = `${rowIndex}_${key}`;
                                const isInvalid = !!validationErrors[errKey];

                                return (
                                  <td key={colIndex} className="p-2 align-top">
                                    <div className="relative">
                                      <div
                                        contentEditable="true"
                                        suppressContentEditableWarning={true}
                                        onBlur={(e) => updateIssueCell(rowIndex, key, e.target.innerText.trim())}
                                        className={`border rounded px-2.5 py-1.5 text-xs outline-none focus:bg-ivory/50 focus:border-terracotta transition min-h-[28px] break-words whitespace-normal leading-relaxed ${isInvalid ? 'border-red-400 bg-red-50/50' : 'border-transparent hover:border-border-warm hover:bg-parchment/20'
                                          }`}
                                      >
                                        {issue[key] || ''}
                                      </div>
                                      {isInvalid && (
                                        <span className="absolute left-2.5 -bottom-3 text-[10px] text-error-crimson font-medium bg-white px-1 shadow-sm rounded-sm border border-red-100">{validationErrors[errKey]}</span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}

                              <td className="p-2 text-center align-top sticky right-0 z-10 bg-white border-l border-border-cream shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[80px]">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      setActiveReviewIndex(rowIndex);
                                      setDetailFormState(extractedIssues[rowIndex] || {});
                                    }}
                                    className="text-olive-gray hover:text-terracotta p-1 rounded transition"
                                    title="校验详情"
                                  >
                                    <Eye size={13} />
                                  </button>
                                  <button
                                    onClick={() => removeIssueRow(rowIndex)}
                                    className="text-stone-gray hover:text-error-crimson p-1 rounded transition"
                                    title="删除记录"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>



                  </div>
                )}
              </section>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* ── Sticky Bottom Action Bar ── */}
      <div className="sticky bottom-0 left-0 right-0 z-30 border-t border-border-cream bg-[#f5f4ed]/85 backdrop-blur-md pt-5 pb-9 shadow-[0_-4px_12px_rgba(20,20,19,0.03)] mt-12">
        <div className="max-w-[1440px] mx-auto px-6 grid grid-cols-3 items-center">

          {/* Left Side Buttons */}
          <div className="flex justify-start">
            {activeStep === 2 && (
              <button
                onClick={() => setActiveStep(1)}
                className="border border-stone-gray hover:border-near-black text-olive-gray hover:text-near-black px-4 py-2 rounded text-xs font-semibold flex items-center gap-1.5 transition bg-white shadow-sm"
              >
                <ArrowLeft size={14} />
                <span>返回上一步</span>
              </button>
            )}
            {activeStep === 3 && (
              <button
                onClick={() => setActiveStep(2)}
                className="border border-stone-gray hover:border-near-black text-olive-gray hover:text-near-black px-4 py-2 rounded text-xs font-semibold flex items-center gap-1.5 transition bg-white shadow-sm"
              >
                <ArrowLeft size={14} />
                <span>返回上一步</span>
              </button>
            )}
            {activeStep === 4 && (
              <button
                onClick={() => setActiveStep(3)}
                className="border border-stone-gray hover:border-near-black text-olive-gray hover:text-near-black px-4 py-2 rounded text-xs font-semibold flex items-center gap-1.5 transition bg-white shadow-sm"
              >
                <ArrowLeft size={14} />
                <span>返回上一步</span>
              </button>
            )}
          </div>

          {/* Center: Progress indicators */}
          <div className="flex justify-center">
            {renderWizardIndicator()}
          </div>

          {/* Right Side Buttons */}
          <div className="flex justify-end items-center gap-3">
            {activeStep === 1 && (
              <>
                <button
                  onClick={() => {
                    const ready = filesQueue.filter(f => f.status === 'done');
                    if (ready.length === 0) {
                      showToast('请先选择待解析的已就绪文档！');
                      return;
                    }
                    setActiveStep(3);
                    startExtraction();
                  }}
                  disabled={isDetectingFields || filesQueue.filter(f => f.status === 'done').length === 0}
                  className="px-4 py-2.5 rounded text-xs font-semibold border border-terracotta/40 bg-terracotta/10 text-terracotta hover:bg-terracotta/20 transition flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed shadow-xs"
                  title={isDetectingFields ? "请等待自动识别字段完成" : "直接跳过配置字段，以默认的字段进行解析"}
                >
                  <Sparkles size={14} />
                  <span>跳过配置字段，立即解析</span>
                </button>

                <button
                  onClick={() => {
                    if (filesQueue.length === 0) {
                      showToast('请先上传或选择待解析文档！');
                      return;
                    }
                    setActiveStep(2);
                  }}
                  className="bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold px-8 py-2.5 rounded transition flex items-center gap-1.5 shadow-sm hover:animate-none"
                >
                  <span>下一步：配置字段</span>
                  <ArrowRight size={14} />
                </button>
              </>
            )}

            {activeStep === 2 && (
              <>
                {extractedIssues.length > 0 ? (
                  <>
                    <button
                      onClick={startExtraction}
                      disabled={isExtracting || isDetectingFields || filesQueue.filter(f => f.status === 'done').length === 0}
                      className="px-5 py-2.5 rounded text-xs font-semibold border border-terracotta/40 bg-terracotta/10 text-terracotta hover:bg-terracotta/20 transition flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed shadow-xs"
                      title={isDetectingFields ? "请等待自动识别字段完成" : "以当前配置的字段重新发起文档分析提取"}
                    >
                      {isExtracting && <Loader2 size={12} className="animate-spin" />}
                      <span>重新解析</span>
                    </button>

                    <button
                      onClick={() => setActiveStep(3)}
                      disabled={isExtracting || isDetectingFields}
                      className="bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold px-8 py-2.5 rounded transition flex items-center gap-1.5 shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <span>查看已解析的结果</span>
                      <ArrowRight size={14} />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={startExtraction}
                    disabled={isExtracting || isDetectingFields || filesQueue.filter(f => f.status === 'done').length === 0}
                    className="bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold px-8 py-2.5 rounded transition flex items-center gap-1.5 shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
                    title={isDetectingFields ? "请等待自动识别字段完成" : ""}
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>解析中...</span>
                      </>
                    ) : (
                      <>
                        <span>下一步：开始解析</span>
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                )}
              </>
            )}

            {activeStep === 3 && extractedIssues.length > 0 && (
              <>
                <button
                  onClick={() => setActiveStep(4)}
                  className="px-5 py-2.5 rounded text-xs font-semibold border border-stone-gray/40 text-olive-gray hover:text-near-black bg-white hover:bg-warm-sand/20 transition shadow-xs flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span>配置多维表格</span>
                  <ArrowRight size={14} />
                </button>

                {renderPushActionGroup(handleStep3Push, '已核对识别结果，一键推送', false)}

                {pushResult && !pushResult.success && (
                  <div className="border rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs shadow-sm max-w-[280px] border-red-200 bg-red-50 text-error-crimson">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-600" />
                    <div className="flex flex-col text-[11px] leading-tight min-w-0">
                      <span className="font-bold">写入失败</span>
                      <span className="opacity-90 truncate">{pushResult.message}</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeStep === 4 && (
              <>
                {renderPushActionGroup(pushToSpreadsheet, '确认推送', !isTableConnected || extractedIssues.length === 0)}

                {pushResult && !pushResult.success && (
                  <div className="border rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs shadow-sm max-w-[280px] border-red-200 bg-red-50 text-error-crimson">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-600" />
                    <div className="flex flex-col text-[11px] leading-tight min-w-0">
                      <span className="font-bold">写入失败</span>
                      <span className="opacity-90 truncate">{pushResult.message}</span>
                    </div>
                  </div>
                )}
              </>
            )}

          </div>

        </div>
      </div>

      {/* ── LLM Raw Output Modal ── */}
      <AnimatePresence>
        {isLlmModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-ivory border border-warm-sand w-full max-w-2xl rounded-xl p-6 shadow-2xl text-near-black flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between border-b border-border-cream pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🤖</span>
                  <h3 className="font-serif font-bold text-base">大模型原始 JSON 响应报文</h3>
                </div>
                <button
                  onClick={() => setIsLlmModalOpen(false)}
                  className="text-stone-gray hover:text-near-black p-1 hover:bg-warm-sand/50 rounded transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-auto bg-warm-sand/30 border border-border-cream p-4 rounded-lg custom-scrollbar">
                <pre className="text-xs font-mono text-near-black whitespace-pre-wrap break-all leading-relaxed select-text">
                  {rawLlmResponse}
                </pre>
              </div>

              <div className="flex justify-end gap-3 mt-4 border-t border-border-cream pt-4">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(rawLlmResponse);
                    showToast('已复制到剪贴板！');
                  }}
                  className="border border-stone-gray hover:border-near-black text-olive-gray hover:text-near-black px-4 py-2 rounded text-xs font-semibold transition bg-white"
                >
                  复制 JSON 内容
                </button>
                <button
                  onClick={() => setIsLlmModalOpen(false)}
                  className="bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold px-4 py-2 rounded transition"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Detailed Record Review & Edit Modal ── */}
      <AnimatePresence>
        {activeReviewIndex !== null && extractedIssues[activeReviewIndex] && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-ivory border border-warm-sand w-full max-w-4xl rounded-xl p-6 shadow-2xl text-near-black flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between border-b border-border-cream pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📋</span>
                  <h3 className="font-serif font-bold text-base">
                    数据记录校验详情 (第 {activeReviewIndex + 1} / {extractedIssues.length} 条)
                  </h3>
                </div>
                <button
                  onClick={() => setActiveReviewIndex(null)}
                  className="text-stone-gray hover:text-near-black p-1 hover:bg-warm-sand/50 rounded transition"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Document Source Banner */}
              {(() => {
                const issue = extractedIssues[activeReviewIndex];
                const fileObj = filesQueue.find(f => f.md5 === issue._fileMd5);
                const fileName = fileObj ? fileObj.fileName : '手动添加';
                const rawPage = issue._page;
                const displayPage = rawPage ? `第 ${rawPage} 页` : '第 1 页';
                return (
                  <div className="bg-warm-sand/35 border border-border-cream/80 rounded-lg px-4 py-2 text-xs font-semibold text-olive-gray mb-4 flex items-center justify-between">
                    <span className="truncate max-w-md">📄 数据来源: {fileName}</span>
                    <span className="bg-orange-50 text-orange-700 border border-orange-200/50 px-2 py-0.5 rounded text-[11px] font-bold">
                      {displayPage}
                    </span>
                  </div>
                );
              })()}

              {/* Form Fields Grid */}
              <div className="flex-1 overflow-auto grid grid-cols-1 md:grid-cols-2 gap-4 pr-1 custom-scrollbar">
                {fields.map((f, idx) => {
                  const key = f.key || `field_${idx + 1}`;
                  const errKey = `${activeReviewIndex}_${key}`;
                  const isInvalid = !!validationErrors[errKey];
                  return (
                    <div key={idx} className="flex flex-col gap-1 bg-white border border-border-cream/40 p-3 rounded-lg shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-bold text-near-black mb-1">
                        <span>{f.label || `列_${idx + 1}`}</span>
                        <span className="text-[10px] text-stone-gray font-normal px-1.5 py-0.5 rounded bg-warm-sand/30 font-mono">
                          {key}
                        </span>
                      </div>
                      <textarea
                        className={`w-full text-xs border rounded-lg p-2.5 outline-none transition focus:bg-ivory/30 focus:border-terracotta focus:ring-1 focus:ring-terracotta resize-y min-h-[50px] ${isInvalid ? 'border-red-400 bg-red-50/50' : 'border-border-cream bg-stone-50/30'
                          }`}
                        rows={2}
                        value={detailFormState[key] || ''}
                        onChange={(e) => handleDetailFieldChange(key, e.target.value)}
                        placeholder={f.example ? `如: ${f.example}` : '暂无数据'}
                      />
                      {isInvalid && (
                        <span className="text-[10px] text-error-crimson font-medium mt-1">
                          ⚠️ {validationErrors[errKey]}
                        </span>
                      )}
                      {f.desc && (
                        <span className="text-[10px] text-stone-gray leading-tight mt-1">
                          💡 属性描述: {f.desc}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer navigation & Action */}
              <div className="flex justify-between items-center mt-5 border-t border-border-cream pt-4">
                <div className="flex gap-2">
                  <button
                    disabled={activeReviewIndex === 0}
                    onClick={() => {
                      const nextIdx = activeReviewIndex - 1;
                      setActiveReviewIndex(nextIdx);
                      setDetailFormState(extractedIssues[nextIdx] || {});
                    }}
                    className="border border-stone-gray hover:border-near-black disabled:opacity-40 disabled:hover:border-stone-gray text-olive-gray hover:text-near-black px-4 py-2 rounded text-xs font-semibold transition bg-white flex items-center gap-1"
                  >
                    <ArrowLeft size={14} />
                    <span>上一条</span>
                  </button>
                  <button
                    disabled={activeReviewIndex === extractedIssues.length - 1}
                    onClick={() => {
                      const nextIdx = activeReviewIndex + 1;
                      setActiveReviewIndex(nextIdx);
                      setDetailFormState(extractedIssues[nextIdx] || {});
                    }}
                    className="border border-stone-gray hover:border-near-black disabled:opacity-40 disabled:hover:border-stone-gray text-olive-gray hover:text-near-black px-4 py-2 rounded text-xs font-semibold transition bg-white flex items-center gap-1"
                  >
                    <span>下一条</span>
                    <motion.div animate={{ x: [0, 2, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                      <ArrowRight size={14} />
                    </motion.div>
                  </button>
                </div>
                <button
                  onClick={() => setActiveReviewIndex(null)}
                  className="bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold px-5 py-2 rounded-lg transition"
                >
                  关闭详情
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

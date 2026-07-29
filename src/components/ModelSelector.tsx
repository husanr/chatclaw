'use client';

import { useState, useEffect } from 'react';
import {
  MODEL_CONFIGS,
  getCustomModels,
  saveCustomModel,
  deleteCustomModel,
  getModelsByProvider,
  type ModelConfig,
} from '@/lib/llm/models';

// 从 localStorage 读/写单个模型的 API 配置
function getModelApiConfig(modelId: string): { baseURL: string; apiKey: string } {
  if (typeof window === 'undefined') return { baseURL: '', apiKey: '' };
  try {
    const stored = localStorage.getItem(`ai-agent-api-${modelId}`);
    return stored ? JSON.parse(stored) : { baseURL: '', apiKey: '' };
  } catch { return { baseURL: '', apiKey: '' }; }
}

function saveModelApiConfig(modelId: string, config: { baseURL: string; apiKey: string }) {
  localStorage.setItem(`ai-agent-api-${modelId}`, JSON.stringify(config));
}

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  // 把当前模型的 api 配置同步给父组件
  onApiConfigChange?: (config: { baseURL: string; apiKey: string }) => void;
}

export function ModelSelector({ selectedModel, onModelChange, onApiConfigChange }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [customModels, setCustomModels] = useState<ModelConfig[]>([]);
  const [groupedModels, setGroupedModels] = useState<Record<string, ModelConfig[]>>({});

  // 当前选中模型的 API 配置
  const [baseURL, setBaseURL] = useState('');
  const [apiKey, setApiKey] = useState('');

  // 自定义模型表单
  const [formData, setFormData] = useState({
    id: '', name: '', provider: '', baseURL: '', model: '', description: '',
  });

  useEffect(() => { loadModels(); }, []);

  const loadModels = () => {
    setCustomModels(getCustomModels());
    setGroupedModels(getModelsByProvider());
  };

  // 选中模型变化时，加载对应的 API 配置
  useEffect(() => {
    const modelInfo = MODEL_CONFIGS.find(m => m.id === selectedModel) ||
      customModels.find(m => m.id === selectedModel);

    const stored = getModelApiConfig(selectedModel);
    const resolvedBaseURL = stored.baseURL || modelInfo?.baseURL || '';
    const resolvedApiKey = stored.apiKey || '';

    setBaseURL(resolvedBaseURL);
    setApiKey(resolvedApiKey);
    onApiConfigChange?.({ baseURL: resolvedBaseURL, apiKey: resolvedApiKey });
  }, [selectedModel, customModels]);

  // baseURL 或 apiKey 变化时同步给父组件
  const updateBaseURL = (val: string) => {
    setBaseURL(val);
    saveModelApiConfig(selectedModel, { baseURL: val, apiKey });
    onApiConfigChange?.({ baseURL: val, apiKey });
  };

  const updateApiKey = (val: string) => {
    setApiKey(val);
    saveModelApiConfig(selectedModel, { baseURL, apiKey: val });
    onApiConfigChange?.({ baseURL, apiKey: val });
  };

  const selectedModelInfo = MODEL_CONFIGS.find(m => m.id === selectedModel) ||
    customModels.find(m => m.id === selectedModel);

  const handleAddModel = () => {
    const newModel: ModelConfig = {
      id: formData.id || `custom-${Date.now()}`,
      name: formData.name,
      provider: formData.provider || '自定义',
      baseURL: formData.baseURL,
      model: formData.model,
      envKey: '',
      supportsTools: true,
      description: formData.description,
      icon: '🔧',
      isCustom: true,
    };
    saveCustomModel(newModel);
    loadModels();
    setShowAddForm(false);
    setFormData({ id: '', name: '', provider: '', baseURL: '', model: '', description: '' });
    onModelChange(newModel.id);
  };

  const handleDeleteModel = (modelId: string) => {
    if (confirm('确定要删除这个自定义模型吗？')) {
      deleteCustomModel(modelId);
      loadModels();
      if (selectedModel === modelId) onModelChange('openai-gpt-4o');
    }
  };

  return (
    <div className="space-y-3">
      {/* 模型选择下拉 */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">{selectedModelInfo?.icon || '🤖'}</span>
            <div className="text-left min-w-0">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                {selectedModelInfo?.name || '选择模型'}
              </div>
              <div className="text-xs text-slate-400 dark:text-slate-500 truncate">
                {selectedModelInfo?.provider || ''}
              </div>
            </div>
          </div>
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="max-h-72 overflow-y-auto">
              {Object.entries(groupedModels).map(([provider, models]) => (
                <div key={provider}>
                  <div className="px-4 py-1.5 bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{provider}</span>
                  </div>
                  {models.map(model => (
                    <button
                      key={model.id}
                      onClick={() => { onModelChange(model.id); setIsOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${selectedModel === model.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                    >
                      <span className="text-lg flex-shrink-0">{model.icon}</span>
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{model.name}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500 truncate">{model.description || model.model}</div>
                      </div>
                      {selectedModel === model.id && (
                        <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              ))}

              {customModels.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">自定义模型</span>
                  </div>
                  {customModels.map(model => (
                    <button
                      key={model.id}
                      onClick={() => { onModelChange(model.id); setIsOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${selectedModel === model.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                    >
                      <span className="text-lg">{model.icon || '🔧'}</span>
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{model.name}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500 truncate">{model.description || model.baseURL}</div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteModel(model.id); }}
                        className="text-red-400 hover:text-red-600 p-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-2 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
              >
                + 添加自定义模型
              </button>
            </div>
          </div>
        )}
      </div>

      {/* API 配置面板：baseURL + API Key */}
      <div className="space-y-2">
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">API 地址</label>
          <input
            type="text"
            value={baseURL}
            onChange={e => updateBaseURL(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => updateApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 添加自定义模型弹窗 */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white">添加自定义模型</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">支持所有 OpenAI 兼容的 API</p>
            </div>
            <div className="p-5 space-y-3">
              {[
                { key: 'name', label: '模型名称 *', placeholder: '例如：DeepSeek V3' },
                { key: 'provider', label: '提供者', placeholder: '例如：DeepSeek' },
                { key: 'baseURL', label: 'API 地址 *', placeholder: 'https://api.deepseek.com' },
                { key: 'model', label: '模型 ID *', placeholder: 'deepseek-chat' },
                { key: 'description', label: '描述', placeholder: '可选描述' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{field.label}</label>
                  <input
                    type="text"
                    value={(formData as any)[field.key]}
                    onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-slate-200 dark:border-slate-700 flex gap-3">
              <button onClick={() => setShowAddForm(false)} className="flex-1 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">取消</button>
              <button
                onClick={handleAddModel}
                disabled={!formData.name || !formData.baseURL || !formData.model}
                className="flex-1 px-4 py-2 text-sm text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >添加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

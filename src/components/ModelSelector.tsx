// ============================================
// 模型选择器组件
// ============================================
//
// 🧠 原理讲解：
// 这个组件让用户可以选择不同的 AI 模型
// 支持：
// - 预定义模型（OpenAI、Claude、DeepSeek 等）
// - 自定义模型（用户自己配置）
// - 按提供者分组显示
//
// ============================================

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

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}

export function ModelSelector({ selectedModel, onModelChange }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [customModels, setCustomModels] = useState<ModelConfig[]>([]);
  const [groupedModels, setGroupedModels] = useState<Record<string, ModelConfig[]>>({});

  // 自定义模型表单状态
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    provider: '',
    baseURL: '',
    model: '',
    envKey: '',
    description: '',
  });

  // 加载模型列表
  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = () => {
    const custom = getCustomModels();
    setCustomModels(custom);
    setGroupedModels(getModelsByProvider());
  };

  // 获取当前选中的模型信息
  const selectedModelInfo = MODEL_CONFIGS.find(m => m.id === selectedModel) ||
    customModels.find(m => m.id === selectedModel);

  // 添加自定义模型
  const handleAddModel = () => {
    const newModel: ModelConfig = {
      id: formData.id || `custom-${Date.now()}`,
      name: formData.name,
      provider: formData.provider || '自定义',
      baseURL: formData.baseURL,
      model: formData.model,
      envKey: formData.envKey || `CUSTOM_${formData.id?.toUpperCase() || 'MODEL'}_API_KEY`,
      supportsTools: true,
      description: formData.description,
      icon: '🔧',
      isCustom: true,
    };

    saveCustomModel(newModel);
    loadModels();
    setShowAddForm(false);
    setFormData({
      id: '',
      name: '',
      provider: '',
      baseURL: '',
      model: '',
      envKey: '',
      description: '',
    });
  };

  // 删除自定义模型
  const handleDeleteModel = (modelId: string) => {
    if (confirm('确定要删除这个自定义模型吗？')) {
      deleteCustomModel(modelId);
      loadModels();
      if (selectedModel === modelId) {
        onModelChange('openai-gpt-4o');
      }
    }
  };

  return (
    <div className="relative">
      {/* 选择按钮 */}
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
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute z-50 w-80 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* 搜索框 */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-700">
            <input
              type="text"
              placeholder="搜索模型..."
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-700 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 模型列表 */}
          <div className="max-h-96 overflow-y-auto">
            {Object.entries(groupedModels).map(([provider, models]) => (
              <div key={provider}>
                {/* 提供者标题 */}
                <div className="px-4 py-2 bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                    {provider}
                  </span>
                </div>

                {/* 模型列表 */}
                {models.map(model => (
                  <button
                    key={model.id}
                    onClick={() => {
                      onModelChange(model.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                      selectedModel === model.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <span className="text-lg flex-shrink-0">{model.icon}</span>
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                        {model.name}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 truncate">
                        {model.description || model.model}
                      </div>
                    </div>
                    {model.supportsTools && (
                      <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full flex-shrink-0">
                        工具
                      </span>
                    )}
                    {model.isCustom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteModel(model.id);
                        }}
                        className="text-red-400 hover:text-red-600 p-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                    {selectedModel === model.id && (
                      <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            ))}

            {/* 自定义模型区域 */}
            {customModels.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                    自定义模型
                  </span>
                </div>
                {customModels.map(model => (
                  <button
                    key={model.id}
                    onClick={() => {
                      onModelChange(model.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                      selectedModel === model.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <span className="text-lg">{model.icon || '🔧'}</span>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {model.name}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">
                        {model.description || model.baseURL}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteModel(model.id);
                      }}
                      className="text-red-400 hover:text-red-600 p-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 添加自定义模型按钮 */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              添加自定义模型
            </button>
          </div>
        </div>
      )}

      {/* 添加自定义模型弹窗 */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                添加自定义模型
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                支持所有 OpenAI 兼容的 API
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  模型名称 *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：DeepSeek V3"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  提供者
                </label>
                <input
                  type="text"
                  value={formData.provider}
                  onChange={e => setFormData({ ...formData, provider: e.target.value })}
                  placeholder="例如：DeepSeek"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  API 地址 *
                </label>
                <input
                  type="text"
                  value={formData.baseURL}
                  onChange={e => setFormData({ ...formData, baseURL: e.target.value })}
                  placeholder="https://api.deepseek.com/v1"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  模型 ID *
                </label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={e => setFormData({ ...formData, model: e.target.value })}
                  placeholder="deepseek-chat"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  环境变量名
                </label>
                <input
                  type="text"
                  value={formData.envKey}
                  onChange={e => setFormData({ ...formData, envKey: e.target.value })}
                  placeholder="DEEPSEEK_API_KEY"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  描述
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="可选描述"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex gap-3">
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAddModel}
                disabled={!formData.name || !formData.baseURL || !formData.model}
                className="flex-1 px-4 py-2 text-sm text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

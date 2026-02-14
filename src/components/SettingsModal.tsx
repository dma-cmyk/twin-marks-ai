import React, { useState, useEffect } from 'react';
import { X, Key, Database, Cpu, RefreshCw, Save } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AppSettings {
  apiKey: string;
  embeddingModel: string;
  generationModel: string;
  notifyUnanalyzed: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<AppSettings>({
    apiKey: '',
    embeddingModel: 'models/embedding-001',
    generationModel: 'models/gemini-1.5-flash',
    notifyUnanalyzed: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [genModels, setGenModels] = useState<string[]>(['models/gemini-1.5-flash', 'models/gemini-1.5-pro', 'models/gemini-1.0-pro']);
  const [embedModels, setEmbedModels] = useState<string[]>(['models/text-embedding-004', 'models/embedding-001']);

  useEffect(() => {
    // Load settings from storage
    chrome.storage?.local.get(['geminiApiKey', 'embeddingModel', 'generationModel', 'notifyUnanalyzed'], (result) => {
      setSettings({
        apiKey: (result.geminiApiKey as string) || '',
        embeddingModel: (result.embeddingModel as string) || 'models/text-embedding-004',
        generationModel: (result.generationModel as string) || 'models/gemini-1.5-flash',
        notifyUnanalyzed: result.notifyUnanalyzed !== undefined ? (result.notifyUnanalyzed as boolean) : true,
      });
    });
  }, [isOpen]);

  const handleSave = () => {
    chrome.storage?.local.set({
      geminiApiKey: settings.apiKey,
      embeddingModel: settings.embeddingModel,
      generationModel: settings.generationModel,
      notifyUnanalyzed: settings.notifyUnanalyzed,
    }, () => {
      setStatusMsg('設定を保存しました！');
      setTimeout(() => setStatusMsg(''), 2000);
      onClose();
    });
  };

  const fetchModels = async () => {
    if (!settings.apiKey) {
      setStatusMsg('APIキーを入力してください。');
      return;
    }
    setIsLoading(true);
    setStatusMsg('モデルを取得中...');
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${settings.apiKey}`);
      
      if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.models) {
          const allModels = data.models as { name: string, supportedGenerationMethods: string[] }[];
          
          const generation = allModels
            .filter(m => m.supportedGenerationMethods.includes('generateContent'))
            .map(m => m.name);
            
          const embedding = allModels
            .filter(m => m.supportedGenerationMethods.includes('embedContent'))
            .map(m => m.name);

          setGenModels(generation);
          setEmbedModels(embedding);
          
          setStatusMsg(`モデルを${allModels.length}件見つけました。`);
      } else {
          setStatusMsg('接続済みですが、モデルは見つかりませんでした。');
      }
    } catch (e) {
      console.error(e);
      setStatusMsg('モデルの取得中にエラーが発生しました。APIキーを確認してください。');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Cpu size={20} className="text-blue-500" />
            AI設定
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* API Key Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Key size={16} /> Gemini APIキー
            </label>
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="APIキーを入力"
            />
            <p className="text-xs text-slate-500">
              APIキーは<a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Google AI Studio</a>で取得できます。
            </p>
          </div>

          {/* Models Section */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <Database size={16} /> エンベディングモデル
              </label>
              <select
                value={settings.embeddingModel}
                onChange={(e) => setSettings({ ...settings, embeddingModel: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
              >
                {embedModels.map(model => (
                    <option key={model} value={model}>{model.replace('models/', '')}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <RefreshCw size={16} /> 生成モデル
              </label>
              <select
                value={settings.generationModel}
                onChange={(e) => setSettings({ ...settings, generationModel: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
              >
                 {genModels.map(model => (
                    <option key={model} value={model}>{model.replace('models/', '')}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between pt-2">
                <label className="text-sm font-medium text-slate-300">
                    未分析サイトの通知
                </label>
                <button
                    onClick={() => setSettings({ ...settings, notifyUnanalyzed: !settings.notifyUnanalyzed })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings.notifyUnanalyzed ? 'bg-blue-600' : 'bg-slate-700'
                    }`}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            settings.notifyUnanalyzed ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                </button>
            </div>
          </div>
          
          {statusMsg && (
             <div className={`text-xs text-center font-medium ${statusMsg.includes('Error') ? 'text-rose-400' : 'text-emerald-400'}`}>
                 {statusMsg}
             </div>
          )}
        </div>

        <div className="px-4 py-3 bg-slate-950/50 border-t border-slate-800 flex justify-end gap-3">
          <button 
             onClick={fetchModels}
             disabled={isLoading}
             className="px-3 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? '取得中...' : 'モデルを取得'}
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-lg shadow-blue-900/20 transition-all"
          >
            <Save size={16} />
            設定を保存
          </button>
        </div>
      </div>
    </div>
  );
};
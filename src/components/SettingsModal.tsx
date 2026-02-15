import React, { useState, useEffect } from 'react';
import { X, Key, Database, Cpu, RefreshCw, Save, HardDrive, Settings as SettingsIcon, BrainCircuit } from 'lucide-react';


interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AppSettings {
  apiKey: string;
  embeddingModel: string;
  generationModel: string;
  extractionEngine: 'defuddle' | 'turndown';
  notifyUnanalyzed: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeSubTab, setActiveSubTab] = useState<'ai' | 'data'>('ai');
  const [settings, setSettings] = useState<AppSettings>({
    apiKey: '',
    embeddingModel: 'models/embedding-001',
    generationModel: 'models/gemini-1.5-flash',
    extractionEngine: 'defuddle',
    notifyUnanalyzed: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [genModels, setGenModels] = useState<string[]>(['models/gemini-1.5-flash', 'models/gemini-1.5-pro', 'models/gemini-1.0-pro']);
  const [embedModels, setEmbedModels] = useState<string[]>(['models/text-embedding-004', 'models/embedding-001']);

  useEffect(() => {
    // Load settings from storage
    chrome.storage?.local.get(['geminiApiKey', 'embeddingModel', 'generationModel', 'extractionEngine', 'notifyUnanalyzed'], (result) => {
      setSettings({
        apiKey: (result.geminiApiKey as string) || '',
        embeddingModel: (result.embeddingModel as string) || 'models/text-embedding-004',
        generationModel: (result.generationModel as string) || 'models/gemini-1.5-flash',
        extractionEngine: (result.extractionEngine as 'defuddle' | 'turndown') || 'defuddle',
        notifyUnanalyzed: result.notifyUnanalyzed !== undefined ? (result.notifyUnanalyzed as boolean) : true,
      });
    });
  }, [isOpen]);

  const handleSave = () => {
    chrome.storage?.local.set({
      geminiApiKey: settings.apiKey,
      embeddingModel: settings.embeddingModel,
      generationModel: settings.generationModel,
      extractionEngine: settings.extractionEngine,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <h2 className="text-xl font-black text-slate-100 flex items-center gap-2 tracking-tight">
            <SettingsIcon size={22} className="text-blue-500" />
            設定
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Sub Tab Navigation */}
        <div className="flex px-6 border-b border-slate-800 bg-slate-900/20">
            <button 
                onClick={() => setActiveSubTab('ai')}
                className={`px-4 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeSubTab === 'ai' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            >
                <Cpu size={16} />
                AI設定
            </button>
            <button 
                onClick={() => setActiveSubTab('data')}
                className={`px-4 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeSubTab === 'data' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            >
                <HardDrive size={16} />
                データ管理
            </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[500px]">
          {activeSubTab === 'ai' ? (
                <div className="space-y-6">
                    {/* API Key Section */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-300 flex items-center gap-2">
                        <Key size={16} className="text-blue-500/70" /> Gemini APIキー
                        </label>
                        <input
                        type="password"
                        value={settings.apiKey}
                        onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-700"
                        placeholder="APIキーを入力"
                        />
                        <p className="text-[11px] text-slate-500 leading-relaxed px-1">
                        APIキーは<a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Google AI Studio</a>で無料で取得できます。
                        </p>
                    </div>

                    {/* Models Section */}
                    <div className="space-y-4 pt-2 border-t border-slate-800/50">
                        <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-300 flex items-center gap-2">
                            <Database size={16} className="text-blue-500/70" /> エンベディングモデル
                        </label>
                        <select
                            value={settings.embeddingModel}
                            onChange={(e) => setSettings({ ...settings, embeddingModel: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
                        >
                            {embedModels.map((model: string) => (
                                <option key={model} value={model}>{model.replace('models/', '')}</option>
                            ))}
                        </select>
                        </div>

                        <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-300 flex items-center gap-2">
                            <RefreshCw size={16} className="text-blue-500/70" /> 生成モデル
                        </label>
                        <select
                            value={settings.generationModel}
                            onChange={(e) => setSettings({ ...settings, generationModel: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
                        >
                            {genModels.map((model: string) => (
                                <option key={model} value={model}>{model.replace('models/', '')}</option>
                            ))}
                        </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-300 flex items-center gap-2">
                                <BrainCircuit size={16} className="text-blue-500/70" /> 抽出エンジン
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setSettings({ ...settings, extractionEngine: 'defuddle' })}
                                    className={`p-3 rounded-xl border text-left transition-all ${
                                        settings.extractionEngine === 'defuddle' 
                                        ? 'bg-blue-600/10 border-blue-500 text-blue-400' 
                                        : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                                    }`}
                                >
                                    <div className="text-xs font-black">Defuddle</div>
                                    <div className="text-[9px] mt-1 opacity-60">高精度・現代的 (Obsidian推奨)</div>
                                </button>
                                <button
                                    onClick={() => setSettings({ ...settings, extractionEngine: 'turndown' })}
                                    className={`p-3 rounded-xl border text-left transition-all ${
                                        settings.extractionEngine === 'turndown' 
                                        ? 'bg-blue-600/10 border-blue-500 text-blue-400' 
                                        : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                                    }`}
                                >
                                    <div className="text-xs font-black">Turndown</div>
                                    <div className="text-[9px] mt-1 opacity-60">Markdown変換 + 独自フィルタ</div>
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-slate-950/50 rounded-xl border border-slate-800">
                            <div className="space-y-0.5">
                                <label className="text-sm font-bold text-slate-300">
                                    未分析サイトの通知
                                </label>
                                <p className="text-[10px] text-slate-500">新しいサイトをブックマークした時に通知</p>
                            </div>
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
                </div>
          ) : (
              <div className="space-y-6">
                  <div className="p-6 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex flex-col items-center gap-4 text-center">
                      <div className="p-3 bg-blue-500/10 rounded-full">
                        <Database size={32} className="text-blue-500" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-slate-200">
                            データ管理はライブラリへ
                        </p>
                        <p className="text-xs text-slate-500 leading-relaxed max-w-[280px]">
                            分析済みデータの管理（インポート、エクスポート、一括削除）は、メイン画面の「保存済みページ」タブから行えるようになりました。
                        </p>
                      </div>
                  </div>
                  <div className="space-y-3 pt-2">
                      <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1">データ移行について</h5>
                      <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                        <p className="text-xs text-slate-400 leading-relaxed">
                            古いデータをインポートしたい場合は、「保存済みページ」タブの右上にある「履歴を取り込む」ボタンを使用してください。
                        </p>
                      </div>
                  </div>
              </div>
          )}
          
          {statusMsg && (
             <div className={`mt-4 text-xs text-center font-bold px-4 py-2 rounded-lg ${statusMsg.includes('エラー') || statusMsg.includes('Error') ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                 {statusMsg}
             </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex justify-between items-center">
          <div className="flex gap-2">
            {activeSubTab === 'ai' && (
                <button 
                    onClick={fetchModels}
                    disabled={isLoading}
                    className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                >
                    <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                    モデル一覧を更新
                </button>
            )}
          </div>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-black text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-[0_4px_15px_rgba(37,99,235,0.4)] hover:shadow-[0_4px_25px_rgba(37,99,235,0.6)] transition-all active:scale-95"
          >
            <Save size={18} />
            設定を完了
          </button>
        </div>
      </div>
    </div>
  );
};
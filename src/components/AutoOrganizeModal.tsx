import React, { useState } from 'react';
import { X, FolderOutput, Loader2, Sparkles } from 'lucide-react';
import { clusterBookmarks } from '../utils/clustering';
import { createOrganizedBookmarks } from '../utils/bookmarkService';

interface AutoOrganizeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AutoOrganizeModal: React.FC<AutoOrganizeModalProps> = ({ isOpen, onClose }) => {
  const [clusterCount, setClusterCount] = useState(5);
  const [namingInstruction, setNamingInstruction] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');

  const handleOrganize = async () => {
    setIsProcessing(true);
    setStatus('ベクトルクラスターを分析中...');
    
    try {
        const settings = await chrome.storage?.local.get(['geminiApiKey', 'generationModel']);
        const apiKey = settings?.geminiApiKey as string;
        // generationModel must be used for naming
        const modelName = (settings?.generationModel || 'gemini-1.5-flash') as string;

        if (!apiKey) {
            alert('先に設定でGemini APIキーを設定してください。');
            setIsProcessing(false);
            return;
        }

        // 1. Cluster
        const clusters = await clusterBookmarks(clusterCount, apiKey, modelName, namingInstruction);
        
        const isFallback = clusters.some(c => c.name?.startsWith('カテゴリ '));
        
        setStatus('新しいブックマークフォルダを作成中...');
        await createOrganizedBookmarks(clusters);
        
        if (isFallback) {
            setStatus('完了！(AI制限のためカテゴリ名は仮称になりました)');
        } else {
            setStatus('完了！「その他のブックマーク」またはルートフォルダを確認してください。');
        }
        setTimeout(() => {
            onClose();
            setStatus('');
            setIsProcessing(false);
        }, 2000);

    } catch (e) {
        console.error(e);
        setStatus('エラーが発生しました。');
        setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Sparkles size={20} className="text-yellow-400" />
            AI自動整理
          </h2>
          <button onClick={onClose} disabled={isProcessing} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <p className="text-sm text-slate-400">
            Twin Marks AIは、保存されたページを分析し、新しいフォルダに自動的に整理します。
          </p>

          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm font-medium text-slate-300">
              <span>カテゴリ数</span>
              <span className="text-purple-400 font-mono text-lg">{clusterCount}</span>
            </div>
            <input
              type="range"
              min="2"
              max="15"
              value={clusterCount}
              onChange={(e) => setClusterCount(parseInt(e.target.value))}
              disabled={isProcessing}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>大まか</span>
              <span>詳細</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">
              カテゴリ命名ルール（任意）
            </label>
            <textarea
              value={namingInstruction}
              onChange={(e) => setNamingInstruction(e.target.value)}
              disabled={isProcessing}
              placeholder="例: 日本語の単語で、絵文字を使って、技術名で..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:ring-2 focus:ring-purple-500 outline-none h-16 resize-none"
            />
          </div>

          {status && (
              <div className="flex items-center gap-2 justify-center text-xs text-purple-300 bg-purple-900/20 p-2 rounded-lg animate-pulse">
                  {isProcessing && <Loader2 size={14} className="animate-spin" />}
                  {status}
              </div>
          )}
        </div>

        <div className="px-4 py-3 bg-slate-950/50 border-t border-slate-800 flex justify-end">
          <button
            onClick={handleOrganize}
            disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-lg shadow-lg shadow-purple-900/20 transition-all disabled:opacity-50"
          >
            <FolderOutput size={16} />
            {isProcessing ? '整理中...' : '整理を開始'}
          </button>
        </div>
      </div>
    </div>
  );
};

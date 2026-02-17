import React, { useState, useEffect } from 'react';
import { X, Check, ArrowRight, Sparkles, Trash2, AlertCircle } from 'lucide-react';

interface TagOptimizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (finalMapping: Record<string, string>) => void;
  initialMapping: Record<string, string>;
}

export const TagOptimizationModal: React.FC<TagOptimizationModalProps> = ({ isOpen, onClose, onApply, initialMapping }) => {
  const [mapping, setMapping] = useState<{ oldTag: string; newTag: string }[]>([]);

  useEffect(() => {
    if (isOpen) {
      const sortedMapping = Object.entries(initialMapping)
        .map(([oldTag, newTag]) => ({
          oldTag,
          newTag,
        }))
        .sort((a, b) => {
            // Sort by change status: changed items come first
            const aChanged = a.oldTag !== a.newTag;
            const bChanged = b.oldTag !== b.newTag;
            if (aChanged && !bChanged) return -1;
            if (!aChanged && bChanged) return 1;
            // Secondary sort by name for stability
            return a.oldTag.localeCompare(b.oldTag);
        });

      setMapping(sortedMapping);
    }
  }, [isOpen, initialMapping]);

  if (!isOpen) return null;

  const handleChangeNewTag = (index: number, value: string) => {
    const newMapping = [...mapping];
    newMapping[index].newTag = value;
    setMapping(newMapping);
  };

  const handleRemoveRow = (index: number) => {
    const newMapping = mapping.filter((_, i) => i !== index);
    setMapping(newMapping);
  };

  const handleApply = () => {
    const result: Record<string, string> = {};
    mapping.forEach(({ oldTag, newTag }) => {
      if (newTag.trim() && oldTag !== newTag.trim()) {
        result[oldTag] = newTag.trim();
      }
    });
    onApply(result);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
                <Sparkles size={20} className="text-purple-400" />
            </div>
            <div>
                <h2 className="text-lg font-bold text-slate-100">タグ整理の確認</h2>
                <p className="text-xs text-slate-500">AIが提案した変更内容を確認・修正してください</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
          {mapping.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <AlertCircle size={48} className="opacity-20 mb-4" />
                <p>適用する変更がありません</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-4 px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <div>現在のタグ</div>
                <div />
                <div>新しいタグ (編集可)</div>
                <div className="w-8 text-center">削除</div>
              </div>
              
              {mapping.map((row, index) => (
                <div key={row.oldTag} className="group flex items-center gap-4 p-3 bg-slate-950/50 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors">
                  
                  {/* Old Tag */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-300 truncate" title={row.oldTag}>
                        {row.oldTag}
                    </div>
                  </div>

                  {/* Arrow */}
                  <ArrowRight size={16} className="text-slate-600 flex-shrink-0" />

                  {/* New Tag Input */}
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={row.newTag}
                      onChange={(e) => handleChangeNewTag(index, e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-purple-300 focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
                    />
                  </div>

                  {/* Delete Action */}
                  <button
                    onClick={() => handleRemoveRow(index)}
                    className="p-1.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
                    title="この変更を除外"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950/50 border-t border-slate-800 flex justify-end gap-3 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleApply}
            disabled={mapping.length === 0}
            className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-lg shadow-purple-900/20 transition-all"
          >
            <Check size={16} />
            {mapping.length}件の変更を適用
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { X, Tag as TagIcon, Plus, Minus, Search } from 'lucide-react';

interface BulkTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'add' | 'remove' | 'edit';
  selectedCount: number;
  allTags: string[];
  onConfirm: (tags: string[], newTagName?: string) => void;
}

export const BulkTagModal: React.FC<BulkTagModalProps> = ({ isOpen, onClose, mode, selectedCount, allTags, onConfirm }) => {
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [customTag, setCustomTag] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTags(new Set());
      setCustomTag('');
      setSearchQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredTags = allTags.filter(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

  const toggleTag = (tag: string) => {
    const newTags = new Set(selectedTags);
    if (mode === 'edit') {
        // Edit mode only allows single selection
        newTags.clear();
        if (!selectedTags.has(tag)) {
            newTags.add(tag);
        }
    } else {
        if (newTags.has(tag)) {
          newTags.delete(tag);
        } else {
          newTags.add(tag);
        }
    }
    setSelectedTags(newTags);
  };

  const handleConfirm = () => {
    const finalTags = new Set(selectedTags);
    if (mode === 'add' && customTag.trim()) {
      // Split by comma for multiple additions
      const customTagsList = customTag.split(',').map(t => t.trim()).filter(t => t);
      customTagsList.forEach(t => finalTags.add(t));
    }
    
    if (mode === 'edit' && finalTags.size === 1 && customTag.trim()) {
        onConfirm(Array.from(finalTags), customTag.trim());
    } else if (finalTags.size > 0 && mode !== 'edit') {
      onConfirm(Array.from(finalTags));
    }
    onClose();
  };

  const isAddMode = mode === 'add';
  const isEditMode = mode === 'edit';
  const isRemoveMode = mode === 'remove';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50 shrink-0">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <TagIcon size={20} className={isAddMode ? "text-blue-400" : (isEditMode ? "text-purple-400" : "text-rose-400")} />
            {isAddMode ? 'タグを一括追加' : (isEditMode ? 'タグを一括編集' : 'タグを一括削除')}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-hidden flex flex-col gap-4">
          <p className="text-sm text-slate-400 shrink-0">
            選択した <span className="text-white font-bold">{selectedCount}</span> 件のアイテムに対して、タグを{isAddMode ? '追加' : (isEditMode ? '編集（変更）' : '削除')}します。
          </p>

          {(isAddMode || isEditMode) && (
            <div className={`space-y-2 shrink-0 ${isEditMode && selectedTags.size === 0 ? 'opacity-50 pointer-events-none transition-opacity' : ''}`}>
              <label className="text-sm font-medium text-slate-300">
                  {isEditMode ? '変更後のタグ名' : '新しいタグを作成'}
              </label>
              <input
                type="text"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                placeholder={isEditMode ? "新しい名前を入力" : "新しいタグ名（カンマ区切りで複数可）"}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirm();
                }}
              />
            </div>
          )}

          <div className={`flex-1 min-h-0 flex flex-col space-y-2 ${isEditMode && customTag.trim() && selectedTags.size === 1 ? 'opacity-50' : ''}`}>
            <label className="text-sm font-medium text-slate-300 shrink-0">
              {isEditMode ? '変更元のタグを選択（1つのみ）' : '既存のタグから選択'}
            </label>
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="タグを検索..."
                className="w-full bg-slate-950 border border-slate-700 pr-3 pl-9 py-2 rounded-lg text-sm text-white focus:ring-1 focus:ring-slate-500 outline-none"
              />
            </div>
            
            <div className="flex-1 overflow-y-auto min-h-[120px] bg-slate-950/50 border border-slate-800 rounded-lg p-3 scrollbar-thin scrollbar-thumb-slate-700">
              {filteredTags.length === 0 ? (
                 <p className="text-xs text-slate-500 text-center py-4">タグが見つかりません</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {filteredTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                        selectedTags.has(tag)
                          ? (isAddMode 
                              ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 shadow-inner' 
                              : (isEditMode 
                                  ? 'bg-purple-600/20 text-purple-400 border-purple-500/50 shadow-inner'
                                  : 'bg-rose-600/20 text-rose-400 border-rose-500/50 shadow-inner'))
                          : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      {selectedTags.has(tag) && !isEditMode ? (isAddMode ? <Plus size={12}/> : <Minus size={12}/>) : null}
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 bg-slate-950/80 border-t border-slate-800 flex justify-end gap-3 shrink-0">
           <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            disabled={(selectedTags.size === 0 && (!isAddMode || customTag.trim() === '')) || (isEditMode && (!customTag.trim() || selectedTags.size !== 1))}
            className={`flex items-center gap-2 px-5 py-2 text-sm font-bold text-white rounded-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              isAddMode 
                ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20' 
                : (isEditMode 
                    ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/20'
                    : 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/20')
            }`}
          >
            {isAddMode && <Plus size={16} />}
            {isRemoveMode && <Minus size={16} />}
            
            {isAddMode ? '選択したアイテムに追加' : (isEditMode ? '選択したアイテムを編集' : '選択したアイテムから削除')}
          </button>
        </div>
      </div>
    </div>
  );
};

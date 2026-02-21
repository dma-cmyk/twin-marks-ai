import React from 'react';
import { ExternalLink, CheckSquare, Square, Trash2, Plus, X, Pencil, MessageSquareText } from 'lucide-react';

export interface VectorItem {
  url: string;
  title: string;
  timestamp: number;
  vector?: number[];
  description?: string;
  isSaved?: boolean;
  tags?: string[];
  notes?: string;
  category?: string;
}

interface ItemProps {
    item: VectorItem;
    selected: boolean;
    onToggle: (e: React.MouseEvent, url: string) => void;
    onSelect: (url: string) => void;
    onOpen: (e: React.MouseEvent, url: string) => void;
    onDelete: (e: React.MouseEvent, url: string) => void;
    onAddTag: (e: React.MouseEvent, item: VectorItem) => void;
    onRemoveTag: (item: VectorItem, tag: string) => void;
    onEditTag: (e: React.MouseEvent, item: VectorItem, tag: string) => void;
    onTagClick: (e: React.MouseEvent, tag: string) => void;
    onEditNotes: (e: React.MouseEvent, item: VectorItem) => void;
    tagCounts?: Record<string, number>;
}

export const TagBadge: React.FC<{ 
    tag: string; 
    onRemove: (t: string) => void;
    onEdit: (e: React.MouseEvent, t: string) => void;
    onClick: (e: React.MouseEvent, t: string) => void;
    count?: number;
}> = ({ tag, onRemove, onEdit, onClick, count }) => (
    <span 
        onClick={(e) => onClick(e, tag)}
        className="group/tag inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-sm bg-slate-800 text-slate-400 border border-slate-700/50 hover:border-blue-500/30 transition-colors cursor-pointer"
    >
        #{tag}{count !== undefined && <span className="opacity-50 ml-0.5">({count})</span>}
        <div className="hidden group-hover/tag:flex items-center gap-0.5 ml-1">
            <button 
                onClick={(e) => { e.stopPropagation(); onEdit(e, tag); }}
                className="hover:text-blue-400 p-0.5"
                title="タグを編集"
            >
                <Pencil size={8} />
            </button>
            <button 
                onClick={(e) => { e.stopPropagation(); onRemove(tag); }}
                className="hover:text-rose-400 p-0.5"
                title="タグを削除"
            >
                <X size={8} />
            </button>
        </div>
    </span>
);

export const ListViewItem: React.FC<ItemProps> = ({ item, selected, onToggle, onSelect, onOpen, onDelete, onAddTag, onRemoveTag, onEditTag, onTagClick, onEditNotes, tagCounts }) => (
    <div 
        onClick={() => onSelect(item.url)} 
        className={`group flex items-center gap-4 p-3 border rounded-xl transition-all cursor-pointer shadow-sm relative overflow-hidden ${selected 
            ? 'bg-blue-900/20 border-blue-500/50' 
            : 'bg-slate-900/20 hover:bg-slate-900/60 border-slate-800/50 hover:border-blue-500/20'
        }`}
    >
        <div 
            onClick={(e) => onToggle(e, item.url)}
            className={`p-2 rounded-lg transition-colors z-10 ${selected ? 'text-blue-500' : 'text-slate-600 hover:text-slate-400'}`}
        >
            {selected ? <CheckSquare size={20} /> : <Square size={20} />}
        </div>

        <img 
            src={`https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=64`} 
            alt="" 
            className="w-10 h-10 p-2 rounded-lg bg-slate-950 object-contain border border-slate-800 group-hover:border-blue-500/30 transition-colors" 
            onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>'; }}
        />
        
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
                <div className="text-sm font-bold truncate group-hover:text-blue-400 transition-colors text-slate-300">{item.title}</div>
                {item.category && (
                    <span className="flex-none px-1.5 py-0.5 bg-purple-500/10 text-purple-400 text-[9px] font-bold rounded border border-purple-500/20">
                        {item.category}
                    </span>
                )}
            </div>
            <div className="text-[10px] text-slate-500 truncate font-mono mt-0.5 opacity-60">{item.url}</div>
            
            {item.notes && (
                <div 
                    onClick={(e) => { e.stopPropagation(); onEditNotes(e, item); }}
                    className="mt-2 px-3 py-2 bg-slate-950 border-l-4 border-blue-500 text-[10px] text-blue-400/80 font-mono whitespace-pre-wrap line-clamp-2 shadow-inner hover:bg-slate-900 transition-all cursor-text rounded-r-md group/note overflow-hidden relative"
                >
                    <div className="absolute top-0 right-0 p-1 opacity-0 group-hover/note:opacity-100 transition-opacity">
                        <Pencil size={8} className="text-blue-500" />
                    </div>
                    <span className="text-slate-600 mr-2 select-none">/*</span>
                    {item.notes}
                    <span className="text-slate-600 ml-2 select-none">*/</span>
                </div>
            )}

            <div className="flex flex-wrap gap-1 mt-1.5 items-center">
                {(item.tags || []).map(tag => (
                    <TagBadge 
                        key={tag} 
                        tag={tag} 
                        onRemove={(t) => onRemoveTag(item, t)} 
                        onEdit={(e, t) => onEditTag(e, item, t)}
                        onClick={onTagClick}
                        count={tagCounts?.[tag]}
                    />
                ))}
                <button 
                    onClick={(e) => onAddTag(e, item)}
                    className="text-[9px] px-1.5 py-0.5 rounded-sm bg-slate-800/50 text-slate-500 hover:text-blue-400 hover:bg-slate-800 border border-transparent hover:border-blue-500/30 transition-all"
                    title="タグを追加"
                >
                    <Plus size={10} />
                </button>
            </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={(e) => onEditNotes(e, item)} className={`p-2 hover:bg-slate-800 rounded-lg transition-colors ${item.notes ? 'text-blue-400' : 'text-slate-600 hover:text-blue-400'}`} title="メモを編集"><MessageSquareText size={16} /></button>
            <button onClick={(e) => onOpen(e, item.url)} className="p-2 text-slate-600 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors"><ExternalLink size={16} /></button>
            <button onClick={(e) => onDelete(e, item.url)} className="p-2 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="削除"><Trash2 size={16} /></button>
        </div>
    </div>
);

export const GridViewItem: React.FC<ItemProps> = ({ item, selected, onToggle, onSelect, onOpen, onDelete, onAddTag, onRemoveTag, onEditTag, onTagClick, onEditNotes, tagCounts }) => (
    <div 
        onClick={() => onSelect(item.url)} 
        className={`group flex flex-col p-4 border rounded-2xl transition-all cursor-pointer shadow-lg relative overflow-hidden ${selected
            ? 'bg-blue-900/20 border-blue-500/50'
            : 'bg-slate-900/30 hover:bg-slate-900 border-slate-800/80 hover:border-blue-500/30'
        }`}
    >
        <div className={`absolute top-0 left-0 w-full h-1 transition-colors ${selected ? 'bg-blue-500' : 'bg-blue-500/10 group-hover:bg-blue-500/40'}`} />
        
        <div 
            onClick={(e) => onToggle(e, item.url)}
            className={`absolute top-3 right-3 p-1.5 rounded-lg transition-all z-20 ${selected 
                ? 'text-blue-500 opacity-100 bg-blue-500/10' 
                : 'text-slate-500 opacity-0 group-hover:opacity-100 hover:text-slate-300 hover:bg-slate-800'}
            `}
        >
            {selected ? <CheckSquare size={18} /> : <Square size={18} />}
        </div>

        <div className="flex items-start justify-between mb-3 pr-8">
            <img 
                src={`https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=64`} 
                alt="" 
                className="w-12 h-12 p-2.5 rounded-xl bg-slate-950 object-contain border border-slate-800 shadow-inner group-hover:border-blue-500/30 transition-colors" 
                onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>'; }}
            />
            {item.category && (
                <div className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] font-bold rounded border border-purple-500/20 shadow-sm">
                    {item.category}
                </div>
            )}
            <div className="absolute bottom-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => onEditNotes(e, item)} className={`p-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors ${item.notes ? 'text-blue-400' : 'text-slate-400 hover:text-blue-400'}`} title="メモを編集"><MessageSquareText size={14} /></button>
                <button onClick={(e) => onOpen(e, item.url)} className="p-1.5 bg-slate-800 text-slate-400 hover:text-blue-400 rounded-lg hover:bg-slate-700 transition-colors"><ExternalLink size={14} /></button>
                <button onClick={(e) => onDelete(e, item.url)} className="p-1.5 bg-slate-800 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/20 transition-colors"><Trash2 size={14} /></button>
            </div>
        </div>

        <div className="flex-1 flex flex-col">
            <h3 className="text-sm font-bold line-clamp-2 leading-tight group-hover:text-blue-400 transition-colors mb-2 text-slate-300">{item.title}</h3>
            {item.description && <p className="text-[11px] text-slate-500 line-clamp-3 mb-2 flex-1 leading-relaxed">{item.description}</p>}
            
            {item.notes && (
                <div 
                    onClick={(e) => { e.stopPropagation(); onEditNotes(e, item); }}
                    className="mb-3 px-3 py-2 bg-slate-950 border-l-4 border-blue-500 text-[10px] text-blue-400/80 font-mono rounded-r-md shadow-inner hover:bg-slate-900 transition-all cursor-text group/note relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-1 opacity-0 group-hover/note:opacity-100 transition-opacity">
                        <Pencil size={8} className="text-blue-500" />
                    </div>
                    <div className="line-clamp-4 whitespace-pre-wrap leading-relaxed">
                        <span className="text-slate-600 mr-1 select-none">//</span>
                        {item.notes}
                    </div>
                </div>
            )}
            
            <div className="flex flex-wrap gap-1 mb-2 items-center">
                {(item.tags || []).map(tag => (
                    <TagBadge 
                        key={tag} 
                        tag={tag} 
                        onRemove={(t) => onRemoveTag(item, t)} 
                        onEdit={(e, t) => onEditTag(e, item, t)}
                        onClick={onTagClick}
                        count={tagCounts?.[tag]}
                    />
                ))}
                <button 
                    onClick={(e) => onAddTag(e, item)}
                    className="text-[9px] px-1.5 py-0.5 rounded-sm bg-slate-800/50 text-slate-500 hover:text-blue-400 hover:bg-slate-800 border border-transparent hover:border-blue-500/30 transition-all opacity-0 group-hover:opacity-100"
                    title="タグを追加"
                >
                    <Plus size={10} />
                </button>
            </div>

            <div className="pt-3 border-t border-slate-800/50 flex items-center justify-between">
                <span className="text-[10px] text-slate-600 font-mono truncate max-w-[120px]">{new URL(item.url).hostname}</span>
            </div>
        </div>
    </div>
);

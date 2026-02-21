import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Save, Clock, Code2, Loader2, Hash, Maximize2, Minimize2, GripVertical, AlignLeft } from 'lucide-react';
import type { VectorItem } from './Items';

interface NotepadPanelProps {
    item: VectorItem | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (url: string, notes: string) => Promise<void>;
    isLoading?: boolean;
}

export const NotepadPanel: React.FC<NotepadPanelProps> = ({ item, isOpen, onClose, onSave, isLoading: globalLoading }) => {
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isWordWrap, setIsWordWrap] = useState(true);
    const [panelWidth, setPanelWidth] = useState(560); // Default width
    const [isResizing, setIsResizing] = useState(false);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (item) {
            setNotes(item.notes || '');
        }
    }, [item]);

    // Handle Resize
    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (isResizing) {
            const newWidth = window.innerWidth - e.clientX;
            // Min/Max constraints
            if (newWidth > 320 && newWidth < window.innerWidth - 100) {
                setPanelWidth(newWidth);
            }
        }
    }, [isResizing]);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        } else {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    if (!isOpen || !item) return null;

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave(item.url, notes);
        } finally {
            setIsSaving(false);
        }
    };

    // Calculate line count for gutter
    const lineCount = notes.split('\n').length;
    const lines = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1);

    return (
        <div className={`fixed inset-0 z-50 flex justify-end overflow-hidden ${isResizing ? 'cursor-col-resize select-none' : 'pointer-events-none'}`}>
            {/* Backdrop */}
            <div 
                className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            />

            {/* Panel */}
            <div 
                style={{ width: isFullscreen ? '100%' : `${panelWidth}px` }}
                className={`relative bg-slate-900 shadow-2xl transform transition-transform duration-300 ease-out pointer-events-auto flex flex-col border-l border-slate-800 ${isOpen ? 'translate-x-0' : 'translate-x-full'} ${isFullscreen ? '!translate-x-0' : ''}`}
            >
                {/* Resize Handle (Left edge) */}
                {!isFullscreen && (
                    <div 
                        onMouseDown={startResizing}
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-20"
                    >
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100">
                            <GripVertical size={16} className="text-blue-400" />
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="relative z-10 px-6 py-4 bg-slate-950 text-white flex items-center justify-between border-b border-slate-800 shadow-sm">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
                            <Code2 size={20} />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm font-bold truncate pr-4 text-slate-200">{item.title}</h2>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                <Clock size={10} />
                                {new Date(item.timestamp).toLocaleString()}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-none">
                        <button 
                            onClick={() => setIsWordWrap(!isWordWrap)}
                            className={`p-2 rounded-lg transition-colors ${isWordWrap ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
                            title={isWordWrap ? "折り返し解除" : "折り返し表示"}
                        >
                            <AlignLeft size={20} />
                        </button>
                        <button 
                            onClick={() => setIsFullscreen(!isFullscreen)}
                            className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
                            title={isFullscreen ? "全画面解除" : "全画面表示"}
                        >
                            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                        </button>
                        <button 
                            onClick={onClose}
                            className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Editor Body */}
                <div className="flex-1 flex overflow-hidden bg-slate-950 font-mono text-sm leading-6 relative">
                    {/* Gutter / Line Numbers */}
                    {!isWordWrap && (
                        <div className="w-12 bg-slate-900 border-r border-slate-800 flex flex-col items-end px-3 py-6 text-slate-600 select-none mr-1 overflow-hidden">
                            {lines.map(line => (
                                <div key={line}>{line}</div>
                            ))}
                        </div>
                    )}

                    {/* Textarea Area */}
                    <div className="flex-1 relative">
                        <textarea
                            ref={textAreaRef}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="// ここにメモを入力してください..."
                            className={`w-full h-full bg-transparent p-6 pt-6 text-slate-300 focus:outline-none resize-none placeholder:text-slate-600 custom-scrollbar ${isWordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre'}`}
                            spellCheck={false}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="relative z-10 px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono bg-slate-950 px-2 py-1 rounded border border-slate-800">
                            <Hash size={10} />
                            {notes.length} ch
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                            {lineCount} lines
                        </div>
                    </div>
                    
                    <button
                        onClick={handleSave}
                        disabled={isSaving || globalLoading}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
                            isSaving || globalLoading
                                ? 'bg-slate-800 text-slate-500'
                                : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20 hover:scale-[1.02]'
                        }`}
                    >
                        {isSaving || globalLoading ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <Save size={16} />
                        )}
                        {isSaving || globalLoading ? 'Saving...' : 'Save Notes'}
                    </button>
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #1e293b;
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #334155;
                }
            `}</style>
        </div>
    );
};

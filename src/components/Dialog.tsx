import React, { useState, useEffect, useRef } from 'react';
import { X, AlertCircle, HelpCircle, CheckCircle } from 'lucide-react';

export type DialogType = 'alert' | 'confirm' | 'prompt';

export interface DialogOptions {
  title?: string;
  message: React.ReactNode;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
  defaultValue?: string;
  placeholder?: string;
}

interface DialogProps {
  isOpen: boolean;
  options: DialogOptions;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}

export const Dialog: React.FC<DialogProps> = ({ isOpen, options, onConfirm, onCancel }) => {
  const [inputValue, setInputValue] = useState(options.defaultValue || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && options.type === 'prompt') {
      setInputValue(options.defaultValue || '');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, options]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (options.type === 'prompt') {
      onConfirm(inputValue);
    } else {
      onConfirm();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const getIcon = () => {
    switch (options.type) {
      case 'confirm':
        return <HelpCircle className="text-blue-400" size={24} />;
      case 'prompt':
        return <CheckCircle className="text-green-400" size={24} />;
      case 'alert':
      default:
        return <AlertCircle className="text-yellow-400" size={24} />;
    }
  };

  const getTitle = () => {
    if (options.title) return options.title;
    switch (options.type) {
        case 'confirm': return '確認';
        case 'prompt': return '入力';
        case 'alert': return '通知';
        default: return '通知';
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            {getIcon()}
            {getTitle()}
          </h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-slate-300 text-sm whitespace-pre-wrap">
            {options.message}
          </div>

          {options.type === 'prompt' && (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={options.placeholder}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          )}
        </div>

        <div className="px-4 py-3 bg-slate-950/50 border-t border-slate-800 flex justify-end gap-2">
          {options.type !== 'alert' && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              {options.cancelText || 'キャンセル'}
            </button>
          )}
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-lg shadow-blue-900/20 transition-all"
          >
            {options.confirmText || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};

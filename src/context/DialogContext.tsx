import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { Dialog } from '../components/Dialog';
import type { DialogOptions } from '../components/Dialog';

interface DialogContextType {
  showAlert: (message: ReactNode, title?: string) => Promise<void>;
  showConfirm: (message: ReactNode, title?: string) => Promise<boolean>;
  showPrompt: (message: ReactNode, defaultValue?: string, title?: string) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export const DialogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<DialogOptions>({ message: '', type: 'alert' });
  const resolveRef = useRef<(value: any) => void>(() => {});

  const openDialog = useCallback((opts: DialogOptions): Promise<any> => {
    setOptions(opts);
    setIsOpen(true);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback((value?: string) => {
    setIsOpen(false);
    if (options.type === 'confirm') {
      resolveRef.current(true);
    } else if (options.type === 'prompt') {
      resolveRef.current(value);
    } else {
      resolveRef.current(undefined);
    }
  }, [options.type]);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    if (options.type === 'confirm') {
      resolveRef.current(false);
    } else if (options.type === 'prompt') {
      resolveRef.current(null);
    } else {
      resolveRef.current(undefined);
    }
  }, [options.type]);

  const showAlert = useCallback(async (message: ReactNode, title?: string) => {
    return openDialog({ message, title, type: 'alert' });
  }, [openDialog]);

  const showConfirm = useCallback(async (message: ReactNode, title?: string) => {
    return openDialog({ message, title, type: 'confirm' });
  }, [openDialog]);

  const showPrompt = useCallback(async (message: ReactNode, defaultValue?: string, title?: string) => {
    return openDialog({ message, title, type: 'prompt', defaultValue });
  }, [openDialog]);

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      {isOpen && (
        <Dialog
          isOpen={isOpen}
          options={options}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </DialogContext.Provider>
  );
};

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
};
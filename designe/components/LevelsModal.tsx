import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight } from 'lucide-react';
import { LEVELS, getLevel } from '../constants';
import { useAuth } from '../context/AuthContext';

interface LevelsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LevelsModal: React.FC<LevelsModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const currentLevel = user ? getLevel(user.points || 0) : LEVELS[0];

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; }
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" onClick={onClose}>
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/80" />

      {/* Modal Content */}
      <div 
        className="relative bg-zinc-50 dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl" 
        onClick={e => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Рейтинг</h2>
          <button 
            onClick={onClose}
            className="p-2 -mr-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-0">
          <div className="max-h-[70vh] overflow-y-auto">
            {LEVELS.map((level) => {
              const isCurrent = currentLevel.id === level.id;
              const isPassed = currentLevel.id > level.id;
              
              return (
                <div 
                  key={level.id} 
                  className={`flex items-center px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 last:border-0 transition-colors ${
                    isCurrent ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mr-4 ${
                    isCurrent 
                      ? 'bg-blue-500 text-white' 
                      : isPassed 
                        ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500' 
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                  }`}>
                    {level.id}
                  </div>
                  
                  <div className="flex-1">
                    <div className={`text-base font-medium ${isCurrent ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-900 dark:text-white'}`}>
                      {level.name}
                    </div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                      {level.minPoints.toLocaleString()} очков
                    </div>
                  </div>

                  {isCurrent && <ChevronRight size={18} className="text-blue-500" />}
                </div>
              );
            })}
          </div>
          
          {user && (
            <div className="p-6 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex justify-between items-end mb-3 text-sm">
                <span className="text-zinc-500 font-medium">Ваш прогресс</span>
                <span className="text-zinc-900 dark:text-white font-bold">{user.points?.toLocaleString()} / {LEVELS[currentLevel.id < LEVELS.length ? currentLevel.id : currentLevel.id - 1].minPoints.toLocaleString()}</span>
              </div>
              
              <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ 
                    width: `${Math.min(100, Math.max(0, ((user.points || 0) - currentLevel.minPoints) / ((LEVELS[currentLevel.id]?.minPoints || (currentLevel.minPoints * 2)) - currentLevel.minPoints) * 100))}%` 
                  }}
                />
              </div>
              
              {currentLevel.id < LEVELS.length && (
                <p className="mt-3 text-sm text-center text-zinc-400">
                  До уровня «{LEVELS[currentLevel.id].name}» осталось {(LEVELS[currentLevel.id].minPoints - (user.points || 0)).toLocaleString()} очков
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

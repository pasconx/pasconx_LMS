import React from 'react';
import { useTheme } from '../../context/ThemeContext.jsx';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle({ showLabel = false, className = '' }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type='button'
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`inline-flex items-center gap-2 p-2 rounded-xl transition-all duration-200 cursor-pointer ${
        isDark
          ? 'bg-slate-800/90 text-amber-300 hover:bg-slate-700/90 border border-slate-700/80 shadow-xs'
          : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 border border-slate-200/80 shadow-2xs'
      } ${className}`}
    >
      <div className='w-4 h-4 flex items-center justify-center'>
        {isDark ? (
          <Sun className='w-4 h-4 text-amber-300' />
        ) : (
          <Moon className='w-4 h-4 text-indigo-600' />
        )}
      </div>
      {showLabel && (
        <span className='text-xs font-semibold select-none'>
          {isDark ? 'Light Theme' : 'Dark Theme'}
        </span>
      )}
    </button>
  );
}

import React from 'react';

export type WorkspaceTab = 'overview' | 'models' | 'volatility' | 'summary' | 'data';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onUploadClick?: () => void;
  hasData?: boolean;
}

const NAV_ITEMS: { id: WorkspaceTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'models', label: 'Models' },
  { id: 'volatility', label: 'Volatility' },
  { id: 'summary', label: 'Summary' },
  { id: 'data', label: 'Data' },
];

export const TopBar: React.FC<TopBarProps> = ({ activeTab, onTabChange, onUploadClick, hasData = false }) => {
  return (
    <header className="no-print sticky top-0 z-30 bg-white border-b border-slate-200">
      <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            if (hasData) onTabChange('overview');
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Finlytics
        </a>

        {hasData && (
          <nav className="flex items-center gap-6 overflow-x-auto" aria-label="Primary">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={`relative py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-sm ${
                    isActive ? 'text-blue-700' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute left-0 right-0 -bottom-[13px] h-[2px] bg-blue-700" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
};

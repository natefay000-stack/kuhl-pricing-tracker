'use client';

import { DollarSign, ShoppingCart, Layers, ChevronRight } from 'lucide-react';

export type TabId = 'line-list' | 'pricing' | 'sales';

interface TabNavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  counts: {
    products: number;
    pricing: number;
    sales: number;
  };
}

// Color configurations for each tab (using static classes for Tailwind)
const tabColors = {
  'line-list': {
    bar: 'bg-kuhl-sage',
    iconBg: 'bg-kuhl-sage/10',
    iconText: 'text-kuhl-sage',
  },
  'pricing': {
    bar: 'bg-kuhl-cyan',
    iconBg: 'bg-kuhl-cyan/10',
    iconText: 'text-kuhl-cyan',
  },
  'sales': {
    bar: 'bg-emerald-600',
    iconBg: 'bg-emerald-600/10',
    iconText: 'text-emerald-600',
  },
};

export default function TabNavigation({ activeTab, onTabChange, counts }: TabNavigationProps) {
  const tabs = [
    {
      id: 'line-list' as TabId,
      label: 'Line List',
      icon: Layers,
      count: counts.products,
      description: 'Master product catalog by season',
    },
    {
      id: 'pricing' as TabId,
      label: 'Pricing',
      icon: DollarSign,
      count: counts.pricing,
      description: 'Price & cost history across seasons',
    },
    {
      id: 'sales' as TabId,
      label: 'Sales',
      icon: ShoppingCart,
      count: counts.sales,
      description: 'Revenue, units & customer analysis',
    },
  ];

  return (
    <div className="bg-gradient-to-b from-kuhl-cream to-kuhl-sand/20 border-b border-kuhl-sand/40">
      <div className="max-w-[1600px] mx-auto px-6 py-4">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-kuhl-stone/50">
              Navigate
            </span>
            <ChevronRight className="w-3 h-3 text-kuhl-stone/30" />
            <span className="text-xs font-medium text-kuhl-stone/70">
              Select a view to explore your data
            </span>
          </div>
        </div>

        {/* Tab Cards */}
        <nav className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const colors = tabColors[tab.id];
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  relative group text-left p-4 rounded-xl border-2 transition-all duration-200
                  ${isActive
                    ? 'bg-white border-kuhl-stone shadow-md ring-1 ring-kuhl-stone/10'
                    : 'bg-white/60 border-kuhl-sand/50 hover:bg-white hover:border-kuhl-sand hover:shadow-sm cursor-pointer'
                  }
                `}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div className={`absolute top-0 left-4 right-4 h-1 -mt-0.5 rounded-full ${colors.bar}`} />
                )}

                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`
                    flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors
                    ${isActive
                      ? colors.iconBg
                      : 'bg-kuhl-sand/30 group-hover:bg-kuhl-sand/50'
                    }
                  `}>
                    <tab.icon className={`w-5 h-5 ${isActive ? colors.iconText : 'text-kuhl-stone/50 group-hover:text-kuhl-stone/70'}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={`font-display font-semibold text-base ${isActive ? 'text-kuhl-stone' : 'text-kuhl-stone/70 group-hover:text-kuhl-stone'}`}>
                        {tab.label}
                      </h3>
                      {tab.count > 0 && (
                        <span className={`
                          text-xs font-mono px-2 py-0.5 rounded-full
                          ${isActive
                            ? 'bg-kuhl-stone/10 text-kuhl-stone'
                            : 'bg-kuhl-sand/50 text-kuhl-stone/50 group-hover:text-kuhl-stone/70'
                          }
                        `}>
                          {tab.count.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs mt-0.5 ${isActive ? 'text-kuhl-stone/60' : 'text-kuhl-stone/40 group-hover:text-kuhl-stone/50'}`}>
                      {tab.description}
                    </p>
                  </div>

                  {/* Arrow indicator for active */}
                  {isActive && (
                    <div className="flex-shrink-0 self-center">
                      <ChevronRight className="w-4 h-4 text-kuhl-stone/40" />
                    </div>
                  )}
                </div>

                {/* Click hint for inactive tabs */}
                {!isActive && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-kuhl-stone/40 bg-white/80 px-2 py-0.5 rounded">
                      Click to view
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

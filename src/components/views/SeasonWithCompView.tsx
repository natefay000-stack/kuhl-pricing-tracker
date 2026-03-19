'use client';

import { useState } from 'react';
import retryDynamic from '@/lib/retryDynamic';
import { Product, SalesRecord, PricingRecord, CostRecord } from '@/types/product';

const SeasonView = retryDynamic(() => import('./SeasonView'));
const SeasonCompView = retryDynamic(() => import('./SeasonCompView'));

type TabId = 'season' | 'seasoncomp';

const TABS: { id: TabId; label: string }[] = [
  { id: 'season', label: 'Season View' },
  { id: 'seasoncomp', label: 'Season Comparison' },
];

interface Props {
  products: Product[];
  sales: SalesRecord[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  searchQuery: string;
  onStyleClick: (styleNumber: string) => void;
  initialTab?: TabId;
}

export default function SeasonWithCompView({
  products,
  sales,
  pricing,
  costs,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  searchQuery,
  onStyleClick,
  initialTab = 'season',
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  return (
    <div>
      {/* Tab Bar */}
      <div
        className="flex gap-1 px-6 py-2 sticky top-14 z-20"
        style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--glass-border)',
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-cyan-600/20 text-cyan-400'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-tertiary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'season' && (
        <SeasonView
          products={products}
          sales={sales}
          pricing={pricing}
          costs={costs}
          selectedSeason={selectedSeason}
          selectedDivision={selectedDivision}
          selectedCategory={selectedCategory}
          searchQuery={searchQuery}
          onStyleClick={onStyleClick}
        />
      )}
      {activeTab === 'seasoncomp' && (
        <SeasonCompView
          products={products}
          sales={sales}
          selectedSeason={selectedSeason}
          selectedDivision={selectedDivision}
          selectedCategory={selectedCategory}
          searchQuery={searchQuery}
          onStyleClick={onStyleClick}
        />
      )}
    </div>
  );
}

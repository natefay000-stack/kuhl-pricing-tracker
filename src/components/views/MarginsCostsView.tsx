'use client';

import { useState } from 'react';
import retryDynamic from '@/lib/retryDynamic';
import { Product, SalesRecord, PricingRecord, CostRecord } from '@/types/product';

const MarginsView = retryDynamic(() => import('./MarginsView'));
const CostsView = retryDynamic(() => import('./CostsView'));
const PricingView = retryDynamic(() => import('./PricingView'));

type TabId = 'margins' | 'costs' | 'pricing';

const TABS: { id: TabId; label: string }[] = [
  { id: 'margins', label: 'Margins' },
  { id: 'costs', label: 'Costs' },
  { id: 'pricing', label: 'Pricing' },
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

export default function MarginsCostsView({
  products,
  sales,
  pricing,
  costs,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  searchQuery,
  onStyleClick,
  initialTab = 'margins',
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
      {activeTab === 'margins' && (
        <MarginsView
          products={products}
          sales={sales}
          costs={costs}
          pricing={pricing}
          selectedSeason={selectedSeason}
          selectedDivision={selectedDivision}
          selectedCategory={selectedCategory}
          searchQuery={searchQuery}
          onStyleClick={onStyleClick}
        />
      )}
      {activeTab === 'costs' && (
        <CostsView
          products={products}
          pricing={pricing}
          costs={costs}
          sales={sales}
          selectedSeason={selectedSeason}
          selectedDivision={selectedDivision}
          selectedCategory={selectedCategory}
          searchQuery={searchQuery}
          onStyleClick={onStyleClick}
        />
      )}
      {activeTab === 'pricing' && (
        <PricingView
          products={products}
          pricing={pricing}
          costs={costs}
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

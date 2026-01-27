'use client';

import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Product, formatCurrency } from '@/types/product';

interface StyleSummary {
  styleNumber: string;
  styleDesc: string;
  price: number;
  msrp: number;
  colorCount: number;
  divisionDesc: string;
  productLineDesc: string;
}

interface SummaryTableProps {
  products: Product[];
}

type SortKey = 'styleNumber' | 'styleDesc' | 'price' | 'msrp';
type SortDirection = 'asc' | 'desc';

export default function SummaryTable({ products }: SummaryTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('styleNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Deduplicate by style number
  const styleSummaries = useMemo(() => {
    const styleMap = new Map<string, StyleSummary>();
    
    products.forEach(product => {
      const existing = styleMap.get(product.styleNumber);
      if (!existing) {
        styleMap.set(product.styleNumber, {
          styleNumber: product.styleNumber,
          styleDesc: product.styleDesc,
          price: product.price,
          msrp: product.msrp,
          colorCount: 1,
          divisionDesc: product.divisionDesc,
          productLineDesc: product.productLineDesc,
        });
      } else {
        // Update color count, keep first price/msrp found
        existing.colorCount++;
      }
    });
    
    return Array.from(styleMap.values());
  }, [products]);

  const sortedSummaries = useMemo(() => {
    return [...styleSummaries].sort((a, b) => {
      let aVal: any = a[sortKey];
      let bVal: any = b[sortKey];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [styleSummaries, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const SortHeader = ({ label, sortKeyName, className = '' }: { label: string; sortKeyName: SortKey; className?: string }) => (
    <th
      onClick={() => handleSort(sortKeyName)}
      className={`cursor-pointer hover:bg-kuhl-sand/20 select-none ${className}`}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortKey === sortKeyName && (
          sortDirection === 'asc' 
            ? <ChevronUp className="w-3 h-3" /> 
            : <ChevronDown className="w-3 h-3" />
        )}
      </div>
    </th>
  );

  if (styleSummaries.length === 0) {
    return (
      <div className="card">
        <div className="p-12 text-center text-kuhl-stone/50">
          <p className="text-lg font-medium">No styles found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="pricing-table">
          <thead>
            <tr>
              <SortHeader label="Style #" sortKeyName="styleNumber" />
              <SortHeader label="Style Name" sortKeyName="styleDesc" />
              <SortHeader label="Wholesale" sortKeyName="price" className="text-right" />
              <SortHeader label="MSRP" sortKeyName="msrp" className="text-right" />
            </tr>
          </thead>
          <tbody>
            {sortedSummaries.map((style) => (
              <tr key={style.styleNumber}>
                <td className="font-mono text-sm font-medium text-kuhl-stone">
                  {style.styleNumber}
                </td>
                <td>
                  <div className="font-medium">{style.styleDesc}</div>
                  {style.colorCount > 1 && (
                    <div className="text-xs text-kuhl-stone/50">{style.colorCount} colors</div>
                  )}
                </td>
                <td className="text-right font-mono text-sm font-medium">
                  {formatCurrency(style.price)}
                </td>
                <td className="text-right font-mono text-sm">
                  {formatCurrency(style.msrp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 bg-kuhl-cream/50 border-t border-kuhl-sand/30 text-sm text-kuhl-stone/60">
        Showing {styleSummaries.length.toLocaleString()} unique styles
      </div>
    </div>
  );
}

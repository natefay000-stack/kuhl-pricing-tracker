'use client';

import React from 'react';
import { Database, CheckCircle, Circle, XCircle, AlertTriangle } from 'lucide-react';

export default function DataSourceMapView() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-display font-bold text-gray-900 tracking-tight">
          KÜHL <span className="text-blue-600">Data Source Map</span>
        </h1>
        <p className="text-base text-gray-500 mt-2">
          Where each field comes from across all data sources. Blue = primary source of truth. Green = secondary/fallback source.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-6 bg-white rounded-xl border-2 border-gray-200 p-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-7 rounded-md bg-blue-100 border-2 border-blue-600 flex items-center justify-center">
            <CheckCircle className="w-4 h-4 text-blue-600" />
          </div>
          <span className="text-sm font-semibold text-gray-700">1st Source of Truth</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-7 rounded-md bg-emerald-100 border-2 border-emerald-600 flex items-center justify-center">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-sm font-semibold text-gray-700">2nd Source (Fallback)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-7 rounded-md bg-gray-100 border border-gray-300 flex items-center justify-center">
            <Circle className="w-4 h-4 text-gray-400" />
          </div>
          <span className="text-sm font-semibold text-gray-700">Has Data</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-7 rounded-md bg-white border border-gray-300 flex items-center justify-center">
            <XCircle className="w-4 h-4 text-gray-300" />
          </div>
          <span className="text-sm font-semibold text-gray-700">No Data</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-7 rounded-md bg-red-100 border-2 border-red-500 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <span className="text-sm font-semibold text-gray-700">No Source of Truth</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-900">
                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider min-w-[160px]">
                  Field
                </th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider min-w-[120px]">
                  Sales Files
                </th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider min-w-[120px]">
                  Line List
                </th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider min-w-[140px]">
                  Price by Season
                </th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider min-w-[120px]">
                  Landed Sheet
                </th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider min-w-[120px]">
                  Style Master
                </th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider min-w-[140px]">
                  Customer Master
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Section: Identifiers */}
              <SectionRow title="Identifiers" />
              <DataRow
                field="Style #"
                cells={[
                  { type: 'primary', tooltip: 'Every transaction has a style #' },
                  { type: 'has', tooltip: 'Listed per season' },
                  { type: 'has', tooltip: 'Pricing keyed by style' },
                  { type: 'has', tooltip: 'Cost keyed by style' },
                  { type: 'has', tooltip: 'Central registry' },
                  { type: 'none', tooltip: 'Customer-level data only' },
                ]}
              />
              <DataRow
                field="Description"
                cells={[
                  { type: 'secondary', tooltip: 'Fallback if not in Line List' },
                  { type: 'primary', tooltip: 'Official product name' },
                  { type: 'has', tooltip: 'Has description' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'has', tooltip: 'Inherited from Line List' },
                  { type: 'none', tooltip: 'Customer-level data only' },
                ]}
              />
              <DataRow
                field="Season"
                cells={[
                  { type: 'primary', tooltip: 'Season per transaction' },
                  { type: 'has', tooltip: 'Implicit by file (SP27, etc.)' },
                  { type: 'has', tooltip: 'Season in pricing data' },
                  { type: 'has', tooltip: 'Season in cost data' },
                  { type: 'none', tooltip: 'All seasons, no specific one' },
                  { type: 'none', tooltip: 'Customer-level data only' },
                ]}
              />

              {/* Section: Product Attributes */}
              <SectionRow title="Product Attributes" />
              <DataRow
                field="Category"
                cells={[
                  { type: 'secondary', tooltip: 'Fallback — less reliable' },
                  { type: 'primary', tooltip: 'Authoritative category' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'has', tooltip: 'Inherited from Line List' },
                  { type: 'none', tooltip: 'Customer-level data only' },
                ]}
              />
              <DataRow
                field="Gender"
                cells={[
                  { type: 'secondary', tooltip: 'Unreliable — use as fallback only' },
                  { type: 'primary', tooltip: 'Reliable gender assignment' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'has', tooltip: 'Inherited from Line List' },
                  { type: 'none', tooltip: 'Customer-level data only' },
                ]}
              />
              <DataRow
                field="Division"
                cells={[
                  { type: 'none', tooltip: 'Not in sales data' },
                  { type: 'primary', tooltip: 'KÜHL vs SKYTHE' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'secondary', tooltip: 'Fallback from registry' },
                  { type: 'none', tooltip: 'Customer-level data only' },
                ]}
              />
              <DataRow
                field="Designer"
                cells={[
                  { type: 'none', tooltip: 'Sales doesn\'t track designer' },
                  { type: 'primary', tooltip: 'Designer assigned per style' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'secondary', tooltip: 'Inherited — backfill from Line Lists' },
                  { type: 'none', tooltip: 'Customer-level data only' },
                ]}
              />
              <DataRow
                field="Color"
                cells={[
                  { type: 'secondary', tooltip: 'Color per transaction' },
                  { type: 'primary', tooltip: 'Full colorway plan' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not tracked' },
                  { type: 'none', tooltip: 'Customer-level data only' },
                ]}
              />

              {/* Section: Customer & Sales */}
              <SectionRow title="Customer & Sales" />
              <DataRow
                field="Customer Name"
                cells={[
                  { type: 'secondary', tooltip: 'Fallback — may have inconsistencies' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'primary', tooltip: 'Official account name from ERP' },
                ]}
              />
              <DataRow
                field="Customer Type"
                cells={[
                  { type: 'secondary', tooltip: 'BB, WH, EC, PS, KI, WD' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'primary', tooltip: 'Authoritative channel assignment' },
                ]}
              />
              <DataRow
                field="Discount Tier"
                cells={[
                  { type: 'none', tooltip: 'Not in sales data' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'primary', tooltip: 'Pricing tier from ERP' },
                ]}
              />
              <DataRow
                field="Region / Territory"
                cells={[
                  { type: 'none', tooltip: 'Not in sales data' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'primary', tooltip: 'Territory assignment from ERP' },
                ]}
              />
              <DataRow
                field="Sales Rep"
                cells={[
                  { type: 'none', tooltip: 'Not in sales data' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'primary', tooltip: 'Rep assignment from ERP' },
                ]}
              />
              <DataRow
                field="Payment Terms"
                cells={[
                  { type: 'none', tooltip: 'Not in sales data' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'primary', tooltip: 'Terms from ERP' },
                ]}
              />
              <DataRow
                field="Account Status"
                cells={[
                  { type: 'none', tooltip: 'Not in sales data' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'primary', tooltip: 'Active / Inactive from ERP' },
                ]}
              />
              <DataRow
                field="Revenue"
                cells={[
                  { type: 'primary', tooltip: 'Actual transaction revenue' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                ]}
              />
              <DataRow
                field="Units"
                cells={[
                  { type: 'primary', tooltip: 'Actual units sold' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                ]}
              />

              {/* Section: Pricing */}
              <SectionRow title="Pricing" />
              <DataRow
                field="MSRP"
                cells={[
                  { type: 'none', tooltip: 'Not in sales data' },
                  { type: 'secondary', tooltip: 'Fallback MSRP' },
                  { type: 'primary', tooltip: 'Season-specific MSRP' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not tracked' },
                  { type: 'none', tooltip: 'Customer-level data only' },
                ]}
              />
              <DataRow
                field="Wholesale Price"
                cells={[
                  { type: 'none', tooltip: 'Not in sales data' },
                  { type: 'secondary', tooltip: 'Fallback wholesale' },
                  { type: 'primary', tooltip: 'Season-specific wholesale' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not tracked' },
                  { type: 'none', tooltip: 'Customer-level data only' },
                ]}
              />
              <DataRow
                field="Net Price (Actual)"
                cells={[
                  { type: 'primary', tooltip: 'Revenue ÷ Units = actual net' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Not available' },
                  { type: 'none', tooltip: 'Customer-level data only' },
                ]}
              />
              <DataRow
                field="Landed Cost"
                cells={[
                  { type: 'none', tooltip: 'Not in sales data' },
                  { type: 'none', tooltip: 'Not in line list' },
                  { type: 'none', tooltip: 'Not in pricing' },
                  { type: 'primary', tooltip: 'Only source for landed cost' },
                  { type: 'none', tooltip: 'Not tracked' },
                  { type: 'none', tooltip: 'Customer-level data only' },
                ]}
              />

              {/* Section: Derived / Margin */}
              <SectionRow title="Derived / Margin" />
              <tr className="border-b border-gray-200">
                <td className="px-6 py-3 text-sm font-semibold text-gray-900 font-mono">
                  Margin %
                </td>
                <td colSpan={6} className="px-6 py-3 text-sm text-gray-600 italic">
                  Calculated: (Net Price − Landed Cost) ÷ Net Price — requires Sales + Landed Sheet
                </td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-3 text-sm font-semibold text-gray-900 font-mono">
                  Gross Profit
                </td>
                <td colSpan={6} className="px-6 py-3 text-sm text-gray-600 italic">
                  Calculated: Revenue − (Landed Cost × Units) — requires Sales + Landed Sheet
                </td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-3 text-sm font-semibold text-gray-900 font-mono">
                  Rev / Style
                </td>
                <td colSpan={6} className="px-6 py-3 text-sm text-gray-600 italic">
                  Calculated: Total Revenue ÷ Distinct Style Count — from Sales only
                </td>
              </tr>

              {/* Section: Gaps */}
              <SectionRow title="⚠ Gaps — No Source of Truth Without Customer Master" />
              <DataRow
                field="Discount Tier"
                cells={[
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'primary', tooltip: 'ONLY available from Customer Master' },
                ]}
              />
              <DataRow
                field="Region / Territory"
                cells={[
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'primary', tooltip: 'ONLY available from Customer Master' },
                ]}
              />
              <DataRow
                field="Sales Rep"
                cells={[
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'primary', tooltip: 'ONLY available from Customer Master' },
                ]}
              />
              <DataRow
                field="Payment Terms"
                cells={[
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'gap', tooltip: 'No source without Customer Master' },
                  { type: 'primary', tooltip: 'ONLY available from Customer Master' },
                ]}
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Note */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
        <div className="flex gap-3">
          <Database className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-bold text-blue-900 mb-2">Building the Complete Data Picture</h3>
            <p className="text-sm text-blue-800 leading-relaxed">
              The red cells at the bottom make the case clear — without a Customer Master from Full Circle, there's no source of truth for discount tiers, territories, sales reps, or payment terms.
              Uploading a Customer Master export fills every gap in the customer dimension. Combined with the Style Registry (Line List → Style Master backfill),
              every view in the app can connect the dots: who designed it, who bought it, what they paid, what it cost, and what the margin was.
            </p>
            <p className="text-sm text-blue-800 leading-relaxed mt-2">
              The join key for products is <strong className="font-mono">style_number</strong>. The join key for customers is <strong className="font-mono">customer_name</strong> (or customer ID if available in the ERP export).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function SectionRow({ title }: { title: string }) {
  return (
    <tr className="bg-gray-100">
      <td colSpan={7} className="px-6 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">
        {title}
      </td>
    </tr>
  );
}

interface CellData {
  type: 'primary' | 'secondary' | 'has' | 'none' | 'gap';
  tooltip: string;
}

function DataRow({ field, cells }: { field: string; cells: CellData[] }) {
  return (
    <tr className="border-b border-gray-200 hover:bg-gray-50">
      <td className="px-6 py-3 text-sm font-semibold text-gray-900 font-mono">
        {field}
      </td>
      {cells.map((cell, idx) => (
        <td key={idx} className="px-4 py-3 text-center">
          <div className="inline-flex items-center justify-center relative group">
            <Cell type={cell.type} />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
              <div className="bg-gray-900 text-white text-xs font-medium px-3 py-2 rounded-lg whitespace-nowrap shadow-lg">
                {cell.tooltip}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                  <div className="border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </div>
          </div>
        </td>
      ))}
    </tr>
  );
}

function Cell({ type }: { type: 'primary' | 'secondary' | 'has' | 'none' | 'gap' }) {
  const styles = {
    primary: 'bg-blue-100 border-2 border-blue-600 text-blue-600',
    secondary: 'bg-emerald-100 border-2 border-emerald-600 text-emerald-600',
    has: 'bg-gray-100 border border-gray-300 text-gray-400',
    none: 'bg-white border border-gray-300 text-gray-300',
    gap: 'bg-red-100 border-2 border-red-500 text-red-500',
  };

  const icons = {
    primary: <CheckCircle className="w-4 h-4" />,
    secondary: <CheckCircle className="w-4 h-4" />,
    has: <Circle className="w-4 h-4" />,
    none: <XCircle className="w-4 h-4" />,
    gap: <AlertTriangle className="w-4 h-4" />,
  };

  return (
    <div className={`w-9 h-7 rounded-md flex items-center justify-center transition-transform hover:scale-110 ${styles[type]}`}>
      {icons[type]}
    </div>
  );
}

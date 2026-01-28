'use client';

import { useState, useCallback } from 'react';
import {
  X,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
} from 'lucide-react';

interface ImportResult {
  success: boolean;
  season: string;
  stats: {
    lineListCount: number;
    pricingCount: number;
    landedCostMatches: number;
    productsCount: number;
    costsCount: number;
    salesCount: number;
  };
  data: {
    products: Record<string, unknown>[];
    pricing: Record<string, unknown>[];
    costs: Record<string, unknown>[];
    sales: Record<string, unknown>[];
  };
}

interface SeasonImportModalProps {
  existingSeasons: string[];
  onImport: (data: {
    products: Record<string, unknown>[];
    pricing: Record<string, unknown>[];
    costs: Record<string, unknown>[];
    sales: Record<string, unknown>[];
    season: string;
  }) => void;
  onImportSalesOnly: (data: {
    sales: Record<string, unknown>[];
  }) => void;
  onClose: () => void;
}

const SEASON_OPTIONS = [
  { value: '27FA', label: 'Fall 2027 (27FA)' },
  { value: '27SP', label: 'Spring 2027 (27SP)' },
  { value: '26FA', label: 'Fall 2026 (26FA)' },
  { value: '26SP', label: 'Spring 2026 (26SP)' },
  { value: '25FA', label: 'Fall 2025 (25FA)' },
  { value: '25SP', label: 'Spring 2025 (25SP)' },
];

type FileType = 'lineList' | 'pricing' | 'landed' | 'sales';

const FILE_TYPE_INFO: Record<FileType, { label: string; description: string }> = {
  lineList: { label: 'Line List', description: 'Products & base pricing' },
  pricing: { label: 'Pricing', description: 'Price by season file' },
  landed: { label: 'Landed Costs', description: 'FOB, LDP, duties' },
  sales: { label: 'Sales', description: 'Sales data (can contain all seasons)' },
};

export default function SeasonImportModal({
  existingSeasons,
  onImport,
  onImportSalesOnly,
  onClose,
}: SeasonImportModalProps) {
  const [selectedSeason, setSelectedSeason] = useState('27SP');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<FileType | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback((fileType: FileType, file: File | null) => {
    setSelectedFile(file);
    setSelectedFileType(file ? fileType : null);
    setResult(null);
    setError(null);
  }, []);

  const handleImport = async () => {
    if (!selectedFile || !selectedFileType) {
      setError('Please select a file to import');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Special handling for sales - can import all seasons at once
      if (selectedFileType === 'sales') {
        const formData = new FormData();
        formData.append('sales', selectedFile);

        const response = await fetch('/api/import-sales', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Import failed');
        }

        const data = await response.json();

        // Show confirmation with season breakdown
        const seasonList = Object.entries(data.stats.seasonBreakdown)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([season, count]) => `${season}: ${(count as number).toLocaleString()}`)
          .join(', ');

        if (confirm(`Import ${data.stats.totalSales.toLocaleString()} sales records?\n\nBy season: ${seasonList}`)) {
          onImportSalesOnly({ sales: data.data.sales });
        }
      } else {
        // Other file types - use season-specific import
        const formData = new FormData();
        formData.append(selectedFileType, selectedFile);
        formData.append('season', selectedSeason);

        const response = await fetch('/api/import-season', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Import failed');
        }

        const data = await response.json();
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmImport = () => {
    if (result && result.data) {
      onImport({
        products: result.data.products,
        pricing: result.data.pricing || [],
        costs: result.data.costs,
        sales: result.data.sales || [],
        season: selectedSeason,
      });
    }
  };

  const getResultSummary = () => {
    if (!result) return '';
    const parts = [];
    if (result.stats.productsCount > 0) parts.push(`${result.stats.productsCount.toLocaleString()} products`);
    if (result.stats.pricingCount > 0) parts.push(`${result.stats.pricingCount.toLocaleString()} pricing records`);
    if (result.stats.costsCount > 0) parts.push(`${result.stats.costsCount.toLocaleString()} cost records`);
    if (result.stats.salesCount > 0) parts.push(`${result.stats.salesCount.toLocaleString()} sales records`);
    return parts.join(', ');
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full overflow-hidden animate-slide-up flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b-2 border-gray-200 flex items-center justify-between bg-gray-50">
          <h2 className="text-xl font-display font-bold text-gray-900">
            Import Data
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Season Selector */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
              Season
            </label>
            <div className="relative">
              <select
                value={selectedSeason}
                onChange={(e) => {
                  setSelectedSeason(e.target.value);
                  setResult(null);
                }}
                className="w-full px-4 py-2 text-lg font-medium bg-white border-2 border-gray-300 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
              >
                {SEASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                    {existingSeasons.includes(opt.value) ? ' (has data)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Sales files can contain multiple seasons - they'll be imported together
            </p>
          </div>

          {/* File Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
              Select File to Import
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(FILE_TYPE_INFO) as FileType[]).map((fileType) => {
                const info = FILE_TYPE_INFO[fileType];
                const isSelected = selectedFileType === fileType;

                return (
                  <label
                    key={fileType}
                    className={`relative border-2 rounded-xl p-4 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        handleFileSelect(fileType, file);
                      }}
                    />
                    <div className="flex items-start gap-3">
                      <FileSpreadsheet className={`w-5 h-5 mt-0.5 ${isSelected ? 'text-cyan-600' : 'text-gray-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-sm ${isSelected ? 'text-cyan-900' : 'text-gray-900'}`}>
                          {info.label}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{info.description}</p>
                        {isSelected && selectedFile && (
                          <p className="text-xs text-cyan-700 mt-1 truncate font-medium">
                            {selectedFile.name}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <CheckCircle className="w-5 h-5 text-cyan-600 flex-shrink-0" />
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-800">Ready to import</p>
                  <p className="text-xs text-emerald-700 mt-0.5">{getResultSummary()}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t-2 border-gray-200 flex justify-end gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>

          {result ? (
            <button
              onClick={handleConfirmImport}
              className="px-6 py-2 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 transition-colors"
            >
              Confirm Import
            </button>
          ) : (
            <button
              onClick={handleImport}
              disabled={!selectedFile || isProcessing}
              className="px-6 py-2 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Import'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

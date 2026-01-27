'use client';

import { useState, useCallback } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
} from 'lucide-react';

interface ImportStats {
  lineListCount: number;
  pricingCount: number;
  landedCostMatches: number;
  productsCount: number;
  costsCount: number;
  salesCount: number;
}

interface PreviewItem {
  styleNumber: string;
  styleName: string;
  colorCode: string;
  msrp: number;
  wholesale: number;
  landed: number;
  margin: number;
  costSource: 'line_list' | 'landed_sheet';
}

interface ImportResult {
  success: boolean;
  season: string;
  stats: ImportStats;
  data: {
    products: Record<string, unknown>[];
    pricing: Record<string, unknown>[];
    costs: Record<string, unknown>[];
    sales: Record<string, unknown>[];
  };
  preview: PreviewItem[];
}

interface SeasonImportModalProps {
  existingSeasons: string[];
  onImport: (data: {
    products: Record<string, unknown>[];
    pricing: Record<string, unknown>[];
    costs: Record<string, unknown>[];
    sales: Record<string, unknown>[];
    season: string
  }) => void;
  onClose: () => void;
}

const SEASON_OPTIONS = [
  { value: '27SP', label: 'Spring 2027 (27SP)' },
  { value: '27FA', label: 'Fall 2027 (27FA)' },
  { value: '26FA', label: 'Fall 2026 (26FA)' },
  { value: '26SP', label: 'Spring 2026 (26SP)' },
];

export default function SeasonImportModal({
  existingSeasons,
  onImport,
  onClose,
}: SeasonImportModalProps) {
  const [selectedSeason, setSelectedSeason] = useState('27SP');
  const [lineListFile, setLineListFile] = useState<File | null>(null);
  const [pricingFile, setPricingFile] = useState<File | null>(null);
  const [landedFile, setLandedFile] = useState<File | null>(null);
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [salesProgress, setSalesProgress] = useState<number>(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileDrop = useCallback(
    (e: React.DragEvent, type: 'lineList' | 'pricing' | 'landed' | 'sales') => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
        if (type === 'lineList') {
          setLineListFile(file);
        } else if (type === 'pricing') {
          setPricingFile(file);
        } else if (type === 'landed') {
          setLandedFile(file);
        } else {
          setSalesFile(file);
        }
        setResult(null);
        setError(null);
      }
    },
    []
  );

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'lineList' | 'pricing' | 'landed' | 'sales'
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      if (type === 'lineList') {
        setLineListFile(file);
      } else if (type === 'pricing') {
        setPricingFile(file);
      } else if (type === 'landed') {
        setLandedFile(file);
      } else {
        setSalesFile(file);
      }
      setResult(null);
      setError(null);
    }
  };

  const handlePreview = async () => {
    if (!lineListFile) {
      setError('Please select a Line List file');
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Processing Line List...');
    setSalesProgress(0);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('lineList', lineListFile);
      formData.append('season', selectedSeason);

      if (pricingFile) {
        formData.append('pricing', pricingFile);
        setProcessingStatus('Processing Line List and Pricing...');
      }

      if (landedFile) {
        formData.append('landed', landedFile);
      }

      if (salesFile) {
        formData.append('sales', salesFile);
        setProcessingStatus('Processing all files (large sales files may take a moment)...');
      }

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
      setProcessingStatus('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process files');
      setProcessingStatus('');
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

  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;
  const formatPercent = (val: number) => `${val.toFixed(1)}%`;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden animate-slide-up flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b-2 border-gray-200 flex items-center justify-between bg-gray-50">
          <h2 className="text-2xl font-display font-bold text-gray-900">
            Import Season Data
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
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
                className="w-64 px-4 py-2 text-lg font-medium bg-white border-2 border-gray-300 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
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
          </div>

          {/* File Upload Zones */}
          <div className="space-y-4">
            {/* 1. Line List (Required) */}
            <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-gray-900">1. Line List</span>
                  <span className="ml-2 text-xs font-medium px-2 py-0.5 bg-red-100 text-red-700 rounded">
                    Required
                  </span>
                </div>
                <span className="text-sm text-gray-500">Style info + base pricing</span>
              </div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleFileDrop(e, 'lineList')}
                className={`p-4 text-center transition-colors ${
                  lineListFile ? 'bg-emerald-50' : 'bg-white hover:bg-gray-50'
                }`}
              >
                {lineListFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <div className="text-left">
                      <p className="font-medium text-gray-900 text-sm">{lineListFile.name}</p>
                      <p className="text-xs text-gray-500">{(lineListFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      onClick={() => { setLineListFile(null); setResult(null); }}
                      className="ml-4 text-xs text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-4">
                    <FileSpreadsheet className="w-8 h-8 text-gray-400" />
                    <div className="text-left">
                      <p className="text-gray-600 text-sm">Drag & drop or select Line List file</p>
                    </div>
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-cyan-600 text-white text-sm rounded-lg hover:bg-cyan-700 cursor-pointer transition-colors">
                      <Upload className="w-4 h-4" />
                      Select
                      <input type="file" accept=".xlsx,.xls" onChange={(e) => handleFileSelect(e, 'lineList')} className="hidden" />
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Pricing (Optional) */}
            <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-gray-900">2. Pricing</span>
                  <span className="ml-2 text-xs font-medium px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                    Optional
                  </span>
                </div>
                <span className="text-sm text-gray-500">Overrides Line List pricing</span>
              </div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleFileDrop(e, 'pricing')}
                className={`p-4 text-center transition-colors ${
                  pricingFile ? 'bg-emerald-50' : 'bg-white hover:bg-gray-50'
                }`}
              >
                {pricingFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <div className="text-left">
                      <p className="font-medium text-gray-900 text-sm">{pricingFile.name}</p>
                      <p className="text-xs text-gray-500">{(pricingFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      onClick={() => { setPricingFile(null); setResult(null); }}
                      className="ml-4 text-xs text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-4">
                    <FileSpreadsheet className="w-8 h-8 text-gray-300" />
                    <div className="text-left">
                      <p className="text-gray-500 text-sm">pricebyseason.xlsx (source of truth for pricing)</p>
                    </div>
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 cursor-pointer transition-colors">
                      <Upload className="w-4 h-4" />
                      Select
                      <input type="file" accept=".xlsx,.xls" onChange={(e) => handleFileSelect(e, 'pricing')} className="hidden" />
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Landed Costs (Optional) */}
            <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-gray-900">3. Landed Costs</span>
                  <span className="ml-2 text-xs font-medium px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                    Optional
                  </span>
                </div>
                <span className="text-sm text-gray-500">Overrides Line List costs</span>
              </div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleFileDrop(e, 'landed')}
                className={`p-4 text-center transition-colors ${
                  landedFile ? 'bg-emerald-50' : 'bg-white hover:bg-gray-50'
                }`}
              >
                {landedFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <div className="text-left">
                      <p className="font-medium text-gray-900 text-sm">{landedFile.name}</p>
                      <p className="text-xs text-gray-500">{(landedFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      onClick={() => { setLandedFile(null); setResult(null); }}
                      className="ml-4 text-xs text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-4">
                    <FileSpreadsheet className="w-8 h-8 text-gray-300" />
                    <div className="text-left">
                      <p className="text-gray-500 text-sm">Landed Request Sheet (FOB, LDP, duties)</p>
                    </div>
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 cursor-pointer transition-colors">
                      <Upload className="w-4 h-4" />
                      Select
                      <input type="file" accept=".xlsx,.xls" onChange={(e) => handleFileSelect(e, 'landed')} className="hidden" />
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* 4. Sales Data (Optional) */}
            <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-gray-900">4. Sales Data</span>
                  <span className="ml-2 text-xs font-medium px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                    Optional
                  </span>
                </div>
                <span className="text-sm text-gray-500">Historical sales performance</span>
              </div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleFileDrop(e, 'sales')}
                className={`p-4 text-center transition-colors ${
                  salesFile ? 'bg-emerald-50' : 'bg-white hover:bg-gray-50'
                }`}
              >
                {salesFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <div className="text-left">
                      <p className="font-medium text-gray-900 text-sm">{salesFile.name}</p>
                      <p className="text-xs text-gray-500">{(salesFile.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    <button
                      onClick={() => { setSalesFile(null); setResult(null); }}
                      className="ml-4 text-xs text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-4">
                    <FileSpreadsheet className="w-8 h-8 text-gray-300" />
                    <div className="text-left">
                      <p className="text-gray-500 text-sm">Sales data (220K+ rows supported)</p>
                      <p className="text-xs text-amber-600">⚠️ Large files processed in batches</p>
                    </div>
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 cursor-pointer transition-colors">
                      <Upload className="w-4 h-4" />
                      Select
                      <input type="file" accept=".xlsx,.xls" onChange={(e) => handleFileSelect(e, 'sales')} className="hidden" />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Preview Button */}
          {lineListFile && !result && (
            <div className="mt-6 text-center">
              <button
                onClick={handlePreview}
                disabled={isProcessing}
                className="px-6 py-3 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {processingStatus || 'Processing...'}
                  </>
                ) : (
                  'Preview Import'
                )}
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800">Import Error</p>
                  <p className="text-sm text-red-600 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Preview Results */}
          {result && (
            <div className="mt-6">
              {/* Stats */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5" />
                  <div>
                    <p className="font-bold text-emerald-800">
                      Ready to import {result.stats.productsCount.toLocaleString()} style/colors
                      {result.stats.salesCount > 0 && (
                        <> + {result.stats.salesCount.toLocaleString()} sales records</>
                      )}
                    </p>
                    <p className="text-sm text-emerald-600 mt-1">
                      {result.stats.lineListCount.toLocaleString()} from Line List
                      {result.stats.pricingCount > 0 && (
                        <>, {result.stats.pricingCount.toLocaleString()} pricing overrides</>
                      )}
                      {result.stats.landedCostMatches > 0 && (
                        <>, {result.stats.landedCostMatches.toLocaleString()} with Landed costs</>
                      )}
                      {result.stats.salesCount > 0 && (
                        <>, {result.stats.salesCount.toLocaleString()} sales transactions</>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Preview Table */}
              <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
                  <span className="font-bold text-gray-900">Preview</span>
                  <span className="text-sm text-gray-500 ml-2">
                    First 10 records
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-2 text-left font-bold text-gray-700">
                          Style
                        </th>
                        <th className="px-3 py-2 text-left font-bold text-gray-700">
                          Name
                        </th>
                        <th className="px-3 py-2 text-left font-bold text-gray-700">
                          Color
                        </th>
                        <th className="px-3 py-2 text-right font-bold text-gray-700">
                          MSRP
                        </th>
                        <th className="px-3 py-2 text-right font-bold text-gray-700">
                          WHSL
                        </th>
                        <th className="px-3 py-2 text-right font-bold text-gray-700">
                          Landed
                        </th>
                        <th className="px-3 py-2 text-right font-bold text-gray-700">
                          Margin
                        </th>
                        <th className="px-3 py-2 text-left font-bold text-gray-700">
                          Source
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.preview.map((item, i) => (
                        <tr
                          key={i}
                          className={`border-b border-gray-100 ${
                            i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                          }`}
                        >
                          <td className="px-3 py-2 font-mono font-bold text-gray-900">
                            {item.styleNumber}
                          </td>
                          <td className="px-3 py-2 text-gray-700 truncate max-w-[150px]">
                            {item.styleName}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {item.colorCode}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-900">
                            {formatCurrency(item.msrp)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-900">
                            {formatCurrency(item.wholesale)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-900">
                            {item.landed > 0 ? formatCurrency(item.landed) : '-'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span
                              className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                                item.margin >= 50
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : item.margin >= 40
                                  ? 'bg-amber-100 text-amber-700'
                                  : item.margin > 0
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {item.margin > 0 ? formatPercent(item.margin) : '-'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`text-xs px-2 py-0.5 rounded ${
                                item.costSource === 'landed_sheet'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {item.costSource === 'landed_sheet' ? 'Landed' : 'Line List'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
          <button
            onClick={handleConfirmImport}
            disabled={!result || result.stats.productsCount === 0}
            className="px-6 py-2 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Import {result?.stats.productsCount.toLocaleString() || 0} Products
          </button>
        </div>
      </div>
    </div>
  );
}

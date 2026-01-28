'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  Sparkles,
  Database,
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

interface SalesImportResult {
  success: boolean;
  stats: {
    totalSales: number;
    seasonBreakdown: Record<string, number>;
  };
  data: {
    sales: Record<string, unknown>[];
  };
}

interface SeasonSalesInfo {
  season: string;
  salesCount: number;
  productCount: number;
  hasLineList: boolean;
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

type ImportMode = 'sales' | 'linelist' | 'generate';

export default function SeasonImportModal({
  existingSeasons,
  onImport,
  onImportSalesOnly,
  onClose,
}: SeasonImportModalProps) {
  const [importMode, setImportMode] = useState<ImportMode>('sales');
  const [selectedSeason, setSelectedSeason] = useState('27SP');
  const [lineListFile, setLineListFile] = useState<File | null>(null);
  const [pricingFile, setPricingFile] = useState<File | null>(null);
  const [landedFile, setLandedFile] = useState<File | null>(null);
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [salesResult, setSalesResult] = useState<SalesImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seasonSalesInfo, setSeasonSalesInfo] = useState<SeasonSalesInfo[]>([]);
  const [generateSeason, setGenerateSeason] = useState<string>('');

  // Fetch available seasons with sales data
  useEffect(() => {
    if (importMode === 'generate') {
      fetch('/api/generate-linelist')
        .then(res => res.json())
        .then(data => {
          if (data.seasons) {
            setSeasonSalesInfo(data.seasons);
            // Default to first season that has sales but no line list
            const firstWithoutLineList = data.seasons.find((s: SeasonSalesInfo) => !s.hasLineList);
            if (firstWithoutLineList) {
              setGenerateSeason(firstWithoutLineList.season);
            } else if (data.seasons.length > 0) {
              setGenerateSeason(data.seasons[0].season);
            }
          }
        })
        .catch(console.error);
    }
  }, [importMode]);

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
        setSalesResult(null);
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
      setSalesResult(null);
      setError(null);
    }
  };

  const handleSalesImport = async () => {
    if (!salesFile) {
      setError('Please select a Sales file');
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Processing sales data...');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('sales', salesFile);

      const response = await fetch('/api/import-sales', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Sales import failed');
      }

      const data = await response.json();
      setSalesResult(data);
      setProcessingStatus('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process sales file');
      setProcessingStatus('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmSalesImport = () => {
    if (salesResult && salesResult.data) {
      onImportSalesOnly({
        sales: salesResult.data.sales,
      });
    }
  };

  const handleGenerateLineList = async () => {
    if (!generateSeason) {
      setError('Please select a season');
      return;
    }

    setIsProcessing(true);
    setProcessingStatus(`Generating line list for ${generateSeason}...`);
    setError(null);

    try {
      const response = await fetch('/api/generate-linelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season: generateSeason }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Generation failed');
      }

      const data = await response.json();
      setProcessingStatus('');

      // Show success message
      setError(null);
      alert(`Successfully generated ${data.stats.newProductsCreated} products for ${generateSeason} from ${data.stats.salesRecords} sales records!`);

      // Refresh the season info
      const infoResponse = await fetch('/api/generate-linelist');
      const infoData = await infoResponse.json();
      if (infoData.seasons) {
        setSeasonSalesInfo(infoData.seasons);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate line list');
      setProcessingStatus('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePreview = async () => {
    if (!lineListFile && !pricingFile && !landedFile && !salesFile) {
      setError('Please select at least one file to import');
      return;
    }

    setIsProcessing(true);
    const fileTypes = [];
    if (lineListFile) fileTypes.push('Line List');
    if (pricingFile) fileTypes.push('Pricing');
    if (landedFile) fileTypes.push('Landed Costs');
    if (salesFile) fileTypes.push('Sales');
    setProcessingStatus(`Processing ${fileTypes.join(', ')}...`);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('season', selectedSeason);

      if (lineListFile) {
        formData.append('lineList', lineListFile);
      }
      if (pricingFile) {
        formData.append('pricing', pricingFile);
      }
      if (landedFile) {
        formData.append('landed', landedFile);
      }
      if (salesFile) {
        formData.append('sales', salesFile);
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
            Import Data
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex gap-2">
            <button
              onClick={() => { setImportMode('sales'); setError(null); }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                importMode === 'sales'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              <Database className="w-4 h-4" />
              1. Import Sales
            </button>
            <button
              onClick={() => { setImportMode('generate'); setError(null); }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                importMode === 'generate'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              2. Generate Line List
            </button>
            <button
              onClick={() => { setImportMode('linelist'); setError(null); }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                importMode === 'linelist'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              3. Import Line List
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {/* SALES IMPORT MODE */}
          {importMode === 'sales' && (
            <div>
              <div className="mb-4 p-4 bg-cyan-50 border border-cyan-200 rounded-lg">
                <h3 className="font-bold text-cyan-800 mb-1">Step 1: Import Sales Data</h3>
                <p className="text-sm text-cyan-700">
                  Upload your sales file first. This file can contain sales for ALL seasons
                  (25SP, 25FA, 26SP, 26FA, 27SP, 27FA, etc.) - they will be imported together.
                </p>
              </div>

              <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-gray-900">Sales Data File</span>
                    <span className="ml-2 text-xs font-medium px-2 py-0.5 bg-red-100 text-red-700 rounded">
                      Required
                    </span>
                  </div>
                  <span className="text-sm text-gray-500">All seasons in one file</span>
                </div>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleFileDrop(e, 'sales')}
                  className={`p-6 text-center transition-colors ${
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
                        onClick={() => { setSalesFile(null); setSalesResult(null); }}
                        className="ml-4 text-xs text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-4">
                      <FileSpreadsheet className="w-10 h-10 text-gray-400" />
                      <div className="text-left">
                        <p className="text-gray-600">Drag & drop or select your sales file</p>
                        <p className="text-xs text-gray-500 mt-1">Large files (45MB+) supported</p>
                      </div>
                      <label className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 cursor-pointer transition-colors">
                        <Upload className="w-4 h-4" />
                        Select File
                        <input type="file" accept=".xlsx,.xls" onChange={(e) => handleFileSelect(e, 'sales')} className="hidden" />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Process Button */}
              {salesFile && !salesResult && (
                <div className="mt-6 text-center">
                  <button
                    onClick={handleSalesImport}
                    disabled={isProcessing}
                    className="px-6 py-3 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {processingStatus || 'Processing...'}
                      </>
                    ) : (
                      'Process Sales File'
                    )}
                  </button>
                </div>
              )}

              {/* Sales Results */}
              {salesResult && (
                <div className="mt-6">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5" />
                      <div>
                        <p className="font-bold text-emerald-800">
                          Ready to import {salesResult.stats.totalSales.toLocaleString()} sales records
                        </p>
                        <div className="mt-2 text-sm text-emerald-700">
                          <p className="font-medium mb-1">Sales by Season:</p>
                          <div className="grid grid-cols-3 gap-2">
                            {Object.entries(salesResult.stats.seasonBreakdown)
                              .sort(([a], [b]) => b.localeCompare(a))
                              .map(([season, count]) => (
                                <div key={season} className="flex justify-between bg-white px-2 py-1 rounded">
                                  <span className="font-mono">{season}</span>
                                  <span>{count.toLocaleString()}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* GENERATE LINE LIST MODE */}
          {importMode === 'generate' && (
            <div>
              <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <h3 className="font-bold text-purple-800 mb-1">Step 2: Generate Line List from Sales</h3>
                <p className="text-sm text-purple-700">
                  For historical seasons without a formal line list, create products from sales data.
                  Each unique style/color combination in sales becomes a product.
                </p>
              </div>

              {seasonSalesInfo.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No sales data found. Import sales first.</p>
                </div>
              ) : (
                <>
                  <div className="border-2 border-gray-200 rounded-xl overflow-hidden mb-6">
                    <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
                      <span className="font-bold text-gray-900">Available Seasons</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {seasonSalesInfo.map((info) => (
                        <div
                          key={info.season}
                          className={`px-4 py-3 flex items-center justify-between cursor-pointer transition-colors ${
                            generateSeason === info.season ? 'bg-purple-50' : 'hover:bg-gray-50'
                          }`}
                          onClick={() => setGenerateSeason(info.season)}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="generateSeason"
                              checked={generateSeason === info.season}
                              onChange={() => setGenerateSeason(info.season)}
                              className="w-4 h-4 text-purple-600"
                            />
                            <div>
                              <span className="font-mono font-bold text-gray-900">{info.season}</span>
                              {info.hasLineList && (
                                <span className="ml-2 text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                                  Has Line List
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right text-sm">
                            <div className="text-gray-900">{info.salesCount.toLocaleString()} sales</div>
                            <div className="text-gray-500">{info.productCount.toLocaleString()} products</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="text-center">
                    <button
                      onClick={handleGenerateLineList}
                      disabled={isProcessing || !generateSeason}
                      className="px-6 py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          {processingStatus || 'Generating...'}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5" />
                          Generate Line List for {generateSeason}
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* LINE LIST IMPORT MODE */}
          {importMode === 'linelist' && (
            <div>
              <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                <h3 className="font-bold text-emerald-800 mb-1">Step 3: Import Season Data</h3>
                <p className="text-sm text-emerald-700">
                  Import any combination of data files for a season. Select the files you want to import.
                </p>
              </div>

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
                    className="w-64 px-4 py-2 text-lg font-medium bg-white border-2 border-gray-300 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
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

              {/* File Upload Zones - All equal, pick any */}
              <div className="grid grid-cols-2 gap-4">
                {/* Line List */}
                <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-gray-100 border-b border-gray-200">
                    <span className="font-bold text-gray-900">Line List</span>
                    <p className="text-xs text-gray-500">Products & base pricing</p>
                  </div>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleFileDrop(e, 'lineList')}
                    className={`p-3 text-center transition-colors ${
                      lineListFile ? 'bg-emerald-50' : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    {lineListFile ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span className="text-sm text-gray-900 truncate flex-1">{lineListFile.name}</span>
                        <button
                          onClick={() => { setLineListFile(null); setResult(null); }}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 cursor-pointer py-2">
                        <FileSpreadsheet className="w-5 h-5 text-gray-400" />
                        <span className="text-sm text-gray-500">Select file</span>
                        <input type="file" accept=".xlsx,.xls" onChange={(e) => handleFileSelect(e, 'lineList')} className="hidden" />
                      </label>
                    )}
                  </div>
                </div>

                {/* Pricing */}
                <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-gray-100 border-b border-gray-200">
                    <span className="font-bold text-gray-900">Pricing</span>
                    <p className="text-xs text-gray-500">Price by season</p>
                  </div>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleFileDrop(e, 'pricing')}
                    className={`p-3 text-center transition-colors ${
                      pricingFile ? 'bg-emerald-50' : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    {pricingFile ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span className="text-sm text-gray-900 truncate flex-1">{pricingFile.name}</span>
                        <button
                          onClick={() => { setPricingFile(null); setResult(null); }}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 cursor-pointer py-2">
                        <FileSpreadsheet className="w-5 h-5 text-gray-400" />
                        <span className="text-sm text-gray-500">Select file</span>
                        <input type="file" accept=".xlsx,.xls" onChange={(e) => handleFileSelect(e, 'pricing')} className="hidden" />
                      </label>
                    )}
                  </div>
                </div>

                {/* Landed Costs */}
                <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-gray-100 border-b border-gray-200">
                    <span className="font-bold text-gray-900">Landed Costs</span>
                    <p className="text-xs text-gray-500">FOB, LDP, duties</p>
                  </div>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleFileDrop(e, 'landed')}
                    className={`p-3 text-center transition-colors ${
                      landedFile ? 'bg-emerald-50' : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    {landedFile ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span className="text-sm text-gray-900 truncate flex-1">{landedFile.name}</span>
                        <button
                          onClick={() => { setLandedFile(null); setResult(null); }}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 cursor-pointer py-2">
                        <FileSpreadsheet className="w-5 h-5 text-gray-400" />
                        <span className="text-sm text-gray-500">Select file</span>
                        <input type="file" accept=".xlsx,.xls" onChange={(e) => handleFileSelect(e, 'landed')} className="hidden" />
                      </label>
                    )}
                  </div>
                </div>

                {/* Sales */}
                <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-gray-100 border-b border-gray-200">
                    <span className="font-bold text-gray-900">Sales</span>
                    <p className="text-xs text-gray-500">Sales data for this season</p>
                  </div>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleFileDrop(e, 'sales')}
                    className={`p-3 text-center transition-colors ${
                      salesFile ? 'bg-emerald-50' : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    {salesFile ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span className="text-sm text-gray-900 truncate flex-1">{salesFile.name}</span>
                        <button
                          onClick={() => { setSalesFile(null); setResult(null); }}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 cursor-pointer py-2">
                        <FileSpreadsheet className="w-5 h-5 text-gray-400" />
                        <span className="text-sm text-gray-500">Select file</span>
                        <input type="file" accept=".xlsx,.xls" onChange={(e) => handleFileSelect(e, 'sales')} className="hidden" />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* Preview Button - enabled when at least one file is selected */}
              {(lineListFile || pricingFile || landedFile || salesFile) && !result && (
                <div className="mt-6 text-center">
                  <button
                    onClick={handlePreview}
                    disabled={isProcessing}
                    className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
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

              {/* Preview Results */}
              {result && (
                <div className="mt-6">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5" />
                      <div>
                        <p className="font-bold text-emerald-800">
                          Ready to import {result.stats.productsCount.toLocaleString()} style/colors
                        </p>
                        <p className="text-sm text-emerald-600 mt-1">
                          {result.stats.lineListCount.toLocaleString()} from Line List
                          {result.stats.pricingCount > 0 && (
                            <>, {result.stats.pricingCount.toLocaleString()} pricing overrides</>
                          )}
                          {result.stats.landedCostMatches > 0 && (
                            <>, {result.stats.landedCostMatches.toLocaleString()} with Landed costs</>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
                      <span className="font-bold text-gray-900">Preview</span>
                      <span className="text-sm text-gray-500 ml-2">First 10 records</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-3 py-2 text-left font-bold text-gray-700">Style</th>
                            <th className="px-3 py-2 text-left font-bold text-gray-700">Name</th>
                            <th className="px-3 py-2 text-left font-bold text-gray-700">Color</th>
                            <th className="px-3 py-2 text-right font-bold text-gray-700">MSRP</th>
                            <th className="px-3 py-2 text-right font-bold text-gray-700">WHSL</th>
                            <th className="px-3 py-2 text-right font-bold text-gray-700">Landed</th>
                            <th className="px-3 py-2 text-right font-bold text-gray-700">Margin</th>
                            <th className="px-3 py-2 text-left font-bold text-gray-700">Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.preview.map((item, i) => (
                            <tr
                              key={i}
                              className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                            >
                              <td className="px-3 py-2 font-mono font-bold text-gray-900">{item.styleNumber}</td>
                              <td className="px-3 py-2 text-gray-700 truncate max-w-[150px]">{item.styleName}</td>
                              <td className="px-3 py-2 text-gray-600">{item.colorCode}</td>
                              <td className="px-3 py-2 text-right font-mono text-gray-900">{formatCurrency(item.msrp)}</td>
                              <td className="px-3 py-2 text-right font-mono text-gray-900">{formatCurrency(item.wholesale)}</td>
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
          )}

          {/* Error */}
          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800">Error</p>
                  <p className="text-sm text-red-600 mt-1">{error}</p>
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

          {importMode === 'sales' && salesResult && (
            <button
              onClick={handleConfirmSalesImport}
              className="px-6 py-2 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 transition-colors"
            >
              Import {salesResult.stats.totalSales.toLocaleString()} Sales
            </button>
          )}

          {importMode === 'linelist' && result && (
            <button
              onClick={handleConfirmImport}
              disabled={result.stats.productsCount === 0}
              className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Import {result.stats.productsCount.toLocaleString()} Products
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

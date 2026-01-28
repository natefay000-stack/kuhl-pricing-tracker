'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  Sparkles,
  Upload,
} from 'lucide-react';

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
  onImportMultiSeason: (data: {
    pricing?: Record<string, unknown>[];
    costs?: Record<string, unknown>[];
  }) => void;
  onClose: () => void;
}

// Future seasons that require explicit line list upload
const FUTURE_SEASONS = [
  { value: '28FA', label: 'Fall 2028 (28FA)' },
  { value: '28SP', label: 'Spring 2028 (28SP)' },
  { value: '27FA', label: 'Fall 2027 (27FA)' },
  { value: '27SP', label: 'Spring 2027 (27SP)' },
];

type FileType = 'lineList' | 'pricing' | 'landed' | 'sales';
type Mode = 'import' | 'generate';

const FILE_TYPE_INFO: Record<FileType, { label: string; description: string }> = {
  sales: { label: 'Sales', description: 'All seasons auto-detected' },
  landed: { label: 'Landed Costs', description: 'All seasons auto-detected' },
  pricing: { label: 'Pricing', description: 'All seasons auto-detected' },
  lineList: { label: 'Line List', description: 'Select season (27SP+)' },
};

interface SeasonSalesInfo {
  season: string;
  salesCount: number;
  productCount: number;
  hasLineList: boolean;
}

export default function SeasonImportModal({
  existingSeasons,
  onImport,
  onImportSalesOnly,
  onImportMultiSeason,
  onClose,
}: SeasonImportModalProps) {
  const [mode, setMode] = useState<Mode>('import');
  const [selectedSeason, setSelectedSeason] = useState('27SP');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<FileType | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{
    type: FileType;
    summary: string;
    data: Record<string, unknown>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // For generate mode
  const [seasonSalesInfo, setSeasonSalesInfo] = useState<SeasonSalesInfo[]>([]);
  const [generateSeason, setGenerateSeason] = useState<string>('');
  const [loadingSeasons, setLoadingSeasons] = useState(false);

  // Load available seasons when switching to generate mode
  useEffect(() => {
    if (mode === 'generate') {
      setLoadingSeasons(true);
      fetch('/api/generate-linelist')
        .then(res => res.json())
        .then(data => {
          if (data.seasons) {
            setSeasonSalesInfo(data.seasons);
            const firstWithoutLineList = data.seasons.find((s: SeasonSalesInfo) => !s.hasLineList && s.salesCount > 0);
            if (firstWithoutLineList) {
              setGenerateSeason(firstWithoutLineList.season);
            } else if (data.seasons.length > 0) {
              setGenerateSeason(data.seasons[0].season);
            }
          }
        })
        .catch(console.error)
        .finally(() => setLoadingSeasons(false));
    }
  }, [mode]);

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
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('fileType', selectedFileType);

      if (selectedFileType === 'lineList') {
        formData.append('season', selectedSeason);
      }

      const response = await fetch('/api/import-file', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Import failed');
      }

      const data = await response.json();
      setResult({
        type: selectedFileType,
        summary: data.summary,
        data: data,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerate = async () => {
    if (!generateSeason) {
      setError('Please select a season');
      return;
    }

    setIsProcessing(true);
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

      // Show success and refresh the list
      alert(`Generated ${data.stats.newProductsCreated} products for ${generateSeason} from ${data.stats.salesRecords} sales records!`);

      // Refresh season info
      const infoResponse = await fetch('/api/generate-linelist');
      const infoData = await infoResponse.json();
      if (infoData.seasons) {
        setSeasonSalesInfo(infoData.seasons);
      }

      // Close modal and trigger data refresh
      onClose();
      window.location.reload(); // Refresh to show new products
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate products');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmImport = () => {
    if (!result) return;

    switch (result.type) {
      case 'sales':
        onImportSalesOnly({ sales: result.data.sales as Record<string, unknown>[] });
        break;
      case 'lineList':
        onImport({
          products: result.data.products as Record<string, unknown>[],
          pricing: [],
          costs: result.data.costs as Record<string, unknown>[] || [],
          sales: [],
          season: selectedSeason,
        });
        break;
      case 'pricing':
      case 'landed':
        onImportMultiSeason({
          pricing: result.type === 'pricing' ? result.data.pricing as Record<string, unknown>[] : undefined,
          costs: result.type === 'landed' ? result.data.costs as Record<string, unknown>[] : undefined,
        });
        break;
    }
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

        {/* Mode Toggle */}
        <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex gap-2">
            <button
              onClick={() => { setMode('import'); setError(null); setResult(null); }}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                mode === 'import'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              <Upload className="w-4 h-4" />
              Import File
            </button>
            <button
              onClick={() => { setMode('generate'); setError(null); setResult(null); }}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                mode === 'generate'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Generate from Sales
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* IMPORT MODE */}
          {mode === 'import' && (
            <>
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
                            <p className="text-xs text-gray-500">{info.description}</p>
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

              {/* Season Selector - Only for Line List */}
              {selectedFileType === 'lineList' && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <label className="block text-sm font-bold text-amber-800 mb-2">
                    Select Season for Line List
                  </label>
                  <div className="relative">
                    <select
                      value={selectedSeason}
                      onChange={(e) => {
                        setSelectedSeason(e.target.value);
                        setResult(null);
                      }}
                      className="w-full px-4 py-2 font-medium bg-white border-2 border-amber-300 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                    >
                      {FUTURE_SEASONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                          {existingSeasons.includes(opt.value) ? ' (has data)' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-amber-600 pointer-events-none" />
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
                      <p className="text-xs text-emerald-700 mt-0.5">{result.summary}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* GENERATE MODE */}
          {mode === 'generate' && (
            <>
              <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-sm text-purple-800">
                  Create products from existing sales data. Each unique style/color in sales becomes a product.
                </p>
              </div>

              {loadingSeasons ? (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
                  <p className="text-sm text-gray-500 mt-2">Loading seasons...</p>
                </div>
              ) : seasonSalesInfo.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No sales data found in database.</p>
                  <p className="text-sm mt-1">Import sales data first.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {seasonSalesInfo.map((info) => (
                    <div
                      key={info.season}
                      onClick={() => setGenerateSeason(info.season)}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        generateSeason === info.season
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            checked={generateSeason === info.season}
                            onChange={() => setGenerateSeason(info.season)}
                            className="w-4 h-4 text-purple-600"
                          />
                          <span className="font-mono font-bold">{info.season}</span>
                          {info.hasLineList && (
                            <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                              Has Products
                            </span>
                          )}
                        </div>
                        <div className="text-right text-sm">
                          <span className="text-gray-900">{info.salesCount.toLocaleString()} sales</span>
                          <span className="text-gray-400 mx-1">·</span>
                          <span className="text-gray-500">{info.productCount} products</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
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

          {mode === 'import' && (
            result ? (
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
            )
          )}

          {mode === 'generate' && (
            <button
              onClick={handleGenerate}
              disabled={!generateSeason || isProcessing || seasonSalesInfo.length === 0}
              className="px-6 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Products
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  Sparkles,
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

const FUTURE_SEASONS = [
  { value: '28FA', label: 'Fall 2028' },
  { value: '28SP', label: 'Spring 2028' },
  { value: '27FA', label: 'Fall 2027' },
  { value: '27SP', label: 'Spring 2027' },
];

type OptionType = 'sales' | 'landed' | 'pricing' | 'lineList' | 'generate';

interface SeasonSalesInfo {
  season: string;
  salesCount: number;
  productCount: number;
}

export default function SeasonImportModal({
  existingSeasons,
  onImport,
  onImportSalesOnly,
  onImportMultiSeason,
  onClose,
}: SeasonImportModalProps) {
  const [selectedOption, setSelectedOption] = useState<OptionType | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedSeason, setSelectedSeason] = useState('27SP');
  const [generateSeason, setGenerateSeason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ summary: string; data: Record<string, unknown> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seasonSalesInfo, setSeasonSalesInfo] = useState<SeasonSalesInfo[]>([]);

  // Load seasons with sales data on mount
  useEffect(() => {
    fetch('/api/generate-linelist')
      .then(res => res.json())
      .then(data => {
        if (data.seasons) {
          setSeasonSalesInfo(data.seasons);
          if (data.seasons.length > 0) {
            setGenerateSeason(data.seasons[0].season);
          }
        }
      })
      .catch(console.error);
  }, []);

  const handleFileSelect = (option: OptionType, file: File | null) => {
    setSelectedOption(option);
    setSelectedFile(file);
    setResult(null);
    setError(null);
  };

  const handleGenerateSelect = () => {
    setSelectedOption('generate');
    setSelectedFile(null);
    setResult(null);
    setError(null);
  };

  const handleImport = async () => {
    if (selectedOption === 'generate') {
      // Generate products from sales
      if (!generateSeason) {
        setError('Select a season');
        return;
      }
      setIsProcessing(true);
      try {
        const response = await fetch('/api/generate-linelist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ season: generateSeason }),
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Failed');
        const data = await response.json();
        alert(`Generated ${data.stats.newProductsCreated} products for ${generateSeason}`);
        onClose();
        window.location.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (!selectedFile || !selectedOption) {
      setError('Select a file');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('fileType', selectedOption);
      if (selectedOption === 'lineList') {
        formData.append('season', selectedSeason);
      }

      const response = await fetch('/api/import-file', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error((await response.json()).error || 'Failed');
      const data = await response.json();
      setResult({ summary: data.summary, data });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = () => {
    if (!result || !selectedOption) return;

    if (selectedOption === 'sales') {
      onImportSalesOnly({ sales: result.data.sales as Record<string, unknown>[] });
    } else if (selectedOption === 'lineList') {
      onImport({
        products: result.data.products as Record<string, unknown>[],
        pricing: [],
        costs: result.data.costs as Record<string, unknown>[] || [],
        sales: [],
        season: selectedSeason,
      });
    } else {
      onImportMultiSeason({
        pricing: selectedOption === 'pricing' ? result.data.pricing as Record<string, unknown>[] : undefined,
        costs: selectedOption === 'landed' ? result.data.costs as Record<string, unknown>[] : undefined,
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
          <h2 className="text-xl font-bold">Import Data</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {/* Sales */}
          <label className={`block border-2 rounded-xl p-4 cursor-pointer transition-all ${selectedOption === 'sales' ? 'border-cyan-500 bg-cyan-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFileSelect('sales', e.target.files?.[0] || null)} />
            <div className="flex items-center gap-3">
              <FileSpreadsheet className={`w-5 h-5 ${selectedOption === 'sales' ? 'text-cyan-600' : 'text-gray-400'}`} />
              <div className="flex-1">
                <p className="font-bold">Sales</p>
                {selectedOption === 'sales' && selectedFile && <p className="text-xs text-cyan-700 truncate">{selectedFile.name}</p>}
              </div>
              {selectedOption === 'sales' && <CheckCircle className="w-5 h-5 text-cyan-600" />}
            </div>
          </label>

          {/* Landed Costs */}
          <label className={`block border-2 rounded-xl p-4 cursor-pointer transition-all ${selectedOption === 'landed' ? 'border-cyan-500 bg-cyan-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFileSelect('landed', e.target.files?.[0] || null)} />
            <div className="flex items-center gap-3">
              <FileSpreadsheet className={`w-5 h-5 ${selectedOption === 'landed' ? 'text-cyan-600' : 'text-gray-400'}`} />
              <div className="flex-1">
                <p className="font-bold">Landed Costs</p>
                {selectedOption === 'landed' && selectedFile && <p className="text-xs text-cyan-700 truncate">{selectedFile.name}</p>}
              </div>
              {selectedOption === 'landed' && <CheckCircle className="w-5 h-5 text-cyan-600" />}
            </div>
          </label>

          {/* Pricing */}
          <label className={`block border-2 rounded-xl p-4 cursor-pointer transition-all ${selectedOption === 'pricing' ? 'border-cyan-500 bg-cyan-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFileSelect('pricing', e.target.files?.[0] || null)} />
            <div className="flex items-center gap-3">
              <FileSpreadsheet className={`w-5 h-5 ${selectedOption === 'pricing' ? 'text-cyan-600' : 'text-gray-400'}`} />
              <div className="flex-1">
                <p className="font-bold">Pricing</p>
                {selectedOption === 'pricing' && selectedFile && <p className="text-xs text-cyan-700 truncate">{selectedFile.name}</p>}
              </div>
              {selectedOption === 'pricing' && <CheckCircle className="w-5 h-5 text-cyan-600" />}
            </div>
          </label>

          {/* Line List */}
          <label className={`block border-2 rounded-xl p-4 cursor-pointer transition-all ${selectedOption === 'lineList' ? 'border-cyan-500 bg-cyan-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFileSelect('lineList', e.target.files?.[0] || null)} />
            <div className="flex items-center gap-3">
              <FileSpreadsheet className={`w-5 h-5 ${selectedOption === 'lineList' ? 'text-cyan-600' : 'text-gray-400'}`} />
              <div className="flex-1">
                <p className="font-bold">Line List</p>
                {selectedOption === 'lineList' && selectedFile && <p className="text-xs text-cyan-700 truncate">{selectedFile.name}</p>}
              </div>
              {selectedOption === 'lineList' && <CheckCircle className="w-5 h-5 text-cyan-600" />}
            </div>
          </label>

          {/* Line List Season Selector */}
          {selectedOption === 'lineList' && (
            <div className="ml-8 relative">
              <select
                value={selectedSeason}
                onChange={e => setSelectedSeason(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg appearance-none"
              >
                {FUTURE_SEASONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}{existingSeasons.includes(opt.value) ? ' (has data)' : ''}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          )}

          {/* Generate from Sales */}
          <div
            onClick={handleGenerateSelect}
            className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${selectedOption === 'generate' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}
          >
            <div className="flex items-center gap-3">
              <Sparkles className={`w-5 h-5 ${selectedOption === 'generate' ? 'text-purple-600' : 'text-gray-400'}`} />
              <div className="flex-1">
                <p className="font-bold">Generate Products from Sales</p>
                <p className="text-xs text-gray-500">Create products from existing sales data</p>
              </div>
              {selectedOption === 'generate' && <CheckCircle className="w-5 h-5 text-purple-600" />}
            </div>
          </div>

          {/* Generate Season Selector */}
          {selectedOption === 'generate' && seasonSalesInfo.length > 0 && (
            <div className="ml-8 relative">
              <select
                value={generateSeason}
                onChange={e => setGenerateSeason(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg appearance-none"
              >
                {seasonSalesInfo.map(s => (
                  <option key={s.season} value={s.season}>
                    {s.season} ({s.salesCount.toLocaleString()} sales, {s.productCount} products)
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <p className="text-sm text-emerald-700">{result.summary}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg">
            Cancel
          </button>
          {result ? (
            <button onClick={handleConfirm} className="px-6 py-2 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700">
              Confirm
            </button>
          ) : (
            <button
              onClick={handleImport}
              disabled={!selectedOption || isProcessing}
              className="px-6 py-2 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : 'Import'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

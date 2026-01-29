'use client';

import { useState, useCallback, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  Eye,
  EyeOff,
} from 'lucide-react';
import { FileType } from '@/lib/file-detection';

type ModalState = 'drop' | 'detecting' | 'confirm' | 'importing' | 'complete';

interface DetectionResult {
  filename: string;
  fileSize: string;
  detectedType: FileType;
  confidence: 'high' | 'medium' | 'low';
  matchedColumns: string[];
  allColumns: string[];
  recordCount: number;
  detectedSeason: string | null;
  previewRows: Record<string, unknown>[];
}

interface ImportResult {
  added: number;
  updated: number;
  summary: string;
}

interface SmartImportModalProps {
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

const AVAILABLE_SEASONS = [
  { value: '28FA', label: 'Fall 2028' },
  { value: '28SP', label: 'Spring 2028' },
  { value: '27FA', label: 'Fall 2027' },
  { value: '27SP', label: 'Spring 2027' },
  { value: '26FA', label: 'Fall 2026' },
  { value: '26SP', label: 'Spring 2026' },
];

const FILE_TYPE_LABELS: Record<FileType, string> = {
  lineList: 'Line List',
  costs: 'Landed Costs',
  sales: 'Sales Data',
  pricing: 'Pricing',
  unknown: 'Unknown',
};

export default function SmartImportModal({
  existingSeasons,
  onImport,
  onImportSalesOnly,
  onImportMultiSeason,
  onClose,
}: SmartImportModalProps) {
  const [state, setState] = useState<ModalState>('drop');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [selectedType, setSelectedType] = useState<FileType>('unknown');
  const [selectedSeason, setSelectedSeason] = useState<string>('27SP');
  const [showPreview, setShowPreview] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileSelect = async (file: File) => {
    // Validate file type
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError('Please select an Excel file (.xlsx or .xls)');
      return;
    }

    setSelectedFile(file);
    setError(null);
    setState('detecting');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/detect-file', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to analyze file');
      }

      setDetection(result);
      setSelectedType(result.detectedType);

      // Use detected season if available, otherwise default
      if (result.detectedSeason) {
        setSelectedSeason(result.detectedSeason);
      }

      setState('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze file');
      setState('drop');
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !detection) return;

    setState('importing');
    setImportProgress(10);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('fileType', selectedType);
      if (selectedType === 'lineList') {
        formData.append('season', selectedSeason);
      }

      setImportProgress(30);

      const response = await fetch('/api/import-file', {
        method: 'POST',
        body: formData,
      });

      setImportProgress(70);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Import failed');
      }

      const data = await response.json();
      setImportProgress(90);

      // Route to appropriate handler based on type
      if (selectedType === 'sales') {
        onImportSalesOnly({ sales: data.sales });
      } else if (selectedType === 'lineList') {
        onImport({
          products: data.products || [],
          pricing: [],
          costs: data.costs || [],
          sales: [],
          season: selectedSeason,
        });
      } else if (selectedType === 'costs') {
        onImportMultiSeason({ costs: data.costs });
      } else if (selectedType === 'pricing') {
        onImportMultiSeason({ pricing: data.pricing });
      }

      setImportProgress(100);
      setImportResult({
        added: data.products?.length || data.sales?.length || data.costs?.length || data.pricing?.length || 0,
        updated: 0,
        summary: data.summary || 'Import complete',
      });
      setState('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setState('confirm');
    }
  };

  const handleReset = () => {
    setState('drop');
    setSelectedFile(null);
    setDetection(null);
    setSelectedType('unknown');
    setError(null);
    setImportResult(null);
    setImportProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const needsSeason = selectedType === 'lineList';

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
          <h2 className="text-xl font-bold">
            {state === 'complete' ? 'Import Complete' : 'Import Data'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Drop Zone State */}
          {state === 'drop' && (
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                isDragging
                  ? 'border-cyan-500 bg-cyan-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-cyan-500' : 'text-gray-400'}`} />
              <p className="text-lg font-medium text-gray-700 mb-2">
                Drop your Excel file here
              </p>
              <p className="text-sm text-gray-500 mb-4">
                or click to browse
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-cyan-600 text-white font-medium rounded-lg hover:bg-cyan-700 transition-colors"
              >
                Select File
              </button>
              <p className="text-xs text-gray-400 mt-4">
                Supports Line List, Sales, Costs, and Pricing files
              </p>
            </div>
          )}

          {/* Detecting State */}
          {state === 'detecting' && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-cyan-500 animate-spin" />
              <p className="text-lg font-medium text-gray-700">
                Analyzing file...
              </p>
              <p className="text-sm text-gray-500 mt-2">
                {selectedFile?.name}
              </p>
            </div>
          )}

          {/* Confirm State */}
          {state === 'confirm' && detection && (
            <div className="space-y-4">
              {/* File Info */}
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <FileSpreadsheet className="w-8 h-8 text-cyan-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {detection.filename}
                  </p>
                  <p className="text-sm text-gray-500">
                    {detection.fileSize} &middot; {detection.recordCount.toLocaleString()} records
                  </p>
                </div>
              </div>

              {/* Detected Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  File Type
                  {detection.confidence === 'high' && (
                    <span className="ml-2 text-xs text-green-600 font-normal">
                      (auto-detected)
                    </span>
                  )}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['lineList', 'sales', 'costs', 'pricing'] as FileType[]).map(type => (
                    <label
                      key={type}
                      className={`flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                        selectedType === type
                          ? 'border-cyan-500 bg-cyan-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="fileType"
                        value={type}
                        checked={selectedType === type}
                        onChange={() => setSelectedType(type)}
                        className="sr-only"
                      />
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          selectedType === type
                            ? 'border-cyan-500'
                            : 'border-gray-300'
                        }`}
                      >
                        {selectedType === type && (
                          <div className="w-2 h-2 rounded-full bg-cyan-500" />
                        )}
                      </div>
                      <span className={selectedType === type ? 'font-medium' : ''}>
                        {FILE_TYPE_LABELS[type]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Season Selector (for Line List) */}
              {needsSeason && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Season
                    {detection.detectedSeason && detection.detectedSeason === selectedSeason && (
                      <span className="ml-2 text-xs text-green-600 font-normal">
                        (auto-detected from filename)
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <select
                      value={selectedSeason}
                      onChange={e => setSelectedSeason(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg appearance-none focus:border-cyan-500 focus:outline-none"
                    >
                      {AVAILABLE_SEASONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                          {existingSeasons.includes(opt.value) ? ' (has data)' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Matched Columns */}
              {detection.matchedColumns.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Matched Columns ({detection.matchedColumns.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {detection.matchedColumns.map((col, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded"
                      >
                        <CheckCircle className="w-3 h-3" />
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview Toggle */}
              <div>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  {showPreview ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                  {showPreview ? 'Hide Preview' : 'Show Preview'}
                </button>
                {showPreview && detection.previewRows.length > 0 && (
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full text-xs border rounded">
                      <thead className="bg-gray-100">
                        <tr>
                          {Object.keys(detection.previewRows[0]).slice(0, 6).map((key, i) => (
                            <th key={i} className="px-2 py-1 text-left font-medium truncate max-w-[100px]">
                              {key}
                            </th>
                          ))}
                          {Object.keys(detection.previewRows[0]).length > 6 && (
                            <th className="px-2 py-1 text-left font-medium text-gray-400">
                              +{Object.keys(detection.previewRows[0]).length - 6} more
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {detection.previewRows.slice(0, 3).map((row, i) => (
                          <tr key={i} className="border-t">
                            {Object.values(row).slice(0, 6).map((val, j) => (
                              <td key={j} className="px-2 py-1 truncate max-w-[100px]">
                                {String(val || '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Error Display */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Importing State */}
          {state === 'importing' && (
            <div className="text-center py-8">
              <div className="w-full bg-gray-200 rounded-full h-3 mb-4 overflow-hidden">
                <div
                  className="bg-cyan-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <p className="text-lg font-medium text-gray-700">
                Importing...
              </p>
              <p className="text-sm text-gray-500 mt-2">
                {importProgress < 50 ? 'Parsing file...' : importProgress < 80 ? 'Processing records...' : 'Saving data...'}
              </p>
            </div>
          )}

          {/* Complete State */}
          {state === 'complete' && importResult && (
            <div className="text-center py-6">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
              <p className="text-lg font-medium text-gray-900 mb-2">
                Import Successful
              </p>
              <p className="text-sm text-gray-600">
                {importResult.summary}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3 bg-gray-50">
          {state === 'drop' && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}

          {state === 'confirm' && (
            <>
              <button
                onClick={handleReset}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={selectedType === 'unknown'}
                className="px-6 py-2 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Import
              </button>
            </>
          )}

          {state === 'complete' && (
            <button
              onClick={onClose}
              className="px-6 py-2 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

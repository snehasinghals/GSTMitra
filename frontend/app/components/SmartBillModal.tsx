"use client";

import React, { useState, useRef } from "react";
import {
  Upload,
  Camera,
  FileText,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  Trash2,
  Edit2,
  Building,
  Calendar,
  Layers,
  ChevronRight,
  Eye,
  Plus,
} from "lucide-react";
import { apiFetch, API_BASE_URL } from "../lib/api";
import { INDIAN_STATES } from "../lib/states";
import { BillCameraScanner } from "./BillCameraScanner";

export interface ExtractedBillItem {
  id?: string;
  description: string;
  hsnSacCode: string;
  quantity: number;
  unit: string;
  rate: number;
  taxableValue: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessRate: number;
  cessAmount: number;
  isItcEligible: boolean;
  totalAmount: number;
}

export interface ExtractedBill {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  filename: string;
  vendor: {
    id: string | null;
    name: string;
    gstin: string | null;
    stateCode: string;
    stateName: string;
    vendorType: string;
  };
  vendorExists: boolean;
  vendorId: string | null;
  billNumber: string;
  billDate: string;
  dueDate: string | null;
  placeOfSupply: string;
  category: string;
  supplyType: "INTRA_STATE" | "INTER_STATE";
  isReverseCharge: boolean;
  isItcEligible: boolean;
  itcIneligibilityReason: string | null;
  subtotal: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalCess: number;
  totalAmount: number;
  Items: ExtractedBillItem[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  extractionMethod: string;
}

interface SmartBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBillsSaved: () => void;
  showToast: (msg: string) => void;
  initialFiles?: Array<{ name: string; type: string; data: string }>;
}

export function SmartBillModal({
  isOpen,
  onClose,
  onBillsSaved,
  showToast,
  initialFiles,
}: SmartBillModalProps) {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [extractedBills, setExtractedBills] = useState<ExtractedBill[]>([]);
  const [selectedBillIndex, setSelectedBillIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<"SUMMARY" | "DETAILS">("SUMMARY");
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Process files (PDFs, Images) to base64 and call /extract-bill
  const processFilesForExtraction = async (
    files: Array<{ name: string; type: string; data: string }>
  ) => {
    setIsExtracting(true);
    setErrorMsg("");

    try {
      const res = await apiFetch<{ success: boolean; bills: ExtractedBill[] }>("/purchases/extract-bill", {
        method: "POST",
        body: JSON.stringify({ files }),
      });

      if (res.error || !res.data) {
        throw new Error(res.error || "Failed to extract bills.");
      }

      const results = res.data.bills || [];
      if (results.length === 0) {
        throw new Error("No details could be extracted from the uploaded files.");
      }

      setExtractedBills((prev) => [...prev, ...results]);
      setSelectedBillIndex(0);
      setActiveTab(results.length === 1 ? "DETAILS" : "SUMMARY");
    } catch (err: any) {
      console.error("Extraction error:", err);
      setErrorMsg(err.message || "Failed to extract bill details. Please check file format.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesToRead = Array.from(fileList);
    const convertedFiles: Array<{ name: string; type: string; data: string }> = [];
    let completed = 0;

    filesToRead.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          convertedFiles.push({
            name: file.name,
            type: file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
            data: dataUrl,
          });
        }
        completed++;
        if (completed === filesToRead.length) {
          processFilesForExtraction(convertedFiles);
        }
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    e.target.value = "";
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const fileList = Array.from(e.dataTransfer.files);
      const convertedFiles: Array<{ name: string; type: string; data: string }> = [];
      let completed = 0;

      fileList.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          if (dataUrl) {
            convertedFiles.push({
              name: file.name,
              type: file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
              data: dataUrl,
            });
          }
          completed++;
          if (completed === fileList.length) {
            processFilesForExtraction(convertedFiles);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleCameraCapture = (captured: Array<{ name: string; type: string; data: string }>) => {
    processFilesForExtraction(captured);
  };

  // Update a field on the currently selected bill
  const updateCurrentBillField = (field: string, value: any) => {
    setExtractedBills((prev) => {
      const copy = [...prev];
      const target = { ...copy[selectedBillIndex] };

      if (field.startsWith("vendor.")) {
        const sub = field.split(".")[1];
        target.vendor = { ...target.vendor, [sub]: value };
      } else {
        (target as any)[field] = value;
      }

      copy[selectedBillIndex] = target;
      return copy;
    });
  };

  // Update item in line Items of current bill
  const updateCurrentBillItem = (itemIndex: number, field: string, value: any) => {
    setExtractedBills((prev) => {
      const copy = [...prev];
      const target = { ...copy[selectedBillIndex] };
      const newItems = [...target.Items];
      const it = { ...newItems[itemIndex], [field]: value };

      // Recalculate
      if (field === "quantity" || field === "rate" || field === "gstRate") {
        const qty = Number(it.quantity) || 1;
        const rate = Number(it.rate) || 0;
        const gstRate = Number(it.gstRate) || 0;
        const taxable = Math.round(qty * rate * 100) / 100;
        it.taxableValue = taxable;

        if (target.supplyType === "INTRA_STATE") {
          it.cgstAmount = Math.round(((taxable * (gstRate / 2)) / 100) * 100) / 100;
          it.sgstAmount = Math.round(((taxable * (gstRate / 2)) / 100) * 100) / 100;
          it.igstAmount = 0;
        } else {
          it.cgstAmount = 0;
          it.sgstAmount = 0;
          it.igstAmount = Math.round(((taxable * gstRate) / 100) * 100) / 100;
        }
        it.totalAmount = Math.round((taxable + it.cgstAmount + it.sgstAmount + it.igstAmount + (it.cessAmount || 0)) * 100) / 100;
      }

      newItems[itemIndex] = it;
      target.Items = newItems;

      // Update bill totals
      target.subtotal = Math.round(newItems.reduce((acc, i) => acc + i.taxableValue, 0) * 100) / 100;
      target.totalCgst = Math.round(newItems.reduce((acc, i) => acc + i.cgstAmount, 0) * 100) / 100;
      target.totalSgst = Math.round(newItems.reduce((acc, i) => acc + i.sgstAmount, 0) * 100) / 100;
      target.totalIgst = Math.round(newItems.reduce((acc, i) => acc + i.igstAmount, 0) * 100) / 100;
      target.totalAmount = Math.round(
        (target.subtotal + target.totalCgst + target.totalSgst + target.totalIgst + target.totalCess) * 100
      ) / 100;

      copy[selectedBillIndex] = target;
      return copy;
    });
  };

  const removeBill = (index: number) => {
    setExtractedBills((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (selectedBillIndex >= next.length) {
        setSelectedBillIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  // Save all extracted bills
  const handleSaveBills = async () => {
    if (extractedBills.length === 0) return;
    setIsSaving(true);
    setErrorMsg("");

    try {
      const res = await apiFetch<{ success: boolean; savedCount: number; errors?: any[] }>(
        "/purchases/batch-save-bills",
        {
          method: "POST",
          body: JSON.stringify({ bills: extractedBills }),
        }
      );

      if (res.error || !res.data) {
        throw new Error(res.error || "Failed to save bills.");
      }

      const count = res.data.savedCount || extractedBills.length;
      showToast(`Successfully added ${count} purchase ${count === 1 ? "bill" : "bills"} to table!`);
      onBillsSaved();
      onClose();
    } catch (err: any) {
      console.error("Batch save bills error:", err);
      setErrorMsg(err.message || "Failed to save bills to database.");
    } finally {
      setIsSaving(false);
    }
  };

  React.useEffect(() => {
    if (isOpen && initialFiles && initialFiles.length > 0) {
      processFilesForExtraction(initialFiles);
    }
  }, [isOpen, initialFiles]);

  if (!isOpen) return null;

  const currentBill = extractedBills[selectedBillIndex] || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50/50 via-white to-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100/70 text-emerald-700 rounded-xl">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Smart Bill Scanner & Auto-Import
              </h2>
              <p className="text-xs text-slate-500">
                Upload PDFs or photos of single/multiple bills, or snap photos with camera. We automatically extract vendor & line Items!
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Upload / Capture Trigger Area */}
          {extractedBills.length === 0 && !isExtracting ? (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition flex flex-col items-center justify-center ${
                dragActive
                  ? "border-emerald-500 bg-emerald-50/50"
                  : "border-slate-200 hover:border-emerald-400 bg-slate-50/50"
              }`}
            >
              <div className="w-16 h-16 rounded-2xl bg-emerald-100/60 text-emerald-600 flex items-center justify-center mb-4">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="text-base font-semibold text-slate-800 mb-1">
                Drop your purchase bills (PDF or Photos) here
              </h3>
              <p className="text-xs text-slate-500 max-w-md mb-6">
                Supports single or multiple PDF invoices, receipts, and photos (PNG, JPG, WebP).
                You don't need to manually create vendors or type line Items!
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-sm shadow-sm transition"
                >
                  <Upload className="w-4 h-4" />
                  Choose Files (Single or Many)
                </button>
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl text-sm shadow-sm transition"
                >
                  <Camera className="w-4 h-4 text-emerald-400" />
                  Scan with Camera / Take Photo
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                multiple
                className="hidden"
                onChange={handleFileInputChange}
              />
            </div>
          ) : isExtracting ? (
            /* Loading State */
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mb-4" />
              <h3 className="text-base font-semibold text-slate-800 mb-1">
                Extracting Details from Bill(s)...
              </h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Scanning invoice layout, detecting vendor legal name, GSTIN, invoice date, amounts, and GST line Items.
              </p>
            </div>
          ) : (
            /* Extracted Bills Review */
            <div className="space-y-5">
              {/* Top toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">
                    {extractedBills.length} {extractedBills.length === 1 ? "Bill Extracted" : "Bills Extracted"}
                  </span>
                  <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 text-xs">
                    <button
                      type="button"
                      onClick={() => setActiveTab("SUMMARY")}
                      className={`px-3 py-1 rounded font-medium transition ${
                        activeTab === "SUMMARY"
                          ? "bg-emerald-600 text-white"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Batch List ({extractedBills.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("DETAILS")}
                      className={`px-3 py-1 rounded font-medium transition ${
                        activeTab === "DETAILS"
                          ? "bg-emerald-600 text-white"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Review #{selectedBillIndex + 1}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add More Files
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCameraOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition shadow-sm"
                  >
                    <Camera className="w-3.5 h-3.5 text-emerald-600" />
                    Snap Another
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileInputChange}
                />
              </div>

              {/* BATCH SUMMARY TAB */}
              {activeTab === "SUMMARY" && (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100/70 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider">
                        <tr>
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">File / Bill</th>
                          <th className="py-2.5 px-3">Vendor</th>
                          <th className="py-2.5 px-3">GSTIN</th>
                          <th className="py-2.5 px-3">Bill Date</th>
                          <th className="py-2.5 px-3 text-right">Items</th>
                          <th className="py-2.5 px-3 text-right">Total (₹)</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {extractedBills.map((b, idx) => (
                          <tr
                            key={b.id || idx}
                            className={`hover:bg-slate-50/80 transition cursor-pointer ${
                              selectedBillIndex === idx ? "bg-emerald-50/40" : ""
                            }`}
                            onClick={() => {
                              setSelectedBillIndex(idx);
                              setActiveTab("DETAILS");
                            }}
                          >
                            <td className="py-2.5 px-3 font-medium text-slate-500">{idx + 1}</td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-800">{b.billNumber}</div>
                              <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                                {b.fileName}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-medium text-slate-800">{b.vendor.name}</div>
                              {b.vendorExists ? (
                                <span className="inline-block text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 font-medium">
                                  Existing Vendor
                                </span>
                              ) : (
                                <span className="inline-block text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200 font-medium">
                                  New Vendor (Auto-Add)
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                              {b.vendor.gstin || "Unregistered"}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">{b.billDate}</td>
                            <td className="py-2.5 px-3 text-right text-slate-700">
                              {b.Items.length}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                              ₹{b.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Ready
                              </span>
                            </td>
                            <td
                              className="py-2.5 px-3 text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedBillIndex(idx);
                                    setActiveTab("DETAILS");
                                  }}
                                  className="p-1 text-slate-400 hover:text-emerald-600 rounded transition"
                                  title="Inspect & Edit Details"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeBill(idx)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                                  title="Remove from batch"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                    <span>
                      Total Sum:{" "}
                      <strong className="text-slate-900 font-bold">
                        ₹
                        {extractedBills
                          .reduce((sum, b) => sum + b.totalAmount, 0)
                          .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </strong>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Click any row to inspect line Items or edit details before saving
                    </span>
                  </div>
                </div>
              )}

              {/* SINGLE BILL DETAILS TAB */}
              {activeTab === "DETAILS" && currentBill && (
                <div className="space-y-4">
                  {/* Selector pagination if multiple bills */}
                  {extractedBills.length > 1 && (
                    <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-slate-700 mr-2">Viewing Bill:</span>
                        {extractedBills.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSelectedBillIndex(i)}
                            className={`w-6 h-6 rounded-lg text-xs font-semibold transition ${
                              selectedBillIndex === i
                                ? "bg-emerald-600 text-white"
                                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                      <div className="text-slate-500 font-medium">
                        Bill #{selectedBillIndex + 1} of {extractedBills.length}
                      </div>
                    </div>
                  )}

                  {/* Top Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Vendor Box */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Building className="w-3.5 h-3.5 text-emerald-600" />
                          Vendor Details
                        </span>
                        {currentBill.vendorExists ? (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                            Matched Vendor
                          </span>
                        ) : (
                          <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-semibold">
                            Will Auto-Create
                          </span>
                        )}
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-slate-500 block mb-1">
                          Vendor Name
                        </label>
                        <input
                          type="text"
                          value={currentBill.vendor.name}
                          onChange={(e) => updateCurrentBillField("vendor.name", e.target.value)}
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-slate-500 block mb-1">
                          Vendor GSTIN
                        </label>
                        <input
                          type="text"
                          value={currentBill.vendor.gstin || ""}
                          placeholder="Unregistered"
                          onChange={(e) => updateCurrentBillField("vendor.gstin", e.target.value.toUpperCase())}
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                        />
                      </div>
                    </div>

                    {/* Invoice Meta Box */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-emerald-600" />
                        Invoice Metadata
                      </span>

                      <div>
                        <label className="text-[11px] font-medium text-slate-500 block mb-1">
                          Bill / Invoice #
                        </label>
                        <input
                          type="text"
                          value={currentBill.billNumber}
                          onChange={(e) => updateCurrentBillField("billNumber", e.target.value)}
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-medium text-slate-500 block mb-1">
                            Bill Date
                          </label>
                          <input
                            type="date"
                            value={currentBill.billDate}
                            onChange={(e) => updateCurrentBillField("billDate", e.target.value)}
                            className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-slate-500 block mb-1">
                            Due Date
                          </label>
                          <input
                            type="date"
                            value={currentBill.dueDate || ""}
                            onChange={(e) => updateCurrentBillField("dueDate", e.target.value || null)}
                            className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Tax & File Attachment Box */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-2">
                          <Layers className="w-3.5 h-3.5 text-emerald-600" />
                          File & Taxes
                        </span>
                        <div className="text-[11px] text-slate-600 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Supply Type:</span>
                            <span className="font-semibold">{currentBill.supplyType}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">ITC Status:</span>
                            <span
                              className={`font-semibold ${
                                currentBill.isItcEligible ? "text-emerald-700" : "text-amber-600"
                              }`}
                            >
                              {currentBill.isItcEligible ? "Eligible" : "Ineligible"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Method:</span>
                            <span className="font-mono text-[10px] text-slate-600">
                              {currentBill.extractionMethod}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                        <span className="text-xs text-slate-500 truncate max-w-[130px]" title={currentBill.fileName}>
                          {currentBill.fileName}
                        </span>
                        <a
                          href={`${API_BASE_URL}${currentBill.fileUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-semibold"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View File
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-100/70 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span>Line Items & HSN ({currentBill.Items.length})</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3">Item Description</th>
                            <th className="py-2 px-3 w-24">HSN/SAC</th>
                            <th className="py-2 px-3 w-16 text-right">Qty</th>
                            <th className="py-2 px-3 w-24 text-right">Rate (₹)</th>
                            <th className="py-2 px-3 w-20 text-right">GST %</th>
                            <th className="py-2 px-3 w-24 text-right">Taxable</th>
                            <th className="py-2 px-3 w-28 text-right">Total (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {currentBill.Items.map((it, itemIdx) => (
                            <tr key={itemIdx} className="hover:bg-slate-50/50">
                              <td className="py-2 px-3">
                                <input
                                  type="text"
                                  value={it.description}
                                  onChange={(e) =>
                                    updateCurrentBillItem(itemIdx, "description", e.target.value)
                                  }
                                  className="w-full text-xs px-2 py-1 rounded border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <input
                                  type="text"
                                  value={it.hsnSacCode}
                                  onChange={(e) =>
                                    updateCurrentBillItem(itemIdx, "hsnSacCode", e.target.value)
                                  }
                                  className="w-full text-xs px-2 py-1 rounded border border-slate-200 bg-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <input
                                  type="number"
                                  step="any"
                                  value={it.quantity}
                                  onChange={(e) =>
                                    updateCurrentBillItem(itemIdx, "quantity", e.target.value)
                                  }
                                  className="w-full text-xs px-2 py-1 rounded border border-slate-200 bg-white text-right focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <input
                                  type="number"
                                  step="any"
                                  value={it.rate}
                                  onChange={(e) =>
                                    updateCurrentBillItem(itemIdx, "rate", e.target.value)
                                  }
                                  className="w-full text-xs px-2 py-1 rounded border border-slate-200 bg-white text-right font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <select
                                  value={it.gstRate}
                                  onChange={(e) =>
                                    updateCurrentBillItem(itemIdx, "gstRate", Number(e.target.value))
                                  }
                                  className="w-full text-xs px-1.5 py-1 rounded border border-slate-200 bg-white text-right focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                >
                                  <option value={0}>0%</option>
                                  <option value={5}>5%</option>
                                  <option value={12}>12%</option>
                                  <option value={18}>18%</option>
                                  <option value={28}>28%</option>
                                </select>
                              </td>
                              <td className="py-2 px-3 text-right font-medium text-slate-700">
                                ₹{it.taxableValue.toFixed(2)}
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-slate-900">
                                ₹{it.totalAmount.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Summary row */}
                    <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs gap-3">
                      <div className="flex items-center gap-4 text-slate-600">
                        <span>
                          Taxable: <strong>₹{currentBill.subtotal.toFixed(2)}</strong>
                        </span>
                        {currentBill.totalCgst > 0 && (
                          <span>
                            CGST: <strong>₹{currentBill.totalCgst.toFixed(2)}</strong>
                          </span>
                        )}
                        {currentBill.totalSgst > 0 && (
                          <span>
                            SGST: <strong>₹{currentBill.totalSgst.toFixed(2)}</strong>
                          </span>
                        )}
                        {currentBill.totalIgst > 0 && (
                          <span>
                            IGST: <strong>₹{currentBill.totalIgst.toFixed(2)}</strong>
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-bold text-slate-900">
                        Total Amount: ₹
                        {currentBill.totalAmount.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-200/60 font-medium transition"
          >
            Cancel
          </button>

          {extractedBills.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 hidden sm:inline">
                {extractedBills.length} {extractedBills.length === 1 ? "bill ready" : "bills ready"} to add
              </span>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveBills}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm shadow-md shadow-emerald-700/20 transition"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Adding to Purchases...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Save & Add {extractedBills.length > 1 ? `(${extractedBills.length} Bills)` : "Bill"} to Table
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Camera Scanner Sub-Modal */}
      <BillCameraScanner
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCameraCapture}
      />
    </div>
  );
}

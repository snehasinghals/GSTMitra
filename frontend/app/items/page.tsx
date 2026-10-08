"use client";

import React, { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";
import { Tooltip } from "../components/Tooltip";
import { Plus, Search, Edit2, Trash2, X, Check, HelpCircle, Package } from "lucide-react";

interface Item {
  id: string;
  name: string;
  description?: string;
  type: string;
  hsnSacCode: string;
  unit: string;
  sellingPrice: number;
  purchasePrice: number;
  isTaxInclusive: boolean;
  gstRate: number;
  cessRate: number;
}

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [toast, setToast] = useState("");
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("GOODS");
  const [hsnSacCode, setHsnSacCode] = useState("998313");
  const [unit, setUnit] = useState("PCS");
  const [sellingPrice, setSellingPrice] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [isTaxInclusive, setIsTaxInclusive] = useState(false);
  const [gstRate, setGstRate] = useState(18);
  const [cessRate, setCessRate] = useState(0);

  // HSN Autocomplete
  const [hsnSuggestions, setHsnSuggestions] = useState<any[]>([]);
  const [showHsnDropdown, setShowHsnDropdown] = useState(false);

  const loadItems = async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await apiFetch<Item[]>("/items");
    if (data) setItems(data);
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    loadItems();
  }, []);

  const searchHsn = async (query: string) => {
    const { data } = await apiFetch<any[]>(`/items/hsn-search?q=${encodeURIComponent(query)}`);
    if (data) setHsnSuggestions(data);
  };

  const handleOpenAddModal = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setType("GOODS");
    setHsnSacCode("998313");
    setUnit("PCS");
    setSellingPrice("");
    setPurchasePrice("");
    setIsTaxInclusive(false);
    setGstRate(18);
    setCessRate(0);
    setShowModal(true);
    searchHsn("");
  };

  const handleOpenEditModal = (item: Item) => {
    setEditingId(item.id);
    setName(item.name);
    setDescription(item.description || "");
    setType(item.type);
    setHsnSacCode(item.hsnSacCode);
    setUnit(item.unit);
    setSellingPrice(item.sellingPrice.toString());
    setPurchasePrice(item.purchasePrice.toString());
    setIsTaxInclusive(item.isTaxInclusive);
    setGstRate(item.gstRate);
    setCessRate(item.cessRate);
    setShowModal(true);
    searchHsn("");
  };

  const handleSelectHsn = (hsnObj: any) => {
    setHsnSacCode(hsnObj.code);
    setGstRate(hsnObj.rate);
    if (!name) setName(hsnObj.description);
    setShowHsnDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    setErrorMsg("");

    const payload = {
      name,
      description,
      type,
      hsnSacCode,
      unit,
      sellingPrice: parseFloat(sellingPrice),
      purchasePrice: parseFloat(purchasePrice || "0"),
      isTaxInclusive,
      gstRate: parseFloat(gstRate.toString()),
      cessRate: parseFloat(cessRate.toString()),
    };

    try {
      const { data, error } = editingId
        ? await apiFetch<any>(`/items/${editingId}`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiFetch<any>("/items", { method: "POST", body: JSON.stringify(payload) });

      if (error) {
        setErrorMsg(error);
        loadItems(true); // in case it was saved but the response timed out
        return;
      }

      const created: any = (data as any)?.item ?? data;
      if (created?.id) {
        setItems((prev) =>
          editingId ? prev.map((i) => (i.id === editingId ? created : i)) : [created, ...prev]
        );
      }

      setShowModal(false);
      showToast(editingId ? "Item updated successfully" : "Item added successfully");
      loadItems(true);
    } catch (err) {
      setErrorMsg("Something went wrong. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    showToast("Item deleted");
    await apiFetch(`/items/${id}`, { method: "DELETE" });
    loadItems(true);
  };

  const filteredItems = items.filter(
    (item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.hsnSacCode.includes(searchQuery)
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            Items & Services Catalog
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your goods and services. GST rates auto-fill based on HSN/SAC code selection.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Item / Service</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs max-w-md">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by item name or HSN code..."
          className="w-full text-xs focus:outline-none bg-transparent"
        />
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading items...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Package className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">No items found</p>
            <p className="text-xs text-slate-500">Click "Add New Item" to add your first product or service.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-3xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Item Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">
                    <Tooltip
                      term="HSN/SAC Code"
                      text="HSN code (for Goods) and SAC code (for Services) are standard codes required by GST portal to classify items."
                      example="998313 for IT services, 847130 for laptops."
                    />
                  </th>
                  <th className="py-3 px-4">Selling Price</th>
                  <th className="py-3 px-4">GST Rate</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {item.name}
                      {item.description && (
                        <p className="text-3xs text-slate-400 font-normal">{item.description}</p>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-3xs font-bold px-2 py-0.5 rounded-full ${item.type === "GOODS" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
                        {item.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium">{item.hsnSacCode}</td>
                    <td className="py-3 px-4 font-semibold">
                      ₹{item.sellingPrice.toFixed(2)} <span className="text-3xs text-slate-400 font-normal">/ {item.unit}</span>
                      {item.isTaxInclusive && (
                        <span className="ml-1.5 text-3xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">Incl. Tax</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold text-blue-700">{item.gstRate}%</td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleOpenEditModal(item)}
                        className="text-slate-600 hover:text-blue-600 p-1 rounded-md hover:bg-slate-100"
                        title="Edit Item"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-slate-600 hover:text-red-600 p-1 rounded-md hover:bg-slate-100"
                        title="Delete Item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-900">
                {editingId ? "Edit Item / Service" : "Add New Item / Service"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {/* Type Select */}
              <div className="flex gap-4">
                <label className={`flex-1 p-2.5 rounded-xl border cursor-pointer text-center font-bold ${type === "GOODS" ? "border-blue-600 bg-blue-50 text-blue-900" : "border-slate-200"}`}>
                  <input type="radio" name="itemType" value="GOODS" checked={type === "GOODS"} onChange={() => setType("GOODS")} className="mr-1.5" />
                  Goods (Physical Product)
                </label>
                <label className={`flex-1 p-2.5 rounded-xl border cursor-pointer text-center font-bold ${type === "SERVICE" ? "border-purple-600 bg-purple-50 text-purple-900" : "border-slate-200"}`}>
                  <input type="radio" name="itemType" value="SERVICE" checked={type === "SERVICE"} onChange={() => setType("SERVICE")} className="mr-1.5" />
                  Service (Consulting/IT)
                </label>
              </div>

              {/* HSN Code Autocomplete */}
              <div className="relative">
                <label className="block font-semibold text-slate-700 mb-1">
                  HSN / SAC Code & GST Rate Search <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={hsnSacCode}
                    onChange={(e) => {
                      setHsnSacCode(e.target.value);
                      searchHsn(e.target.value);
                      setShowHsnDropdown(true);
                    }}
                    onFocus={() => setShowHsnDropdown(true)}
                    placeholder="Search HSN code or item name..."
                    required
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <select
                    value={gstRate}
                    onChange={(e) => setGstRate(parseFloat(e.target.value))}
                    className="px-3 py-2 border border-slate-300 rounded-xl font-bold text-blue-700 bg-white"
                  >
                    {[0, 5, 12, 18, 28].map((rate) => (
                      <option key={rate} value={rate}>
                        {rate}% GST
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dropdown Suggestions */}
                {showHsnDropdown && hsnSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50 divide-y divide-slate-100">
                    {hsnSuggestions.map((hsn) => (
                      <button
                        key={hsn.code}
                        type="button"
                        onClick={() => handleSelectHsn(hsn)}
                        className="w-full text-left p-2.5 hover:bg-blue-50 transition-colors flex items-center justify-between"
                      >
                        <div>
                          <span className="font-mono font-bold text-blue-700">{hsn.code}</span>
                          <p className="text-3xs text-slate-600">{hsn.description}</p>
                        </div>
                        <span className="font-bold text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-800">
                          {hsn.rate}% GST
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Item Name */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Item Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dell Wireless Mouse or IT Software Consulting"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Price & Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Selling Price (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unit (UQC)</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  >
                    {["PCS", "KGS", "NOS", "SAC", "BOX", "MTR", "HRS", "SET"].map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tax Inclusive Checkbox */}
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={isTaxInclusive}
                  onChange={(e) => setIsTaxInclusive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-xs text-slate-700">
                  Price is <strong>Tax Inclusive</strong> (GST is included in selling price)
                </span>
              </label>
              
              {errorMsg && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                  {errorMsg}
                </p>
              )}
              <div className="pt-3 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSaving ? "Saving..." : "Save Item"}
              </button>
              </div>
            </form>
          </div>
        </div>
        
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] bg-emerald-600 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-lg animate-fadeIn">
          ✓ {toast}
        </div>
      )}
    </div>
  );
}

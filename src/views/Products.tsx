/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  ArrowRightLeft, 
  Package, 
  Image as ImageIcon,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  FileText,
  Download,
  Filter,
  X,
  Check,
  AlertTriangle,
  Tag,
  History,
  Calculator,
  ArrowUpNarrowWide,
  ArrowDownWideNarrow
} from 'lucide-react';
import { NumberInput } from '../components/NumberInput';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Product } from '../types';
import { pinyin } from 'pinyin-pro';
import { compressImage } from '../lib/imageUtils';
import { storage, BUCKET_ID, getImageUrl } from '../appwrite';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

interface ProductsProps {
  userRole: 'admin' | 'operator';
}

export default function Products({ userRole }: ProductsProps) {
  const products = useLiveQuery(() => db.products.where('isDeleted').notEqual(1).toArray()) || [];
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('全部');
  const [filterPricingMethod, setFilterPricingMethod] = useState<'all' | 'piece' | 'weight'>('all');
  const [sortBy, setSortBy] = useState<'stock' | 'name' | 'code'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [stockAction, setStockAction] = useState<'in' | 'out'>('in');

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category));
    return ['全部', ...Array.from(cats)];
  }, [products]);

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // 1. Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(term) || 
        p.code.toLowerCase().includes(term) ||
        p.pinyin.toLowerCase().includes(term)
      );
    }

    // 2. Category filter
    if (filterCategory !== '全部') {
      result = result.filter(p => p.category === filterCategory);
    }

    // 3. Pricing method filter
    if (filterPricingMethod !== 'all') {
      result = result.filter(p => p.pricingMethod === filterPricingMethod);
    }

    // 4. Sorting
    result.sort((a, b) => {
      // If there's a search term, prioritize by search frequency
      if (searchTerm) {
        const aFreq = a.searchCount || 0;
        const bFreq = b.searchCount || 0;
        if (aFreq !== bFreq) return bFreq - aFreq;
      }

      let comparison = 0;
      if (sortBy === 'stock') {
        comparison = a.stock - b.stock;
      } else if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name, 'zh-CN');
      } else if (sortBy === 'code') {
        comparison = a.code.localeCompare(b.code);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [products, searchTerm, filterCategory, filterPricingMethod, sortBy, sortOrder]);

  const incrementSearchCount = async (product: Product) => {
    await db.products.update(product.id!, {
      searchCount: (product.searchCount || 0) + 1
    });
  };

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(products.map(p => ({
      '编号': p.code,
      '名称': p.name,
      '分类': p.category,
      '进货价': p.purchasePrice,
      '批发价': p.wholesalePrice,
      '价格一': p.price2,
      '自定义价': p.price3,
      '零售价': p.retailPrice,
      '单位': p.unit,
      '当前库存': p.stock,
      '库存预警值': p.minStock
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "商品列表");
    XLSX.writeFile(wb, `商品列表_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const handleDelete = async (id: number) => {
    if (confirm('确定要删除该商品吗？')) {
      await db.products.update(id, { isDeleted: true });
      await db.logs.add({
        user: '管理员',
        action: '删除商品',
        details: `删除了商品 ID: ${id}`,
        createdAt: new Date().toISOString()
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Bar & Filters */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={22} />
            <input 
              type="text" 
              placeholder="搜索名称、编号或拼音首字母..." 
              value={searchTerm === '0' ? '' : searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-lg"
            />
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200 transition-all"
            >
              <Download size={18} />
              <span>导出表格</span>
            </button>
            <button 
              onClick={() => { setSelectedProduct(null); setIsAddModalOpen(true); }}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all font-medium"
            >
              <Plus size={18} />
              <span>新增商品</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 pt-4 border-t border-slate-50">
          {/* Category Filter */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">分类筛选</span>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                    filterCategory === cat 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' 
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Pricing Method Filter */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">计价方式</span>
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
              {[
                { label: '全部', value: 'all' },
                { label: '按件卖', value: 'piece' },
                { label: '按斤卖', value: 'weight' }
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilterPricingMethod(opt.value as any)}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                    filterPricingMethod === opt.value 
                      ? 'bg-white text-indigo-600 shadow-sm' 
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sorting */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">排序方式</span>
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <select 
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-[10px] font-bold text-slate-600 focus:outline-none px-2 py-1"
              >
                <option value="name">按商品名称</option>
                <option value="stock">按库存数量</option>
                <option value="code">按商品编号</option>
              </select>
              <button 
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="p-1 bg-white rounded-md text-indigo-600 shadow-sm hover:bg-indigo-50 transition-all"
              >
                {sortOrder === 'asc' ? <ArrowUpNarrowWide size={14} /> : <ArrowDownWideNarrow size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProducts.map((product) => (
          <motion.div 
            layout
            key={product.id}
            className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-all group"
          >
            <div 
              className="aspect-video bg-slate-100 relative overflow-hidden cursor-pointer"
              onClick={() => { 
                setSelectedProduct(product); 
                setIsDetailsModalOpen(true); 
                incrementSearchCount(product);
              }}
            >
              {product.image ? (
                <img src={getImageUrl(product.image)} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300">
                  <Package size={48} strokeWidth={1} />
                </div>
              )}
              {product.stock <= product.minStock && (
                <motion.div 
                  initial={{ scale: 0.9 }}
                  animate={{ scale: [0.9, 1.05, 0.9] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute top-3 right-3 bg-rose-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-lg z-10"
                >
                  <AlertTriangle size={12} /> 库存预警
                </motion.div>
              )}
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-2">
                <button 
                  onClick={() => { setSelectedProduct(product); setIsAddModalOpen(true); }}
                  className="p-2 bg-white/20 backdrop-blur-md text-white rounded-lg hover:bg-white/40 transition-colors"
                >
                  <Edit size={16} />
                </button>
                <button 
                  onClick={() => handleDelete(product.id!)}
                  className="p-2 bg-rose-500/80 backdrop-blur-md text-white rounded-lg hover:bg-rose-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div 
                className="flex justify-between items-start cursor-pointer"
                onClick={() => { 
                  setSelectedProduct(product); 
                  setIsDetailsModalOpen(true); 
                  incrementSearchCount(product);
                }}
              >
                <div>
                  <h4 className="font-bold text-slate-800 truncate max-w-[150px]">{product.name}</h4>
                  <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">{product.code}</p>
                </div>
                <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase">
                  {product.category}
                </span>
                <span className={`px-2 py-1 ${product.pricingMethod === 'weight' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'} text-[10px] font-bold rounded uppercase`}>
                  {product.pricingMethod === 'weight' ? '按斤' : '按件'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400 font-medium uppercase">进货价</p>
                  <p className="text-sm font-bold text-slate-500">¥{(product.purchasePrice || 0).toFixed(1)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400 font-medium uppercase">批发价</p>
                  <p className="text-sm font-bold text-indigo-600">¥{(product.wholesalePrice || 0).toFixed(1)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400 font-medium uppercase">零售价</p>
                  <p className="text-sm font-bold text-rose-500">¥{(product.retailPrice || 0).toFixed(1)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400 font-medium uppercase">价格一</p>
                  <p className="text-sm font-bold text-slate-600">¥{(product.price2 || 0).toFixed(1)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400 font-medium uppercase">自定义价</p>
                  <p className="text-sm font-bold text-slate-600">¥{(product.price3 || 0).toFixed(1)}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${product.stock > product.minStock ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <span className="text-sm font-bold text-slate-600">
                    {product.pricingMethod === 'weight' ? product.stock.toFixed(1) : Math.floor(product.stock)} {product.unit}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => { setSelectedProduct(product); setIsHistoryModalOpen(true); }}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    title="库存记录"
                  >
                    <History size={16} />
                  </button>
                  <button 
                    onClick={() => { setSelectedProduct(product); setIsPriceModalOpen(true); }}
                    className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-all"
                  >
                    <Tag size={14} />
                    <span>编辑价格</span>
                  </button>
                  <button 
                    onClick={() => { setSelectedProduct(product); setStockAction('in'); setIsStockModalOpen(true); }}
                    className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-all"
                  >
                    <ArrowRightLeft size={14} />
                    <span>库存调整</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}

        {filteredProducts.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-300">
            <Search size={64} className="mb-4 opacity-20" />
            <p className="text-lg font-medium">未找到匹配的商品</p>
            <p className="text-sm">尝试更换搜索关键词或新增商品</p>
          </div>
        )}
      </div>

      {/* Details Modal */}
      <AnimatePresence>
        {isDetailsModalOpen && selectedProduct && (
          <ProductDetailsModal 
            product={selectedProduct} 
            onClose={() => setIsDetailsModalOpen(false)} 
          />
        )}
      </AnimatePresence>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <ProductFormModal 
            product={selectedProduct} 
            onClose={() => setIsAddModalOpen(false)} 
          />
        )}
      </AnimatePresence>

      {/* Stock Adjustment Modal */}
      <AnimatePresence>
        {isStockModalOpen && selectedProduct && (
          <StockAdjustmentModal 
            product={selectedProduct} 
            onClose={() => setIsStockModalOpen(false)} 
          />
        )}
      </AnimatePresence>

      {/* Price Edit Modal */}
      <AnimatePresence>
        {isPriceModalOpen && selectedProduct && (
          <PriceEditModal 
            product={selectedProduct} 
            onClose={() => setIsPriceModalOpen(false)} 
          />
        )}
      </AnimatePresence>

      {/* Stock Movement History Modal */}
      <AnimatePresence>
        {isHistoryModalOpen && selectedProduct && (
          <StockMovementHistoryModal 
            product={selectedProduct} 
            onClose={() => setIsHistoryModalOpen(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-components ---

function ProductDetailsModal({ product, onClose }: { product: Product, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col md:flex-row"
      >
        <div className="md:w-1/2 aspect-square bg-slate-100 flex items-center justify-center relative">
          {product.image ? (
            <img src={getImageUrl(product.image)} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <Package size={80} className="text-slate-300" strokeWidth={1} />
          )}
          <button 
            onClick={onClose}
            className="absolute top-4 left-4 p-2 bg-white/20 backdrop-blur-md text-white rounded-full hover:bg-white/40 transition-colors md:hidden"
          >
            <X size={20} />
          </button>
        </div>
        <div className="md:w-1/2 p-8 flex flex-col">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-2xl font-bold text-slate-800">{product.name}</h3>
              <p className="text-sm text-slate-400 font-mono uppercase tracking-widest">{product.code}</p>
            </div>
            <button onClick={onClose} className="hidden md:block p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-6 flex-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">当前库存</p>
                <p className="text-lg font-bold text-slate-800">
                  {product.pricingMethod === 'weight' ? product.stock.toFixed(1) : Math.floor(product.stock)} {product.unit}
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">计价方式</p>
                <p className="text-lg font-bold text-slate-800">
                  {product.pricingMethod === 'weight' ? '按斤卖' : '按件卖'}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">价格详情</p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                  <span className="text-sm text-slate-500">进货价</span>
                  <span className="text-sm font-bold text-slate-700">¥{(product.purchasePrice || 0).toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                  <span className="text-sm text-slate-500">批发价</span>
                  <span className="text-sm font-bold text-indigo-600">¥{(product.wholesalePrice || 0).toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                  <span className="text-sm text-slate-500">零售价</span>
                  <span className="text-sm font-bold text-rose-500">¥{(product.retailPrice || 0).toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                  <span className="text-sm text-slate-500">价格一</span>
                  <span className="text-sm font-bold text-slate-700">¥{(product.price2 || 0).toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                  <span className="text-sm text-slate-500">自定义价</span>
                  <span className="text-sm font-bold text-slate-700">¥{(product.price3 || 0).toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
            >
              关闭
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ProductFormModal({ product, onClose }: { product: Product | null, onClose: () => void }) {
  const [formData, setFormData] = useState<Partial<Product>>(product || {
    code: '',
    name: '',
    category: '冻品',
    purchasePrice: 0,
    wholesalePrice: 0,
    price2: 0,
    price3: 0,
    retailPrice: 0,
    weight: 0,
    unit: '件',
    pricingMethod: 'piece',
    stock: 0,
    minStock: 5,
    history: []
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const compressed = await compressImage(reader.result as string);
          setFormData({ ...formData, image: compressed });
        } catch (err) {
          console.error('Image compression failed:', err);
          setFormData({ ...formData, image: reader.result as string });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const py = pinyin(formData.name!, { pattern: 'initial', toneType: 'none' }).replace(/\s/g, '');
    const data = { ...formData, pinyin: py } as Product;
    
    if (product?.id) {
      await db.products.put({ ...data, id: product.id });
    } else {
      const id = await db.products.add(data);
      if (data.stock > 0) {
        await db.stockMovements.add({
          productId: id as number,
          productName: data.name,
          type: '入库',
          quantity: data.stock,
          previousStock: 0,
          currentStock: data.stock,
          reason: '初始库存',
          operator: '管理员',
          createdAt: new Date().toISOString()
        });
      }
    }
    
    await db.logs.add({
      user: '管理员',
      action: product ? '编辑商品' : '新增商品',
      details: `${product ? '编辑' : '新增'}了商品: ${data.name}`,
      createdAt: new Date().toISOString()
    });
    
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
      >
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="text-xl font-bold text-slate-800">{product ? '编辑商品' : '新增商品'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">商品图片</label>
              <div className="flex items-center gap-6">
                <div className="w-32 h-32 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group">
                  {formData.image ? (
                    <>
                      <img src={getImageUrl(formData.image)} alt="Preview" className="w-full h-full object-cover" />
                      <button 
                        type="button"
                        onClick={() => setFormData({ ...formData, image: undefined })}
                        className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        <Trash2 size={24} />
                      </button>
                    </>
                  ) : (
                    <ImageIcon className="text-slate-300" size={40} strokeWidth={1} />
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden" 
                    id="product-image-upload"
                  />
                  <label 
                    htmlFor="product-image-upload"
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 cursor-pointer transition-all shadow-sm"
                  >
                    <ImageIcon size={18} />
                    <span>选择商品图片</span>
                  </label>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    支持 JPG, PNG 格式图片。<br />
                    建议使用正方形图片以获得最佳显示效果。
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">商品名称</label>
              <input 
                required
                type="text" 
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                placeholder="例如：澳洲肥牛卷"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">商品编号</label>
              <input 
                required
                type="text" 
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                placeholder="例如：FN-001"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">分类</label>
              <select 
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              >
                <option>鸡类</option>
                <option>鸭类</option>
                <option>海鲜类</option>
                <option>丸子类</option>
                <option>冻肉类</option>
                <option>其他</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">单位</label>
              <select 
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value as any })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              >
                <option>件</option>
                <option>包</option>
                <option>斤</option>
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">计价方式</label>
              <div className="flex gap-4">
                <label className={`flex-1 flex items-center justify-center gap-2 p-3 border-2 rounded-xl cursor-pointer transition-all ${formData.pricingMethod === 'piece' ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'}`}>
                  <input 
                    type="radio" 
                    className="hidden" 
                    name="pricingMethod" 
                    checked={formData.pricingMethod === 'piece'} 
                    onChange={() => setFormData({ ...formData, pricingMethod: 'piece' })} 
                  />
                  <Package size={18} />
                  <span className="font-bold">按件卖 (整数)</span>
                </label>
                <label className={`flex-1 flex items-center justify-center gap-2 p-3 border-2 rounded-xl cursor-pointer transition-all ${formData.pricingMethod === 'weight' ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'}`}>
                  <input 
                    type="radio" 
                    className="hidden" 
                    name="pricingMethod" 
                    checked={formData.pricingMethod === 'weight'} 
                    onChange={() => setFormData({ ...formData, pricingMethod: 'weight' })} 
                  />
                  <Calculator size={18} />
                  <span className="font-bold">按斤卖 (小数)</span>
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">进货价 (¥)</label>
              <NumberInput 
                required
                step="0.1"
                value={formData.purchasePrice}
                onChange={(val) => setFormData({ ...formData, purchasePrice: val })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">批发价 (¥)</label>
              <NumberInput 
                step="0.1"
                value={formData.wholesalePrice}
                onChange={(val) => setFormData({ ...formData, wholesalePrice: val })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">零售价 (¥)</label>
              <NumberInput 
                required
                step="0.1"
                value={formData.retailPrice}
                onChange={(val) => setFormData({ ...formData, retailPrice: val })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">价格一 (¥)</label>
              <NumberInput 
                required
                step="0.1"
                value={formData.price2}
                onChange={(val) => setFormData({ ...formData, price2: val })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">自定义价 (¥)</label>
              <NumberInput 
                required
                step="0.1"
                value={formData.price3}
                onChange={(val) => setFormData({ ...formData, price3: val })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">初始库存</label>
              <NumberInput 
                required
                step={formData.pricingMethod === 'weight' ? "0.1" : "1"}
                value={formData.stock}
                onChange={(val) => setFormData({ ...formData, stock: val })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">库存预警值</label>
              <NumberInput 
                required
                step={formData.pricingMethod === 'weight' ? "0.1" : "1"}
                value={formData.minStock}
                onChange={(val) => setFormData({ ...formData, minStock: val })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
          </div>
          <div className="pt-6 border-t border-slate-100 flex justify-end gap-4">
            <button 
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-all"
            >
              取消
            </button>
            <button 
              type="submit"
              className="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
            >
              保存商品
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function PriceEditModal({ product, onClose }: { product: Product, onClose: () => void }) {
  const [prices, setPrices] = useState({
    purchasePrice: product.purchasePrice || 0,
    wholesalePrice: product.wholesalePrice || 0,
    price2: product.price2 || 0,
    price3: product.price3 || 0,
    retailPrice: product.retailPrice || 0
  });

  const handleSave = async () => {
    await db.products.update(product.id!, prices);
    await db.logs.add({
      user: '管理员',
      action: '快速调价',
      details: `修改了商品 ${product.name} 的价格档位`,
      createdAt: new Date().toISOString()
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-amber-100">
              <Tag size={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-800">编辑价格</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-8 space-y-6">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 mb-2">
            <p className="text-sm font-bold text-slate-800">{product.name}</p>
            <p className="text-xs text-slate-400">编号: {product.code}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">进货价 (¥)</label>
              <NumberInput 
                step="0.1"
                value={prices.purchasePrice}
                onChange={(val) => setPrices({ ...prices, purchasePrice: val })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-bold text-slate-700"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">批发价 (¥)</label>
              <NumberInput 
                step="0.1"
                value={prices.wholesalePrice}
                onChange={(val) => setPrices({ ...prices, wholesalePrice: val })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-bold text-indigo-600"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">零售价 (¥)</label>
              <NumberInput 
                step="0.1"
                value={prices.retailPrice}
                onChange={(val) => setPrices({ ...prices, retailPrice: val })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none font-bold text-rose-600"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">价格一 (¥)</label>
              <NumberInput 
                step="0.1"
                value={prices.price2}
                onChange={(val) => setPrices({ ...prices, price2: val })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 outline-none font-bold text-slate-700"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">自定义价 (¥)</label>
              <NumberInput 
                step="0.1"
                value={prices.price3}
                onChange={(val) => setPrices({ ...prices, price3: val })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 outline-none font-bold text-slate-700"
              />
            </div>
          </div>

          <div className="pt-6 flex gap-4">
            <button 
              onClick={onClose}
              className="flex-1 py-3.5 text-slate-500 font-bold hover:bg-slate-50 rounded-2xl transition-all border border-slate-100"
            >
              取消
            </button>
            <button 
              onClick={handleSave}
              className="flex-1 py-3.5 bg-amber-500 text-white font-bold rounded-2xl hover:bg-amber-600 shadow-lg shadow-amber-100 transition-all"
            >
              保存修改
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function StockAdjustmentModal({ product, onClose }: { product: Product, onClose: () => void }) {
  const [amount, setAmount] = useState(0);
  const [type, setType] = useState<'in' | 'out'>('in');
  const [reason, setReason] = useState('');

  const handleAdjust = async () => {
    const newStock = type === 'in' ? product.stock + amount : product.stock - amount;
    if (newStock < 0) {
      alert('库存不足，无法出库！');
      return;
    }
    
    await db.products.update(product.id!, { stock: newStock });
    
    // Record stock movement
    await db.stockMovements.add({
      productId: product.id!,
      productName: product.name,
      type: type === 'in' ? '入库' : '出库',
      quantity: type === 'in' ? amount : -amount,
      previousStock: product.stock,
      currentStock: newStock,
      reason: reason || (type === 'in' ? '手动入库' : '手动出库'),
      operator: '管理员',
      createdAt: new Date().toISOString()
    });

    await db.logs.add({
      user: '管理员',
      action: type === 'in' ? '入库' : '出库',
      details: `${product.name} ${type === 'in' ? '入库' : '出库'} ${amount} ${product.unit}。备注: ${reason}`,
      createdAt: new Date().toISOString()
    });
    
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="text-xl font-bold text-slate-800">库存调整</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-8 space-y-6">
          <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center gap-4">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
              <Package size={24} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{product.name}</p>
              <p className="text-xs text-slate-500">
                当前库存: {product.pricingMethod === 'weight' ? product.stock.toFixed(1) : Math.floor(product.stock)} {product.unit}
              </p>
            </div>
          </div>

          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button 
              onClick={() => setType('in')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${type === 'in' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              入库 (+)
            </button>
            <button 
              onClick={() => setType('out')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${type === 'out' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              出库 (-)
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              调整数量 ({product.unit}) - {product.pricingMethod === 'weight' ? '支持小数' : '仅限整数'}
            </label>
            <NumberInput 
              step={product.pricingMethod === 'weight' ? "0.1" : "1"}
              value={amount}
              onChange={(val) => setAmount(val)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-xl font-bold"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">备注原因</label>
            <textarea 
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none min-h-[80px]"
              placeholder="例如：进货、损耗、调拨..."
            />
          </div>

          <button 
            onClick={handleAdjust}
            disabled={amount <= 0}
            className={`w-full py-4 rounded-2xl font-bold text-white shadow-lg transition-all ${
              type === 'in' 
                ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200' 
                : 'bg-rose-500 hover:bg-rose-600 shadow-rose-200'
            } disabled:opacity-50 disabled:shadow-none`}
          >
            确认{type === 'in' ? '入库' : '出库'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function StockMovementHistoryModal({ product, onClose }: { product: Product, onClose: () => void }) {
  const movements = useLiveQuery(() => 
    db.stockMovements.where('productId').equals(product.id!).reverse().toArray()
  ) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg">
              <History size={20} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">{product.name} - 库存记录</h3>
              <p className="text-xs text-slate-400">
                当前库存: {product.pricingMethod === 'weight' ? product.stock.toFixed(1) : Math.floor(product.stock)} {product.unit}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
          {movements.length > 0 ? (
            <div className="space-y-3">
              {movements.map((m) => (
                <div key={m.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:border-indigo-200 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        m.type === '入库' || m.type === '退货' ? 'bg-emerald-100 text-emerald-600' : 
                        m.type === '出库' || m.type === '销售' ? 'bg-rose-100 text-rose-600' : 
                        'bg-amber-100 text-amber-600'
                      }`}>
                        {m.type}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">{format(new Date(m.createdAt), 'yyyy-MM-dd HH:mm:ss')}</span>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-black font-mono ${m.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {m.quantity > 0 ? '+' : ''}{product.pricingMethod === 'weight' ? m.quantity.toFixed(1) : Math.floor(m.quantity)} {product.unit}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-[10px] text-slate-500 mb-2">
                    <div>
                      <p className="text-slate-400 uppercase tracking-wider mb-0.5">变动前</p>
                      <p className="font-bold font-mono">{product.pricingMethod === 'weight' ? m.previousStock.toFixed(1) : Math.floor(m.previousStock)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 uppercase tracking-wider mb-0.5">变动后</p>
                      <p className="font-bold font-mono">{product.pricingMethod === 'weight' ? m.currentStock.toFixed(1) : Math.floor(m.currentStock)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 uppercase tracking-wider mb-0.5">操作人</p>
                      <p className="font-bold">{m.operator}</p>
                    </div>
                  </div>
                  {m.reason && (
                    <div className="pt-2 border-t border-slate-200/50">
                      <p className="text-[10px] text-slate-400 italic">备注: {m.reason}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-slate-300">
              <History size={48} className="opacity-20 mb-2" />
              <p>暂无库存变动记录</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50">
          <button 
            onClick={onClose}
            className="w-full py-3 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all"
          >
            关闭
          </button>
        </div>
      </motion.div>
    </div>
  );
}

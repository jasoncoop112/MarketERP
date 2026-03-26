/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  ShoppingCart, 
  User, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard, 
  Check, 
  X, 
  Printer, 
  History, 
  Package,
  ChevronRight,
  ArrowRight,
  DollarSign,
  Tag,
  Calculator,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { NumberInput } from '../components/NumberInput';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { getImageUrl } from '../appwrite';
import type { Product, Customer, Order, OrderItem, SearchHistory } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

import OrderPrintPreview from '../components/OrderPrintPreview.tsx';

export default function Sales() {
  const products = useLiveQuery(() => db.products.where('isDeleted').notEqual(1).toArray()) || [];
  const customers = useLiveQuery(() => db.customers.where('isDeleted').notEqual(1).toArray()) || [];
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [discount, setDiscount] = useState(0);
  const [bucketsOut, setBucketsOut] = useState(0);
  const [bucketsIn, setBucketsIn] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'现金' | '微信' | '支付宝' | '欠款'>('现金');
  const [receivedAmount, setReceivedAmount] = useState(0);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isOrderSuccess, setIsOrderSuccess] = useState(false);
  const [lastOrderNo, setLastOrderNo] = useState('');
  const [stockWarning, setStockWarning] = useState<{ name: string; stock: number; requested: number } | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);

  const searchHistory = useLiveQuery(() => 
    db.searchHistory.orderBy('updatedAt').reverse().limit(10).toArray()
  ) || [];

  const saveSearchHistory = async (keyword: string) => {
    if (!keyword.trim()) return;
    const existing = await db.searchHistory.where('keyword').equals(keyword.trim()).first();
    if (existing) {
      await db.searchHistory.update(existing.id!, {
        count: (existing.count || 0) + 1,
        updatedAt: new Date().toISOString()
      });
    } else {
      await db.searchHistory.add({
        keyword: keyword.trim(),
        count: 1,
        updatedAt: new Date().toISOString()
      });
    }
  };

  const clearSearchHistory = async () => {
    await db.searchHistory.clear();
  };

  // Categories
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category));
    return ['全部', ...Array.from(cats)];
  }, [products]);

  // Filter products
  const filteredProducts = useMemo(() => {
    let result = [...products];
    if (selectedCategory !== '全部') {
      result = result.filter(p => p.category === selectedCategory);
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(term) || 
        p.code.toLowerCase().includes(term) ||
        p.pinyin.toLowerCase().includes(term)
      );

      // Sort by search frequency when searching
      result.sort((a, b) => {
        const aFreq = a.searchCount || 0;
        const bFreq = b.searchCount || 0;
        if (aFreq !== bFreq) return bFreq - aFreq;
        return a.name.localeCompare(b.name, 'zh-CN');
      });
    } else {
      // Default view: show top 24 products, maybe sorted by frequency too
      result.sort((a, b) => (b.searchCount || 0) - (a.searchCount || 0));
      return result.slice(0, 24);
    }
    
    return result;
  }, [products, searchTerm, selectedCategory]);

  const handleQuickOrder = async () => {
    if (!selectedCustomer) {
      alert('请先选择一个老客户');
      return;
    }
    const lastOrder = await db.orders
      .where('customerId')
      .equals(selectedCustomer.id!)
      .reverse()
      .first();
    
    if (lastOrder) {
      // Map items back to cart, but check current prices
      const newCart = await Promise.all(lastOrder.items.map(async item => {
        const product = await db.products.get(item.productId);
        return {
          ...item,
          price: product ? product.wholesalePrice : item.price, // Use current wholesale price or last price
          total: Number(((product ? product.wholesalePrice : item.price) * item.quantity).toFixed(1))
        };
      }));
      setCart(newCart);
    } else {
      alert('该客户暂无历史订单');
    }
  };

  const addToCart = async (product: Product) => {
    // Save search history if there's a search term
    if (searchTerm.trim()) {
      await saveSearchHistory(searchTerm.trim());
    }

    // Increment search frequency
    await db.products.update(product.id!, {
      searchCount: (product.searchCount || 0) + 1
    });

    const existing = cart.find(item => item.productId === product.id);
    if (existing) {
      const newQty = existing.quantity + 1;
      setCart(cart.map(item => 
        item.productId === product.id 
          ? { ...item, quantity: newQty, total: Number((newQty * item.price).toFixed(1)) } 
          : item
      ));
    } else {
      setCart([...cart, {
        productId: product.id!,
        name: product.name,
        price: product.wholesalePrice, // Default to Wholesale Price
        quantity: 1,
        unit: product.unit,
        pricingMethod: product.pricingMethod,
        total: product.wholesalePrice
      }]);
    }
  };

  const updatePrice = (productId: number, newPrice: number) => {
    setCart(cart.map(item => 
      item.productId === productId 
        ? { ...item, price: newPrice, total: Number((item.quantity * newPrice).toFixed(1)) } 
        : item
    ));
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const updateQuantity = (productId: number, newQty: number) => {
    setCart(cart.map(item => {
      if (item.productId === productId) {
        // Allow 0 or empty input without removing item
        const qty = isNaN(newQty) ? 0 : Math.max(0, newQty);
        // If piece, ensure integer
        const finalQty = item.pricingMethod === 'weight' ? qty : Math.floor(qty);
        return { ...item, quantity: finalQty, total: Number((finalQty * item.price).toFixed(1)) };
      }
      return item;
    }));
  };

  const handlePreview = () => {
    if (cart.length === 0) return;
    
    const order: Order = {
      orderNo: `PREVIEW-${format(new Date(), 'HHmmss')}`,
      customerName: selectedCustomer?.name || '零售客户',
      customerId: selectedCustomer?.id,
      items: cart,
      totalAmount,
      discount,
      bucketsOut,
      bucketsIn,
      depositAmount,
      finalAmount,
      paymentMethod,
      status: '待支付',
      createdAt: new Date().toISOString()
    };
    
    setPreviewOrder(order);
    setIsPreviewOpen(true);
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.total, 0);
  const depositAmount = (bucketsOut - bucketsIn) * 20;
  const finalAmount = Math.max(0, totalAmount - discount + depositAmount);

  useEffect(() => {
    if (isCheckoutOpen) {
      setReceivedAmount(paymentMethod === '欠款' ? 0 : finalAmount);
    }
  }, [isCheckoutOpen, paymentMethod, finalAmount]);

  const handleCheckout = async (shouldPrint = true, force = false) => {
    if (cart.length === 0) return;

    // Stock check
    if (!force) {
      for (const item of cart) {
        const product = products.find(p => p.id === item.productId);
        if (product && item.quantity > product.stock) {
          setStockWarning({ name: item.name, stock: product.stock, requested: item.quantity });
          return;
        }
      }
    }
    
    // Generate unique order ID: YYYYMMDD-XXXX
    const todayStr = format(new Date(), 'yyyyMMdd');
    const todayOrders = await db.orders
      .where('createdAt')
      .aboveOrEqual(new Date(new Date().setHours(0,0,0,0)).toISOString())
      .toArray();
    
    const sequence = (todayOrders.length + 1).toString().padStart(4, '0');
    const orderNo = `${todayStr}-${sequence}`;
    
    const order: Order = {
      orderNo,
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name || '散客',
      items: cart,
      totalAmount,
      discount,
      bucketsOut,
      bucketsIn,
      depositAmount,
      finalAmount,
      paymentMethod,
      status: paymentMethod === '欠款' ? '待支付' : '已支付',
      createdAt: new Date().toISOString()
    };

    // 1. Save Order
    await db.orders.add(order);

    // 2. Update Stock
    for (const item of cart) {
      const product = await db.products.get(item.productId);
      if (product) {
        const newStock = product.stock - item.quantity;
        await db.products.update(item.productId, { 
          stock: newStock
        });
        
        // Record stock movement
        await db.stockMovements.add({
          productId: item.productId,
          productName: item.name,
          type: '销售',
          quantity: -item.quantity,
          previousStock: product.stock,
          currentStock: newStock,
          reason: `销售开单: ${orderNo}`,
          operator: '管理员',
          createdAt: new Date().toISOString()
        });
      }
    }

    // 3. Update Customer Debt/Spent/Buckets
    if (selectedCustomer) {
      // 现结冲抵欠款，挂账则累加欠款
      // newDebt = oldDebt + (finalAmount - receivedAmount)
      const diff = finalAmount - receivedAmount;
      const newDebt = Math.max(0, selectedCustomer.debt + diff);
      const newSpent = selectedCustomer.totalSpent + finalAmount;
      const newBucketsOut = (selectedCustomer.bucketsOut || 0) + bucketsOut;
      const newBucketsIn = (selectedCustomer.bucketsIn || 0) + bucketsIn;
      
      await db.customers.update(selectedCustomer.id!, { 
        debt: newDebt, 
        totalSpent: newSpent,
        bucketsOut: newBucketsOut,
        bucketsIn: newBucketsIn
      });
    }

    // 4. Log
    await db.logs.add({
      user: '管理员',
      action: '销售开单',
      details: `开具单据 ${orderNo}，金额 ¥${finalAmount}，客户: ${order.customerName}`,
      createdAt: new Date().toISOString()
    });

    setLastOrderNo(orderNo);
    setIsOrderSuccess(true);
    
    // 5. Print if requested
    if (shouldPrint) {
      window.dispatchEvent(new CustomEvent('app-print-order', { detail: order }));
    }

    setCart([]);
    setSelectedCustomer(null);
    setDiscount(0);
    setBucketsOut(0);
    setBucketsIn(0);
    setIsCheckoutOpen(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-160px)]">
      {/* Product Selection (Left) */}
      <div className="lg:col-span-7 flex flex-col gap-6 overflow-hidden">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 shrink-0 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={22} />
            <input 
              type="text" 
              placeholder="搜索商品名称、编号或拼音首字母..." 
              value={searchTerm === '0' ? '' : searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && filteredProducts.length > 0) {
                  await addToCart(filteredProducts[0]);
                  setSearchTerm('');
                }
              }}
              className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-bold text-lg shadow-sm"
            />
          </div>

          {searchHistory.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Clock size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">最近搜索</span>
                </div>
                <button 
                  onClick={clearSearchHistory}
                  className="text-[10px] font-bold text-rose-400 hover:text-rose-500 transition-colors uppercase tracking-widest"
                >
                  清空记录
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {searchHistory.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setSearchTerm(h.keyword)}
                    className="px-3 py-1 bg-slate-50 text-slate-500 text-[10px] font-bold rounded-lg border border-slate-100 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100 transition-all"
                  >
                    {h.keyword}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  selectedCategory === cat 
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' 
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all text-left group flex flex-col justify-between h-full relative"
              >
                {product.stock <= product.minStock && (
                  <div className="absolute -top-2 -right-2 bg-rose-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-lg z-10 animate-pulse">
                    <AlertTriangle size={8} /> 库存预警
                  </div>
                )}
                <div className="flex gap-4 items-start">
                  <div className="w-16 h-16 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 shrink-0 overflow-hidden border border-slate-100">
                    {product.image ? (
                      <img src={getImageUrl(product.image)} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package size={24} strokeWidth={1} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{product.code}</span>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${product.stock > product.minStock ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    </div>
                    <h4 className="font-bold text-slate-800 mb-0.5 truncate">{product.name}</h4>
                    <p className="text-[10px] text-slate-400 truncate">{product.category} · {product.unit}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-lg font-bold text-indigo-600">¥{(product.wholesalePrice || 0).toFixed(1)}</p>
                  <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    <Plus size={18} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cart & Checkout (Right) */}
      <div className="lg:col-span-5 bg-white rounded-3xl shadow-xl border border-slate-100 flex flex-col overflow-hidden">
        {/* Cart Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
              <ShoppingCart size={20} />
            </div>
            <h3 className="font-bold text-slate-800">当前订单</h3>
          </div>
          <button 
            onClick={() => setCart([])}
            className="text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-widest"
          >
            清空购物车
          </button>
        </div>

        {/* Customer Selector */}
        <div className="p-6 border-b border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">选择客户</label>
            {selectedCustomer && (
              <button 
                onClick={handleQuickOrder}
                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded"
              >
                <History size={12} /> 快速开单 (带入上次)
              </button>
            )}
          </div>
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <select 
              value={selectedCustomer?.id || ''}
              onChange={(e) => {
                const c = customers.find(cust => cust.id === parseInt(e.target.value));
                setSelectedCustomer(c || null);
              }}
              className="w-full pl-12 pr-10 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 appearance-none text-lg font-bold text-slate-800 transition-all cursor-pointer shadow-sm"
            >
              <option value="">散客 (无记录)</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <ChevronRight size={20} className="rotate-90" />
            </div>
          </div>
          {selectedCustomer && (
            <div className="flex flex-col gap-1 px-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">当前欠款:</span>
                <span className={`text-sm font-black ${selectedCustomer.debt > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                  ¥{(selectedCustomer.debt || 0).toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">未还桶数:</span>
                <span className="text-sm font-black text-amber-600">
                  {((selectedCustomer.bucketsOut || 0) - (selectedCustomer.bucketsIn || 0))} 个
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
          {cart.length > 0 ? (
            cart.map((item) => {
              const product = products.find(p => p.id === item.productId);
              const isWeight = item.pricingMethod === 'weight';
              
              return (
                <div key={item.productId} className="flex flex-col p-4 rounded-2xl bg-slate-50 border border-slate-100 group gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h5 className="text-sm font-bold text-slate-800 truncate">{item.name}</h5>
                      <p className="text-[10px] text-slate-400 mt-0.5">{product?.code} · {item.unit}</p>
                    </div>
                    <button 
                      onClick={() => removeFromCart(item.productId)}
                      className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-12 gap-3 items-end">
                    {/* Price Selection & Manual Input */}
                    <div className="col-span-7 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">本次单价</label>
                        <select 
                          value={item.price || 0}
                          onChange={(e) => updatePrice(item.productId, parseFloat(e.target.value) || 0)}
                          className="text-[10px] bg-white border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          {product && (
                            <>
                              <option value={product.wholesalePrice || 0}>批发价: ¥{(product.wholesalePrice || 0).toFixed(1)}</option>
                              <option value={product.retailPrice || 0}>零售价: ¥{(product.retailPrice || 0).toFixed(1)}</option>
                              <option value={product.price2 || 0}>价格一: ¥{(product.price2 || 0).toFixed(1)}</option>
                              <option value={product.price3 || 0}>自定义价: ¥{(product.price3 || 0).toFixed(1)}</option>
                            </>
                          )}
                        </select>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">¥</span>
                        <NumberInput 
                          step="0.1"
                          value={item.price}
                          onChange={(val) => updatePrice(item.productId, val)}
                          className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm font-bold text-indigo-600"
                        />
                      </div>
                    </div>

                    {/* Quantity Input */}
                    <div className="col-span-5 space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {isWeight ? '斤数 (小数)' : '数量 (整数)'}
                      </label>
                        <div className="flex items-center bg-white rounded-xl border border-slate-200 p-1">
                          <button 
                            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                            className="p-2.5 hover:bg-slate-50 text-slate-400 rounded-lg transition-colors"
                          >
                            <Minus size={16} />
                          </button>
                          <NumberInput 
                            step={isWeight ? "0.1" : "1"}
                            value={item.quantity}
                            onChange={(val) => updateQuantity(item.productId, val)}
                            placeholder="0"
                            className="w-full text-center text-sm font-bold text-slate-700 bg-transparent outline-none"
                          />
                          <button 
                            onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                            className="p-2.5 hover:bg-slate-50 text-slate-400 rounded-lg transition-colors"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-100/50">
                    <span className="text-[10px] text-slate-400">小计</span>
                    <p className="text-sm font-bold text-slate-800 font-mono">¥{(item.total || 0).toFixed(1)}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 py-12">
              <ShoppingCart size={48} className="mb-2 opacity-20" />
              <p className="text-sm">购物车是空的</p>
            </div>
          )}
        </div>

        {/* Cart Footer */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-slate-500">
              <span>商品总额</span>
              <span className="font-mono">¥{(totalAmount || 0).toFixed(1)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 flex items-center gap-1">
                <Tag size={14} /> 优惠金额
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-xs">-</span>
                <NumberInput 
                  step="0.1"
                  value={discount}
                  onChange={(val) => setDiscount(val)}
                  className="w-20 text-right bg-transparent border-b border-slate-200 focus:border-indigo-500 outline-none text-sm font-mono font-bold text-rose-500"
                />
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 flex items-center gap-1">
                <Package size={14} /> 押桶数量
              </span>
              <div className="flex items-center gap-2">
                <NumberInput 
                  step="1"
                  value={bucketsOut}
                  onChange={(val) => setBucketsOut(val)}
                  className="w-20 text-right bg-transparent border-b border-slate-200 focus:border-indigo-500 outline-none text-sm font-mono font-bold text-indigo-600"
                />
                <span className="text-slate-400 text-[10px]">个</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 flex items-center gap-1">
                <ArrowRight size={14} className="rotate-180" /> 还桶数量
              </span>
              <div className="flex items-center gap-2">
                <NumberInput 
                  step="1"
                  value={bucketsIn}
                  onChange={(val) => setBucketsIn(val)}
                  className="w-20 text-right bg-transparent border-b border-slate-200 focus:border-indigo-500 outline-none text-sm font-mono font-bold text-emerald-600"
                />
                <span className="text-slate-400 text-[10px]">个</span>
              </div>
            </div>
            <div className="flex justify-between text-sm text-slate-500">
              <span>押金小计 (¥20/个)</span>
              <span className={`font-mono font-bold ${depositAmount >= 0 ? 'text-indigo-600' : 'text-emerald-600'}`}>
                {depositAmount >= 0 ? '+' : ''}¥{depositAmount.toFixed(1)}
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">应付总计</p>
              <p className="text-3xl font-black text-slate-900 font-mono">¥{(finalAmount || 0).toFixed(1)}</p>
            </div>
            <div className="flex items-center gap-3">
              <button 
                disabled={cart.length === 0}
                onClick={handlePreview}
                className="px-6 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all disabled:opacity-50 flex items-center gap-2"
                title="打印单预览"
              >
                <Printer size={20} />
                <span className="hidden md:inline">预览</span>
              </button>
              <button 
                disabled={cart.length === 0}
                onClick={() => setIsCheckoutOpen(true)}
                className="px-8 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
              >
                <span>结算开单</span>
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stock Warning Modal */}
      <AnimatePresence>
        {stockWarning && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center space-y-6"
            >
              <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle size={40} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">库存不足</h3>
                <p className="text-slate-500">
                  商品 <span className="font-bold text-slate-800">[{stockWarning.name}]</span> 库存不足。<br />
                  当前库存: <span className="font-bold text-rose-500">{stockWarning.stock}</span><br />
                  申请数量: <span className="font-bold text-indigo-600">{stockWarning.requested}</span>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setStockWarning(null)}
                  className="py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
                >
                  调整数量
                </button>
                <button 
                  onClick={() => {
                    setStockWarning(null);
                    handleCheckout(true);
                  }}
                  className="py-3 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 transition-all shadow-lg shadow-rose-100"
                >
                  强制下单
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Checkout Modal */}
      <AnimatePresence>
        {isCheckoutOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-xl font-bold text-slate-800">确认支付</h3>
                <button onClick={() => setIsCheckoutOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-8 space-y-8">
                <div className="text-center space-y-2">
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">应付金额</p>
                  <p className="text-5xl font-black text-indigo-600 font-mono">¥{(finalAmount || 0).toFixed(1)}</p>
                  <p className="text-xs text-slate-400">客户: {selectedCustomer?.name || '散客'}</p>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-sm font-bold text-slate-500">实收金额 (¥)</span>
                    <NumberInput 
                      step="0.1"
                      value={receivedAmount}
                      onChange={(val) => setReceivedAmount(val)}
                      className="w-32 text-right bg-transparent border-b-2 border-indigo-600 focus:outline-none text-xl font-black text-indigo-600 font-mono"
                    />
                  </div>
                  {selectedCustomer && (
                    <div className="px-4 py-2 bg-amber-50 rounded-xl border border-amber-100 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">结算后欠款</span>
                      <span className="text-sm font-black text-amber-700 font-mono">
                        ¥{Math.max(0, selectedCustomer.debt + (finalAmount - receivedAmount)).toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">选择支付方式</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['现金', '微信', '支付宝', '欠款'].map((m) => (
                      <button
                        key={m}
                        onClick={() => setPaymentMethod(m as any)}
                        className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                          paymentMethod === m 
                            ? 'bg-indigo-50 border-indigo-600 text-indigo-600 shadow-md' 
                            : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${paymentMethod === m ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                          {m === '现金' && <DollarSign size={18} />}
                          {m === '微信' && <Calculator size={18} />}
                          {m === '支付宝' && <CreditCard size={18} />}
                          {m === '欠款' && <History size={18} />}
                        </div>
                        <span className="font-bold">{m}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={() => handleCheckout(false)}
                    className="w-full py-4 bg-slate-100 text-slate-700 font-bold text-lg rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-3"
                  >
                    <Check size={24} />
                    <span>确认 (不打印)</span>
                  </button>
                  <button 
                    onClick={() => handleCheckout(true)}
                    className="w-full py-5 bg-indigo-600 text-white font-bold text-lg rounded-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-3"
                  >
                    <Printer size={24} />
                    <span>确认并打印单据</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {isOrderSuccess && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-indigo-600/90 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-[40px] shadow-2xl p-12 text-center max-w-sm w-full space-y-8"
            >
              <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <Check size={48} strokeWidth={3} />
              </div>
              <div>
                <h3 className="text-3xl font-black text-slate-800 mb-2">开单成功!</h3>
                <p className="text-slate-500 font-medium">单号: {lastOrderNo}</p>
              </div>
              <div className="space-y-3">
                <button 
                  onClick={() => {
                    db.orders.where('orderNo').equals(lastOrderNo).first().then(order => {
                      if (order) window.dispatchEvent(new CustomEvent('app-print-order', { detail: order }));
                    });
                  }}
                  className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-800 transition-all"
                >
                  <Printer size={20} />
                  <span>立即打印</span>
                </button>
                <button 
                  onClick={() => setIsOrderSuccess(false)}
                  className="w-full py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all"
                >
                  返回开单
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Print Preview Modal */}
      <AnimatePresence>
        {isPreviewOpen && previewOrder && (
          <OrderPrintPreview 
            order={previewOrder} 
            onClose={() => setIsPreviewOpen(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

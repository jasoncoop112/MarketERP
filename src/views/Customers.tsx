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
  Users, 
  Phone, 
  MapPin, 
  DollarSign, 
  History, 
  X, 
  Check, 
  Printer,
  ArrowRightLeft,
  ChevronRight,
  UserPlus,
  ShoppingCart,
  Package,
  Minus,
  Calculator,
  CreditCard,
  Tag,
  ArrowRight,
  AlertTriangle,
  FileText,
  Download
} from 'lucide-react';
import { NumberInput } from '../components/NumberInput';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { syncService } from '../services/syncService';
import type { Customer, Product, Order, OrderItem, Repayment } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { pinyin } from 'pinyin-pro';

export default function Customers() {
  const customers = useLiveQuery(async () => {
    const all = await db.customers.toArray();
    return all.filter(c => c.isDeleted !== 1);
  }) || [];
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [isQuickOrderModalOpen, setIsQuickOrderModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customers;
    const term = searchTerm.toLowerCase();
    return customers.filter(c => 
      c.name.toLowerCase().includes(term) || 
      c.phone.includes(term) ||
      c.pinyin?.toLowerCase().includes(term)
    );
  }, [customers, searchTerm]);

  const handleDelete = async (id: number) => {
    if (confirm('确定要删除该客户吗？')) {
      try {
        await db.customers.update(id, { 
          isDeleted: 1,
          sync_status: 1,
          updatedAt: new Date().toISOString()
        });
        
        await db.logs.add({
          user: '管理员',
          action: '删除客户',
          details: `删除了客户 ID: ${id}`,
          sync_status: 1,
          createdAt: new Date().toISOString()
        });
        await syncService.triggerSync();
      } catch (error) {
        console.error('Customer Delete Error:', error);
        alert('删除客户失败，请重试');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="搜索姓名或手机号..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
        <button 
          onClick={() => { setSelectedCustomer(null); setIsAddModalOpen(true); }}
          className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all font-medium"
        >
          <UserPlus size={18} />
          <span>添加客户</span>
        </button>
      </div>

      {/* Customer List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCustomers.map((customer) => (
          <motion.div 
            layout
            key={customer.id}
            className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 hover:shadow-md transition-all group relative overflow-hidden"
          >
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 font-bold text-xl shadow-inner">
                  {customer.name[0]}
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-lg">{customer.name}</h4>
                  <div className="flex items-center gap-1 text-slate-400 text-xs">
                    <Phone size={12} />
                    <span>{customer.phone}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 transition-opacity">
                <button 
                  onClick={() => { setSelectedCustomer(customer); setIsAddModalOpen(true); }}
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                >
                  <Edit size={16} />
                </button>
                <button 
                  onClick={() => handleDelete(customer.id!)}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">累计消费</p>
                <p className="text-lg font-bold text-slate-700">¥{(customer.totalSpent || 0).toFixed(1)}</p>
              </div>
              <div className={`p-3 rounded-xl border ${customer.debt > 0 ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${customer.debt > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>当前欠款</p>
                <p className={`text-lg font-bold ${customer.debt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>¥{(customer.debt || 0).toFixed(1)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider mb-1">累计押桶</p>
                <p className="text-lg font-bold text-indigo-600">{customer.bucketsOut || 0} 个</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
                <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wider mb-1">未还桶数</p>
                <p className="text-lg font-bold text-amber-600">{(customer.bucketsOut || 0) - (customer.bucketsIn || 0)} 个</p>
              </div>
            </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => { setSelectedCustomer(customer); setIsQuickOrderModalOpen(true); }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                  >
                    <ShoppingCart size={18} />
                    <span>快速开单</span>
                  </button>
                  <button 
                    onClick={() => { setSelectedCustomer(customer); setIsDebtModalOpen(true); }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                  >
                    <DollarSign size={18} />
                    <span>收款销账</span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => { setSelectedCustomer(customer); setIsHistoryModalOpen(true); }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-100 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-200 transition-all border border-slate-200"
                  >
                    <History size={18} />
                    <span>历史订单</span>
                  </button>
                  <button 
                    onClick={() => { setSelectedCustomer(customer); setIsStatementModalOpen(true); }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-50 text-emerald-600 text-sm font-bold rounded-xl hover:bg-emerald-100 transition-all border border-emerald-200"
                  >
                    <FileText size={18} />
                    <span>对账单</span>
                  </button>
                </div>
              </div>
          </motion.div>
        ))}

        {filteredCustomers.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-300">
            <Users size={64} className="mb-4 opacity-20" />
            <p className="text-lg font-medium">暂无客户信息</p>
            <p className="text-sm">点击上方按钮添加新客户</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <CustomerFormModal 
            customer={selectedCustomer} 
            onClose={() => setIsAddModalOpen(false)} 
          />
        )}
      </AnimatePresence>

      {/* Debt Repayment Modal */}
      <AnimatePresence>
        {isDebtModalOpen && selectedCustomer && (
          <DebtRepaymentModal 
            customer={selectedCustomer} 
            onClose={() => setIsDebtModalOpen(false)} 
          />
        )}
      </AnimatePresence>

      {/* Quick Order Modal */}
      <AnimatePresence>
        {isQuickOrderModalOpen && selectedCustomer && (
          <QuickOrderModal 
            customer={selectedCustomer} 
            onClose={() => setIsQuickOrderModalOpen(false)} 
          />
        )}
      </AnimatePresence>

      {/* Customer History Modal */}
      <AnimatePresence>
        {isHistoryModalOpen && selectedCustomer && (
          <CustomerHistoryModal 
            customer={selectedCustomer} 
            onClose={() => setIsHistoryModalOpen(false)} 
          />
        )}
      </AnimatePresence>

      {/* Customer Statement Modal */}
      <AnimatePresence>
        {isStatementModalOpen && selectedCustomer && (
          <CustomerStatementModal 
            customer={selectedCustomer} 
            onClose={() => setIsStatementModalOpen(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CustomerHistoryModal({ customer, onClose }: { customer: Customer, onClose: () => void }) {
  const orders = useLiveQuery(() => 
    db.orders.where('customerId').equals(customer.id!).reverse().toArray()
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
              <h3 className="text-xl font-bold text-slate-800">{customer.name} - 历史订单</h3>
              <p className="text-xs text-slate-400">共计 {orders.length} 笔订单</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
          {orders.length > 0 ? (
            orders.map((order) => (
              <div key={order.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:border-indigo-200 transition-all">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{order.orderNo}</p>
                    <p className="text-[10px] text-slate-400">{format(new Date(order.createdAt), 'yyyy-MM-dd HH:mm')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-indigo-600 font-mono">¥{(order.finalAmount || 0).toFixed(1)}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${order.status === '已支付' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                      {order.status}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {order.items.map((item, i) => (
                    <span key={i} className="text-[10px] bg-white border border-slate-200 px-2 py-1 rounded-lg text-slate-500">
                      {item.name} x{item.quantity}
                    </span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-slate-300">
              <History size={48} className="opacity-20 mb-2" />
              <p>暂无订单记录</p>
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

function QuickOrderModal({ customer, onClose }: { customer: Customer, onClose: () => void }) {
  const products = useLiveQuery(async () => {
    const all = await db.products.toArray();
    return all.filter(p => p.isDeleted !== 1);
  }) || [];
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [bucketsOut, setBucketsOut] = useState(0);
  const [bucketsIn, setBucketsIn] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'现金' | '微信' | '支付宝' | '欠款'>('现金');
  const [isOrderSuccess, setIsOrderSuccess] = useState(false);
  const [lastOrderNo, setLastOrderNo] = useState('');

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products.slice(0, 8);
    const term = searchTerm.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(term) || 
      p.code.toLowerCase().includes(term) ||
      p.pinyin.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  const addToCart = (product: Product) => {
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
        price: product.wholesalePrice, // Default to Price 1
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

  const updateQuantity = (productId: number, newQty: number) => {
    setCart(cart.map(item => {
      if (item.productId === productId) {
        const qty = isNaN(newQty) ? 0 : Math.max(0, newQty);
        return { ...item, quantity: qty, total: Number((qty * item.price).toFixed(1)) };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.total, 0);
  const depositAmount = (bucketsOut - bucketsIn) * 20;
  const finalAmount = Math.max(0, totalAmount - discount + depositAmount);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    
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
      customerId: customer.id,
      customerName: customer.name,
      items: cart,
      totalAmount,
      discount,
      bucketsOut,
      bucketsIn,
      depositAmount,
      finalAmount,
      paymentMethod,
      status: paymentMethod === '欠款' ? '待支付' : '已支付',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: 0,
      sync_status: 1
    };

    await db.orders.add(order);

    for (const item of cart) {
      const product = await db.products.get(item.productId);
      if (product) {
        const newStock = product.stock - item.quantity;
        await db.products.update(item.productId, { 
          stock: newStock,
          sync_status: 1,
          updatedAt: new Date().toISOString()
        });
        
        // Record stock movement
        await db.stockMovements.add({
          productId: item.productId,
          productName: item.name,
          type: '销售',
          quantity: -item.quantity,
          previousStock: product.stock,
          currentStock: newStock,
          reason: `快速开单: ${orderNo}`,
          operator: '管理员',
          sync_status: 1,
          createdAt: new Date().toISOString()
        });
      }
    }

    const newDebt = paymentMethod === '欠款' ? customer.debt + finalAmount : customer.debt;
    const newSpent = customer.totalSpent + finalAmount;
    const newBucketsOut = (customer.bucketsOut || 0) + bucketsOut;
    const newBucketsIn = (customer.bucketsIn || 0) + bucketsIn;

    await db.customers.update(customer.id!, { 
      debt: newDebt, 
      totalSpent: newSpent,
      bucketsOut: newBucketsOut,
      bucketsIn: newBucketsIn,
      sync_status: 1,
      updatedAt: new Date().toISOString()
    });

    await db.logs.add({
      user: '管理员',
      action: '快速开单',
      details: `为客户 ${customer.name} 快速开单 ${orderNo}，金额 ¥${finalAmount}`,
      sync_status: 1,
      createdAt: new Date().toISOString()
    });

    await syncService.triggerSync();
    setLastOrderNo(orderNo);
    setIsOrderSuccess(true);
    // Dispatch print event
    window.dispatchEvent(new CustomEvent('app-print-order', { detail: order }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
              <ShoppingCart size={20} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">快速开单 - {customer.name}</h3>
              <p className="text-xs text-slate-400">客户电话: {customer.phone}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Product Selection */}
          <div className="flex-1 p-6 border-r border-slate-100 flex flex-col gap-4 overflow-hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="搜索商品名称、编号或拼音..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
            </div>
            <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-3 pr-2 scrollbar-thin">
              {filteredProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="p-3 bg-white border border-slate-100 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all text-left flex flex-col justify-between relative"
                >
                  {product.stock <= product.minStock && (
                    <div className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-lg z-10 animate-pulse">
                      <AlertTriangle size={8} /> 库存预警
                    </div>
                  )}
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 truncate">{product.name}</h4>
                    <p className="text-[10px] text-slate-400">{product.unit} | 库存: {product.stock}</p>
                  </div>
                  <p className="mt-2 text-indigo-600 font-bold">¥{(product.wholesalePrice || 0).toFixed(2)}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Cart */}
          <div className="w-full md:w-96 bg-slate-50 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-700">已选商品 ({cart.length})</span>
              <button onClick={() => setCart([])} className="text-xs text-rose-500 font-bold">清空</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
              {cart.map(item => {
                const product = products.find(p => p.id === item.productId);
                const isWeight = item.pricingMethod === 'weight';
                
                return (
                  <div key={item.productId} className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-bold text-slate-800 truncate flex-1">{item.name}</span>
                      <button onClick={() => removeFromCart(item.productId)} className="text-slate-300 hover:text-rose-500"><Trash2 size={14}/></button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">本次单价</label>
                        <div className="flex flex-col gap-1">
                          <select 
                            value={item.price || 0}
                            onChange={(e) => updatePrice(item.productId, parseFloat(e.target.value) || 0)}
                            className="text-[10px] bg-slate-50 border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full"
                          >
                            {product && (
                              <>
                                <option value={product.wholesalePrice || 0}>价格一: ¥{(product.wholesalePrice || 0).toFixed(1)}</option>
                                <option value={product.retailPrice || 0}>价格二: ¥{(product.retailPrice || 0).toFixed(1)}</option>
                                <option value={product.price2 || 0}>价格三: ¥{(product.price2 || 0).toFixed(1)}</option>
                                <option value={product.price3 || 0}>价格四: ¥{(product.price3 || 0).toFixed(1)}</option>
                              </>
                            )}
                          </select>
                          <NumberInput 
                            step="0.1"
                            value={item.price}
                            onChange={(val) => updatePrice(item.productId, val)}
                            className="w-full px-2 py-1 text-xs font-bold text-indigo-600 border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">
                          {isWeight ? '斤数 (小数)' : '数量 (整数)'}
                        </label>
                        <div className="flex items-center bg-slate-50 rounded-lg border border-slate-100 p-1">
                          <button onClick={() => updateQuantity(item.productId, item.quantity - 1)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors"><Minus size={16}/></button>
                          <NumberInput 
                            step={isWeight ? "0.1" : "1"}
                            value={item.quantity}
                            onChange={(val) => updateQuantity(item.productId, val)}
                            placeholder="0"
                            className="w-full text-center text-xs font-bold bg-transparent outline-none"
                          />
                          <button onClick={() => updateQuantity(item.productId, item.quantity + 1)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors"><Plus size={16}/></button>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-slate-50">
                      <span className="text-[10px] text-slate-400">{item.unit}</span>
                      <span className="text-sm font-bold text-slate-700">¥{(item.total || 0).toFixed(1)}</span>
                    </div>
                  </div>
                );
              })}
              {cart.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 py-12">
                  <ShoppingCart size={32} className="opacity-20 mb-2" />
                  <p className="text-xs">未选择商品</p>
                </div>
              )}
            </div>
            <div className="p-6 bg-white border-t border-slate-200 space-y-3">
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>商品总额</span>
                  <span>¥{(totalAmount || 0).toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">优惠金额</span>
                  <NumberInput 
                    step="0.1"
                    value={discount || 0}
                    onChange={(val) => setDiscount(val)}
                    className="w-20 text-right bg-slate-50 border-b border-slate-200 focus:border-indigo-500 outline-none text-xs font-bold text-rose-500"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">押桶数量</span>
                  <NumberInput 
                    step="1"
                    value={bucketsOut || 0}
                    onChange={(val) => setBucketsOut(val)}
                    className="w-20 text-right bg-slate-50 border-b border-slate-200 focus:border-indigo-500 outline-none text-xs font-bold text-indigo-600"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">还桶数量</span>
                  <NumberInput 
                    step="1"
                    value={bucketsIn || 0}
                    onChange={(val) => setBucketsIn(val)}
                    className="w-20 text-right bg-slate-50 border-b border-slate-200 focus:border-indigo-500 outline-none text-xs font-bold text-emerald-600"
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>押金小计</span>
                  <span className={`font-bold ${depositAmount >= 0 ? 'text-indigo-600' : 'text-emerald-600'}`}>
                    {depositAmount >= 0 ? '+' : ''}¥{depositAmount.toFixed(1)}
                  </span>
                </div>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                <span className="text-sm font-bold text-slate-800">应付总计</span>
                <span className="text-xl font-black text-indigo-600">¥{(finalAmount || 0).toFixed(1)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {['现金', '微信', '支付宝', '欠款'].map(m => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m as any)}
                    className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${paymentMethod === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <button 
                disabled={cart.length === 0}
                onClick={handleCheckout}
                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span>确认开单</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

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
                  onClick={() => {
                    setIsOrderSuccess(false);
                    onClose();
                  }}
                  className="w-full py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all"
                >
                  返回列表
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CustomerFormModal({ customer, onClose }: { customer: Customer | null, onClose: () => void }) {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Customer>>(customer || {
    name: '',
    phone: '',
    address: '',
    debt: 0,
    totalSpent: 0,
    createdAt: new Date().toISOString()
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    console.log('Customer Form Submit Started', formData);
    try {
      // 增强拼音生成，处理数字和特殊字符
      const py = pinyin(formData.name || '', { 
        pattern: 'initial', 
        toneType: 'none',
        nonZh: 'consecutive'
      }).replace(/\s/g, '').toLowerCase();

      const data = { 
        ...formData, 
        pinyin: py,
        updatedAt: new Date().toISOString(),
        isDeleted: formData.isDeleted || 0,
        sync_status: 1
      } as Customer;

      if (customer?.id) {
        console.log('Updating existing customer:', customer.id);
        await db.customers.update(customer.id, data);
      } else {
        console.log('Adding new customer');
        await db.customers.add(data);
      }
      
      await db.logs.add({
        user: '管理员',
        action: customer ? '编辑客户' : '新增客户',
        details: `${customer ? '编辑' : '新增'}了客户: ${data.name}`,
        sync_status: 1,
        createdAt: new Date().toISOString()
      });
      
      await syncService.triggerSync();
      console.log('Customer save successful, closing modal');
      onClose();
    } catch (error) {
      console.error('Customer Save Error:', error);
      alert('保存客户失败，请重试');
    } finally {
      setIsSaving(false);
    }
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
          <h3 className="text-xl font-bold text-slate-800">{customer ? '编辑客户' : '添加客户'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">客户姓名</label>
              <input 
                required
                type="text" 
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                placeholder="例如：张老板"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">联系电话</label>
              <input 
                type="text" 
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                placeholder="138xxxx8888 (选填)"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">详细地址</label>
              <textarea 
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none min-h-[80px]"
                placeholder="送货地址..."
              />
            </div>
            {!customer && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">初始欠款 (¥)</label>
                <NumberInput 
                  value={formData.debt}
                  onChange={(val) => setFormData({ ...formData, debt: val })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
            )}
          </div>
          <div className="pt-6 border-t border-slate-100 flex justify-end gap-4">
            <button 
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-6 py-2.5 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-all disabled:opacity-50"
            >
              取消
            </button>
            <button 
              type="submit"
              disabled={isSaving}
              className="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>正在保存...</span>
                </>
              ) : (
                <span>保存客户</span>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function DebtRepaymentModal({ customer, onClose }: { customer: Customer, onClose: () => void }) {
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<'现金' | '微信' | '支付宝'>('现金');

  const handleRepay = async () => {
    if (amount <= 0) return;
    try {
      const newDebt = Math.max(0, customer.debt - amount);
      
      // 1. Update customer debt
      await db.customers.update(customer.id!, { 
        debt: newDebt,
        sync_status: 1,
        updatedAt: new Date().toISOString()
      });

      // 2. Record repayment
      await db.repayments.add({
        customerId: customer.id!,
        customerName: customer.name,
        amount: amount,
        method: method,
        sync_status: 1,
        createdAt: new Date().toISOString()
      });

      // 3. Log action
      await db.logs.add({
        user: '管理员',
        action: '收款销账',
        details: `客户 ${customer.name} 偿还欠款 ¥${amount} (${method})。剩余欠款: ¥${newDebt}`,
        sync_status: 1,
        createdAt: new Date().toISOString()
      });

      // 4. Trigger sync
      await syncService.triggerSync();

      onClose();
    } catch (error) {
      console.error('Repayment Error:', error);
      alert('收款失败，请重试');
    }
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
          <h3 className="text-xl font-bold text-slate-800">收款销账</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-8 space-y-6">
          <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-rose-400 uppercase tracking-wider">当前欠款</p>
              <p className="text-2xl font-bold text-rose-600">¥{(customer.debt || 0).toFixed(2)}</p>
            </div>
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-rose-500 shadow-sm">
              <DollarSign size={24} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">本次收款金额 (¥)</label>
            <NumberInput 
              value={amount}
              onChange={(val) => setAmount(val)}
              className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-2xl font-bold text-slate-800"
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">收款方式</label>
            <div className="grid grid-cols-3 gap-2">
              {['现金', '微信', '支付宝'].map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m as any)}
                  className={`py-2 text-sm font-bold rounded-lg border transition-all ${
                    method === m 
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <button 
            onClick={handleRepay}
            disabled={amount <= 0}
            className="w-full py-4 bg-emerald-500 text-white font-bold rounded-2xl hover:bg-emerald-600 shadow-lg shadow-emerald-200 transition-all disabled:opacity-50"
          >
            确认收款
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function CustomerStatementModal({ customer, onClose }: { customer: Customer, onClose: () => void }) {
  const orders = useLiveQuery(() => 
    db.orders.where('customerId').equals(customer.id!).reverse().toArray()
  ) || [];
  
  const repayments = useLiveQuery(async () => {
    const items = await db.repayments.where('customerId').equals(customer.id!).reverse().toArray();
    return items.filter(r => r.isDeleted !== 1);
  }) || [];

  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownloadPDF = async () => {
    const element = document.getElementById('customer-statement');
    if (!element) return;
    
    setIsGenerating(true);
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${customer.name}_对账单_${format(new Date(), 'yyyyMMdd')}.pdf`);
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert('生成PDF失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteRepayment = async (repayment: Repayment) => {
    if (confirm(`确定要删除这条 ¥${repayment.amount} 的还款记录吗？删除后客户欠款将增加。`)) {
      try {
        // 1. Mark repayment as deleted
        await db.repayments.update(repayment.id!, { 
          isDeleted: 1,
          sync_status: 1,
          updatedAt: new Date().toISOString()
        });
        
        // 2. Restore customer debt
        const currentCustomer = await db.customers.get(customer.id!);
        if (currentCustomer) {
          await db.customers.update(customer.id!, {
            debt: (currentCustomer.debt || 0) + repayment.amount,
            sync_status: 1,
            updatedAt: new Date().toISOString()
          });
        }

        // 3. Log action
        await db.logs.add({
          user: '管理员',
          action: '删除还款',
          details: `删除了客户 ${customer.name} 的还款记录 ID: ${repayment.id}，金额: ¥${repayment.amount}。欠款已恢复。`,
          sync_status: 1,
          createdAt: new Date().toISOString()
        });

        // 4. Trigger sync
        await syncService.triggerSync();
      } catch (error) {
        console.error('Repayment Delete Error:', error);
        alert('删除失败，请重试');
      }
    }
  };

  const combinedHistory = useMemo(() => {
    const history = [
      ...orders.map(o => ({ type: 'order' as const, date: o.createdAt, data: o })),
      ...repayments.map(r => ({ type: 'repayment' as const, date: r.createdAt, data: r }))
    ];
    return history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [orders, repayments]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">客户对账单</h3>
              <p className="text-xs text-slate-400">{customer.name} - {customer.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleDownloadPDF}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
            >
              {isGenerating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Download size={16} />}
              <span>导出PDF</span>
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
          <div id="customer-statement" className="bg-white p-8 border border-slate-100 rounded-xl">
            {/* Statement Header */}
            <div className="text-center mb-10 border-b-2 border-slate-900 pb-6">
              <h2 className="text-3xl font-black text-slate-900 mb-2">客户往来对账单</h2>
              <div className="flex justify-between items-end mt-6">
                <div className="text-left space-y-1">
                  <p className="text-sm text-slate-500 font-bold">客户姓名：<span className="text-slate-900">{customer.name}</span></p>
                  <p className="text-sm text-slate-500 font-bold">联系电话：<span className="text-slate-900">{customer.phone}</span></p>
                  <p className="text-sm text-slate-500 font-bold">对账日期：<span className="text-slate-900">{format(new Date(), 'yyyy-MM-dd HH:mm')}</span></p>
                </div>
                <div className="text-right">
                  <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl">
                    <p className="text-xs font-bold text-rose-400 uppercase tracking-widest mb-1">当前总欠款</p>
                    <p className="text-3xl font-black text-rose-600 font-mono">¥{(customer.debt || 0).toFixed(1)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* History Table */}
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="py-3 text-xs font-black text-slate-400 uppercase tracking-widest">日期</th>
                  <th className="py-3 text-xs font-black text-slate-400 uppercase tracking-widest">类型</th>
                  <th className="py-3 text-xs font-black text-slate-400 uppercase tracking-widest">详情</th>
                  <th className="py-3 text-right text-xs font-black text-slate-400 uppercase tracking-widest">金额</th>
                </tr>
              </thead>
              <tbody>
                {combinedHistory.map((item, index) => (
                  <tr key={index} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-4 text-xs font-bold text-slate-500">{format(new Date(item.date), 'yyyy-MM-dd HH:mm')}</td>
                    <td className="py-4">
                      <span className={`text-[10px] font-black px-2 py-1 rounded-full ${
                        item.type === 'order' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'
                      }`}>
                        {item.type === 'order' ? '销售单' : '还款销账'}
                      </span>
                    </td>
                    <td className="py-4">
                      {item.type === 'order' ? (
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-800">{item.data.orderNo}</p>
                          <p className="text-[10px] text-slate-400 truncate max-w-[200px]">
                            {item.data.items.map((i: any) => `${i.name}x${i.quantity}`).join(', ')}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs font-bold text-slate-800">通过 {item.data.method} 还款</p>
                      )}
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <p className={`text-sm font-black font-mono ${
                          item.type === 'order' ? 'text-slate-900' : 'text-emerald-600'
                        }`}>
                          {item.type === 'order' ? '+' : '-'}¥{
                            item.type === 'order' 
                              ? (item.data as Order).finalAmount.toFixed(1) 
                              : (item.data as Repayment).amount.toFixed(1)
                          }
                        </p>
                        {item.type === 'repayment' && (
                          <button 
                            onClick={() => handleDeleteRepayment(item.data as Repayment)}
                            className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                            title="删除还款记录"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Summary Footer */}
            <div className="mt-10 pt-6 border-t-2 border-slate-200 flex justify-between items-start">
              <div className="text-xs text-slate-400 space-y-2">
                <p>备注：此对账单仅供参考，如有异议请及时联系。</p>
                <p>打印时间：{format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</p>
              </div>
              <div className="text-right space-y-2">
                <div className="flex justify-between gap-10">
                  <span className="text-xs font-bold text-slate-400">累计消费：</span>
                  <span className="text-sm font-bold text-slate-900">¥{(customer.totalSpent || 0).toFixed(1)}</span>
                </div>
                <div className="flex justify-between gap-10">
                  <span className="text-xs font-bold text-slate-400">累计还款：</span>
                  <span className="text-sm font-bold text-emerald-600">¥{repayments.reduce((sum, r) => sum + r.amount, 0).toFixed(1)}</span>
                </div>
                <div className="flex justify-between gap-10 pt-2 border-t border-slate-100">
                  <span className="text-sm font-black text-slate-900">应付余额：</span>
                  <span className="text-xl font-black text-rose-600 font-mono">¥{(customer.debt || 0).toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50">
          <button 
            onClick={onClose}
            className="w-full py-3 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all"
          >
            关闭预览
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Search, 
  History, 
  Eye, 
  Printer, 
  Trash2, 
  Calendar, 
  Filter, 
  ChevronRight, 
  X, 
  FileText, 
  Download,
  CreditCard,
  DollarSign,
  Calculator,
  Clock,
  TrendingUp,
  TrendingDown,
  FileDown
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { syncService } from '../services/syncService';
import type { Order } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfDay, endOfDay, subDays, isWithinInterval } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import OrderPrintPreview from '../components/OrderPrintPreview';

export default function Orders() {
  const orders = useLiveQuery(async () => {
    const all = await db.orders.toArray();
    return all.filter(o => o.isDeleted !== 1).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }) || [];
  const customers = useLiveQuery(async () => {
    const all = await db.customers.toArray();
    return all.filter(c => c.isDeleted !== 1);
  }) || [];
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'custom' | 'all'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'all' | '已支付' | '待支付' | '欠款'>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);

  const filteredOrders = useMemo(() => {
    let result = orders;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(o => 
        o.orderNo.toLowerCase().includes(term) || 
        o.customerName.toLowerCase().includes(term)
      );
    }

    if (dateRange !== 'all') {
      const now = new Date();
      let start = startOfDay(now);
      let end = endOfDay(now);

      if (dateRange === 'week') start = subDays(start, 7);
      if (dateRange === 'month') start = subDays(start, 30);
      if (dateRange === 'custom' && startDate && endDate) {
        start = startOfDay(new Date(startDate));
        end = endOfDay(new Date(endDate));
      }
      
      if (dateRange !== 'custom' || (startDate && endDate)) {
        result = result.filter(o => isWithinInterval(new Date(o.createdAt), { start, end }));
      }
    }

    if (paymentStatus !== 'all') {
      if (paymentStatus === '已支付') result = result.filter(o => o.status === '已支付' && o.paymentMethod !== '欠款');
      if (paymentStatus === '待支付') result = result.filter(o => o.status === '待支付');
      if (paymentStatus === '欠款') result = result.filter(o => o.paymentMethod === '欠款');
    }

    return result;
  }, [orders, searchTerm, dateRange, paymentStatus]);

  // Sales Totals
  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const todaySales = orders
      .filter(o => isWithinInterval(new Date(o.createdAt), { start: todayStart, end: endOfDay(now) }))
      .reduce((sum, o) => sum + o.finalAmount, 0);

    const monthSales = orders
      .filter(o => isWithinInterval(new Date(o.createdAt), { start: monthStart, end: endOfDay(now) }))
      .reduce((sum, o) => sum + o.finalAmount, 0);

    return { todaySales, monthSales };
  }, [orders]);

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(filteredOrders.map(o => ({
      '单号': o.orderNo,
      '客户': o.customerName,
      '总金额': o.totalAmount,
      '优惠': o.discount,
      '实付': o.finalAmount,
      '支付方式': o.paymentMethod,
      '状态': o.status,
      '日期': format(new Date(o.createdAt), 'yyyy-MM-dd HH:mm:ss')
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "销售订单");
    XLSX.writeFile(wb, `销售订单_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('确定要删除这条订单记录吗？')) {
      try {
        const now = new Date().toISOString();
        await db.orders.update(id, { 
          isDeleted: 1,
          updatedAt: now
        });
        await syncService.triggerSync();
        await db.logs.add({
          user: '管理员',
          action: '删除订单',
          details: `删除了订单 ID: ${id}`,
          createdAt: now
        });
      } catch (error) {
        console.error('Order Delete Error:', error);
        alert('删除订单失败，请重试');
      }
    }
  };

  const handlePreview = (order: Order) => {
    setPreviewOrder(order);
    setIsPreviewOpen(true);
  };

  const handleDownloadPDF = async (order: Order) => {
    const customer = customers.find(c => c.id === order.customerId);
    
    // Create a temporary container for the bill
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '148mm';
    container.style.backgroundColor = 'white';
    container.style.padding = '8mm';
    container.style.fontFamily = '"宋体", "SimSun", serif';
    
    const items = order.items || [];
    const totalRows = 14;
    const displayItems: any[] = [...items];
    
    if (order.bucketsOut > 0) {
      displayItems.push({
        productId: -101,
        name: '押桶 (¥20/个)',
        price: 20,
        quantity: order.bucketsOut,
        unit: '个',
        total: order.bucketsOut * 20,
        isBucket: true
      });
    }
    
    if (order.bucketsIn > 0) {
      displayItems.push({
        productId: -102,
        name: '还桶 (¥20/个)',
        price: 20,
        quantity: -order.bucketsIn,
        unit: '个',
        total: -order.bucketsIn * 20,
        isBucket: true
      });
    }

    while (displayItems.length < totalRows) {
      displayItems.push({ productId: -1, name: '', price: 0, quantity: 0, unit: '', total: 0 });
    }
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

    container.innerHTML = `
      <div style="width: 132mm; color: black; font-family: 'SimSun', serif; display: flex; flex-direction: column; min-height: 194mm;">
        <table style="width: 100%; margin-bottom: 15pt; border-collapse: collapse; border: none;">
          <tbody>
            <tr>
              <td style="width: 25%; border: none;"></td>
              <td style="width: 50%; text-align: center; vertical-align: bottom; border: none;">
                <h1 style="font-size: 20pt; font-weight: bold; letter-spacing: 4pt; margin: 0; border-bottom: 2pt solid black; padding-bottom: 4pt; display: inline-block; white-space: nowrap; line-height: 1.2;">席立志冷库销售清单</h1>
              </td>
              <td style="width: 25%; text-align: right; vertical-align: bottom; font-size: 9pt; line-height: 1.5; white-space: nowrap; border: none;">
                <p style="margin: 0;">NO：${order.orderNo.replace('SO', '')}</p>
                <p style="margin: 0;">开单日期：${format(new Date(order.createdAt), 'yyyy-MM-dd')}</p>
              </td>
            </tr>
          </tbody>
        </table>

        <table style="width: 100%; margin-bottom: 8pt; border-collapse: collapse; border: none; border-bottom: 1pt solid black; padding-bottom: 6pt;">
          <tbody>
            <tr>
              <td style="text-align: left; font-size: 10pt; border: none;">
                客户名称：<span style="font-weight: bold; border-bottom: 1pt solid black; padding: 0 40pt;">${order.customerName}</span>
              </td>
            </tr>
          </tbody>
        </table>

        <table style="width: 100%; border-collapse: collapse; border: 1.5pt solid black; margin-bottom: 10pt; font-size: 9pt;">
          <thead>
            <tr style="height: 24pt; background-color: #f8fafc;">
              <th style="border: 1pt solid black; width: 30pt; text-align: center;">序号</th>
              <th style="border: 1pt solid black; padding: 0 4pt; text-align: left;">商品名称</th>
              <th style="border: 1pt solid black; width: 50pt; text-align: center;">数量</th>
              <th style="border: 1pt solid black; width: 50pt; text-align: center;">单价</th>
              <th style="border: 1pt solid black; width: 60pt; text-align: right; padding: 0 4pt;">金额</th>
            </tr>
          </thead>
          <tbody>
            ${displayItems.map((item, i) => `
              <tr style="height: 22pt; background-color: ${item.isBucket ? '#fefce8' : 'transparent'};">
                <td style="border: 1pt solid black; text-align: center;">${item.productId === -1 ? '' : (item.isBucket ? '*' : i + 1)}</td>
                <td style="border: 1pt solid black; padding: 0 4pt; font-weight: bold;">
                  ${item.isBucket ? `<span style="color: #854d0e;">${item.name}</span>` : item.name}
                </td>
                <td style="border: 1pt solid black; text-align: center;">
                  ${item.productId === -1 ? '' : `
                    ${item.isBucket ? item.quantity : (item.pricingMethod === 'weight' ? item.quantity.toFixed(1) : Math.floor(item.quantity))}
                    <span style="margin-left: 2pt;">${item.unit}</span>
                  `}
                </td>
                <td style="border: 1pt solid black; text-align: center;">
                  ${item.productId === -1 ? '' : (item.price || 0).toFixed(1) + '元'}
                </td>
                <td style="border: 1pt solid black; text-align: right; padding: 0 4pt; font-weight: bold;">
                  ${item.productId === -1 ? '' : (item.total || 0).toFixed(1) + '元'}
                </td>
              </tr>
            `).join('')}
            <tr style="height: 26pt; font-weight: bold; background-color: #f8fafc;">
              <td style="border: 1pt solid black; text-align: center;" colspan="2">合 计 (人民币大写): ________________________________</td>
              <td style="border: 1pt solid black; text-align: center;">${totalQuantity.toFixed(1)}</td>
              <td style="border: 1pt solid black;"></td>
              <td style="border: 1pt solid black; text-align: right; padding: 0 4pt;">${(order.finalAmount || 0).toFixed(1)}元</td>
            </tr>
          </tbody>
        </table>

        <table style="width: 100%; font-size: 10pt; line-height: 1.8; margin-top: 10pt; margin-bottom: 10pt; border-collapse: collapse; border: none;">
          <tbody>
            <tr>
              <td style="font-weight: bold; padding-bottom: 4pt; border: none;">主营：鸡、鸭、鸡血、鸭血、盒装鸭血、鸡鸭副产、鸡鲜品、宫保鸡丁、鱼块等</td>
            </tr>
            <tr>
              <td style="padding-bottom: 4pt; font-size: 9pt; color: #475569; border: none;">
                <span style="font-weight: bold; color: #1e293b;">[桶账汇总]</span> 
                &nbsp;本次押桶：${order.bucketsOut || 0} | 本次还桶：${order.bucketsIn || 0} | 
                &nbsp;剩余未退：<span style="color: #e11d48; font-weight: bold;">${((customer?.bucketsOut || 0) - (customer?.bucketsIn || 0))}</span> 个
              </td>
            </tr>
            <tr>
              <td style="padding-bottom: 4pt; border: none;">地址：新发地A2-046 席立志冷库</td>
            </tr>
            <tr>
              <td style="border: none;">电话：席立志 13966869019  陈影 13637198664</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: auto; font-size: 11pt; border-top: 1pt dashed #cbd5e1; padding-top: 10pt; text-align: center; font-weight: bold;">
          <p style="margin: 0;">感谢您的惠顾，欢迎下次光临！</p>
        </div>
      </div>
    `;
    
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a5'
      });
      
      pdf.addImage(imgData, 'JPEG', 0, 0, 148, 210);
      pdf.save(`销售清单_${order.orderNo}.pdf`);
    } catch (error) {
      console.error('PDF generation failed:', error);
    } finally {
      document.body.removeChild(container);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-6">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
            <DollarSign size={28} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">今日销售额</p>
            <p className="text-3xl font-black text-slate-900 font-mono">¥{stats.todaySales.toFixed(1)}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-6">
          <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-100">
            <TrendingUp size={28} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">本月销售额</p>
            <p className="text-3xl font-black text-slate-900 font-mono">¥{stats.monthSales.toFixed(1)}</p>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex flex-wrap items-center gap-4 flex-1">
          <div className="relative min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="搜索单号或客户姓名..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <Filter size={14} className="text-slate-400" />
            <select 
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="bg-transparent focus:outline-none text-sm font-medium"
            >
              <option value="all">全部时间</option>
              <option value="today">今日订单</option>
              <option value="week">本周订单</option>
              <option value="month">本月订单</option>
              <option value="custom">自定义范围</option>
            </select>
          </div>

          {dateRange === 'custom' && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent focus:outline-none text-sm font-medium"
              />
              <span className="text-slate-400 text-xs">至</span>
              <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent focus:outline-none text-sm font-medium"
              />
            </div>
          )}

          <select 
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value as any)}
            className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium"
          >
            <option value="all">全部状态</option>
            <option value="已支付">已结账</option>
            <option value="待支付">未结账</option>
            <option value="欠款">欠款订单</option>
          </select>

          {(searchTerm || dateRange !== 'all' || paymentStatus !== 'all') && (
            <button 
              onClick={() => {
                setSearchTerm('');
                setDateRange('all');
                setPaymentStatus('all');
                setStartDate('');
                setEndDate('');
              }}
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
              title="重置筛选"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <button 
          onClick={handleExport}
          className="flex items-center gap-2 px-6 py-2 text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200 transition-all font-medium"
        >
          <Download size={18} />
          <span>导出 Excel</span>
        </button>
      </div>

      {/* Order Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">单号 / 日期</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">客户</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">实付金额</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">支付方式</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">状态</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-slate-800">{order.orderNo}</p>
                    <p className="text-[10px] text-slate-400">{format(new Date(order.createdAt), 'yyyy-MM-dd HH:mm')}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-slate-600">{order.customerName}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-black text-slate-900 font-mono">¥{(order.finalAmount || 0).toFixed(1)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        {order.paymentMethod === '现金' && <DollarSign size={12} />}
                        {order.paymentMethod === '微信' && <Calculator size={12} />}
                        {order.paymentMethod === '支付宝' && <CreditCard size={12} />}
                        {order.paymentMethod === '欠款' && <History size={12} />}
                      </div>
                      <span className="text-xs font-bold text-slate-500">{order.paymentMethod}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      order.status === '已支付' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handlePreview(order)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="打印单预览"
                      >
                        <Printer size={18} />
                      </button>
                      <button 
                        onClick={() => setSelectedOrder(order)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="查看详情"
                      >
                        <Eye size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(order.id!)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        title="删除订单"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredOrders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300">
            <History size={64} className="mb-4 opacity-20" />
            <p className="text-lg font-medium">暂无订单记录</p>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">订单详情</h3>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">{selectedOrder.orderNo}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto scrollbar-thin">
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">客户信息</p>
                    <p className="text-lg font-bold text-slate-800">{selectedOrder.customerName}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">下单日期</p>
                    <p className="text-lg font-bold text-slate-800">{format(new Date(selectedOrder.createdAt), 'yyyy-MM-dd HH:mm')}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">商品清单</p>
                  <div className="space-y-2">
                    {selectedOrder.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <div>
                          <p className="text-sm font-bold text-slate-800">{item.name}</p>
                          <p className="text-[10px] text-slate-400">
                            ¥{(item.price || 0).toFixed(1)} x {item.pricingMethod === 'weight' ? item.quantity.toFixed(1) : Math.floor(item.quantity)} {item.unit}
                            {item.pricingMethod === 'weight' && <span className="ml-1">(按斤)</span>}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-slate-800 font-mono">¥{(item.total || 0).toFixed(1)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 space-y-2">
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>商品总额</span>
                    <span className="font-mono">¥{(selectedOrder.totalAmount || 0).toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-rose-500">
                    <span>优惠减免</span>
                    <span className="font-mono">-¥{(selectedOrder.discount || 0).toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-indigo-500">
                    <span>押桶/还桶 ({selectedOrder.bucketsOut || 0}/{selectedOrder.bucketsIn || 0}个)</span>
                    <span className="font-mono">{selectedOrder.depositAmount >= 0 ? '+' : ''}¥{(selectedOrder.depositAmount || 0).toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-lg font-bold text-slate-800">实付总计</span>
                    <span className="text-2xl font-black text-indigo-600 font-mono">¥{(selectedOrder.finalAmount || 0).toFixed(1)}</span>
                  </div>
                </div>
              </div>
              <div className="p-8 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={() => handlePreview(selectedOrder)}
                  className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
                >
                  <Printer size={20} />
                  <span>打印预览</span>
                </button>
                <button 
                  onClick={() => handleDownloadPDF(selectedOrder)}
                  className="flex-1 py-4 bg-white text-indigo-600 font-bold rounded-2xl border-2 border-indigo-600 flex items-center justify-center gap-2 hover:bg-indigo-50 transition-all"
                >
                  <Download size={20} />
                  <span>导出 PDF</span>
                </button>
                <button 
                  onClick={() => setSelectedOrder(null)}
                  className="flex-1 py-4 bg-white text-slate-600 font-bold rounded-2xl border border-slate-200 hover:bg-slate-50 transition-all"
                >
                  关闭窗口
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

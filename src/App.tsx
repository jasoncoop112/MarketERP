/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  ShoppingCart, 
  History, 
  Settings, 
  LogOut, 
  Clock, 
  User,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Search,
  Plus,
  Printer,
  FileText,
  Download,
  Database,
  Trash2,
  Edit,
  ArrowRightLeft,
  ChevronRight,
  Menu,
  X,
  Cloud,
  CloudOff,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { Product, Customer, Order, OperationLog } from './types';
import { pinyin } from 'pinyin-pro';
import { syncService } from './services/syncService';

// --- Views ---
import Dashboard from './views/Dashboard';
import Products from './views/Products';
import Customers from './views/Customers';
import Sales from './views/Sales';
import Orders from './views/Orders';
import SettingsView from './views/Settings';

type ViewType = 'dashboard' | 'products' | 'customers' | 'sales' | 'orders' | 'settings';

function PrintBill({ order }: { order: Order | null }) {
  const customer = useLiveQuery(
    () => (order?.customerId ? db.customers.get(order.customerId) : Promise.resolve(null)),
    [order?.customerId]
  );

  if (!order) return null;

  const BillContent = ({ copyTitle }: { copyTitle: string }) => {
    const items = order.items || [];
    const totalRows = 14;
    const displayItems = [...items];
    while (displayItems.length < totalRows) {
      displayItems.push({ productId: -1, name: '', price: 0, quantity: 0, unit: '', total: 0 });
    }

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

    return (
      <div className="print-page" style={{ 
        fontFamily: '"宋体", "SimSun", serif',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%'
      }}>
        {/* Header Table */}
        <table style={{ width: '100%', marginBottom: '15pt', borderCollapse: 'collapse' }}>
          <tr>
            <td style={{ width: '25%' }}></td>
            <td style={{ width: '50%', textAlign: 'center', verticalAlign: 'bottom' }}>
              <h1 style={{ 
                fontSize: '20pt', 
                fontWeight: 'bold', 
                letterSpacing: '4pt', 
                margin: 0, 
                borderBottom: '2pt solid black', 
                paddingBottom: '4pt', 
                display: 'inline-block',
                whiteSpace: 'nowrap'
              }}>
                席立志冷库销售清单
              </h1>
            </td>
            <td style={{ 
              width: '25%', 
              textAlign: 'right', 
              verticalAlign: 'bottom', 
              fontSize: '9pt', 
              lineHeight: '1.5',
              whiteSpace: 'nowrap'
            }}>
              <p style={{ margin: 0 }}>NO：{order.orderNo.replace('SO', '')}</p>
              <p style={{ margin: 0 }}>开单日期：{format(new Date(order.createdAt), 'yyyy-MM-dd')}</p>
            </td>
          </tr>
        </table>

        {/* Customer Info Table */}
        <table style={{ width: '100%', marginBottom: '8pt', borderBottom: '1pt solid black', paddingBottom: '6pt' }}>
          <tr>
            <td style={{ textAlign: 'left', fontSize: '10pt' }}>
              客户名称：<span style={{ fontWeight: 'bold', borderBottom: '1pt solid black', padding: '0 40pt' }}>{order.customerName}</span>
            </td>
          </tr>
        </table>

        {/* Main Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5pt solid black', marginBottom: '10pt', fontSize: '9pt' }}>
          <thead>
            <tr style={{ height: '24pt', backgroundColor: '#f8fafc' }}>
              <th style={{ border: '1pt solid black', width: '30pt', textAlign: 'center' }}>序号</th>
              <th style={{ border: '1pt solid black', padding: '0 4pt', textAlign: 'left' }}>商品名称</th>
              <th style={{ border: '1pt solid black', width: '50pt', textAlign: 'center' }}>数量</th>
              <th style={{ border: '1pt solid black', width: '50pt', textAlign: 'center' }}>单价</th>
              <th style={{ border: '1pt solid black', width: '60pt', textAlign: 'right', padding: '0 4pt' }}>金额</th>
            </tr>
          </thead>
          <tbody>
            {displayItems.map((item, i) => (
              <tr key={i} style={{ height: '22pt' }}>
                <td style={{ border: '1pt solid black', textAlign: 'center' }}>{item.productId === -1 ? '' : i + 1}</td>
                <td style={{ border: '1pt solid black', padding: '0 4pt', fontWeight: 'bold' }}>{item.name}</td>
                <td style={{ border: '1pt solid black', textAlign: 'center' }}>
                  {item.productId === -1 ? '' : (
                    <>
                      {item.pricingMethod === 'weight' ? item.quantity.toFixed(1) : Math.floor(item.quantity)}
                      <span style={{ marginLeft: '2pt' }}>{item.unit}</span>
                    </>
                  )}
                </td>
                <td style={{ border: '1pt solid black', textAlign: 'center' }}>
                  {item.productId === -1 ? '' : (item.price || 0).toFixed(1) + '元'}
                </td>
                <td style={{ border: '1pt solid black', textAlign: 'right', padding: '0 4pt', fontWeight: 'bold' }}>
                  {item.productId === -1 ? '' : (item.total || 0).toFixed(1) + '元'}
                </td>
              </tr>
            ))}
            {/* Total Row */}
            <tr style={{ height: '26pt', fontWeight: 'bold', backgroundColor: '#f8fafc' }}>
              <td style={{ border: '1pt solid black', textAlign: 'center' }} colSpan={2}>合 计 (人民币大写): ________________________________</td>
              <td style={{ border: '1pt solid black', textAlign: 'center' }}>{totalQuantity.toFixed(1)}</td>
              <td style={{ border: '1pt solid black' }}></td>
              <td style={{ border: '1pt solid black', textAlign: 'right', padding: '0 4pt' }}>{(order.finalAmount || 0).toFixed(1)}元</td>
            </tr>
          </tbody>
        </table>

        {/* Footer Table */}
        <table style={{ width: '100%', fontSize: '10pt', lineHeight: '1.8', marginTop: '10pt', marginBottom: '10pt' }}>
          <tr>
            <td style={{ fontWeight: 'bold', paddingBottom: '4pt' }}>主营：鸡、鸭、鸡血、鸭血、盒装鸭血、鸡鸭副产、鸡鲜品、宫保鸡丁、鱼块等</td>
          </tr>
          <tr>
            <td style={{ paddingBottom: '4pt', fontSize: '9pt' }}>
              本次押桶：{order.bucketsOut || 0} | 本次还桶：{order.bucketsIn || 0} | 本次押金：¥{(order.depositAmount || 0).toFixed(1)} | 剩余未退：{((customer?.bucketsOut || 0) - (customer?.bucketsIn || 0))}个
            </td>
          </tr>
          <tr>
            <td style={{ paddingBottom: '4pt' }}>地址：新发地A2-046 席立志冷库</td>
          </tr>
          <tr>
            <td>电话：席立志 13966869019  陈影 13637198664</td>
          </tr>
        </table>

        <div style={{ marginTop: 'auto', fontSize: '11pt', borderTop: '1pt dashed #cbd5e1', paddingTop: '10pt', textAlign: 'center', fontWeight: 'bold' }}>
          <p style={{ margin: 0 }}>感谢您的惠顾，欢迎下次光临！</p>
        </div>
      </div>
    );
  };

  return (
    <div className="print-area">
      <div className="print-sheet">
        <BillContent copyTitle="第一联：商家留底" />
        <BillContent copyTitle="第二联：客户联" />
      </div>
    </div>
  );
}

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [userRole, setUserRole] = useState<'admin' | 'operator'>('admin');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [beijingTime, setBeijingTime] = useState(new Date());
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');

  // Auto-sync every 30 seconds
  useEffect(() => {
    const doSync = async () => {
      console.log('Auto-sync started...');
      setSyncStatus('syncing');
      try {
        const didSync = await syncService.syncAll();
        if (didSync) {
          console.log('Auto-sync completed successfully');
          setSyncStatus('idle');
        }
      } catch (error) {
        console.error('Auto-sync failed:', error);
        setSyncStatus('error');
      }
    };

    doSync();
    const interval = setInterval(doSync, 5000);
    return () => clearInterval(interval);
  }, []);

  // Listen for print events from Sales/Orders
  useEffect(() => {
    const handlePrint = (e: any) => {
      setPrintOrder(e.detail);
      setTimeout(() => window.print(), 100);
    };
    window.addEventListener('app-print-order', handlePrint);
    return () => window.removeEventListener('app-print-order', handlePrint);
  }, []);

  // Beijing Time Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setBeijingTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const navItems = [
    { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
    { id: 'products', label: '商品管理', icon: Package },
    { id: 'customers', label: '客户管理', icon: Users },
    { id: 'sales', label: '销售开单', icon: ShoppingCart },
    { id: 'orders', label: '历史订单', icon: History },
    { id: 'settings', label: '系统设置', icon: Settings },
  ];

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <Dashboard />;
      case 'products': return <Products userRole={userRole} />;
      case 'customers': return <Customers />;
      case 'sales': return <Sales />;
      case 'orders': return <Orders />;
      case 'settings': return <SettingsView userRole={userRole} />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden print:block print:h-auto print:bg-white print:overflow-visible">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 240 : 80 }}
        className="bg-white border-r border-slate-200 flex flex-col shadow-sm z-20 print:hidden"
      >
        <div className="p-6 flex items-center gap-3 border-b border-slate-100">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shrink-0">
            <Package size={20} />
          </div>
          {isSidebarOpen && (
            <span className="font-bold text-lg tracking-tight truncate">冻品ERP</span>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id as ViewType)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                currentView === item.id 
                  ? 'bg-indigo-50 text-indigo-600 font-medium' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <item.icon size={20} className="shrink-0" />
              {isSidebarOpen && <span>{item.label}</span>}
              {currentView === item.id && isSidebarOpen && (
                <motion.div layoutId="active-nav" className="ml-auto w-1.5 h-1.5 bg-indigo-600 rounded-full" />
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-4">
          <div className={`flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 ${!isSidebarOpen && 'justify-center'}`}>
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 shrink-0">
              <User size={18} />
            </div>
            {isSidebarOpen && (
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate">管理员</span>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">{userRole === 'admin' ? '系统管理员' : '操作员'}</span>
              </div>
            )}
          </div>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-full flex items-center justify-center p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden print:hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shadow-sm shrink-0 z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-slate-800">
              {navItems.find(i => i.id === currentView)?.label}
            </h2>
          </div>

          <div className="flex items-center gap-6">
            <button 
              onClick={() => syncService.triggerSync()}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold transition-all hover:scale-105 active:scale-95 ${
              syncStatus === 'syncing' ? 'bg-indigo-50 text-indigo-600 border-indigo-100 animate-pulse' :
              syncStatus === 'error' ? 'bg-rose-50 text-rose-600 border-rose-100' :
              'bg-emerald-50 text-emerald-600 border-emerald-100'
            }`}>
              {syncStatus === 'syncing' ? <RefreshCw size={14} className="animate-spin" /> : 
               syncStatus === 'error' ? <CloudOff size={14} /> : <Cloud size={14} />}
              <span>{syncStatus === 'syncing' ? '正在同步云端...' : 
                     syncStatus === 'error' ? '同步失败 (点击重试)' : '云端已同步'}</span>
            </button>

            <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-50 rounded-full border border-slate-100 text-slate-600 shadow-inner">
              <Clock size={16} className="text-indigo-500" />
              <span className="text-sm font-mono font-medium">
                {format(beijingTime, 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })}
              </span>
              <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-bold">北京时间</span>
            </div>
          </div>
        </header>

        {/* View Container */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-7xl mx-auto"
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Hidden Print Content */}
      <div className="hidden print:block">
        <PrintBill order={printOrder} />
      </div>
    </div>
  );
}

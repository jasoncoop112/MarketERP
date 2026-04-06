/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  Trash2, 
  Shield, 
  FileText, 
  Info, 
  Check, 
  X, 
  AlertTriangle,
  History,
  User,
  Settings as SettingsIcon,
  ChevronRight,
  Package,
  Users,
  Cloud,
  RefreshCw,
  CloudOff
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { syncService } from '../services/syncService';

interface SettingsProps {
  userRole: 'admin' | 'operator';
}

export default function SettingsView({ userRole }: SettingsProps) {
  const logs = useLiveQuery(() => db.logs.orderBy('createdAt').reverse().limit(50).toArray()) || [];
  const [isBackupSuccess, setIsBackupSuccess] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ database: boolean; storage: boolean; error?: string; diagnostics?: string[] } | null>(null);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const lastSync = useLiveQuery(() => db.syncStatus.get('lastSync'));

  const handleCheckConnection = async () => {
    setIsCheckingConnection(true);
    const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
    const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || '69c4c032002f214af93e';
    
    try {
      const status = await syncService.checkConnection();
      setConnectionStatus(status);
      if (!status.database || !status.storage) {
        console.warn('Appwrite connection check failed. Current origin:', window.location.origin);
      }
    } catch (error: any) {
      console.error('Connection check failed:', error);
      setConnectionStatus({ 
        database: false, 
        storage: false, 
        error: error.message || String(error), 
        diagnostics: [
          `[!] 严重错误: ${error.message || String(error)}`,
          `[D] Endpoint: ${endpoint}`,
          `[D] Project ID: ${projectId}`,
          `[D] Origin: ${window.location.origin}`
        ] 
      });
    } finally {
      setIsCheckingConnection(false);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncService.syncAll();
      alert('同步成功！');
    } catch (error: any) {
      const results = syncService.getLastSyncResults();
      const failedDetails = Object.entries(results)
        .filter(([_, res]) => !res.success)
        .map(([name, res]) => `${name}: ${res.error}`)
        .join('\n');
      
      alert(`同步失败！\n\n失败详情:\n${failedDetails || error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleBackup = async () => {
    const products = await db.products.toArray();
    const customers = await db.customers.toArray();
    const orders = await db.orders.toArray();
    const logsData = await db.logs.toArray();

    const wb = XLSX.utils.book_new();
    
    // Products Sheet
    const wsProducts = XLSX.utils.json_to_sheet(products);
    XLSX.utils.book_append_sheet(wb, wsProducts, "商品");
    
    // Customers Sheet
    const wsCustomers = XLSX.utils.json_to_sheet(customers);
    XLSX.utils.book_append_sheet(wb, wsCustomers, "客户");
    
    // Orders Sheet
    // Flatten items for orders might be complex, let's store as JSON string in a cell or just skip complex nested data for Excel if it's too much.
    // Actually, for a real backup, JSON is better, but user asked for Excel.
    // I'll store items as JSON string.
    const wsOrders = XLSX.utils.json_to_sheet(orders.map(o => ({
      ...o,
      items: JSON.stringify(o.items)
    })));
    XLSX.utils.book_append_sheet(wb, wsOrders, "订单");
    
    // Logs Sheet
    const wsLogs = XLSX.utils.json_to_sheet(logsData);
    XLSX.utils.book_append_sheet(wb, wsLogs, "日志");

    XLSX.writeFile(wb, `FrozenFoodERP_FullBackup_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
    
    setIsBackupSuccess(true);
    setTimeout(() => setIsBackupSuccess(false), 3000);
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('恢复备份将清空当前所有数据！确定要继续吗？')) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const products = XLSX.utils.sheet_to_json(workbook.Sheets["商品"]) as any[];
        const customers = XLSX.utils.sheet_to_json(workbook.Sheets["客户"]) as any[];
        const ordersRaw = XLSX.utils.sheet_to_json(workbook.Sheets["订单"]) as any[];
        const logs = XLSX.utils.sheet_to_json(workbook.Sheets["日志"]) as any[];

        const orders = ordersRaw.map(o => ({
          ...o,
          items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items
        }));

        await db.transaction('rw', [db.products, db.customers, db.orders, db.logs, db.stockMovements, db.repayments], async () => {
          await db.products.clear();
          await db.customers.clear();
          await db.orders.clear();
          await db.logs.clear();
          await db.stockMovements.clear();
          await db.repayments.clear();

          if (products.length > 0) await db.products.bulkAdd(products);
          if (customers.length > 0) await db.customers.bulkAdd(customers);
          if (orders.length > 0) await db.orders.bulkAdd(orders);
          if (logs.length > 0) await db.logs.bulkAdd(logs);
        });

        alert('数据恢复成功！');
        window.location.reload();
      } catch (err) {
        alert('恢复失败，请确保文件格式正确：' + (err as Error).message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleClearLogs = async () => {
    if (confirm('确定要清空所有操作日志吗？')) {
      try {
        await db.logs.clear();
        alert('日志已清空');
      } catch (error) {
        console.error('Clear Logs Error:', error);
        alert('清空日志失败');
      }
    }
  };

  const handleClearAllData = async () => {
    if (confirm('⚠️ 警告：这将彻底清空本地所有数据（商品、客户、订单、日志等）！此操作不可撤销。确定要继续吗？')) {
      try {
        await Promise.all([
          db.products.clear(),
          db.customers.clear(),
          db.orders.clear(),
          db.logs.clear(),
          db.stockMovements.clear(),
          db.repayments.clear(),
          db.searchHistory.clear(),
          db.syncStatus.clear()
        ]);
        alert('所有本地数据已清空。页面将重新加载以应用更改。');
        window.location.reload();
      } catch (error) {
        console.error('Clear All Data Error:', error);
        alert('清空数据失败');
      }
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Data Management */}
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                <Database size={20} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">本地备份</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button 
                onClick={handleBackup}
                className="flex flex-col items-center justify-center p-6 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100 transition-all group"
              >
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm mb-3 group-hover:scale-110 transition-transform">
                  <Download size={24} />
                </div>
                <span className="text-sm font-bold text-slate-700">一键备份</span>
                <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">导出 Excel 文件</span>
              </button>

              <label className="flex flex-col items-center justify-center p-6 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100 transition-all group cursor-pointer">
                <input type="file" accept=".xlsx,.xls" onChange={handleRestore} className="hidden" />
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm mb-3 group-hover:scale-110 transition-transform">
                  <Upload size={24} />
                </div>
                <span className="text-sm font-bold text-slate-700">数据恢复</span>
                <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">导入备份文件</span>
              </label>
            </div>

            <AnimatePresence>
              {isBackupSuccess && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3 text-emerald-600"
                >
                  <Check size={18} />
                  <span className="text-sm font-bold">备份文件已生成并下载</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                  <Cloud size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">云端同步</h3>
              </div>
              {lastSync && (
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">
                  上次同步: {format(new Date(lastSync.lastSync), 'MM-dd HH:mm')}
                </span>
              )}
            </div>

            <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center text-center space-y-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-all ${
                isSyncing ? 'bg-indigo-100 text-indigo-600 animate-pulse' : 'bg-white text-indigo-600'
              }`}>
                {isSyncing ? <RefreshCw size={32} className="animate-spin" /> : <Cloud size={32} />}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">全数据自动同步</p>
                <p className="text-xs text-slate-400 mt-1 max-w-[240px]">
                  系统会自动在后台同步您的订单、商品和客户数据。如果同步不及时，您可以点击下方按钮手动触发。
                </p>
              </div>
              <div className="flex flex-col md:flex-row gap-4 w-full">
                <button 
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSyncing ? <RefreshCw size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                  <span>立即同步数据</span>
                </button>
                <button 
                  onClick={async () => {
                    if (confirm('确定要重置同步状态吗？这不会删除数据，但会强制从云端重新拉取所有变更。')) {
                      await syncService.resetSync();
                      alert('同步状态已重置，正在开始全量同步...');
                      handleManualSync();
                    }
                  }}
                  disabled={isSyncing}
                  className="px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Trash2 size={18} />
                  <span>重置同步</span>
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                  <Shield size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">连接验证</h3>
              </div>
              <button 
                onClick={handleCheckConnection}
                disabled={isCheckingConnection}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-50 flex items-center gap-1"
              >
                {isCheckingConnection ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                <span>重新验证</span>
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${connectionStatus?.database ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    <Database size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Appwrite 云端数据库</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">Database Connection</p>
                  </div>
                </div>
                {connectionStatus === null ? (
                  <span className="text-[10px] text-slate-400 font-bold">待验证</span>
                ) : connectionStatus.database ? (
                  <span className="flex items-center gap-1 text-emerald-600 text-[10px] font-bold">
                    <Check size={12} /> 正常连接
                  </span>
                ) : (
                  <div className="text-right">
                    <span className="flex items-center justify-end gap-1 text-rose-600 text-[10px] font-bold">
                      <X size={12} /> 连接失败
                    </span>
                    {connectionStatus.error && (
                      <div className="mt-2 text-right">
                        <p className="text-[9px] text-rose-400 leading-tight break-all">{connectionStatus.error}</p>
                        
                        {/* 诊断日志显示 */}
                        {connectionStatus.diagnostics && (
                          <div className="mt-4 p-3 bg-slate-900 rounded-xl text-left font-mono">
                            <p className="text-[10px] text-slate-400 mb-2 border-b border-slate-800 pb-1">诊断日志 (Diagnostic Logs):</p>
                            <div className="space-y-1">
                              {connectionStatus.diagnostics.map((log, idx) => (
                                <p key={idx} className={`text-[9px] ${log.includes('成功') ? 'text-emerald-400' : log.includes('失败') || log.includes('错误') ? 'text-rose-400' : 'text-slate-300'}`}>
                                  {log}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {connectionStatus.error.includes('Failed to fetch') && (
                          <div className="mt-2 p-2 bg-rose-50 rounded-lg border border-rose-100 text-left">
                            <p className="text-[9px] text-rose-600 mb-1 font-bold">域名未授权 (CORS Error)</p>
                            <p className="text-[8px] text-rose-500 mb-2 leading-tight">请在 Appwrite 后台 → Settings → Platforms → Web App 中添加以下域名：</p>
                            <div className="flex items-center gap-1">
                              <code className="text-[8px] bg-white px-1 py-0.5 rounded border border-rose-200 flex-1 truncate">{window.location.origin}</code>
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(window.location.origin);
                                  alert('域名已复制');
                                }}
                                className="text-[8px] text-indigo-600 font-bold hover:underline"
                              >
                                复制
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${connectionStatus?.storage ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    <Package size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Appwrite 存储桶 (图片)</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">Storage Connection</p>
                  </div>
                </div>
                {connectionStatus === null ? (
                  <span className="text-[10px] text-slate-400 font-bold">待验证</span>
                ) : connectionStatus.storage ? (
                  <span className="flex items-center gap-1 text-emerald-600 text-[10px] font-bold">
                    <Check size={12} /> 正常连接
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-rose-600 text-[10px] font-bold">
                    <X size={12} /> 连接失败
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg shadow-slate-100">
                <Shield size={20} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">系统权限</h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400">
                    <User size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">当前角色</p>
                    <p className="text-xs text-slate-400 uppercase tracking-widest">{userRole === 'admin' ? '系统管理员' : '操作员'}</p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-indigo-100 text-indigo-600 text-[10px] font-bold rounded-full uppercase tracking-widest">
                  {userRole}
                </span>
              </div>
              <p className="text-xs text-slate-400 px-2">
                * 管理员拥有所有权限，包括删除商品、清空日志、数据恢复等。操作员仅限开单和查看。
              </p>
            </div>
          </div>
        </div>

        {/* Operation Logs */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col h-[600px]">
          <div className="flex items-center justify-between mb-8 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-amber-100">
                <History size={20} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">操作日志</h3>
            </div>
            <button 
              onClick={handleClearLogs}
              className="text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-widest"
            >
              清空日志
            </button>
            <button 
              onClick={handleClearAllData}
              className="text-xs font-bold text-rose-400 hover:text-rose-600 transition-colors uppercase tracking-widest flex items-center gap-1"
            >
              <Trash2 size={12} />
              重置系统 (清空数据)
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-thin">
            {logs.map((log) => (
              <div key={log.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                <div className="flex justify-between items-start">
                  <span className="px-2 py-0.5 bg-white border border-slate-200 text-slate-600 text-[10px] font-bold rounded uppercase tracking-widest">
                    {log.action}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {format(new Date(log.createdAt), 'MM-dd HH:mm:ss')}
                  </span>
                </div>
                <p className="text-sm text-slate-700 font-medium leading-relaxed">{log.details}</p>
                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                  <User size={10} />
                  <span>执行人: {log.user}</span>
                </div>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 py-12">
                <FileText size={48} className="mb-2 opacity-20" />
                <p className="text-sm">暂无操作记录</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* App Info */}
      <div className="bg-slate-900 rounded-[40px] p-12 text-white relative overflow-hidden shadow-2xl shadow-indigo-200">
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/50">
                <Package size={32} />
              </div>
              <div>
                <h2 className="text-3xl font-black tracking-tight">冻品ERP v1.0</h2>
                <p className="text-indigo-300 font-medium">菜市场个人生意管理专家</p>
              </div>
            </div>
            <p className="text-slate-400 max-w-md leading-relaxed">
              本软件采用【本地+云端】双存储架构。数据实时同步至 Appwrite 云端，支持多设备互通。断网环境下仍可正常开单，联网后自动补齐数据。
            </p>
          </div>
          <div className="flex gap-4">
            <div className="p-6 bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 text-center min-w-[120px]">
              <p className="text-indigo-400 text-[10px] font-bold uppercase tracking-widest mb-1">运行环境</p>
              <p className="text-xl font-black">Cloud Sync</p>
            </div>
            <div className="p-6 bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 text-center min-w-[120px]">
              <p className="text-indigo-400 text-[10px] font-bold uppercase tracking-widest mb-1">数据状态</p>
              <p className="text-xl font-black">双向同步</p>
            </div>
          </div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Package, 
  Users, 
  AlertTriangle 
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { format, startOfDay, subDays, isSameDay } from 'date-fns';

export default function Dashboard() {
  const products = useLiveQuery(async () => {
    return await db.products.where('isDeleted').notEqual(1).toArray();
  }) || [];
  const orders = useLiveQuery(async () => {
    return await db.orders.where('isDeleted').notEqual(1).toArray();
  }) || [];
  const customers = useLiveQuery(async () => {
    return await db.customers.where('isDeleted').notEqual(1).toArray();
  }) || [];

  // Stats calculations
  const today = startOfDay(new Date());
  const todayOrders = orders.filter(o => isSameDay(new Date(o.createdAt), today));
  const todaySales = todayOrders.reduce((sum, o) => sum + o.finalAmount, 0);
  
  const lowStockProducts = products.filter(p => p.stock <= p.minStock);
  const totalStockValue = products.reduce((sum, p) => sum + (p.stock * p.wholesalePrice), 0);
  const totalDebt = customers.reduce((sum, c) => sum + c.debt, 0);

  // Chart data: Last 7 days sales
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const date = subDays(today, 6 - i);
    const dayOrders = orders.filter(o => isSameDay(new Date(o.createdAt), date));
    return {
      name: format(date, 'MM-dd'),
      sales: dayOrders.reduce((sum, o) => sum + o.finalAmount, 0)
    };
  });

  const stats = [
    { label: '今日销售额', value: `¥${(todaySales || 0).toFixed(1)}`, icon: DollarSign, color: 'bg-emerald-500', trend: '+12.5%' },
    { label: '库存预警', value: lowStockProducts.length, icon: AlertTriangle, color: 'bg-amber-500', trend: '需补货' },
    { label: '库存总值', value: `¥${(totalStockValue || 0).toFixed(1)}`, icon: Package, color: 'bg-blue-500', trend: '资产' },
    { label: '待收欠款', value: `¥${(totalDebt || 0).toFixed(1)}`, icon: Users, color: 'bg-rose-500', trend: '风险' },
  ];

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className={`w-12 h-12 ${stat.color} rounded-xl flex items-center justify-center text-white shadow-lg`}>
              <stat.icon size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">{stat.label}</p>
              <h3 className="text-2xl font-bold text-slate-800">{stat.value}</h3>
              <p className={`text-xs mt-1 font-semibold ${stat.trend.includes('+') ? 'text-emerald-600' : 'text-slate-400'}`}>
                {stat.trend}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sales Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-slate-800">近7日销售趋势</h3>
              <p className="text-sm text-slate-400">销售额数据统计</p>
            </div>
            <div className="flex gap-2">
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                <TrendingUp size={12} /> 增长中
              </span>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={last7Days}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low Stock List */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-6">库存预警</h3>
          <div className="space-y-4">
            {lowStockProducts.length > 0 ? (
              lowStockProducts.slice(0, 6).map((product) => (
                <div key={product.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-200">
                      <Package size={20} className="text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">{product.name}</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">{product.code}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-rose-500">
                      {product.pricingMethod === 'weight' ? product.stock.toFixed(1) : Math.floor(product.stock)} {product.unit}
                    </p>
                    <p className="text-[10px] text-slate-400">预警值: {product.minStock}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                <Package size={48} className="mb-2 opacity-20" />
                <p className="text-sm">暂无库存预警</p>
              </div>
            )}
          </div>
          {lowStockProducts.length > 6 && (
            <button className="w-full mt-6 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
              查看全部 {lowStockProducts.length} 个预警
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { motion } from 'motion/react';
import { X, Printer, Download, FileDown } from 'lucide-react';
import { format } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Order, Customer } from '../types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface OrderPrintPreviewProps {
  order: Order;
  onClose: () => void;
}

export default function OrderPrintPreview({ order, onClose }: OrderPrintPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const customer = useLiveQuery(
    () => (order.customerId ? db.customers.get(order.customerId) : Promise.resolve(null)),
    [order.customerId]
  );

  const handlePrint = () => {
    window.dispatchEvent(new CustomEvent('app-print-order', { detail: order }));
  };

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;

    try {
      const element = printRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
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

      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`销售清单_${order.orderNo}.pdf`);
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert('生成PDF失败，请重试');
    }
  };

  const items = order.items || [];
  const totalRows = 14;
  // 构造显示列表，将押桶/退桶信息作为特殊行加入表格
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md print:hidden" onClick={onClose}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-8 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
              <Printer size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">打印单预览</h3>
              <p className="text-xs text-slate-500 font-medium">单号: {order.orderNo}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 font-bold rounded-xl hover:bg-emerald-100 transition-all border border-emerald-100"
            >
              <FileDown size={18} />
              <span>下载 PDF</span>
            </button>
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
            >
              <Printer size={18} />
              <span>立即打印</span>
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors ml-2">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Preview Area */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-200/50 flex justify-center">
          <div 
            ref={printRef}
            className="bg-white shadow-xl origin-top"
            style={{ 
              width: '148mm', 
              minHeight: '210mm',
              color: 'black',
              fontFamily: '"宋体", "SimSun", serif',
              padding: '8mm',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box'
            }}
          >
            <style>{`
              @media print {
                @page {
                  size: A5 portrait;
                  margin: 0;
                }
                body {
                  margin: 0;
                  padding: 0;
                }
                .print-area-preview {
                  width: 148mm;
                  height: 210mm;
                  padding: 8mm;
                  box-sizing: border-box;
                }
              }
            `}</style>
            {/* Header Table */}
            <table style={{ width: '100%', marginBottom: '15pt', borderCollapse: 'collapse', border: 'none' }}>
              <tbody>
                <tr>
                  <td style={{ width: '25%', border: 'none' }}></td>
                  <td style={{ width: '50%', textAlign: 'center', verticalAlign: 'bottom', border: 'none' }}>
                    <h1 style={{ 
                      fontSize: '20pt', 
                      fontWeight: 'bold', 
                      letterSpacing: '4pt', 
                      margin: 0, 
                      borderBottom: '2pt solid black', 
                      paddingBottom: '4pt', 
                      display: 'inline-block',
                      whiteSpace: 'nowrap',
                      lineHeight: '1.2'
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
                    whiteSpace: 'nowrap',
                    border: 'none'
                  }}>
                    <p style={{ margin: 0 }}>NO：{order.orderNo.replace('SO', '')}</p>
                    <p style={{ margin: 0 }}>开单日期：{format(new Date(order.createdAt), 'yyyy-MM-dd')}</p>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Customer Info Table */}
            <table style={{ width: '100%', marginBottom: '8pt', borderCollapse: 'collapse', border: 'none', borderBottom: '1pt solid black', paddingBottom: '6pt' }}>
              <tbody>
                <tr>
                  <td style={{ textAlign: 'left', fontSize: '10pt', border: 'none' }}>
                    客户名称：<span style={{ fontWeight: 'bold', borderBottom: '1pt solid black', padding: '0 40pt' }}>{order.customerName}</span>
                  </td>
                </tr>
              </tbody>
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
                  <tr key={i} style={{ height: '22pt', backgroundColor: item.isBucket ? '#fefce8' : 'transparent' }}>
                    <td style={{ border: '1pt solid black', textAlign: 'center' }}>{item.productId === -1 ? '' : (item.isBucket ? '*' : i + 1)}</td>
                    <td style={{ border: '1pt solid black', padding: '0 4pt', fontWeight: 'bold' }}>
                      {item.isBucket ? <span style={{ color: '#854d0e' }}>{item.name}</span> : item.name}
                    </td>
                    <td style={{ border: '1pt solid black', textAlign: 'center' }}>
                      {item.productId === -1 ? '' : (
                        <>
                          {item.isBucket ? item.quantity : (item.pricingMethod === 'weight' ? item.quantity.toFixed(1) : Math.floor(item.quantity))}
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

            <table style={{ width: '100%', fontSize: '10pt', lineHeight: '1.8', marginTop: '10pt', marginBottom: '10pt', borderCollapse: 'collapse', border: 'none' }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 'bold', paddingBottom: '4pt', border: 'none' }}>主营：鸡、鸭、鸡血、鸭血、盒装鸭血、鸡鸭副产、鸡鲜品、宫保鸡丁、鱼块等</td>
                </tr>
                <tr>
                  <td style={{ paddingBottom: '4pt', fontSize: '9pt', color: '#475569', border: 'none' }}>
                    <span style={{ fontWeight: 'bold', color: '#1e293b' }}>[桶账汇总]</span> 
                    &nbsp;本次押桶：{order.bucketsOut || 0} | 本次还桶：{order.bucketsIn || 0} | 
                    &nbsp;剩余未退：<span style={{ color: '#e11d48', fontWeight: 'bold' }}>{((customer?.bucketsOut || 0) - (customer?.bucketsIn || 0))}</span> 个
                  </td>
                </tr>
                <tr>
                  <td style={{ paddingBottom: '4pt', border: 'none' }}>地址：新发地A2-046 席立志冷库</td>
                </tr>
                <tr>
                  <td style={{ border: 'none' }}>电话：席立志 13966869019  陈影 13637198664</td>
                </tr>
              </tbody>
            </table>

            <div style={{ marginTop: 'auto', fontSize: '11pt', borderTop: '1pt dashed #cbd5e1', paddingTop: '10pt', textAlign: 'center', fontWeight: 'bold' }}>
              <p style={{ margin: 0 }}>感谢您的惠顾，欢迎下次光临！</p>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="px-8 py-3 bg-amber-50 border-t border-amber-100 flex items-center gap-2 text-amber-700 text-xs shrink-0">
          <Printer size={14} />
          <span>提示：预览效果与实际打印效果一致。如需保存，请点击“下载 PDF”。</span>
        </div>
      </motion.div>
    </div>
  );
}

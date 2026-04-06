/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Product {
  id?: number;
  appwriteId?: string;
  updatedAt?: string;
  sync_status?: number; // 0: synced, 1: dirty
  isDeleted?: number;
  code: string;
  name: string;
  pinyin: string; // For searching
  category: string;
  image?: string;
  purchasePrice: number; // 进货价格
  wholesalePrice: number; // 批发价格 (Price 1)
  price2: number; // 价格 2
  price3: number; // 价格 3
  retailPrice: number;
  weight: number; // in kg
  unit: string;
  pricingMethod: 'piece' | 'weight'; // 计价方式: 按件卖 | 按斤卖
  stock: number;
  minStock: number;
  searchCount?: number; // 搜索频次统计
  history: { date: string; price: number; stock: number }[];
}

export interface Customer {
  id?: number;
  appwriteId?: string;
  updatedAt?: string;
  sync_status?: number;
  isDeleted?: number;
  name: string;
  pinyin: string; // For searching
  phone: string;
  address?: string;
  debt: number; // 欠款
  totalSpent: number;
  bucketsOut: number; // 累计押桶
  bucketsIn: number;  // 累计还桶
  createdAt: string;
}

export interface OrderItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  pricingMethod?: 'piece' | 'weight';
  total: number;
}

export interface Order {
  id?: number;
  appwriteId?: string;
  updatedAt?: string;
  sync_status?: number;
  isDeleted?: number;
  orderNo: string;
  customerId?: number;
  customerName: string;
  items: OrderItem[];
  totalAmount: number;
  discount: number;
  bucketsOut: number; // 本次押桶
  bucketsIn: number;  // 本次还桶
  depositAmount: number; // 本次押金金额 (bucketsOut - bucketsIn) * 20
  finalAmount: number;
  paymentMethod: '现金' | '微信' | '支付宝' | '欠款';
  status: '已支付' | '待支付' | '草稿';
  createdAt: string;
}

export interface OperationLog {
  id?: number;
  appwriteId?: string;
  updatedAt?: string;
  sync_status?: number;
  isDeleted?: number;
  user: string;
  action: string;
  details: string;
  createdAt: string;
}

export interface Repayment {
  id?: number;
  appwriteId?: string;
  updatedAt?: string;
  sync_status?: number;
  isDeleted?: number;
  customerId: number;
  customerName: string;
  amount: number;
  method: '现金' | '微信' | '支付宝';
  createdAt: string;
}

export interface SearchHistory {
  id?: number;
  keyword: string;
  count: number;
  updatedAt: string;
}

export interface StockMovement {
  id?: number;
  appwriteId?: string;
  updatedAt?: string;
  sync_status?: number;
  isDeleted?: number;
  productId: number;
  productName: string;
  type: '入库' | '出库' | '盘点' | '销售' | '退货';
  quantity: number;
  previousStock: number;
  currentStock: number;
  reason: string;
  operator: string;
  createdAt: string;
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Dexie, { type Table } from 'dexie';
import type { Product, Customer, Order, OperationLog, StockMovement, Repayment, SearchHistory } from './types';

export class MyDatabase extends Dexie {
  products!: Table<Product>;
  customers!: Table<Customer>;
  orders!: Table<Order>;
  logs!: Table<OperationLog>;
  stockMovements!: Table<StockMovement>;
  repayments!: Table<Repayment>;
  searchHistory!: Table<SearchHistory>;
  syncStatus!: Table<{ key: string; lastSync: string }>;

  constructor() {
    super('FrozenFoodERP_V2');
    this.version(1).stores({
      products: '++id, code, name, pinyin, category',
      customers: '++id, name, phone',
      orders: '++id, orderNo, customerId, customerName, status, createdAt',
      logs: '++id, user, action, createdAt',
      stockMovements: '++id, productId, productName, type, createdAt',
    });
    this.version(2).stores({
      products: '++id, code, name, pinyin, category, updatedAt, isDeleted, appwriteId',
      customers: '++id, name, phone, updatedAt, isDeleted, appwriteId',
      orders: '++id, orderNo, customerId, customerName, status, createdAt, updatedAt, isDeleted, appwriteId',
      logs: '++id, user, action, createdAt, updatedAt, isDeleted, appwriteId',
      stockMovements: '++id, productId, productName, type, createdAt, updatedAt, isDeleted, appwriteId',
      syncStatus: 'key',
    });
    this.version(3).stores({
      products: '++id, code, name, pinyin, category, updatedAt, isDeleted, appwriteId',
      customers: '++id, name, pinyin, phone, updatedAt, isDeleted, appwriteId',
      orders: '++id, orderNo, customerId, customerName, status, createdAt, updatedAt, isDeleted, appwriteId',
      logs: '++id, user, action, createdAt, updatedAt, isDeleted, appwriteId',
      stockMovements: '++id, productId, productName, type, createdAt, updatedAt, isDeleted, appwriteId',
      repayments: '++id, customerId, customerName, method, createdAt, updatedAt, isDeleted, appwriteId',
      searchHistory: '++id, keyword, updatedAt',
      syncStatus: 'key',
    });

    // Auto-set updatedAt on any change
    const setUpdatedAt = (mods: any, primKey: any, obj: any) => {
      // Only set updatedAt if it's not already being set (prevents sync loops)
      if (!mods.updatedAt) {
        mods.updatedAt = new Date().toISOString();
      }
    };

    const setCreatedAt = (primKey: any, obj: any) => {
      if (!obj.updatedAt) {
        obj.updatedAt = new Date().toISOString();
      }
      // Use 0/1 for isDeleted to ensure reliable indexing
      obj.isDeleted = 0;
    };

    ['products', 'customers', 'orders', 'logs', 'stockMovements', 'repayments', 'searchHistory'].forEach(table => {
      (this as any)[table].hook('creating', setCreatedAt);
      (this as any)[table].hook('updating', setUpdatedAt);
    });
  }
}

export const db = new MyDatabase();

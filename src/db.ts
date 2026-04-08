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
    this.version(5).stores({
      products: '++id, code, name, pinyin, category, updatedAt, isDeleted, appwriteId, sync_status',
      customers: '++id, name, pinyin, phone, updatedAt, isDeleted, appwriteId, sync_status',
      orders: '++id, orderNo, customerId, customerName, status, createdAt, updatedAt, isDeleted, appwriteId, sync_status',
      logs: '++id, user, action, createdAt, updatedAt, isDeleted, appwriteId, sync_status',
      stockMovements: '++id, productId, productName, type, createdAt, updatedAt, isDeleted, appwriteId, sync_status',
      repayments: '++id, customerId, customerName, method, createdAt, updatedAt, isDeleted, appwriteId, sync_status',
      searchHistory: '++id, keyword, updatedAt',
      syncStatus: 'key',
    }).upgrade(async (tx) => {
      // Initialize sync_status and isDeleted for all records during migration
      const tables = ['products', 'customers', 'orders', 'logs', 'stockMovements', 'repayments'];
      for (const tableName of tables) {
        await tx.table(tableName).toCollection().modify(obj => {
          if (obj.sync_status === undefined) {
            // If it has an appwriteId, assume it was synced, otherwise it's dirty
            obj.sync_status = obj.appwriteId ? 0 : 1;
          }
          if (obj.isDeleted === undefined) {
            obj.isDeleted = 0;
          }
        });
      }
    });

    // Auto-set updatedAt and sync_status on any change
    const setUpdatedAt = (mods: any, primKey: any, obj: any) => {
      // If _isSync is present, it means the update is from the sync service
      if (mods._isSync) {
        delete mods._isSync;
        // When syncing from cloud, we mark as synced (0)
        if (mods.sync_status === undefined) {
          mods.sync_status = 0;
        }
        return;
      }
      
      // Local change: mark as dirty (1) and update timestamp
      mods.sync_status = 1;
      mods.updatedAt = new Date().toISOString();
    };

    const setCreatedAt = (primKey: any, obj: any) => {
      if (obj._isSync) {
        delete obj._isSync;
        if (obj.sync_status === undefined) obj.sync_status = 0;
      } else {
        obj.sync_status = 1;
      }

      obj.updatedAt = new Date().toISOString();
      // Use 0/1 for isDeleted to ensure reliable indexing
      if (obj.isDeleted === undefined) obj.isDeleted = 0;
    };

    ['products', 'customers', 'orders', 'logs', 'stockMovements', 'repayments', 'searchHistory'].forEach(table => {
      (this as any)[table].hook('creating', setCreatedAt);
      (this as any)[table].hook('updating', setUpdatedAt);
    });
  }
}

export const db = new MyDatabase();

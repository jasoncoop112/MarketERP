/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ID, Query } from 'appwrite';
import { db } from '../db';
import { databases, DATABASE_ID, COLLECTIONS, storage, BUCKET_ID, account } from '../appwrite';
import type { Product, Customer, Order, OperationLog, StockMovement } from '../types';

export class SyncService {
    private static isSyncing = false;
    private static sessionInitialized = false;
    private static lastSyncResults: Record<string, { success: boolean; error?: string }> = {};

    static getLastSyncResults() {
        return this.lastSyncResults;
    }

    private static async initSession() {
        if (this.sessionInitialized) return;
        try {
            await account.get();
            this.sessionInitialized = true;
            console.log('Appwrite Session Active');
        } catch (error: any) {
            try {
                await account.createAnonymousSession();
                this.sessionInitialized = true;
                console.log('Appwrite Anonymous Session Created');
            } catch (sessionError: any) {
                console.error('Appwrite Session Initialization Failed:', sessionError);
                throw sessionError;
            }
        }
    }

    static async checkConnection(): Promise<{ database: boolean; storage: boolean; error?: string; diagnostics?: string[] }> {
        const status = { database: false, storage: false, error: '', diagnostics: [] as string[] };
        const origin = window.location.origin;
        
        status.diagnostics.push(`[1] 正在检查网络环境... (Origin: ${origin})`);
        
        try {
            await this.initSession();
            status.diagnostics.push(`[2] 会话初始化成功 (Session Active)`);
        } catch (e: any) {
            const errorMsg = e.message || String(e);
            status.diagnostics.push(`[2] 会话初始化失败: ${errorMsg}`);
            status.error = errorMsg;
            return status;
        }

        try {
            status.diagnostics.push(`[3] 正在验证数据库 ID: ${DATABASE_ID}...`);
            await databases.listDocuments(DATABASE_ID, COLLECTIONS.PRODUCTS, [Query.limit(1)]);
            status.database = true;
            status.diagnostics.push(`[4] 数据库与集合验证成功`);
        } catch (error: any) {
            console.error('Appwrite Database Connection Failed:', error);
            const errorMsg = error.message || String(error);
            status.error = errorMsg;
            status.diagnostics.push(`[3] 失败: ${errorMsg}`);
        }

        try {
            status.diagnostics.push(`[5] 正在验证存储桶 ID: ${BUCKET_ID}...`);
            await storage.listFiles(BUCKET_ID, [Query.limit(1)]);
            status.storage = true;
            status.diagnostics.push(`[6] 存储空间验证成功`);
        } catch (error: any) {
            const errorMsg = error.message || String(error);
            status.diagnostics.push(`[5] 存储验证失败: ${errorMsg}`);
        }

        return status;
    }

    // 触发同步（兼容旧调用）
    static async triggerSync() {
        console.log('🚀 触发同步...');
        this.syncAll().catch(err => console.error('后台同步失败:', err));
    }

    static async syncAll() {
        if (this.isSyncing) return;
        this.isSyncing = true;
        console.log('🔄 开始全量同步...');
        let hasError = false;
        const results: Record<string, { success: boolean; error?: string }> = {};
        
        try {
            await this.initSession();

            const tables: [string, string][] = [
                ['products', COLLECTIONS.PRODUCTS],
                ['customers', COLLECTIONS.CUSTOMERS],
                ['orders', COLLECTIONS.ORDERS],
                ['logs', COLLECTIONS.LOGS],
                ['stockMovements', COLLECTIONS.STOCK_MOVEMENTS],
                ['repayments', COLLECTIONS.REPAYMENTS]
            ];

            for (const [tableName, collectionId] of tables) {
                try {
                    console.log(`Syncing table: ${tableName}...`);
                    await this.syncTable(tableName, collectionId);
                    results[tableName] = { success: true };
                    console.log(`Successfully synced table: ${tableName}`);
                } catch (tableError: any) {
                    hasError = true;
                    const errorMsg = tableError.message || String(tableError);
                    results[tableName] = { success: false, error: errorMsg };
                    
                    if (tableError.code === 404) {
                        console.warn(`⚠️ 集合 [${collectionId}] 不存在，已跳过。`);
                    } else if (tableError.code === 401) {
                        console.error(`❌ [${tableName}] 权限不足 (401): 请在 Appwrite 控制台为该集合开启 'Any' 角色的所有权限。`);
                    } else {
                        console.error(`❌ [${tableName}] 同步失败:`, tableError);
                    }
                }
            }
            
            this.lastSyncResults = results;
            
            if (hasError) {
                const failedTables = Object.entries(results)
                    .filter(([_, res]) => !res.success)
                    .map(([name, _]) => name)
                    .join(', ');
                throw new Error(`部分数据表同步失败: ${failedTables}`);
            }
            
            await db.syncStatus.put({ key: 'lastSync', lastSync: new Date().toISOString() });
            console.log('✅ 全量同步完成');
        } catch (error) {
            console.error('❌ 同步服务异常:', error);
            throw error; // 抛出错误以便 UI 捕获
        } finally {
            this.isSyncing = false;
        }
    }

    private static async syncTable(tableName: string, collectionId: string) {
        const table = (db as any)[tableName];
        if (!table) return;

        const syncKey = `lastSync_${tableName}`;
        const lastSyncState = await db.syncStatus.get(syncKey).catch(() => null);
        const lastSyncTime = lastSyncState?.lastSync || new Date(0).toISOString();
        
        // 1. 推送本地变更
        const localChanges = await table.where('updatedAt').above(lastSyncTime).toArray().catch(() => []);
        if (localChanges.length > 0) {
            console.log(`Pushing ${localChanges.length} changes for ${tableName}`);
            for (const item of localChanges) {
                try {
                    const { id, appwriteId, ...data } = item;
                    const preparedData = this.prepareForAppwrite(tableName, data);

                    if (appwriteId) {
                        await databases.updateDocument(DATABASE_ID, collectionId, appwriteId, preparedData);
                    } else {
                        // 尝试通过业务 ID 匹配云端（防止重复创建）
                        let existingDocId = null;
                        const searchField = data.orderNo ? 'orderNo' : (data.code ? 'code' : (data.name ? 'name' : null));
                        const searchValue = data.orderNo || data.code || data.name;

                        if (searchField && searchValue) {
                            try {
                                const existing = await databases.listDocuments(DATABASE_ID, collectionId, [
                                    Query.equal(searchField, searchValue),
                                    Query.limit(1)
                                ]);
                                if (existing.total > 0) {
                                    existingDocId = existing.documents[0].$id;
                                    console.log(`Found existing cloud doc for ${tableName} via ${searchField}: ${existingDocId}`);
                                }
                            } catch (searchError: any) {
                                // If search fails, it might be due to missing index
                                if (searchError.code === 400 && searchError.message?.includes('index')) {
                                    console.error(`Appwrite Index Missing for ${tableName}.${searchField}. Please create an index in Appwrite console.`);
                                } else {
                                    console.warn(`Search failed for ${tableName}:`, searchError.message);
                                }
                            }
                        }

                        if (existingDocId) {
                            await databases.updateDocument(DATABASE_ID, collectionId, existingDocId, preparedData);
                            await table.update(id, { appwriteId: existingDocId });
                        } else {
                            const doc = await databases.createDocument(DATABASE_ID, collectionId, ID.unique(), preparedData);
                            await table.update(id, { appwriteId: doc.$id });
                        }
                    }
                } catch (err: any) {
                    console.error(`Push error for ${tableName}:`, err);
                    throw err; // 向上抛出，让 syncAll 捕获
                }
            }
        }

        // 2. 拉取云端变更
        try {
            const pullStartTime = new Date(new Date(lastSyncTime).getTime() - 5 * 60 * 1000).toISOString();
            const response = await databases.listDocuments(DATABASE_ID, collectionId, [
                Query.greaterThan('$updatedAt', pullStartTime),
                Query.limit(100)
            ]);

            for (const doc of response.documents) {
                const data = this.prepareFromAppwrite(doc);
                // 增强去重逻辑
                const localItem = await table.where('appwriteId').equals(doc.$id).first()
                    || (data.orderNo ? await table.where('orderNo').equals(data.orderNo).first() : null)
                    || (data.code ? await table.where('code').equals(data.code).first() : null)
                    || (tableName === 'customers' && data.name ? await table.where('name').equals(data.name).first() : null);

                if (localItem) {
                    if (new Date(doc.$updatedAt) > new Date(localItem.updatedAt)) {
                        await table.update(localItem.id, { ...data, appwriteId: doc.$id });
                    } else if (!localItem.appwriteId) {
                        await table.update(localItem.id, { appwriteId: doc.$id });
                    }
                } else {
                    await table.add({ ...data, appwriteId: doc.$id, isDeleted: data.isDeleted ?? 0 });
                }
            }
        } catch (e: any) {
            console.error(`Pull error for ${tableName}:`, e);
            if (e.code !== 404) throw e;
        }

        await db.syncStatus.put({ key: syncKey, lastSync: new Date().toISOString() });
    }

    private static prepareForAppwrite(tableName: string, item: any) {
        const data = { ...item };
        delete data.id;
        delete data.appwriteId;
        delete data.sync_status;
        
        // 强制转换数值，防止 Appwrite 报错
        const numericFields = [
            'purchasePrice', 'wholesalePrice', 'retailPrice', 'price2', 'price3', 
            'stock', 'minStock', 'debt', 'totalSpent', 'amount', 'quantity', 
            'totalAmount', 'discount', 'finalAmount', 'bucketsOut', 'bucketsIn', 'depositAmount',
            'receivedAmount', 'previousStock', 'currentStock', 'searchCount'
        ];
        numericFields.forEach(f => {
            if (data[f] !== undefined && data[f] !== null) {
                data[f] = Number(data[f]) || 0;
            }
        });

        if (data.history && typeof data.history !== 'string') data.history = JSON.stringify(data.history);
        if (data.items && typeof data.items !== 'string') data.items = JSON.stringify(data.items);
        return data;
    }

    private static prepareFromAppwrite(doc: any) {
        const { $id, $updatedAt, $createdAt, ...data } = doc;
        const prepared = { 
            ...data, 
            appwriteId: $id, 
            updatedAt: $updatedAt,
            createdAt: data.createdAt || $createdAt
        };
        try {
            if (prepared.history && typeof prepared.history === 'string') prepared.history = JSON.parse(prepared.history);
            if (prepared.items && typeof prepared.items === 'string') prepared.items = JSON.parse(prepared.items);
        } catch (e) {}
        return prepared;
    }
}

export const syncService = SyncService;

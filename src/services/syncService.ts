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
    private static syncStatus: 'idle' | 'syncing' | 'error' = 'idle';
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

    static async syncAll(): Promise<boolean> {
        if (this.isSyncing) return false;
        this.isSyncing = true;
        this.syncStatus = 'syncing';
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
            this.syncStatus = hasError ? 'error' : 'idle';
            
            if (hasError) {
                const failedTables = Object.entries(results)
                    .filter(([_, res]) => !res.success)
                    .map(([name, _]) => name)
                    .join(', ');
                throw new Error(`部分数据表同步失败: ${failedTables}`);
            }
            
            await db.syncStatus.put({ key: 'lastSync', lastSync: new Date().toISOString() });
            console.log('✅ 全量同步完成');
            return true;
        } catch (error) {
            console.error('❌ 同步服务异常:', error);
            this.syncStatus = 'error';
            throw error; // 抛出错误以便 UI 捕获
        } finally {
            this.isSyncing = false;
        }
    }

    static async resetSync() {
        console.log('🧹 重置同步状态...');
        await db.syncStatus.clear();
        console.log('✅ 同步状态已重置，下次将进行全量拉取。');
    }

    private static async syncTable(tableName: string, collectionId: string) {
        const table = (db as any)[tableName];
        if (!table) return;

        // 分离推送和拉取的检查点，彻底解决时钟偏差问题
        const pushKey = `lastPush_${tableName}`;
        const pullKey = `lastPull_${tableName}`;
        
        const lastPushState = await db.syncStatus.get(pushKey).catch(() => null);
        const lastPullState = await db.syncStatus.get(pullKey).catch(() => null);
        
        // 推送使用本地时间，拉取使用服务器时间
        const lastPushTime = lastPushState?.lastSync || new Date(0).toISOString();
        const lastPullTime = lastPullState?.lastSync || new Date(0).toISOString();
        const isFullSync = lastPullTime === new Date(0).toISOString();

        // 记录本次同步开始的本地时间，用于更新 pushKey
        const currentSyncLocalTime = new Date().toISOString();
        
        // 1. 推送本地变更 (对比本地最后推送时间)
        const localChanges = await table.where('updatedAt').above(lastPushTime).toArray().catch(() => []);
        if (localChanges.length > 0) {
            console.log(`[Sync] Pushing ${localChanges.length} changes for ${tableName}`);
            for (const item of localChanges) {
                try {
                    const { id, appwriteId, ...data } = item;
                    
                    // 处理图片上传
                    if (tableName === 'products' && data.image && data.image.startsWith('data:image')) {
                        try {
                            const fileId = await this.uploadImage(data.image);
                            data.image = fileId;
                            await table.update(id, { image: fileId, _isSync: true });
                        } catch (uploadErr) {
                            console.error('Image upload failed during sync:', uploadErr);
                        }
                    }

                    const preparedData = this.prepareForAppwrite(tableName, data);

                    const pushToAppwrite = async (payload: any, retryCount = 0): Promise<any> => {
                        try {
                            if (appwriteId) {
                                return await databases.updateDocument(DATABASE_ID, collectionId, appwriteId, payload);
                            } else {
                                // 尝试通过业务 ID 匹配云端
                                let existingDocId = null;
                                const searchField = payload.orderNo ? 'orderNo' : (payload.code ? 'code' : (payload.name ? 'name' : null));
                                const searchValue = payload.orderNo || payload.code || payload.name;

                                if (searchField && searchValue) {
                                    try {
                                        const existing = await databases.listDocuments(DATABASE_ID, collectionId, [
                                            Query.equal(searchField, searchValue),
                                            Query.limit(1)
                                        ]);
                                        if (existing.total > 0) {
                                            existingDocId = existing.documents[0].$id;
                                        }
                                    } catch (searchError) {}
                                }

                                if (existingDocId) {
                                    return await databases.updateDocument(DATABASE_ID, collectionId, existingDocId, payload);
                                } else {
                                    return await databases.createDocument(DATABASE_ID, collectionId, ID.unique(), payload);
                                }
                            }
                        } catch (err: any) {
                            const unknownAttrMatch = err.message?.match(/Unknown attribute: "([^"]+)"/);
                            if (unknownAttrMatch && retryCount < 5) {
                                const attrName = unknownAttrMatch[1];
                                const newPayload = { ...payload };
                                delete newPayload[attrName];
                                return await pushToAppwrite(newPayload, retryCount + 1);
                            }
                            throw err;
                        }
                    };

                    const doc = await pushToAppwrite(preparedData);
                    // 推送成功后，将本地记录同步为服务器状态
                    await table.update(id, { 
                        appwriteId: doc.$id, 
                        _isSync: true,
                        updatedAt: doc.$updatedAt // 同步为服务器时间
                    });
                } catch (err: any) {
                    console.error(`[Sync] Failed to push item ${item.id} in ${tableName}:`, err);
                }
            }
            // 更新本地推送检查点
            await db.syncStatus.put({ key: pushKey, lastSync: currentSyncLocalTime });
        }

        // 2. 拉取云端变更 (对比服务器最后更新时间)
        try {
            const pullStartTime = new Date(new Date(lastPullTime).getTime() - 5 * 60 * 1000).toISOString();
            let offset = 0;
            let hasMore = true;
            let maxServerUpdatedAt = lastPullTime;

            while (hasMore) {
                const response = await databases.listDocuments(DATABASE_ID, collectionId, [
                    Query.greaterThan('$updatedAt', pullStartTime),
                    Query.limit(100),
                    Query.offset(offset)
                ]);

                if (response.documents.length === 0) break;

                for (const doc of response.documents) {
                    if (doc.$updatedAt > maxServerUpdatedAt) maxServerUpdatedAt = doc.$updatedAt;
                    
                    const data = this.prepareFromAppwrite(doc);
                    const localItem = await table.where('appwriteId').equals(doc.$id).first()
                        || (data.orderNo ? await table.where('orderNo').equals(data.orderNo).first() : null)
                        || (data.code ? await table.where('code').equals(data.code).first() : null)
                        || (tableName === 'customers' && data.name ? await table.where('name').equals(data.name).first() : null);

                    if (localItem) {
                        const serverTime = new Date(doc.$updatedAt).getTime();
                        const localTime = localItem.updatedAt ? new Date(localItem.updatedAt).getTime() : 0;
                        
                        // 强制更新条件：
                        // 1. 处于全量同步模式 (isFullSync)
                        // 2. 服务器时间晚于本地时间
                        // 3. 本地还没有 appwriteId
                        if (isFullSync || isNaN(localTime) || serverTime > localTime || !localItem.appwriteId) {
                            await table.update(localItem.id, { ...data, appwriteId: doc.$id, _isSync: true });
                        }
                    } else {
                        const { id: _, ...newData } = data;
                        await table.put({ ...newData, appwriteId: doc.$id, isDeleted: data.isDeleted ?? 0 });
                    }
                }

                offset += response.documents.length;
                if (offset >= response.total) hasMore = false;
            }
            
            // 更新服务器拉取检查点
            await db.syncStatus.put({ key: pullKey, lastSync: maxServerUpdatedAt });
        } catch (e: any) {
            console.error(`[Sync] Pull error for ${tableName}:`, e);
            if (e.code !== 404) throw e;
        }
    }

    private static async uploadImage(base64: string): Promise<string> {
        const blob = await (await fetch(base64)).blob();
        const file = new File([blob], `product_${Date.now()}.png`, { type: 'image/png' });
        const uploaded = await storage.createFile(BUCKET_ID, ID.unique(), file);
        return uploaded.$id;
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
            'receivedAmount', 'previousStock', 'currentStock', 'searchCount',
            'customerId', 'productId', 'isDeleted'
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
        const { $id, $updatedAt, $createdAt, $collectionId, $databaseId, $permissions, ...data } = doc;
        const prepared = { 
            ...data, 
            appwriteId: $id, 
            updatedAt: $updatedAt,
            createdAt: data.createdAt || $createdAt
        };
        
        // 移除可能带入的本地 ID，防止冲突
        delete (prepared as any).id;

        try {
            if (prepared.history && typeof prepared.history === 'string') prepared.history = JSON.parse(prepared.history);
            if (prepared.items && typeof prepared.items === 'string') prepared.items = JSON.parse(prepared.items);
        } catch (e) {}
        return prepared;
    }
}

export const syncService = SyncService;

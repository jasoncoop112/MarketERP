/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ID, Query } from 'appwrite';
import { db } from '../db';
import { databases, DATABASE_ID, COLLECTIONS, storage, BUCKET_ID, account } from '../appwrite';
import type { Product, Customer, Order, OperationLog, StockMovement } from '../types';

class SyncService {
    private isSyncing = false;
    private sessionInitialized = false;

    private async initSession() {
        if (this.sessionInitialized) return;
        try {
            // Check if session already exists
            await account.get();
            this.sessionInitialized = true;
            console.log('Appwrite Session Active');
        } catch (error: any) {
            const isNetworkError = error.message?.includes('Failed to fetch') || String(error).includes('Failed to fetch');
            
            if (isNetworkError) {
                const currentOrigin = window.location.origin;
                console.error(`Appwrite Network Error: Failed to fetch. 
                    This is likely a CORS/Domain issue. 
                    Please ensure ${currentOrigin} is added to your Appwrite Project Platforms.`);
                // We don't return early here, we still try createAnonymousSession just in case, 
                // but it will likely fail with the same error.
            }

            try {
                // Create anonymous session if none exists
                await account.createAnonymousSession();
                this.sessionInitialized = true;
                console.log('Appwrite Anonymous Session Created');
            } catch (sessionError: any) {
                console.error('Appwrite Session Initialization Failed:', sessionError);
                if (sessionError.message?.includes('Failed to fetch') || String(sessionError).includes('Failed to fetch')) {
                    const currentOrigin = window.location.origin;
                    const msg = `CRITICAL: Failed to fetch. Please add ${currentOrigin} to Appwrite -> Settings -> Platforms -> Web App.`;
                    console.warn(msg);
                    throw new Error(msg);
                }
                throw sessionError;
            }
        }
    }

    async checkConnection(): Promise<{ database: boolean; storage: boolean; error?: string; diagnostics?: string[] }> {
        const status = { database: false, storage: false, error: '', diagnostics: [] as string[] };
        const origin = window.location.origin;
        
        status.diagnostics.push(`[1] 正在检查网络环境... (Origin: ${origin})`);
        
        try {
            await this.initSession();
            status.diagnostics.push(`[2] 会话初始化成功 (Session Active)`);
        } catch (e: any) {
            const errorMsg = e.message || String(e);
            status.diagnostics.push(`[2] 会话初始化失败: ${errorMsg}`);
            if (errorMsg.includes('Failed to fetch')) {
                status.diagnostics.push(`建议: 检查 Appwrite 后台 Settings -> Platforms 是否添加了 ${origin}`);
            }
            status.error = errorMsg;
            return status;
        }

        try {
            status.diagnostics.push(`[3] 正在验证数据库 ID: ${DATABASE_ID}...`);
            // Try to list documents from products collection as a test
            await databases.listDocuments(DATABASE_ID, COLLECTIONS.PRODUCTS, [Query.limit(1)]);
            status.database = true;
            status.diagnostics.push(`[4] 数据库与集合验证成功`);
        } catch (error: any) {
            console.error('Appwrite Database Connection Failed:', error);
            const errorMsg = error.message || String(error);
            status.error = errorMsg;
            
            if (errorMsg.includes('Failed to fetch')) {
                status.diagnostics.push(`[3] 失败: 跨域拦截 (CORS). 请确认后台 Platforms 已添加当前域名。`);
            } else if (errorMsg.includes('not found')) {
                status.diagnostics.push(`[3] 失败: ID 错误. 请确认数据库 ID '${DATABASE_ID}' 或集合 ID '${COLLECTIONS.PRODUCTS}' 是否正确。`);
            } else {
                status.diagnostics.push(`[3] 失败: ${errorMsg}`);
            }
        }

        try {
            status.diagnostics.push(`[5] 正在验证存储桶 ID: ${BUCKET_ID}...`);
            // Try to list files from storage bucket as a test
            await storage.listFiles(BUCKET_ID, [Query.limit(1)]);
            status.storage = true;
            status.diagnostics.push(`[6] 存储空间验证成功`);
        } catch (error: any) {
            const errorMsg = error.message || String(error);
            status.diagnostics.push(`[5] 存储验证失败: ${errorMsg}`);
        }

        return status;
    }

    async syncAll() {
        if (this.isSyncing) return;
        this.isSyncing = true;
        console.log('🔄 开始全量同步...');
        
        try {
            await this.initSession();

            const tables: [keyof typeof db, string][] = [
                ['products', COLLECTIONS.PRODUCTS],
                ['customers', COLLECTIONS.CUSTOMERS],
                ['orders', COLLECTIONS.ORDERS],
                ['logs', COLLECTIONS.LOGS],
                ['stockMovements', COLLECTIONS.STOCK_MOVEMENTS],
                ['repayments', COLLECTIONS.REPAYMENTS]
            ];

            for (const [tableName, collectionId] of tables) {
                try {
                    await this.syncTable(tableName, collectionId);
                } catch (tableError) {
                    console.error(`❌ [${tableName}] 同步失败:`, tableError);
                }
            }
            
            console.log('✅ 全量同步完成');
        } catch (error) {
            console.error('❌ 同步服务异常:', error);
        } finally {
            this.isSyncing = false;
        }
    }

    private async syncTable(tableName: keyof typeof db, collectionId: string) {
        const table = db[tableName] as any;
        if (!table) return;

        // 获取该表上次同步的时间，如果没有则从 2000 年开始
        const syncKey = `lastSync_${tableName}`;
        const lastSyncState = await db.syncStatus.get(syncKey).catch(() => null);
        
        // 关键修复：拉取时稍微往前推 5 分钟，防止服务器时间差导致漏单
        const lastSyncDate = lastSyncState?.lastSync ? new Date(lastSyncState.lastSync) : new Date(0);
        const pullStartTime = new Date(lastSyncDate.getTime() - 5 * 60 * 1000).toISOString();

        console.log(`--- 同步 [${tableName}] (上次同步: ${lastSyncState?.lastSync || '从未'}) ---`);

        // 1. 推送本地变更 (updatedAt > lastSync)
        const localChanges = await table
            .where('updatedAt')
            .above(lastSyncState?.lastSync || new Date(0).toISOString())
            .toArray()
            .catch(() => []);

        if (localChanges.length > 0) {
            console.log(`⬆️ 正在推送 ${localChanges.length} 条本地变更...`);
            for (const item of localChanges) {
                try {
                    const { id, appwriteId, ...data } = item;
                    const preparedData = this.prepareForAppwrite(data);

                    if (appwriteId) {
                        await databases.updateDocument(DATABASE_ID, collectionId, appwriteId, preparedData);
                    } else {
                        // 尝试通过业务 ID 匹配云端（防止重复创建）
                        let existingDocId = null;
                        if (data.orderNo || data.code || data.name) {
                            const searchField = data.orderNo ? 'orderNo' : (data.code ? 'code' : 'name');
                            const searchValue = data.orderNo || data.code || data.name;
                            const existing = await databases.listDocuments(DATABASE_ID, collectionId, [
                                Query.equal(searchField, searchValue),
                                Query.limit(1)
                            ]).catch(() => null);
                            
                            if (existing && existing.documents.length > 0) {
                                existingDocId = existing.documents[0].$id;
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
                } catch (err) {
                    console.error(`推送失败 [${tableName}]:`, err);
                }
            }
        }

        // 2. 拉取云端变更 ($updatedAt > pullStartTime)
        try {
            const response = await databases.listDocuments(DATABASE_ID, collectionId, [
                Query.greaterThan('$updatedAt', pullStartTime),
                Query.limit(100)
            ]).catch(() => null);

            if (response && response.documents.length > 0) {
                console.log(`⬇️ 正在拉取 ${response.documents.length} 条云端变更...`);
                for (const doc of response.documents) {
                    try {
                        const appwriteId = doc.$id;
                        const data = this.prepareFromAppwrite(doc);
                        
                        // 匹配本地记录
                        const localItem = await table.where('appwriteId').equals(appwriteId).first()
                            || (data.orderNo ? await table.where('orderNo').equals(data.orderNo).first() : null)
                            || (data.code ? await table.where('code').equals(data.code).first() : null);

                        if (localItem) {
                            // 云端较新才更新本地
                            if (new Date(doc.$updatedAt) > new Date(localItem.updatedAt)) {
                                await table.update(localItem.id, { ...data, appwriteId });
                            }
                        } else {
                            // 本地没有，直接新增
                            await table.add({ ...data, appwriteId, isDeleted: data.isDeleted ?? 0 });
                        }
                    } catch (e) {
                        console.error(`拉取单条失败 [${tableName}]:`, e);
                    }
                }
            }
        } catch (error) {
            console.error(`拉取失败 [${tableName}]:`, error);
        }

        // 更新该表的同步时间
        await db.syncStatus.put({ key: syncKey, lastSync: new Date().toISOString() });
    }

    private async uploadImage(base64: string): Promise<string> {
        try {
            const res = await fetch(base64);
            const blob = await res.blob();
            const file = new File([blob], 'image.jpg', { type: 'image/jpeg' });
            const response = await storage.createFile(BUCKET_ID, ID.unique(), file);
            return response.$id;
        } catch (error) {
            throw error;
        }
    }

    private prepareForAppwrite(item: any) {
        const data = { ...item };
        // Remove internal Dexie/Sync fields that are not in Appwrite Schema
        delete data.id;
        delete data.appwriteId;
        
        try {
            if (data.history && typeof data.history !== 'string') data.history = JSON.stringify(data.history);
            if (data.items && typeof data.items !== 'string') data.items = JSON.stringify(data.items);
        } catch (e) {}
        return data;
    }

    private prepareFromAppwrite(doc: any) {
        const { $id, $permissions, $collectionId, $databaseId, $createdAt, $updatedAt, ...data } = doc;
        const prepared = { 
            ...data, 
            appwriteId: $id,
            updatedAt: $updatedAt // Map Appwrite's $updatedAt to local updatedAt
        };
        try {
            if (prepared.history && typeof prepared.history === 'string') prepared.history = JSON.parse(prepared.history);
            if (prepared.items && typeof prepared.items === 'string') prepared.items = JSON.parse(prepared.items);
        } catch (e) {}
        return prepared;
    }
}

export const syncService = new SyncService();

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
        await this.initSession();

        try {
            // Sync each table independently to prevent one failure from stopping others
            const tables: [keyof typeof db, string][] = [
                ['products', COLLECTIONS.PRODUCTS],
                ['customers', COLLECTIONS.CUSTOMERS],
                ['orders', COLLECTIONS.ORDERS],
                ['logs', COLLECTIONS.LOGS],
                ['stockMovements', COLLECTIONS.STOCK_MOVEMENTS],
                ['repayments', COLLECTIONS.REPAYMENTS]
            ];

            for (const [tableName, collectionId] of tables) {
                await this.syncTable(tableName, collectionId).catch(() => {});
            }
            
            await db.syncStatus.put({ key: 'lastSync', lastSync: new Date().toISOString() }).catch(() => {});
        } catch (error) {
            // Silent fail for syncAll
        } finally {
            this.isSyncing = false;
        }
    }

    private async syncTable(tableName: keyof typeof db, collectionId: string) {
        try {
            const table = db[tableName] as any;
            if (!table) return;

            const lastSyncState = await db.syncStatus.get('lastSync').catch(() => null);
            const lastSync = lastSyncState?.lastSync || new Date(0).toISOString();

            // 1. Push local changes to Appwrite
            const localChanges = await table
                .where('updatedAt')
                .above(lastSync)
                .toArray()
                .catch(() => []);

            if (localChanges && localChanges.length > 0) {
                console.log(`Pushing ${localChanges.length} local changes for [${tableName}]`);
                for (const item of localChanges) {
                    try {
                        const id = item.id;
                        const appwriteId = item.appwriteId;
                        const data = this.prepareForAppwrite(item);

                        if (appwriteId) {
                            await databases.updateDocument(DATABASE_ID, collectionId, appwriteId, data)
                                .then(() => {
                                    console.log(`Sync Update Success [${tableName}]: ${appwriteId}`);
                                })
                                .catch((err) => {
                                    console.error(`Sync Update Error [${tableName}]:`, err);
                                });
                        } else {
                            const doc = await databases.createDocument(DATABASE_ID, collectionId, ID.unique(), data)
                                .then((res) => {
                                    console.log(`Sync Create Success [${tableName}]: ${res.$id}`);
                                    return res;
                                })
                                .catch((err) => {
                                    console.error(`Sync Create Error [${tableName}]:`, err);
                                    return null;
                                });
                            if (doc) {
                                await table.update(id, { appwriteId: doc.$id }).catch(() => {});
                            }
                        }
                    } catch (error) {
                        console.error(`Item Sync Failed [${tableName}]:`, error);
                    }
                }
            }

            // 2. Pull cloud changes from Appwrite
            try {
                // Use $updatedAt for Appwrite system attribute query
                const response = await databases.listDocuments(DATABASE_ID, collectionId, [
                    Query.greaterThan('$updatedAt', lastSync),
                    Query.limit(100)
                ]).catch(() => null);

                if (response && response.documents && response.documents.length > 0) {
                    console.log(`Pulled ${response.documents.length} cloud changes for [${tableName}]`);
                    for (const doc of response.documents) {
                        try {
                            const appwriteId = doc.$id;
                            const localItem = await table.where('appwriteId').equals(appwriteId).first().catch(() => null);

                            const data = this.prepareFromAppwrite(doc);

                            if (localItem) {
                                // If localItem exists, only update if cloud is newer
                                if (new Date(data.updatedAt) > new Date(localItem.updatedAt)) {
                                    await table.update(localItem.id, data).catch(() => {});
                                }
                            } else {
                                // For new items, respect cloud isDeleted or default to 0
                                await table.add({ ...data, isDeleted: data.isDeleted ?? 0 }).catch(() => {});
                            }
                        } catch (e) {
                            console.error(`Item Pull Failed [${tableName}]:`, e);
                        }
                    }
                }
            } catch (error) {
                console.error(`Pull Error [${tableName}]:`, error);
            }
        } catch (error) {
            console.error(`Table Sync Error [${tableName}]:`, error);
        }
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

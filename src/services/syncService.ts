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

    async checkConnection(): Promise<{ database: boolean; storage: boolean; error?: string }> {
        const status = { database: false, storage: false, error: '' };
        try {
            await this.initSession();
        } catch (e: any) {
            status.error = e.message || String(e);
            return status;
        }

        try {
            // Try to list documents from products collection as a test
            await databases.listDocuments(DATABASE_ID, COLLECTIONS.PRODUCTS, [Query.limit(1)]);
            status.database = true;
        } catch (error: any) {
            console.error('Appwrite Database Connection Failed:', error);
            status.error = error.message || String(error);
            if (status.error.includes('Failed to fetch')) {
                status.error = `网络连接失败 (Failed to fetch). 请检查: 1. Appwrite 后台是否添加了当前域名 ${window.location.origin} 到 Web Platforms; 2. Project ID 是否正确; 3. 网络是否通畅。`;
            }
        }

        try {
            // Try to list files from storage bucket as a test
            await storage.listFiles(BUCKET_ID, [Query.limit(1)]);
            status.storage = true;
        } catch (error) {
            console.error('Appwrite Storage Connection Failed:', error);
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
                    if ((item as any).isTest) continue; // Skip test data sync
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
                                if (new Date(data.updatedAt) > new Date(localItem.updatedAt)) {
                                    await table.update(localItem.id, data).catch(() => {});
                                }
                            } else {
                                await table.add(data).catch(() => {});
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
        delete data.isTest;
        
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

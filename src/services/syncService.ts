/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ID, Query } from 'appwrite';
import { db } from '../db';
import { databases, DATABASE_ID, COLLECTIONS, storage, BUCKET_ID } from '../appwrite';
import type { Product, Customer, Order, OperationLog, StockMovement } from '../types';

class SyncService {
    private isSyncing = false;

    async checkConnection(): Promise<{ database: boolean; storage: boolean }> {
        const status = { database: false, storage: false };
        try {
            // Try to list documents from products collection as a test
            await databases.listDocuments(DATABASE_ID, COLLECTIONS.PRODUCTS, [Query.limit(1)]);
            status.database = true;
        } catch (error) {
            console.error('Appwrite Database Connection Failed:', error);
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
            
            await db.syncState.put({ key: 'lastSync', lastSync: new Date().toISOString() }).catch(() => {});
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

            const lastSyncState = await db.syncState.get('lastSync').catch(() => null);
            const lastSync = lastSyncState?.lastSync || new Date(0).toISOString();

            // 1. Push local changes to Appwrite
            const localChanges = await table
                .where('updatedAt')
                .above(lastSync)
                .toArray()
                .catch(() => []);

            if (localChanges && localChanges.length > 0) {
                for (const item of localChanges) {
                    try {
                        const data = { ...item };
                        const id = data.id;
                        delete data.id; // Don't send local ID to Appwrite

                        // Special handling for product images
                        if (tableName === 'products' && data.image && data.image.startsWith('data:image')) {
                            try {
                                const fileId = await this.uploadImage(data.image);
                                data.image = fileId;
                            } catch (e) {
                                // If image upload fails, we still try to push the rest of the data
                            }
                        }

                        if (item.appwriteId) {
                            await databases.updateDocument(DATABASE_ID, collectionId, item.appwriteId, this.prepareForAppwrite(data)).catch(() => {});
                        } else {
                            const doc = await databases.createDocument(DATABASE_ID, collectionId, ID.unique(), this.prepareForAppwrite(data)).catch(() => null);
                            if (doc) {
                                await table.update(id, { appwriteId: doc.$id }).catch(() => {});
                            }
                        }
                    } catch (error) {
                        // Silent fail for individual items
                    }
                }
            }

            // 2. Pull cloud changes from Appwrite
            try {
                const response = await databases.listDocuments(DATABASE_ID, collectionId, [
                    Query.greaterThan('updatedAt', lastSync),
                    Query.limit(100) // Safety limit
                ]).catch(() => null);

                if (response && response.documents && response.documents.length > 0) {
                    for (const doc of response.documents) {
                        try {
                            const appwriteId = doc.$id;
                            const localItem = await table.where('appwriteId').equals(appwriteId).first().catch(() => null);

                            const data = this.prepareFromAppwrite(doc);

                            if (localItem) {
                                // Conflict resolution: Cloud wins for updates if newer
                                if (new Date(data.updatedAt) > new Date(localItem.updatedAt)) {
                                    await table.update(localItem.id, data).catch(() => {});
                                }
                            } else {
                                // New record from cloud
                                await table.add(data).catch(() => {});
                            }
                        } catch (e) {
                            // Silent fail for individual pull items
                        }
                    }
                }
            } catch (error) {
                // Silent fail for pull
            }
        } catch (error) {
            // Silent fail for table sync
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

    private prepareForAppwrite(data: any) {
        const prepared = { ...data };
        try {
            if (prepared.history && typeof prepared.history !== 'string') prepared.history = JSON.stringify(prepared.history);
            if (prepared.items && typeof prepared.items !== 'string') prepared.items = JSON.stringify(prepared.items);
        } catch (e) {}
        return prepared;
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

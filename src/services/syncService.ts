/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ID, Query } from 'appwrite';
import { db } from '../db';
import { databases, DATABASE_ID, COLLECTIONS, storage, BUCKET_ID, account, client } from '../appwrite';
import type { Product, Customer, Order, OperationLog, StockMovement } from '../types';

export class SyncService {
    public static isSyncing = false;
    private static syncStatus: 'idle' | 'syncing' | 'error' = 'idle';
    private static sessionInitialized = false;
    private static lastSyncResults: Record<string, { success: boolean; error?: string }> = {};

    static getLastSyncResults() {
        return this.lastSyncResults;
    }

    static getStatus() {
        return this.syncStatus;
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

    private static syncTimeout: any = null;
    // 触发同步（增加防抖，并限制触发频率）
    private static lastTriggerTime = 0;
    static async triggerSync() {
        const now = Date.now();
        // 限制手动/自动触发的最小间隔为 10 秒，防止瞬间爆发请求
        if (now - this.lastTriggerTime < 10000) return;
        
        if (this.syncTimeout) clearTimeout(this.syncTimeout);
        this.syncTimeout = setTimeout(() => {
            this.lastTriggerTime = Date.now();
            console.log('🚀 执行防抖同步...');
            this.syncAll(true).catch(err => console.error('后台同步失败:', err));
        }, 2000); // 2秒防抖
    }

    static async syncAll(priorityOnly = false): Promise<boolean> {
        if (this.isSyncing) return false;
        
        // 设置一个 1 分钟的超时保护 (缩短超时，节省资源)
        const timeoutPromise = new Promise<boolean>((_, reject) => {
            setTimeout(() => reject(new Error('Sync timeout')), 60000);
        });

        const syncPromise = (async () => {
            this.isSyncing = true;
            this.syncStatus = 'syncing';
            console.log(`🔄 开始${priorityOnly ? '快速' : '全量'}同步...`);
            let hasError = false;
            const results: Record<string, { success: boolean; error?: string }> = {};
            
            try {
                await this.initSession();

                // 1. 同步前清理本地重复数据 (改为非阻塞，且仅在全量同步时执行)
                // if (!priorityOnly) await this.cleanupDuplicates();

                const tables: [string, string][] = [
                    ['products', COLLECTIONS.PRODUCTS],
                    ['customers', COLLECTIONS.CUSTOMERS],
                    ['orders', COLLECTIONS.ORDERS],
                    ['stockMovements', COLLECTIONS.STOCK_MOVEMENTS],
                    ['repayments', COLLECTIONS.REPAYMENTS]
                ];

                // 如果不是仅同步优先级表，且随机概率极低，则加入日志 (节省额度)
                if (!priorityOnly && Math.random() < 0.05) {
                    tables.push(['logs', COLLECTIONS.LOGS]);
                }

                for (const [tableName, collectionId] of tables) {
                    try {
                        console.log(`Syncing table: ${tableName}...`);
                        await this.syncTable(tableName, collectionId);
                        results[tableName] = { success: true };
                    } catch (tableError: any) {
                        hasError = true;
                        const errorMsg = tableError.message || String(tableError);
                        results[tableName] = { success: false, error: errorMsg };
                        console.error(`❌ [${tableName}] 同步失败:`, tableError);
                    }
                }
                
                this.lastSyncResults = results;
                this.syncStatus = hasError ? 'error' : 'idle';
                
                // 只要有关键表同步成功，就更新同步时间，避免因为日志等次要表失败导致一直显示“从未同步”
                const criticalTables = ['products', 'customers', 'orders'];
                const criticalSuccess = criticalTables.every(t => results[t]?.success);

                if (criticalSuccess) {
                    await db.syncStatus.put({ key: 'lastSync', lastSync: new Date().toISOString() });
                    if (!hasError) {
                        console.log('✅ 全量同步完成');
                    } else {
                        console.warn('⚠️ 同步完成，但部分次要表存在错误');
                    }
                }
                
                return !hasError;
            } catch (error) {
                console.error('❌ 同步服务异常:', error);
                this.syncStatus = 'error';
                return false;
            } finally {
                this.isSyncing = false;
            }
        })();

        return Promise.race([syncPromise, timeoutPromise]) as Promise<boolean>;
    }

    static async forcePushAll() {
        console.log('🚀 强制重新推送所有本地数据...');
        const tables = ['products', 'customers', 'orders', 'logs', 'stockMovements', 'repayments'];
        for (const tableName of tables) {
            const table = (db as any)[tableName];
            if (table) {
                await table.toCollection().modify({ sync_status: 1 });
            }
        }
        return this.syncAll();
    }

    static async resetSync() {
        console.log('🧹 重置同步状态...');
        await db.syncStatus.clear();
        // 重置所有表的 sync_status 为 1，强制下次同步重新检查
        const tables = ['products', 'customers', 'orders', 'logs', 'stockMovements', 'repayments'];
        for (const tableName of tables) {
            await (db as any)[tableName].toCollection().modify({ sync_status: 1 });
        }
        console.log('✅ 同步状态已重置，下次将进行全量拉取。');
    }

    /**
     * 订阅 Appwrite 实时更新 (Realtime)
     * 像大型游戏一样，实现秒级同步
     */
    static subscribeToRealtime() {
        console.log('🚀 正在启动实时同步订阅...');
        
        const tables: [string, string][] = [
            ['products', COLLECTIONS.PRODUCTS],
            ['customers', COLLECTIONS.CUSTOMERS],
            ['orders', COLLECTIONS.ORDERS],
            // ['logs', COLLECTIONS.LOGS], // 禁用日志实时同步，节省额度
            ['stockMovements', COLLECTIONS.STOCK_MOVEMENTS],
            ['repayments', COLLECTIONS.REPAYMENTS]
        ];

        const channels = tables.map(([_, collId]) => `databases.${DATABASE_ID}.collections.${collId}.documents`);

        return client.subscribe(channels, async (response) => {
            const { events, payload } = response;
            const eventType = events[0]; // e.g., databases.default.collections.products.documents.69d70...create
            
            // 提取表名
            const collId = eventType.split('.')[3];
            const tableName = tables.find(([_, id]) => id === collId)?.[0];
            
            if (!tableName) return;
            const table = (db as any)[tableName];
            if (!table) return;

            console.log(`[Realtime] 📥 收到云端更新 (${tableName}):`, eventType);

            try {
                if (eventType.endsWith('.delete')) {
                    // 物理删除（通常我们用软删除，但如果有人在后台删了，我们也同步）
                    const docId = (payload as any).$id;
                    const localItem = await table.where('appwriteId').equals(docId).first();
                    if (localItem) {
                        await table.delete(localItem.id);
                        console.log(`[Realtime] 🗑️ 已同步物理删除: ${tableName}:${docId}`);
                    }
                } else {
                    // 创建或更新
                    const doc = payload as any;
                    const data = await this.mapAppwriteToLocal(tableName, doc);
                    
                    let localItem = await table.where('appwriteId').equals(doc.$id).first();
                    
                    // 如果没找到 appwriteId，尝试通过业务 ID 匹配
                    if (!localItem) {
                        if (data.orderNo) {
                            localItem = await table.where('orderNo').equals(data.orderNo.trim()).first();
                        } else if (data.code) {
                            localItem = await table.where('code').equals(data.code.trim()).first();
                        } else if (tableName === 'customers' && data.phone) {
                            localItem = await table.where('phone').equals(data.phone.trim()).first();
                        }
                        // 注意：不再通过 name 匹配，防止同名不同人的数据被误覆盖
                    }

                    if (localItem) {
                        const serverTime = new Date(doc.$updatedAt).getTime();
                        const localTime = localItem.updatedAt ? new Date(localItem.updatedAt).getTime() : 0;
                        const isDirty = localItem.sync_status === 1;
                        
                        // 实时同步冲突解决：
                        // 1. 如果本地有未同步变更 (isDirty)，绝对不覆盖，保护本地数据
                        if (isDirty) {
                            console.log(`[Realtime] 🛡️ 保护未同步的本地数据: ${tableName}:${localItem.id}`);
                            return;
                        }

                        // 2. 云端必须比本地新
                        if (serverTime > localTime) {
                            // 3. 保护本地删除状态
                            if (localItem.isDeleted === 1 && data.isDeleted !== 1) {
                                console.log(`[Realtime] 🛡️ 保护本地删除状态: ${tableName}:${doc.$id}`);
                                return;
                            }

                            await table.update(localItem.id, {
                                ...data,
                                appwriteId: doc.$id,
                                _isSync: true,
                                sync_status: 0
                            });
                            console.log(`[Realtime] ✅ 已实时同步更新: ${tableName}:${doc.$id}`);
                        }
                    } else {
                        // 新增数据
                        await table.add({
                            ...data,
                            appwriteId: doc.$id,
                            _isSync: true,
                            sync_status: 0
                        });
                        console.log(`[Realtime] ✨ 已同步新增: ${tableName}:${doc.$id}`);
                    }
                }
                
                // 实时更新成功后，也更新一下“上次同步时间”
                await db.syncStatus.put({ key: 'lastSync', lastSync: new Date().toISOString() });
            } catch (err) {
                console.error(`[Realtime] 同步处理失败 (${tableName}):`, err);
            }
        });
    }

    /**
     * 清理本地重复数据（基于业务主键：商品代码、客户姓名、订单号）
     */
    // 将清理重复数据改为公开方法，供手动调用
    static async cleanupDuplicates() {
        console.log('🔍 正在检查并清理本地重复数据...');
        
        const tables = [
            { name: 'products', keyField: 'code' },
            { name: 'customers', keyField: 'phone' } // 改为手机号，姓名重复率太高
        ];

        for (const { name, keyField } of tables) {
            const table = (db as any)[name];
            const items = await table.toArray();
            const seen = new Map<string, any>();

            for (const item of items) {
                const val = item[keyField];
                if (!val) continue;
                const key = String(val).trim().toLowerCase();

                if (seen.has(key)) {
                    const existing = seen.get(key);
                    // 优先级：有 appwriteId > 已删除标记 > 更新时间晚 > ID 小
                    let toKeep = existing;
                    let toDelete = item;

                    const existingTime = new Date(existing.updatedAt || 0).getTime();
                    const itemTime = new Date(item.updatedAt || 0).getTime();

                    const score = (obj: any) => {
                        let s = 0;
                        if (obj.appwriteId) s += 1000;
                        if (obj.isDeleted === 1) s += 500;
                        return s;
                    };

                    const existingScore = score(existing);
                    const itemScore = score(item);

                    if (itemScore > existingScore) {
                        toKeep = item;
                        toDelete = existing;
                    } else if (itemScore === existingScore) {
                        if (itemTime > existingTime) {
                            toKeep = item;
                            toDelete = existing;
                        }
                    }

                    // 继承未同步状态
                    if (toDelete.sync_status === 1) {
                        toKeep.sync_status = 1;
                        toKeep.updatedAt = new Date().toISOString();
                    }

                    console.warn(`[Cleanup] Deleting duplicate ${name} (${key}): keeping ${toKeep.id}, deleting ${toDelete.id}`);
                    await table.delete(toDelete.id);
                    await table.put(toKeep); // 保存继承的状态
                    seen.set(key, toKeep);
                } else {
                    seen.set(key, item);
                }
            }
        }
        console.log('✅ 本地重复数据清理完成');
    }

    private static async syncTable(tableName: string, collectionId: string) {
        const table = (db as any)[tableName];
        if (!table) return;

        const pullKey = `lastPull_${tableName}`;
        const lastPullState = await db.syncStatus.get(pullKey).catch(() => null);
        const lastPullTime = lastPullState?.lastSync || new Date(0).toISOString();
        const isFullSync = lastPullTime === new Date(0).toISOString();

        // 1. 推送本地变更 (使用 sync_status 标记，不再依赖时间戳，彻底解决同步循环)
        // 增加容错：如果 sync_status 为空，也尝试同步（可能是旧数据）
        const localChanges = await table.filter((item: any) => item.sync_status === 1 || item.sync_status === undefined).toArray().catch(() => []);
        
        if (localChanges.length > 0) {
            console.log(`[Sync] Found ${localChanges.length} unsynced items for ${tableName}`);
            for (const item of localChanges) {
                try {
                    const { id, appwriteId, ...data } = item;
                    
                    // 处理图片上传
                    if (tableName === 'products' && data.image && data.image.startsWith('data:image')) {
                        try {
                            const fileId = await this.uploadImage(data.image);
                            data.image = fileId;
                            // 同步更新本地，标记为已同步图片
                            await table.update(id, { image: fileId });
                        } catch (uploadErr) {
                            console.error('Image upload failed during sync, clearing image from payload to avoid 400 error:', uploadErr);
                            // 如果上传失败，不要把 base64 发给数据库，否则会报 400 (Value too long)
                            data.image = ''; 
                        }
                    } else if (tableName === 'products' && data.image && data.image.length > 2000) {
                        // 最后的防线：如果图片字符串依然异常长，强制清理，防止卡死同步
                        data.image = '';
                    }

                    // --- 关键修复：将本地 ID 转换为 Appwrite ID ---
                    const preparedData = await this.mapLocalToAppwrite(tableName, data);
                    console.log(`[Sync] Pushing payload for ${tableName}:${item.id}`, preparedData);

                    const pushToAppwrite = async (payload: any, retryCount = 0): Promise<any> => {
                        try {
                            if (appwriteId) {
                                return await databases.updateDocument(DATABASE_ID, collectionId, appwriteId, payload);
                            } else {
                                // 尝试通过业务唯一 ID 匹配云端，防止重复创建
                                // 注意：不再通过 name 匹配，因为名称可能重复，且容易导致误覆盖
                                let existingDocId = null;
                                const searchField = payload.orderNo ? 'orderNo' : (payload.code ? 'code' : (tableName === 'customers' && payload.phone ? 'phone' : null));
                                const searchValue = payload.orderNo || payload.code || (tableName === 'customers' ? payload.phone : null);

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
                            // 更加鲁棒的错误检测逻辑
                            const errorMsg = err.message || '';
                            
                            // 1. 未知属性检测
                            const unknownAttrMatch = errorMsg.match(/Unknown attribute[:\s]+"([^"]+)"/i);
                            if (unknownAttrMatch && retryCount < 5) {
                                const attrName = unknownAttrMatch[1];
                                console.warn(`[Sync] 🛡️ 自动剔除云端不存在的字段: ${attrName} (${tableName})`);
                                const newPayload = { ...payload };
                                delete newPayload[attrName];
                                return await pushToAppwrite(newPayload, retryCount + 1);
                            }

                            // 2. 格式错误检测 (例如: Value must be a valid float)
                            const invalidFormatMatch = errorMsg.match(/Attribute "([^"]+)" has invalid format/i);
                            if (invalidFormatMatch && retryCount < 5) {
                                const attrName = invalidFormatMatch[1];
                                console.warn(`[Sync] 🛠️ 尝试修复字段格式: ${attrName} (${tableName})`);
                                const newPayload = { ...payload };
                                if (errorMsg.toLowerCase().includes('float') || errorMsg.toLowerCase().includes('integer') || errorMsg.toLowerCase().includes('number')) {
                                    newPayload[attrName] = Number(newPayload[attrName]) || 0;
                                } else {
                                    delete newPayload[attrName];
                                }
                                return await pushToAppwrite(newPayload, retryCount + 1);
                            }

                            console.error(`[Sync] Appwrite Push Error (${tableName}:${item.id}):`, errorMsg);
                            throw err;
                        }
                    };

                    const doc = await pushToAppwrite(preparedData);
                    
                    if (preparedData.isDeleted === 1) {
                        console.log(`[Sync] ✅ Successfully pushed deletion for ${tableName}: ${doc.$id} (isDeleted in response: ${doc.isDeleted})`);
                    }

                    // 检查 isDeleted 是否成功保存到云端
                    if (preparedData.isDeleted === 1 && doc.isDeleted !== 1) {
                        console.error(`[Sync] ⚠️ 关键错误: isDeleted 标记未能在 Appwrite 中保存 (${tableName}:${doc.$id})。请检查 Appwrite 集合属性中是否存在 isDeleted (Integer) 字段。`);
                    }

                    // 推送成功后，标记为已同步 (sync_status: 0)
                    await table.update(id, { 
                        appwriteId: doc.$id, 
                        _isSync: true,
                        sync_status: 0,
                        updatedAt: doc.$updatedAt
                    });
                } catch (err: any) {
                    console.error(`[Sync] Failed to push item ${item.id} in ${tableName}:`, err);
                }
            }
        }

        // 2. 拉取云端变更
        try {
            // 增加缓冲时间，确保不漏掉临界点的数据
            const pullStartTime = new Date(new Date(lastPullTime).getTime() - 5 * 60 * 1000).toISOString();
            let offset = 0;
            let hasMore = true;
            let maxServerUpdatedAt = lastPullTime;

            while (hasMore) {
                const response = await databases.listDocuments(DATABASE_ID, collectionId, [
                    Query.greaterThan('$updatedAt', pullStartTime),
                    Query.orderAsc('$updatedAt'),
                    Query.limit(100),
                    Query.offset(offset)
                ]);

                if (response.documents.length === 0) break;

                // 检查云端属性完整性
                if (response.documents.length > 0 && response.documents[0].isDeleted === undefined) {
                    console.error(`[Sync] ❌ 严重警告: 云端文档 (${tableName}) 缺失 isDeleted 属性。这会导致删除同步失效！请务必在 Appwrite 控制台中为该集合添加 isDeleted (Integer) 属性。`);
                }

                for (const doc of response.documents) {
                    // 记录最大的更新时间，用于下次同步
                    if (doc.$updatedAt >= maxServerUpdatedAt) maxServerUpdatedAt = doc.$updatedAt;
                    
                    // --- 关键修复：将 Appwrite ID 转换回本地 ID ---
                    const data = await this.mapAppwriteToLocal(tableName, doc);
                    
                    let localItem = await table.where('appwriteId').equals(doc.$id).first();
                    
                    if (!localItem) {
                        if (data.orderNo) {
                            localItem = await table.where('orderNo').equals(data.orderNo.trim()).first();
                        } else if (data.code) {
                            localItem = await table.where('code').equals(data.code.trim()).first();
                        } else if (tableName === 'customers' && data.phone) {
                            localItem = await table.where('phone').equals(data.phone.trim()).first();
                        }
                        // 注意：不再通过 name 匹配，防止同名不同人的数据被误覆盖
                    }

                    if (localItem) {
                        const serverTime = new Date(doc.$updatedAt).getTime();
                        const localTime = localItem.updatedAt ? new Date(localItem.updatedAt).getTime() : 0;
                        const isDirty = localItem.sync_status === 1;
                        
                        // 核心冲突解决策略：
                        // 1. 如果本地有未同步变更 (isDirty)，绝对不覆盖，保护本地数据不消失
                        // 2. 如果本地标记为已删除 (isDeleted: 1)，除非云端有更晚的更新，否则不恢复
                        // 3. 只有当本地已同步，且云端时间更晚，才更新本地
                        
                        let shouldOverwrite = false;
                        
                        if (isDirty) {
                            // 本地有未同步修改，保护它，不从云端覆盖
                            shouldOverwrite = false;
                            console.log(`[Sync] 🛡️ Protecting unsynced local item ${tableName}:${localItem.id} from cloud overwrite`);
                        } else if (isFullSync || !localItem.appwriteId) {
                            shouldOverwrite = true;
                        } else if (serverTime > localTime) {
                            shouldOverwrite = true;
                        }
                        
                        // 特殊保护：防止“已删除”状态被旧的云端数据（isDeleted: 0）覆盖
                        if (shouldOverwrite && localItem.isDeleted === 1 && data.isDeleted !== 1) {
                            shouldOverwrite = false;
                            // 如果本地已删除但云端没删，确保本地标记为“待同步”
                            if (localItem.sync_status !== 1) {
                                await table.update(localItem.id, { sync_status: 1, _isSync: true });
                            }
                        }

                        if (shouldOverwrite) {
                            if (data.isDeleted === 1) {
                                console.log(`[Sync] 🗑️ Pulled deletion for ${tableName}: ${doc.$id}`);
                            } else if (localItem.isDeleted === 1) {
                                console.warn(`[Sync] ⚠️ Pulled active state for previously deleted item ${tableName}: ${doc.$id}. Overwriting local deletion.`);
                            }
                            await table.update(localItem.id, { 
                                ...data, 
                                appwriteId: doc.$id, 
                                _isSync: true,
                                sync_status: 0 
                            });
                        } else if (localItem.isDeleted === 1 && data.isDeleted !== 1) {
                            console.log(`[Sync] 🛡️ Protected local deletion for ${tableName}: ${doc.$id} from older cloud state.`);
                        }
                    } else {
                        const { id: _, ...newData } = data;
                        await table.put({ 
                            ...newData, 
                            appwriteId: doc.$id, 
                            isDeleted: data.isDeleted ?? 0,
                            _isSync: true,
                            sync_status: 0
                        });
                    }
                }

                offset += response.documents.length;
                if (offset >= response.total) hasMore = false;
            }
            
            // 只有在确实拉取到新数据或者初始同步时才更新 lastSync
            if (maxServerUpdatedAt > lastPullTime || isFullSync) {
                await db.syncStatus.put({ key: pullKey, lastSync: maxServerUpdatedAt });
            }
        } catch (e: any) {
            console.error(`[Sync] Pull error for ${tableName}:`, e);
            if (e.code !== 404) throw e;
        }
    }

    private static async mapLocalToAppwrite(tableName: string, data: any) {
        const payload = this.prepareForAppwrite(tableName, data);

        // 1. 转换 Order 的 customerId -> customerAppwriteId
        if (tableName === 'orders') {
            if (payload.customerId) {
                const customer = await db.customers.get(payload.customerId);
                if (customer?.appwriteId) {
                    payload.customerAppwriteId = customer.appwriteId;
                }
            }
            delete payload.customerId;
        }

        // 2. 转换 OrderItems 的 productId -> productAppwriteId
        if (tableName === 'orders' && payload.items) {
            try {
                const items = typeof payload.items === 'string' ? JSON.parse(payload.items) : payload.items;
                for (const item of items) {
                    if (item.productId) {
                        const product = await db.products.get(item.productId);
                        if (product?.appwriteId) {
                            item.productAppwriteId = product.appwriteId;
                        }
                    }
                    delete item.productId;
                }
                payload.items = JSON.stringify(items);
            } catch (e) {}
        }

        // 3. 转换 Repayment 的 customerId -> customerAppwriteId
        if (tableName === 'repayments') {
            if (payload.customerId) {
                const customer = await db.customers.get(payload.customerId);
                if (customer?.appwriteId) {
                    payload.customerAppwriteId = customer.appwriteId;
                }
            }
            delete payload.customerId;
        }

        // 4. 转换 StockMovement 的 productId -> productAppwriteId
        if (tableName === 'stockMovements') {
            if (payload.productId) {
                const product = await db.products.get(payload.productId);
                if (product?.appwriteId) {
                    payload.productAppwriteId = product.appwriteId;
                }
            }
            delete payload.productId;
        }

        return payload;
    }

    private static async mapAppwriteToLocal(tableName: string, doc: any) {
        const data = this.prepareFromAppwrite(doc);

        // 转换 Order 的 customerAppwriteId -> customerId
        if (tableName === 'orders' && data.customerAppwriteId) {
            const customer = await db.customers.where('appwriteId').equals(data.customerAppwriteId).first();
            if (customer) {
                data.customerId = customer.id;
            }
        }

        // 转换 OrderItems 的 productAppwriteId -> productId
        if (tableName === 'orders' && data.items) {
            for (const item of data.items) {
                if (item.productAppwriteId) {
                    const product = await db.products.where('appwriteId').equals(item.productAppwriteId).first();
                    if (product) {
                        item.productId = product.id;
                    }
                }
            }
        }

        // 转换 Repayment 的 customerAppwriteId -> customerId
        if (tableName === 'repayments' && data.customerAppwriteId) {
            const customer = await db.customers.where('appwriteId').equals(data.customerAppwriteId).first();
            if (customer) {
                data.customerId = customer.id;
            }
        }

        // 转换 StockMovement 的 productAppwriteId -> productId
        if (tableName === 'stockMovements' && data.productAppwriteId) {
            const product = await db.products.where('appwriteId').equals(data.productAppwriteId).first();
            if (product) {
                data.productId = product.id;
            }
        }

        return data;
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
        delete data._isSync;
        delete data.pinyin; // 拼音字段通常不在云端 schema 中，本地生成即可
        delete data.updatedAt; // 使用 Appwrite 自带的 $updatedAt
        delete data.createdAt; // 使用 Appwrite 自带的 $createdAt
        
        // 删除所有以 $ 开头的 Appwrite 系统字段，防止 400 错误
        Object.keys(data).forEach(key => {
            if (key.startsWith('$')) delete data[key];
        });

        // 确保没有 null 值，Appwrite 对 null 值校验较严
        Object.keys(data).forEach(key => {
            if (data[key] === null || data[key] === undefined) {
                // 根据字段类型赋予默认空值
                const numericFields = [
                    'purchasePrice', 'wholesalePrice', 'retailPrice', 'price2', 'price3', 
                    'stock', 'minStock', 'debt', 'totalSpent', 'amount', 'quantity', 
                    'totalAmount', 'discount', 'finalAmount', 'bucketsOut', 'bucketsIn', 'depositAmount',
                    'receivedAmount', 'previousStock', 'currentStock', 'searchCount',
                    'isDeleted', 'balance'
                ];
                if (numericFields.includes(key)) {
                    data[key] = 0;
                } else {
                    data[key] = '';
                }
            }
        });

        // 强制转换数值，防止 Appwrite 报错
        const numericFields = [
            'purchasePrice', 'wholesalePrice', 'retailPrice', 'price2', 'price3', 
            'stock', 'minStock', 'debt', 'totalSpent', 'amount', 'quantity', 
            'totalAmount', 'discount', 'finalAmount', 'bucketsOut', 'bucketsIn', 'depositAmount',
            'receivedAmount', 'previousStock', 'currentStock', 'searchCount',
            'isDeleted', 'balance'
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
            createdAt: data.createdAt || $createdAt,
            isDeleted: data.isDeleted ?? 0
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

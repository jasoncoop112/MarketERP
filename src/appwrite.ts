/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client, Databases, Storage, Account } from 'appwrite';

export const client = new Client()
    .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1')
    .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID || '69c4c032002f214af93e');

export const databases = new Databases(client);
export const storage = new Storage(client);
export const account = new Account(client);

export const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'lengku-db';
export const BUCKET_ID = import.meta.env.VITE_APPWRITE_BUCKET_ID || 'product-images';

export const COLLECTIONS = {
    PRODUCTS: 'products',
    CUSTOMERS: 'customers',
    ORDERS: 'orders',
    LOGS: 'logs',
    STOCK_MOVEMENTS: 'stock_movements',
    REPAYMENTS: 'repayments'
};

export const getImageUrl = (image: string | undefined) => {
    if (!image) return '';
    if (image.startsWith('data:image')) return image;
    
    const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || '69c4c032002f214af93e';
    const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
    
    // 手动拼接预览 URL，这是最稳妥的方式，确保 project ID 始终存在
    // 同时也支持设置宽度和质量来优化加载速度
    return `${endpoint}/storage/buckets/${BUCKET_ID}/files/${image}/preview?project=${projectId}&width=400&quality=80`;
};

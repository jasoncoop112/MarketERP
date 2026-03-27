/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client, Databases, Storage, Account } from 'appwrite';

const client = new Client()
    .setEndpoint('https://cloud.appwrite.io/v1')
    .setProject('69c4c032002f214af93e');

export const databases = new Databases(client);
export const storage = new Storage(client);
export const account = new Account(client);

export const DATABASE_ID = 'lengku-db';
export const BUCKET_ID = 'product-images';

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
    return storage.getFilePreview(BUCKET_ID, image);
};

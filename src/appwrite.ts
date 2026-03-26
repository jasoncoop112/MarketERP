/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client, Databases, Storage, Account } from 'appwrite';

const client = new Client()
    .setEndpoint('https://sgp.cloud.appwrite.io/v1')
    .setProject('standard_93288dfb298919857efbcc50ce6b96ef44f71e097ff11852d86ee966046a2026cbc14af637c09b950e340f685a2ff054ff6d37cf7eb75df4ee1ab0800c20737eb23c9c4702f3c0a60c72dda2a991fbbb62b99358c0e04e10301ef2646fd55b8c936f2a71aa593b7b80eedb0f42be0bace52a524ada3b6373c0937de16fdba4b9');

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

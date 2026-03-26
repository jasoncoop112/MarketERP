/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export async function compressImage(base64: string, maxWidth = 800, quality = 0.7): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = base64;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Failed to get canvas context'));
            
            ctx.drawImage(img, 0, 0, width, height);
            
            // Try to compress until it's under 100KB or quality is too low
            let currentQuality = quality;
            let result = canvas.toDataURL('image/jpeg', currentQuality);
            
            while (result.length > 133333 && currentQuality > 0.1) { // 100KB in base64 is approx 133KB
                currentQuality -= 0.1;
                result = canvas.toDataURL('image/jpeg', currentQuality);
            }
            
            resolve(result);
        };
        img.onerror = reject;
    });
}

// Turn a camera photo or chosen image into a reasonably small JPEG for a PDF page.

export interface JpegPage {
  blob: Blob;
  width: number;
  height: number;
}

const MAX_SIDE = 1600; // enough to read small print, small enough to store many pages

export async function imageToJpeg(file: Blob, quality = 0.82): Promise<JpegPage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; // transparent PNGs become white paper, not black
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', quality));
  return { blob, width, height };
}

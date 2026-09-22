/**
 * Compress an image file to a base64 JPEG data URL.
 * Mobile cameras shoot 4-15 MB photos which exceed our 10 MB API
 * payload limit after base64 encoding. Payment screenshots only need
 * to be readable, not photographic — so we downscale to ~1600px max
 * dimension at 80% JPEG quality. Typical 8 MB iPhone photo → 200-500 KB.
 *
 * HEIC/HEIF: iPhone cameras save photos in HEIC. <img> + canvas cannot decode
 * that outside Safari, so the old pipeline hit img.onerror and the upload died
 * with a useless "Failed to decode image" — leaving Verify Payment disabled.
 * (Screenshots are PNG, which is why only camera photos failed.) Those files are
 * now converted to JPEG first, via a dynamic import so the ~1 MB decoder is only
 * fetched when someone actually picks a HEIC.
 */

/** HEIC often arrives with an empty file.type, so check the name as well. */
function isHeic(file) {
  const name = String(file?.name || '').toLowerCase();
  return /image\/hei[cf]/i.test(file?.type || '') || /\.(heic|heif)$/i.test(name);
}

/** Looks like an image by extension — used when the browser gives no MIME type. */
function looksLikeImage(file) {
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif|tiff?)$/i.test(String(file?.name || ''));
}

export async function compressImage(file, opts = {}) {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.8,
    mimeType = 'image/jpeg'
  } = opts;

  if (!file) throw new Error('No file selected.');

  const type = file.type || '';
  // Android sometimes hands over a HEIC from the gallery with type === '', which
  // the old strict check rejected before decoding was ever attempted.
  if (type && !type.startsWith('image/') && !isHeic(file)) {
    throw new Error('That file is not an image. Please upload a photo or screenshot.');
  }
  if (!type && !looksLikeImage(file)) {
    throw new Error('That file is not an image. Please upload a photo or screenshot.');
  }

  let source = file;

  if (isHeic(file)) {
    try {
      const heic2any = (await import('heic2any')).default;
      const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
      source = Array.isArray(out) ? out[0] : out;
    } catch {
      throw new Error(
        'Could not read this iPhone photo (HEIC). Take a screenshot instead, or set ' +
        'Camera → Formats → Most Compatible in iPhone Settings.'
      );
    }
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file. Please try selecting it again.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('This image format is not supported. Please upload a JPG or PNG.'));
      img.onload = () => {
        let { width, height } = img;
        if (!width || !height) {
          reject(new Error('This image appears to be empty or damaged.'));
          return;
        }
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        // White background so transparent PNGs don't go black after JPEG conversion
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL(mimeType, quality));
        } catch {
          reject(new Error('Could not process this image. Please try a different photo.'));
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(source);
  });

  return dataUrl;
}

/**
 * Approximate the byte size of a base64 data URL (decoded payload).
 */
export function base64ByteSize(dataUrl) {
  if (typeof dataUrl !== 'string') return 0;
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = (b64.match(/=+$/) || [''])[0].length;
  return Math.floor((b64.length * 3) / 4) - padding;
}

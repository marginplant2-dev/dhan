import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

/**
 * UPI payment QR, drawn locally.
 *
 * This used to be an <img> pointing at api.qrserver.com. That put a third-party
 * HTTPS request on the critical path of the payment screen: the payload is only
 * ~500 bytes but a cold DNS + TCP + TLS handshake to a foreign host measured
 * 2-3.5s on desktop and far worse on Indian mobile, which is why the QR and UPI
 * id appeared to "take a minute". It also leaked the admin's UPI id and the
 * amount to an outside service, and broke entirely if that service was down.
 *
 * Drawing it here removes the request, and rendering at devicePixelRatio keeps
 * the code sharp instead of upscaling a fixed 200px bitmap.
 */
export default function UpiQr({ value, size = 200, className = '', style = {} }) {
  const canvasRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!value || !canvasRef.current) return;
    let cancelled = false;

    // Cap the multiplier: a 3x canvas of a QR buys nothing visually but costs
    // memory on low-end phones.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    QRCode.toCanvas(canvasRef.current, value, {
      width: Math.round(size * dpr),
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' },
    })
      .then(() => {
        if (cancelled || !canvasRef.current) return;
        // Draw big, display small — that is what makes it crisp on retina.
        canvasRef.current.style.width = `${size}px`;
        canvasRef.current.style.height = `${size}px`;
        setFailed(false);
      })
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => { cancelled = true; };
  }, [value, size]);

  if (failed) {
    return (
      <div
        className={className}
        style={{
          width: size, height: size, display: 'grid', placeItems: 'center',
          textAlign: 'center', padding: 10, fontSize: 11, lineHeight: 1.4,
          border: '1px solid var(--border-color)', borderRadius: 8,
          background: 'var(--bg-primary)', color: 'var(--text-secondary)',
          ...style,
        }}
      >
        QR unavailable — copy the UPI ID below instead
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-label="UPI payment QR code"
      style={{ width: size, height: size, borderRadius: 6, background: '#fff', ...style }}
    />
  );
}

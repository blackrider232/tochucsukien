import QRCode from 'qrcode';
import type { QrCodeProps } from './kit.types';

const ERROR_LEVEL = 'M';
const QUIET_ZONE = 2;

/** Module matrix of a payload, as an SVG path ('M x y h1 v1 h-1z' per dark module). */
export function qrPath(payload: string): { path: string; modules: number } {
  const { modules } = QRCode.create(payload, { errorCorrectionLevel: ERROR_LEVEL });
  const n = modules.size;
  let path = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (modules.get(x, y)) path += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
    }
  }
  return { path, modules: n + QUIET_ZONE * 2 };
}

/** Vector QR (crisp in print, no async step). The payload always comes from encodeCheckinPayload(). */
export function QrCode({ payload, size, caption }: QrCodeProps) {
  const { path, modules } = qrPath(payload);
  return (
    <figure className="inline-flex flex-col items-center gap-1">
      <svg
        role="img"
        aria-label={caption ? `Mã QR ${caption}` : 'Mã QR check-in'}
        width={size}
        height={size}
        viewBox={`0 0 ${modules} ${modules}`}
        shapeRendering="crispEdges"
        className="bg-white"
      >
        <path d={path} fill="#000000" />
      </svg>
      {caption && <figcaption className="font-mono text-sm font-semibold tracking-widest text-ink print:text-black">{caption}</figcaption>}
    </figure>
  );
}

/** PNG data URL for email attachments. Awaits the encoder with no fixed timeout (m4c B44). */
export function qrPngDataUrl(payload: string, size: number): Promise<string> {
  return QRCode.toDataURL(payload, { type: 'image/png', width: size, margin: QUIET_ZONE, errorCorrectionLevel: ERROR_LEVEL });
}

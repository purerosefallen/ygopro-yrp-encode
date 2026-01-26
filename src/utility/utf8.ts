export function decodeUtf8(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('utf8');
  }
  const TD = (globalThis as any).TextDecoder as typeof TextDecoder | undefined;
  if (TD) {
    return new TD('utf-8').decode(bytes);
  }
  return String.fromCharCode(...bytes);
}

export function encodeUtf8(s: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(s, 'utf8'));
  }
  const TE = (globalThis as any).TextEncoder as typeof TextEncoder | undefined;
  if (TE) {
    return new TE().encode(s);
  }
  return Uint8Array.from(s.split('').map((c) => c.charCodeAt(0)));
}

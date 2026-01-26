export function decodeUtf16leZ(bytes: Uint8Array): string {
  // stop at first 0x0000 (2 bytes)
  let end = bytes.length;
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    if (bytes[i] === 0 && bytes[i + 1] === 0) {
      end = i;
      break;
    }
  }

  // Prefer TextDecoder when available (most runtimes), fallback to manual.
  const TD = (globalThis as any).TextDecoder as typeof TextDecoder | undefined;
  if (TD) {
    try {
      return new TD('utf-16le').decode(bytes.subarray(0, end));
    } catch {
      // fallthrough
    }
  }

  // Manual decode: UTF-16 code units LE
  const codeUnits: number[] = [];
  for (let i = 0; i + 1 < end; i += 2) {
    codeUnits.push(bytes[i] | (bytes[i + 1] << 8));
  }
  return String.fromCharCode(...codeUnits);
}

export function encodeUtf16le(s: string): Uint8Array {
  // Prefer TextEncoder when it can do utf-16le (rare); otherwise manual.
  // Manual: write UTF-16 code units LE (JS strings are UTF-16 code units).
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    const cu = s.charCodeAt(i);
    out[i * 2] = cu & 0xff;
    out[i * 2 + 1] = (cu >>> 8) & 0xff;
  }
  return out;
}

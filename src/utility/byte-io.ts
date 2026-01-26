import { decodeUtf16leZ, encodeUtf16le } from './utf16';

export class ByteReader {
  private ptr = 0;
  private view: DataView;

  constructor(private readonly buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  get remaining(): number {
    return this.buf.length - this.ptr;
  }

  readUInt8(): number {
    const v = this.view.getUint8(this.ptr);
    this.ptr += 1;
    return v;
  }

  readInt8(): number {
    const v = this.view.getInt8(this.ptr);
    this.ptr += 1;
    return v;
  }

  readUInt16(): number {
    const v = this.view.getUint16(this.ptr, true);
    this.ptr += 2;
    return v;
  }

  readInt16(): number {
    const v = this.view.getInt16(this.ptr, true);
    this.ptr += 2;
    return v;
  }

  readUInt32(): number {
    const v = this.view.getUint32(this.ptr, true);
    this.ptr += 4;
    return v >>> 0;
  }

  readInt32(): number {
    const v = this.view.getInt32(this.ptr, true);
    this.ptr += 4;
    return v | 0;
  }

  readBytes(len: number): Uint8Array {
    if (this.ptr + len > this.buf.length) {
      throw new Error(
        `readBytes out of range: want=${len}, remaining=${this.remaining}`,
      );
    }
    const out = this.buf.subarray(this.ptr, this.ptr + len);
    this.ptr += len;
    return out;
  }

  readByteArray(len: number): number[] {
    const b = this.readBytes(len);
    return Array.from(b);
  }

  readAll(): Uint8Array {
    return this.buf.subarray(this.ptr);
  }

  /** fixed-size UTF-16LE string, null-terminated */
  readStringUtf16le(byteLen: number): string {
    const raw = this.readBytes(byteLen);
    return decodeUtf16leZ(raw);
  }
}

export class ByteWriter {
  private buf: Uint8Array;
  private view: DataView;
  private ptr = 0;

  constructor(initialSize = 256) {
    this.buf = new Uint8Array(initialSize);
    this.view = new DataView(this.buf.buffer);
  }

  private ensure(n: number): void {
    const need = this.ptr + n;
    if (need <= this.buf.length) return;
    let next = this.buf.length;
    while (next < need) next = Math.max(256, next * 2);
    const nb = new Uint8Array(next);
    nb.set(this.buf, 0);
    this.buf = nb;
    this.view = new DataView(this.buf.buffer);
  }

  get length(): number {
    return this.ptr;
  }

  toUint8Array(): Uint8Array {
    return this.buf.subarray(0, this.ptr);
  }

  writeUInt8(v: number): void {
    this.ensure(1);
    this.view.setUint8(this.ptr, v & 0xff);
    this.ptr += 1;
  }

  writeInt32(v: number): void {
    this.ensure(4);
    this.view.setInt32(this.ptr, v | 0, true);
    this.ptr += 4;
  }

  writeUInt16(v: number): void {
    this.ensure(2);
    this.view.setUint16(this.ptr, v & 0xffff, true);
    this.ptr += 2;
  }

  writeUInt32(v: number): void {
    this.ensure(4);
    this.view.setUint32(this.ptr, v >>> 0, true);
    this.ptr += 4;
  }

  writeBytes(bytes: Uint8Array): void {
    this.ensure(bytes.length);
    this.buf.set(bytes, this.ptr);
    this.ptr += bytes.length;
  }

  writeByteArray(values: Iterable<number>): void {
    for (const v of values) this.writeUInt8(v);
  }

  /** fixed-size UTF-16LE string, zero-padded */
  writeStringUtf16leFixed(s: string, byteLen: number): void {
    const raw = encodeUtf16le(s);
    const out = new Uint8Array(byteLen);
    out.set(raw.subarray(0, Math.min(raw.length, byteLen)));
    this.writeBytes(out);
  }
}

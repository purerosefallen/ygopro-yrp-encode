import {
  REPLAY_COMPRESSED_FLAG,
  REPLAY_SINGLE_MODE,
  REPLAY_TAG_FLAG,
  ShuffleVersion,
} from './constants';

export class ReplayHeader {
  id = 0;
  version = 0;
  flag = 0;
  seed = 0;

  /** decompressed size (low 32-bit) stored as 4 bytes LE in file */
  dataSizeRaw: number[] = [0, 0, 0, 0];

  hash = 0;

  /** Eight bytes on disk. The first five are LZMA properties, and byte 7 stores the shuffle version. */
  props: number[] = new Array(8).fill(0);

  /** Initial deck shuffle version. Unrecognized byte values are preserved. */
  get shuffleVersion(): ShuffleVersion {
    return (this.props[7] ?? ShuffleVersion.NotAvailable) as ShuffleVersion;
  }

  set shuffleVersion(version: ShuffleVersion) {
    this.props[7] = version;
  }

  // yrp2 extra
  seedSequence: number[] = [];
  /** One byte in the YRP2 header. */
  headerVersion = 0;
  /** 15 reserved bytes, preserved when reading, copying, and writing. */
  value: Uint8Array = new Uint8Array(15);

  /** @deprecated Use value instead; this maps to value[3..7). */
  get value1(): number {
    return this.readValue(3);
  }

  /** @deprecated Use value instead; this maps to value[3..7). */
  set value1(v: number) {
    this.writeValue(3, v);
  }

  /** @deprecated Use value instead; this maps to value[7..11). */
  get value2(): number {
    return this.readValue(7);
  }

  /** @deprecated Use value instead; this maps to value[7..11). */
  set value2(v: number) {
    this.writeValue(7, v);
  }

  /** @deprecated Use value instead; this maps to value[11..15). */
  get value3(): number {
    return this.readValue(11);
  }

  /** @deprecated Use value instead; this maps to value[11..15). */
  set value3(v: number) {
    this.writeValue(11, v);
  }

  private readValue(offset: number): number {
    return (
      ((this.value[offset] ?? 0) |
        ((this.value[offset + 1] ?? 0) << 8) |
        ((this.value[offset + 2] ?? 0) << 16) |
        ((this.value[offset + 3] ?? 0) << 24)) >>>
      0
    );
  }

  private writeValue(offset: number, v: number): void {
    if (this.value.length !== 15) {
      const value = new Uint8Array(15);
      value.set(this.value.subarray(0, 15));
      this.value = value;
    }
    for (let i = 0; i < 4; i++) {
      this.value[offset + i] = (v >>> (i * 8)) & 0xff;
    }
  }

  get dataSize(): number {
    return (
      (this.dataSizeRaw[0] |
        0 |
        ((this.dataSizeRaw[1] | 0) << 8) |
        ((this.dataSizeRaw[2] | 0) << 16) |
        ((this.dataSizeRaw[3] | 0) << 24)) >>>
      0
    );
  }

  set dataSize(v: number) {
    const u = v >>> 0;
    this.dataSizeRaw = [
      u & 0xff,
      (u >>> 8) & 0xff,
      (u >>> 16) & 0xff,
      (u >>> 24) & 0xff,
    ];
  }

  get isTag(): boolean {
    return (this.flag & REPLAY_TAG_FLAG) !== 0;
  }

  get isCompressed(): boolean {
    return (this.flag & REPLAY_COMPRESSED_FLAG) !== 0;
  }

  get isSingleMode(): boolean {
    return (this.flag & REPLAY_SINGLE_MODE) !== 0;
  }

  /** Compose a standard 13-byte .lzma header (props[0..5) + uncompressed size (8 bytes LE)) */
  getLzmaHeader13(): Uint8Array {
    const out = new Uint8Array(13);
    out.set(Uint8Array.from(this.props.slice(0, 5)), 0);
    out.set(Uint8Array.from(this.dataSizeRaw.slice(0, 4)), 5);
    // upper 32-bit of size = 0
    out[9] = 0;
    out[10] = 0;
    out[11] = 0;
    out[12] = 0;
    return out;
  }
}

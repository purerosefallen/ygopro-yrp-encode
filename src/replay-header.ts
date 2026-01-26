import {
  REPLAY_COMPRESSED_FLAG,
  REPLAY_SINGLE_MODE,
  REPLAY_TAG_FLAG,
} from './constants';

export class ReplayHeader {
  id = 0;
  version = 0;
  flag = 0;
  seed = 0;

  /** decompressed size (low 32-bit) stored as 4 bytes LE in file */
  dataSizeRaw: number[] = [0, 0, 0, 0];

  hash = 0;

  /** 8 bytes stored in file; only first 5 are LZMA properties */
  props: number[] = new Array(8).fill(0);

  // yrp2 extra
  seedSequence: number[] = [];
  headerVersion = 0;
  value1 = 0;
  value2 = 0;
  value3 = 0;

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

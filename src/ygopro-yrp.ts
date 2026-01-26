// Platform-agnostic YGOPro .yrp/.yrp2 replay parser + writer (no Node APIs, no Buffer)
// Compression: uses @nanahira/lzma1 (CJS+ESM). API assumed identical to lzma1: compress(Uint8Array)->Uint8Array, decompress(Uint8Array)->Uint8Array

import YGOProDeck from 'ygopro-deck-encode';

import { REPLAY_ID_YRP2 } from './constants';
import { ReplayHeader } from './replay-header';
import type { YGOProYrpLike } from './ygopro-yrp-like';
import {
  decompressBody,
  readDeck,
  readHeader,
  readResponses,
  writeDeck,
  writeHeader,
  writeResponses,
} from './replay-io';
import { ByteReader, ByteWriter } from './utility/byte-io';
import { concatBytes } from './utility/bytes';
import { compress } from '@nanahira/lzma1';

export class YGOProYrp {
  constructor(init: Partial<YGOProYrpLike> = {}) {
    if (init.header) {
      const h = new ReplayHeader();
      h.id = init.header.id ?? 0;
      h.version = init.header.version ?? 0;
      h.flag = init.header.flag ?? 0;
      h.seed = init.header.seed ?? 0;
      h.dataSizeRaw = [...(init.header.dataSizeRaw ?? [0, 0, 0, 0])];
      h.hash = init.header.hash ?? 0;
      h.props = [...(init.header.props ?? [])];
      h.seedSequence = [...(init.header.seedSequence ?? [])];
      h.headerVersion = init.header.headerVersion ?? 0;
      h.value1 = init.header.value1 ?? 0;
      h.value2 = init.header.value2 ?? 0;
      h.value3 = init.header.value3 ?? 0;
      this.header = h;
    } else if (init.header === null) {
      this.header = null;
    }

    if (init.hostName !== undefined) this.hostName = init.hostName;
    if (init.clientName !== undefined) this.clientName = init.clientName;
    if (init.startLp !== undefined) this.startLp = init.startLp;
    if (init.startHand !== undefined) this.startHand = init.startHand;
    if (init.drawCount !== undefined) this.drawCount = init.drawCount;
    if (init.opt !== undefined) this.opt = init.opt;

    if (init.hostDeck) {
      this.hostDeck = new YGOProDeck({
        main: [...(init.hostDeck.main ?? [])],
        extra: [...(init.hostDeck.extra ?? [])],
        side: [...(init.hostDeck.side ?? [])],
        name: init.hostDeck.name,
      });
    } else if (init.hostDeck === null) {
      this.hostDeck = null;
    }

    if (init.clientDeck) {
      this.clientDeck = new YGOProDeck({
        main: [...(init.clientDeck.main ?? [])],
        extra: [...(init.clientDeck.extra ?? [])],
        side: [...(init.clientDeck.side ?? [])],
        name: init.clientDeck.name,
      });
    } else if (init.clientDeck === null) {
      this.clientDeck = null;
    }

    if (init.tagHostName !== undefined) this.tagHostName = init.tagHostName;
    if (init.tagClientName !== undefined)
      this.tagClientName = init.tagClientName;

    if (init.tagHostDeck) {
      this.tagHostDeck = new YGOProDeck({
        main: [...(init.tagHostDeck.main ?? [])],
        extra: [...(init.tagHostDeck.extra ?? [])],
        side: [...(init.tagHostDeck.side ?? [])],
        name: init.tagHostDeck.name,
      });
    } else if (init.tagHostDeck === null) {
      this.tagHostDeck = null;
    }

    if (init.tagClientDeck) {
      this.tagClientDeck = new YGOProDeck({
        main: [...(init.tagClientDeck.main ?? [])],
        extra: [...(init.tagClientDeck.extra ?? [])],
        side: [...(init.tagClientDeck.side ?? [])],
        name: init.tagClientDeck.name,
      });
    } else if (init.tagClientDeck === null) {
      this.tagClientDeck = null;
    }

    if (init.responses) {
      this.responses = init.responses.map((seg) => new Uint8Array(seg));
    }
  }

  header: ReplayHeader | null = null;

  hostName = '';
  clientName = '';

  startLp = 0;
  startHand = 0;
  drawCount = 0;
  opt = 0;

  hostDeck: YGOProDeck | null = null;
  clientDeck: YGOProDeck | null = null;

  // Tag duel (2v2)
  tagHostName: string | null = null;
  tagClientName: string | null = null;
  tagHostDeck: YGOProDeck | null = null;
  tagClientDeck: YGOProDeck | null = null;

  responses: Uint8Array[] = [];

  get isTag(): boolean {
    return this.header?.isTag ?? false;
  }
  get isCompressed(): boolean {
    return this.header?.isCompressed ?? false;
  }

  /** Parse .yrp/.yrp2 bytes */
  fromYrp(payload: Uint8Array) {
    const r0 = new ByteReader(payload);
    const h = readHeader(r0);
    const rawBody = r0.readAll();

    const body = h.isCompressed ? decompressBody(h, rawBody) : rawBody;
    const r = new ByteReader(body);

    this.header = h;

    this.hostName = r.readStringUtf16le(40);
    if (h.isTag) {
      this.tagHostName = r.readStringUtf16le(40);
      this.tagClientName = r.readStringUtf16le(40);
    } else {
      this.tagHostName = null;
      this.tagClientName = null;
    }
    this.clientName = r.readStringUtf16le(40);

    this.startLp = r.readInt32();
    this.startHand = r.readInt32();
    this.drawCount = r.readInt32();
    this.opt = r.readInt32();

    this.hostDeck = readDeck(r);
    if (h.isTag) {
      this.tagHostDeck = readDeck(r);
      this.tagClientDeck = readDeck(r);
    } else {
      this.tagHostDeck = null;
      this.tagClientDeck = null;
    }
    this.clientDeck = readDeck(r);

    this.responses = readResponses(r);
    return this;
  }

  /** Serialize to .yrp/.yrp2 bytes (Uint8Array) */
  toYrp(): Uint8Array {
    if (!this.header)
      throw new Error(
        'Header not initialized. Call fromYrp() or set header first.',
      );

    // --- build uncompressed body ---
    const w = new ByteWriter(1024);

    w.writeStringUtf16leFixed(this.hostName ?? '', 40);
    if (this.header.isTag) {
      w.writeStringUtf16leFixed(this.tagHostName ?? '', 40);
      w.writeStringUtf16leFixed(this.tagClientName ?? '', 40);
    }
    w.writeStringUtf16leFixed(this.clientName ?? '', 40);

    w.writeInt32(this.startLp);
    w.writeInt32(this.startHand);
    w.writeInt32(this.drawCount);
    w.writeInt32(this.opt);

    writeDeck(w, this.hostDeck);
    if (this.header.isTag) {
      writeDeck(w, this.tagHostDeck);
      writeDeck(w, this.tagClientDeck);
    }
    writeDeck(w, this.clientDeck);

    writeResponses(w, this.responses);

    const bodyRaw = w.toUint8Array();

    // Update decompressed size in header (important for LZMA header reconstruction)
    this.header.dataSize = bodyRaw.length;

    // --- compress if needed ---
    let bodyOut = bodyRaw;

    if (this.header.isCompressed) {
      const compressedFull = compress(bodyRaw);
      if (compressedFull.length < 13)
        throw new Error('Invalid LZMA output: too short.');

      // Sync props with what the compressor produced (first 5 bytes of .lzma header)
      const props5 = compressedFull.subarray(0, 5);
      const newProps8 = new Array(8).fill(0);
      for (let i = 0; i < 5; i++) newProps8[i] = props5[i]!;
      // keep old tail if present (often unused, but harmless)
      for (let i = 5; i < 8; i++)
        newProps8[i] = (this.header.props[i] ?? 0) & 0xff;
      this.header.props = newProps8;

      // YGOPro stores raw LZMA stream WITHOUT the 13-byte header
      bodyOut = compressedFull.subarray(13);
    }

    // --- write header ---
    const hw = new ByteWriter(this.header.id === REPLAY_ID_YRP2 ? 96 : 64);
    writeHeader(hw, this.header);
    const headerBytes = hw.toUint8Array();

    return concatBytes(headerBytes, bodyOut);
  }
}

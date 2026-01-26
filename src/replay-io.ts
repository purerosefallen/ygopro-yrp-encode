import YGOProDeck from 'ygopro-deck-encode';

import { REPLAY_ID_YRP2, SEED_COUNT } from './constants';
import { ReplayHeader } from './replay-header';
import { ByteReader, ByteWriter } from './utility/byte-io';
import { concatBytes, u8ToI32 } from './utility/bytes';
import { decompress } from '@nanahira/lzma1';

export function readHeader(r: ByteReader): ReplayHeader {
  const h = new ReplayHeader();
  h.id = r.readUInt32();
  h.version = r.readUInt32();
  h.flag = r.readUInt32();
  h.seed = r.readUInt32();
  h.dataSizeRaw = r.readByteArray(4);
  h.hash = r.readUInt32();
  h.props = r.readByteArray(8);

  if (h.id === REPLAY_ID_YRP2) {
    h.seedSequence = [];
    for (let i = 0; i < SEED_COUNT; i++) h.seedSequence.push(r.readUInt32());
    h.headerVersion = r.readUInt32();
    h.value1 = r.readUInt32();
    h.value2 = r.readUInt32();
    h.value3 = r.readUInt32();
  }
  return h;
}

export function writeHeader(w: ByteWriter, h: ReplayHeader): void {
  w.writeUInt32(h.id);
  w.writeUInt32(h.version);
  w.writeUInt32(h.flag);
  w.writeUInt32(h.seed);
  w.writeByteArray(h.dataSizeRaw);
  w.writeUInt32(h.hash);

  // Ensure props length == 8
  const props8 = new Array(8).fill(0).map((_, i) => (h.props[i] ?? 0) & 0xff);
  w.writeByteArray(props8);

  if (h.id === REPLAY_ID_YRP2) {
    for (let i = 0; i < SEED_COUNT; i++) w.writeUInt32(h.seedSequence[i] ?? 0);
    w.writeUInt32(h.headerVersion);
    w.writeUInt32(h.value1);
    w.writeUInt32(h.value2);
    w.writeUInt32(h.value3);
  }
}

export function decompressBody(
  h: ReplayHeader,
  rawBody: Uint8Array,
): Uint8Array {
  const lzmaPayload = concatBytes(h.getLzmaHeader13(), rawBody);
  return decompress(lzmaPayload);
}

function readDeckPack(r: ByteReader): number[] {
  const len = r.readInt32();
  const out: number[] = [];
  for (let i = 0; i < len; i++) out.push(r.readInt32());
  return out;
}

export function readDeck(r: ByteReader): YGOProDeck {
  const deck = new YGOProDeck();
  deck.main = readDeckPack(r);
  deck.extra = readDeckPack(r);
  return deck;
}

function writeDeckPack(w: ByteWriter, pack: number[]): void {
  w.writeInt32(u8ToI32(pack.length));
  for (const id of pack) w.writeInt32(id | 0);
}

export function writeDeck(w: ByteWriter, d: YGOProDeck | null): void {
  if (!d) {
    w.writeInt32(0);
    w.writeInt32(0);
    return;
  }
  writeDeckPack(w, d.main ?? []);
  writeDeckPack(w, d.extra ?? []);
}

export function readResponses(r: ByteReader): Uint8Array[] {
  const out: Uint8Array[] = [];
  while (r.remaining > 0) {
    let len: number;
    try {
      len = r.readUInt8();
    } catch {
      break;
    }
    if (len > 64) len = 64; // mimic common yrp reader behavior
    if (r.remaining < len) break;
    out.push(r.readBytes(len));
  }
  return out;
}

export function writeResponses(w: ByteWriter, res: Uint8Array[]): void {
  for (const seg of res) {
    w.writeUInt8(seg.length & 0xff);
    w.writeBytes(seg);
  }
}

import fs from 'fs';
import path from 'path';

import YGOProDeck from 'ygopro-deck-encode';

import {
  DUEL_TAG_MODE,
  REPLAY_COMPRESSED_FLAG,
  REPLAY_ID_YRP1,
  REPLAY_ID_YRP2,
  REPLAY_SINGLE_MODE,
  REPLAY_TAG_FLAG,
  ReplayHeader,
  YGOProYrp,
} from '../index';
import { readHeader, writeHeader } from '../src/replay-io';
import { ByteReader, ByteWriter } from '../src/utility/byte-io';

const U32_VALUES = [0, 1, 0x7fffffff, 0x80000000, 0xffffffff, 0x12345678];
const LEGACY_VERSIONS = [0, 1, 0xff, 0x100, 0x12345601, 0xffffffff];
const VALUE_FIELDS = ['value1', 'value2', 'value3'] as const;

function serializeHeader(header: ReplayHeader): Uint8Array {
  const writer = new ByteWriter();
  writeHeader(writer, header);
  return writer.toUint8Array();
}

// Independent oracle for the pre-1.0.9 layout. Do not use ByteWriter here.
function legacyHeaderBytes(
  headerVersion: number,
  values: number[],
): Uint8Array {
  const bytes = new Uint8Array(80);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, REPLAY_ID_YRP2, true);
  view.setUint32(4, 0x1362, true);
  view.setUint32(8, REPLAY_COMPRESSED_FLAG, true);
  view.setUint32(12, 0xabcdef01, true);
  view.setUint32(16, 0x1234, true);
  view.setUint32(20, 0x98765432, true);
  bytes.set([0x5d, 0, 0, 1, 0, 0xaa, 0xbb, 0xcc], 24);
  for (let i = 0; i < 8; i++) view.setUint32(32 + i * 4, i * 0x1234567, true);
  view.setUint32(64, headerVersion, true);
  for (let i = 0; i < 3; i++) view.setUint32(68 + i * 4, values[i], true);
  return bytes;
}

function patternedValue(): Uint8Array {
  return Uint8Array.from({ length: 15 }, (_, i) => 0x81 + i * 7);
}

describe('YRP2 header layout compatibility', () => {
  it('defaults to the existing version and independent zeroed reserved bytes', () => {
    const header = new ReplayHeader();
    expect(header.headerVersion).toBe(0);
    expect(header.value).toEqual(new Uint8Array(15));
    header.value[0] = 0xff;
    expect(new ReplayHeader().value[0]).toBe(0);
  });

  it.each(LEGACY_VERSIONS)(
    'preserves legacy version word %i byte for byte',
    (version) => {
      for (const value of U32_VALUES) {
        const values = [value, (value ^ 0xa5a5a5a5) >>> 0, (value + 1) >>> 0];
        const bytes = legacyHeaderBytes(version, values);
        const withSentinel = new Uint8Array(84);
        withSentinel.set(bytes);
        withSentinel.set([0xde, 0xad, 0xbe, 0xef], 80);
        const reader = new ByteReader(withSentinel);
        const header = readHeader(reader);

        expect(header.headerVersion).toBe(version & 0xff);
        expect(header.value).toEqual(bytes.slice(65, 80));
        expect(VALUE_FIELDS.map((field) => header[field])).toEqual(values);
        expect(serializeHeader(header)).toEqual(bytes);
        expect(reader.remaining).toBe(4);
        expect(reader.readUInt32()).toBe(0xefbeadde);
      }
    },
  );

  it('writes every possible version byte at offset 64 without shifting the body', () => {
    const header = new ReplayHeader();
    header.id = REPLAY_ID_YRP2;
    header.value = patternedValue();
    for (let version = 0; version <= 0xff; version++) {
      header.headerVersion = version;
      const bytes = serializeHeader(header);
      expect(bytes).toHaveLength(80);
      expect(bytes[64]).toBe(version);
      expect(bytes.slice(65)).toEqual(header.value);
    }
  });

  it.each([0, 3, 14, 15, 16, 30])(
    'writes exactly 15 reserved bytes from length %i',
    (length) => {
      const header = new ReplayHeader();
      header.id = REPLAY_ID_YRP2;
      header.value = Uint8Array.from({ length }, (_, i) => i + 1);
      const original = header.value.slice();
      const expected = new Uint8Array(15);
      expected.set(original.subarray(0, 15));
      const bytes = serializeHeader(header);
      expect(bytes).toHaveLength(80);
      expect(bytes.slice(65)).toEqual(expected);
      expect(header.value).toEqual(original);
    },
  );

  it('owns the parsed reserved bytes even when the input is a subarray', () => {
    const input = new Uint8Array(93);
    input.set(legacyHeaderBytes(0x12345601, U32_VALUES.slice(3)), 9);
    const header = readHeader(new ByteReader(input.subarray(9, 89)));
    const original = input.slice();
    header.value[0] ^= 0xff;
    expect(input).toEqual(original);
    const value = header.value.slice();
    input.fill(0);
    expect(header.value).toEqual(value);
  });

  it.each([0, 1, 14])(
    'rejects a truncated reserved area of %i bytes',
    (length) => {
      const input = legacyHeaderBytes(1, [0, 0, 0]).slice(0, 65 + length);
      expect(() => readHeader(new ByteReader(input))).toThrow();
    },
  );

  it('retains the original 32-byte YRP1 header', () => {
    const header = readHeader(new ByteReader(legacyHeaderBytes(1, [1, 2, 3])));
    header.id = REPLAY_ID_YRP1;
    const expected = legacyHeaderBytes(1, [1, 2, 3]).slice(0, 32);
    new DataView(expected.buffer).setUint32(0, REPLAY_ID_YRP1, true);
    expect(serializeHeader(header)).toEqual(expected);
    const parsed = readHeader(new ByteReader(expected));
    expect(parsed.value).toEqual(new Uint8Array(15));
  });
});

describe('deprecated u32 accessors', () => {
  it.each(VALUE_FIELDS)(
    '%s reads and writes its original little-endian slot',
    (field) => {
      const offset = 3 + VALUE_FIELDS.indexOf(field) * 4;
      const header = new ReplayHeader();
      header.id = REPLAY_ID_YRP2;
      header.headerVersion = 1;
      // A subarray also catches incorrect DataView byteOffset handling.
      const backing = new Uint8Array(23).fill(0x55);
      header.value = backing.subarray(4, 19);
      header.value.set(patternedValue());
      for (const value of U32_VALUES) {
        const expected = header.value.slice();
        new DataView(expected.buffer).setUint32(offset, value, true);
        header[field] = value;
        expect(header.value).toEqual(expected);
        expect(header[field]).toBe(value);
        expect(backing.slice(0, 4)).toEqual(new Uint8Array(4).fill(0x55));
        expect(backing.slice(19)).toEqual(new Uint8Array(4).fill(0x55));

        const changed = (value ^ 0xffffffff) >>> 0;
        new DataView(backing.buffer).setUint32(4 + offset, changed, true);
        expect(header[field]).toBe(changed);
        const bytes = serializeHeader(header);
        expect(new DataView(bytes.buffer).getUint32(65 + offset, true)).toBe(
          changed,
        );
      }
    },
  );

  it('zero-extends short arrays and keeps all other reserved bytes on write', () => {
    const header = new ReplayHeader();
    header.value = Uint8Array.of(0xaa, 0xbb, 0xcc, 0xdd);
    expect(header.value1).toBe(0xdd);
    expect(header.value3).toBe(0);
    header.value3 = 0xffffffff;
    expect(header.value).toEqual(
      Uint8Array.of(
        0xaa,
        0xbb,
        0xcc,
        0xdd,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        255,
        255,
        255,
        255,
      ),
    );
  });
});

describe('header cloning', () => {
  it('deep-copies all 15 bytes and gives value precedence over legacy fields', () => {
    const value = patternedValue();
    const header = Object.assign(new ReplayHeader(), {
      id: REPLAY_ID_YRP2,
      value,
    });
    Object.defineProperties(header, {
      value1: { get: () => 0 },
      value2: { get: () => 0 },
      value3: { get: () => 0 },
    });
    const copy = new YGOProYrp({ header }).header!;
    expect(copy.value).toEqual(value);
    expect(copy.value.buffer).not.toBe(value.buffer);
    copy.value1 = 0;
    expect(header.value).toEqual(patternedValue());
    const copiedValue = copy.value.slice();
    value.fill(0);
    expect(copy.value).toEqual(copiedValue);
  });

  it.each(LEGACY_VERSIONS)(
    'migrates an old header object with version word %i',
    (version) => {
      const legacy = {
        id: REPLAY_ID_YRP2,
        headerVersion: version,
        value1: 0x12345678,
        value2: 0x80000000,
        value3: 0xffffffff,
      };
      const copy = new YGOProYrp({ header: legacy as ReplayHeader }).header!;
      const expected = new Uint8Array(16);
      const view = new DataView(expected.buffer);
      view.setUint32(0, version, true);
      view.setUint32(4, legacy.value1, true);
      view.setUint32(8, legacy.value2, true);
      view.setUint32(12, legacy.value3, true);
      expect(copy.headerVersion).toBe(version & 0xff);
      expect(copy.value).toEqual(expected.slice(1));
      expect(serializeHeader(copy).slice(64)).toEqual(expected);
      expect(copy.value1).toBe(legacy.value1);
      expect(copy.value2).toBe(legacy.value2);
      expect(copy.value3).toBe(legacy.value3);
    },
  );
});

describe('replay body compatibility', () => {
  it('preserves the sample replay header and complete parsed replay', () => {
    const input = fs.readFileSync(path.join(__dirname, 'ygopro-yrp-test.yrp'));
    const replay = new YGOProYrp().fromYrp(input);
    expect(serializeHeader(replay.header!)).toEqual(
      new Uint8Array(input.subarray(0, 80)),
    );
    const roundTripped = new YGOProYrp().fromYrp(replay.toYrp());
    expect(roundTripped).toEqual(replay);
  });

  it.each([
    ['regular', 0, 0],
    ['tag', REPLAY_TAG_FLAG, DUEL_TAG_MODE],
    ['single', REPLAY_SINGLE_MODE, 0],
  ] as const)(
    'preserves %s body semantics with arbitrary reserved bytes',
    (_, flag, opt) => {
      for (const id of [REPLAY_ID_YRP1, REPLAY_ID_YRP2]) {
        for (const compressed of [false, true]) {
          const header = new ReplayHeader();
          header.id = id;
          header.headerVersion = 1;
          header.flag = flag | (compressed ? REPLAY_COMPRESSED_FLAG : 0);
          header.seedSequence = [1, 2, 3, 4, 5, 6, 7, 8];
          header.value = patternedValue();
          const replay = new YGOProYrp({
            header,
            hostName: 'P1',
            clientName: 'P2',
            startLp: 8000,
            startHand: 5,
            drawCount: 1,
            opt,
            singleScript: flag & REPLAY_SINGLE_MODE ? 'example.lua' : null,
            hostDeck: new YGOProDeck({ main: [123, 456], extra: [789] }),
            clientDeck: new YGOProDeck({ main: [987], extra: [654] }),
            tagHostName: 'P3',
            tagClientName: 'P4',
            tagHostDeck: new YGOProDeck({ main: [321] }),
            tagClientDeck: new YGOProDeck({ main: [432] }),
            responses: [
              Uint8Array.of(0x80, 0xff),
              new Uint8Array(255).fill(0xaa),
            ],
          });
          const bytes = replay.toYrp();
          const headerSize = id === REPLAY_ID_YRP2 ? 80 : 32;
          if (id === REPLAY_ID_YRP2) {
            expect(bytes.slice(64, 80)).toEqual(
              Uint8Array.of(1, ...header.value),
            );
          }
          if (!compressed) {
            expect(bytes.slice(headerSize, headerSize + 4)).toEqual(
              Uint8Array.of(80, 0, 49, 0),
            );
          }
          const parsed = new YGOProYrp().fromYrp(bytes);
          expect(parsed.hostName).toBe('P1');
          expect(parsed.clientName).toBe('P2');
          expect(parsed.responses).toEqual(replay.responses);
          expect(parsed.singleScript).toBe(replay.singleScript);
          if (!(flag & REPLAY_SINGLE_MODE)) {
            expect(parsed.hostDeck).toEqual(replay.hostDeck);
            expect(parsed.clientDeck).toEqual(replay.clientDeck);
          }
          if (flag & REPLAY_TAG_FLAG) {
            expect(parsed.tagHostName).toBe('P3');
            expect(parsed.tagClientName).toBe('P4');
            expect(parsed.tagHostDeck).toEqual(replay.tagHostDeck);
            expect(parsed.tagClientDeck).toEqual(replay.tagClientDeck);
          }
          const roundTripped = new YGOProYrp().fromYrp(
            new YGOProYrp(parsed).toYrp(),
          );
          expect(roundTripped).toEqual(parsed);
        }
      }
    },
  );
});

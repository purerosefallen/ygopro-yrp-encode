import fs from 'fs';
import path from 'path';

import { REPLAY_ID_YRP1, ReplayHeader, YGOProYrp } from '../index';

const ROOT = path.resolve(__dirname, '..');
const YRP1_HEADER_SIZE = 32;
const REGULAR_DUEL_INFO_SIZE = 112;
const RESPONSE_OFFSET = YRP1_HEADER_SIZE + REGULAR_DUEL_INFO_SIZE;

function concatBytes(...segments: Uint8Array[]): Uint8Array {
  const total = segments.reduce((sum, seg) => sum + seg.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const seg of segments) {
    out.set(seg, offset);
    offset += seg.length;
  }
  return out;
}

function responseSegment(prefix: number[], payload: Uint8Array): Uint8Array {
  return concatBytes(Uint8Array.from(prefix), payload);
}

function createUncompressedYrp(responses: Uint8Array[]): YGOProYrp {
  const header = new ReplayHeader();
  header.id = REPLAY_ID_YRP1;
  return new YGOProYrp({ header, responses });
}

function getResponseBytes(yrpBytes: Uint8Array): Uint8Array {
  return yrpBytes.subarray(RESPONSE_OFFSET);
}

it('parses names and remakes yrp', () => {
  const inputPath = path.join(ROOT, 'tests', 'ygopro-yrp-test.yrp');
  const outputPath = path.join(ROOT, 'ygopro-yrp-test-remake.yrp');
  const outputPath2 = path.join(ROOT, 'ygopro-yrp-test-remake2.yrp');

  const payload = fs.readFileSync(inputPath);
  const yrp = new YGOProYrp().fromYrp(payload);

  expect(yrp.hostName).toBe('p1');
  expect(yrp.clientName).toBe('蓝叶雾叶');

  const remade = yrp.toYrp();
  fs.writeFileSync(outputPath, remade);

  yrp.clientName = 'p2'; // change to test
  const remade2 = yrp.toYrp();
  const yrp2 = new YGOProYrp().fromYrp(remade2);
  expect(yrp2.clientName).toBe('p2');

  fs.writeFileSync(outputPath2, remade2);

  const cloned = new YGOProYrp(yrp);
  expect(cloned.hostName).toBe('p1');
  expect(cloned.clientName).toBe('p2');
  const remade3 = cloned.toYrp();
  expect(remade3).toEqual(remade2);

  cloned.hostName = 'player1';
  const remade4 = cloned.toYrp();
  const yrp4 = new YGOProYrp().fromYrp(remade4);
  expect(yrp4.hostName).toBe('player1');
});

it('round-trips extended response lengths', () => {
  const maxLengthResponse = new Uint8Array(255).fill(0xaa);
  const extendedResponse = new Uint8Array(256).fill(0xbb);
  const maxResponse = new Uint8Array(512).fill(0xcc);
  const oversizeResponse = new Uint8Array(513).fill(0xdd);
  const trailingResponse = new Uint8Array([0xee, 0xff]);
  const emptyResponse = new Uint8Array(0);

  const yrp = createUncompressedYrp([
    emptyResponse,
    maxLengthResponse,
    extendedResponse,
    maxResponse,
    oversizeResponse,
    trailingResponse,
  ]);

  const yrpBytes = yrp.toYrp();
  const roundTripped = new YGOProYrp().fromYrp(yrpBytes);
  const expectedOversizeResponse = oversizeResponse.subarray(0, 512);

  expect(roundTripped.responses).toHaveLength(5);
  expect(roundTripped.responses[0]).toEqual(maxLengthResponse);
  expect(roundTripped.responses[1]).toEqual(extendedResponse);
  expect(roundTripped.responses[2]).toEqual(maxResponse);
  expect(roundTripped.responses[3]).toEqual(expectedOversizeResponse);
  expect(roundTripped.responses[4]).toEqual(trailingResponse);

  expect(getResponseBytes(yrpBytes)).toEqual(
    concatBytes(
      responseSegment([0xff], maxLengthResponse),
      responseSegment([0x00, 0x00, 0x01], extendedResponse),
      responseSegment([0x00, 0x00, 0x02], maxResponse),
      responseSegment([0x00, 0x00, 0x02], expectedOversizeResponse),
      responseSegment([0x02], trailingResponse),
    ),
  );
});

it('caps oversized extended responses while skipping only the capped length', () => {
  const declaredOversizeResponse = new Uint8Array(512).fill(0xab);
  const trailingResponse = new Uint8Array([0xcd]);
  const yrpPrefix = createUncompressedYrp([]).toYrp();
  const malformedResponseBytes = concatBytes(
    yrpPrefix,
    responseSegment([0x00, 0x58, 0x02], declaredOversizeResponse),
    responseSegment([0x01], trailingResponse),
  );

  const parsed = new YGOProYrp().fromYrp(malformedResponseBytes);

  expect(parsed.responses).toHaveLength(2);
  expect(parsed.responses[0]).toEqual(
    declaredOversizeResponse.subarray(0, 512),
  );
  expect(parsed.responses[1]).toEqual(trailingResponse);
});

import fs from 'fs';
import path from 'path';

import { REPLAY_ID_YRP1, ReplayHeader, YGOProYrp } from '../index';

const ROOT = path.resolve(__dirname, '..');

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

it('skips responses that do not fit in one byte', () => {
  const header = new ReplayHeader();
  header.id = REPLAY_ID_YRP1;

  const maxLengthResponse = new Uint8Array(255).fill(0xaa);
  const tooLongResponse = new Uint8Array(256).fill(0xbb);
  const trailingResponse = new Uint8Array([0xcc, 0xdd]);

  const yrp = new YGOProYrp({
    header,
    responses: [maxLengthResponse, tooLongResponse, trailingResponse],
  });

  const roundTripped = new YGOProYrp().fromYrp(yrp.toYrp());

  expect(roundTripped.responses).toHaveLength(2);
  expect(roundTripped.responses[0]).toEqual(maxLengthResponse);
  expect(roundTripped.responses[1]).toEqual(trailingResponse);
});

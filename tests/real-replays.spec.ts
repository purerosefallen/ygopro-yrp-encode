import fs from 'fs';
import path from 'path';

import { YGOProYrp } from '../index';
import { writeHeader } from '../src/replay-io';
import { ByteWriter } from '../src/utility/byte-io';

const REPLAY_DIR = path.join(__dirname, 'test-replays');
const EXPECTED_REPLAY_FILES = Array.from(
  { length: 100 },
  (_, i) => `${String(i + 1).padStart(3, '0')}.yrp`,
);

describe('real replay fixtures', () => {
  it('contains exactly the anonymized replay set', () => {
    const files = fs
      .readdirSync(REPLAY_DIR)
      .filter((fileName) => fileName.endsWith('.yrp'))
      .sort();

    expect(files).toEqual(EXPECTED_REPLAY_FILES);
  });

  it.each(EXPECTED_REPLAY_FILES)('parses anonymized replay %s', (fileName) => {
    const input = fs.readFileSync(path.join(REPLAY_DIR, fileName));
    const replay = new YGOProYrp().fromYrp(input);
    const writer = new ByteWriter();
    writeHeader(writer, replay.header!);
    expect(writer.toUint8Array()).toEqual(
      new Uint8Array(input.subarray(0, 80)),
    );
    expect(replay.header!.headerVersion).toBe(input[64]);
    expect(replay.header!.value).toEqual(
      new Uint8Array(input.subarray(65, 80)),
    );
    const roundTripped = new YGOProYrp().fromYrp(replay.toYrp());
    expect(roundTripped).toEqual(replay);

    expect(replay.hostName).toBe('P1');
    expect(replay.clientName).toBe('P2');
    expect(replay.responses.length).toBeGreaterThan(0);
    expect(roundTripped.responses).toEqual(replay.responses);
    if (replay.isTag) {
      expect(replay.tagHostName).toBe('P1');
      expect(replay.tagClientName).toBe('P2');
    } else {
      expect(replay.tagHostName).toBeNull();
      expect(replay.tagClientName).toBeNull();
    }
  });
});

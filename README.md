# ygopro-yrp-encode

A platform-agnostic YGOPro `.yrp` / `.yrp2` replay parser and writer (no Node `Buffer` usage inside the core logic).

## Install

```bash
npm i ygopro-yrp-encode
```

## API

### `YGOProYrp`

Main class for reading and writing replays.

```ts
import { YGOProYrp } from 'ygopro-yrp-encode';

// Read
const payload = fs.readFileSync('tests/ygopro-yrp-test.yrp');
const yrp = new YGOProYrp().fromYrp(payload);

console.log(yrp.hostName);   // first player name
console.log(yrp.clientName); // second player name

// Write
const out = yrp.toYrp();
fs.writeFileSync('ygopro-yrp-test-remake.yrp', out);
```

### `YGOProYrpLike`

Structure used by the deep-copy constructor.

```ts
import { YGOProYrp, type YGOProYrpLike } from 'ygopro-yrp-encode';

const copy = new YGOProYrp(existing as YGOProYrpLike); // deep copy
```

### `ReplayHeader`

Header object used by `YGOProYrp`. It exposes flags and LZMA properties.

```ts
import { ReplayHeader, REPLAY_ID_YRP1, REPLAY_ID_YRP2 } from 'ygopro-yrp-encode';

const header = new ReplayHeader();
header.id = REPLAY_ID_YRP1;
```

`shuffleVersion` reads and writes `props[7]` in both YRP1 and YRP2. The exported
`ShuffleVersion` enum defines `NotAvailable` (0), `None` (1), `MTRandom` (2),
`MTRandomWithSalt` (3), and `Other` (4). Older replays with a zero byte read as
`NotAvailable`. Unrecognized byte values are preserved when writing a replay.

For YRP2, `headerVersion` occupies one byte and `value` is a zero-initialized
`Uint8Array(15)` containing reserved bytes. All 15 bytes are preserved on read,
deep copy, and write, including nonzero bytes. Writing always emits 15 reserved
bytes, zero-padding shorter arrays and truncating longer ones. The YRP2 header
remains 80 bytes, with the version at offset 64 and the reserved bytes at 65–79.

The deprecated `value1`, `value2`, and `value3` getters/setters remain available.
They expose little-endian unsigned 32-bit values at offsets 3, 7, and 11 within
`value`, respectively. New code should use `value` directly and preserve bytes
whose meaning it does not know. For example, the equivalent of
`header.value1 = 0x12345678` is:

```ts
new DataView(
  header.value.buffer,
  header.value.byteOffset,
  header.value.byteLength,
).setUint32(3, 0x12345678, true);
```

The deep-copy constructor also accepts legacy header objects without `value`:
it migrates the upper three bytes of the old 32-bit `headerVersion` followed by
`value1`, `value2`, and `value3` into the reserved array. If `value` is present,
it takes precedence over the deprecated fields. When parsing old files, the
version is now the low byte; the other three bytes are preserved in `value`.

### Constants

```ts
import {
  SEED_COUNT,
  REPLAY_ID_YRP1,
  REPLAY_ID_YRP2,
  REPLAY_COMPRESSED_FLAG,
  REPLAY_TAG_FLAG,
  REPLAY_DECODED_FLAG,
  REPLAY_SINGLE_MODE,
  REPLAY_UNIFORM,
} from 'ygopro-yrp-encode';
```

## Notes

- Repacking will usually produce a different SHA256, because LZMA compression output is not byte-stable.
- Tag duel fields (`tag*`) are only present when `header.isTag` is true.

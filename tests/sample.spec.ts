import fs from 'fs';
import path from 'path';

import { YGOProYrp } from '../index';

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
});

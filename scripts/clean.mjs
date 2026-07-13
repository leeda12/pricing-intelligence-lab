import { rmSync } from 'node:fs';

for (const path of ['dist', 'dist-server']) {
  rmSync(path, { recursive: true, force: true });
}

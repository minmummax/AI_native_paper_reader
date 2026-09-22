import { cp, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const destination = resolve('public', 'pdfjs');
await mkdir(destination, { recursive: true });
for (const name of ['cmaps', 'standard_fonts']) {
  await cp(resolve('node_modules', 'pdfjs-dist', name), join(destination, name), { recursive: true });
}

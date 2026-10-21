/**
 * Guards against Vite's asset-URL rewrite of `new URL(`...`, import.meta.url)`,
 * which silently sent every dashboard API call to `/_astro/undefined` in production.
 * Checks the source, and the built bundle when `dist/` exists.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');

describe('dashboard API URLs survive the production build', () => {
  it('source never passes import.meta.url directly next to a template-literal URL', () => {
    const src = readFileSync(join(root, 'src/components/app/api-client.ts'), 'utf8');
    expect(src).not.toMatch(/new URL\(`[^`]*`,\s*import\.meta\.url\)/);
  });

  it('built client bundles contain no rewritten asset lookup for /api', () => {
    const dir = join(root, 'dist/_astro');
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
      const code = readFileSync(join(dir, f), 'utf8');
      expect(code, f).not.toMatch(/Object\.assign\(\{\}\)\[`\/api\//);
    }
  });
});

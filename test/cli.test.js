import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(testDir, '../bin/flotiq-excel-migrator');

describe('CLI entrypoint', () => {
    it('loads the migrator module using ESM import', () => {
        const cliSource = readFileSync(cliPath, 'utf8');

        expect(cliSource).toContain("import './../flotiq-xlsx-migrate.js';");
    });
});
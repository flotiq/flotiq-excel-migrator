import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module, { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

const testDir = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(testDir, '../bin/flotiq-excel-migrator');

describe('CLI entrypoint', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete require.cache[cliPath];
    });

    it('loads the migrator module when the executable is required', () => {
        const loadSpy = vi.spyOn(Module, '_load');

        require(cliPath);

        expect(
            loadSpy.mock.calls.some(([request]) => request === './../flotiq-xlsx-migrate.js')
        ).toBe(true);
    });
});
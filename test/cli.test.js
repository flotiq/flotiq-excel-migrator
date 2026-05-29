import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(testDir, '../bin/flotiq-excel-migrator');

describe('CLI entrypoint', () => {
    it('prints help for --help', () => {
        const result = spawnSync(process.execPath, [cliPath, '--help'], {
            encoding: 'utf8'
        });
        const output = `${result.stdout}${result.stderr}`;

        expect(result.status).toBe(0);
        expect(output).toContain('Usage:');
        expect(output).toContain('flotiq-excel-migrator <command> [options]');
        expect(output).toContain('export');
        expect(output).toContain('import');
    });

    it('prints help when called without arguments', () => {
        const result = spawnSync(process.execPath, [cliPath], {
            encoding: 'utf8'
        });
        const output = `${result.stdout}${result.stderr}`;

        expect(result.status).toBe(0);
        expect(output).toContain('Usage:');
    });
});
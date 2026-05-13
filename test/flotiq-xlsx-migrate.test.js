import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

const moduleUnderTestPath = path.resolve(__dirname, '../flotiq-xlsx-migrate.js');
const fetchModulePath = require.resolve('node-fetch');
const readXlsxModulePath = require.resolve('read-excel-file/node');
const writeXlsxModulePath = require.resolve('write-excel-file/node');

const originalModuleEntries = {
    fetch: require.cache[fetchModulePath],
    readXlsx: require.cache[readXlsxModulePath],
    writeXlsx: require.cache[writeXlsxModulePath]
};

const restoreModuleEntry = (modulePath, originalEntry) => {
    if (originalEntry) {
        require.cache[modulePath] = originalEntry;
        return;
    }

    delete require.cache[modulePath];
};

const setModuleExport = (modulePath, exports) => {
    require.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports
    };
};

describe('flotiq-xlsx-migrate', () => {
    let exportXlsx;
    let importXlsx;
    let fetchMock;
    let readXlsxMock;
    let readSheetNamesMock;
    let writeXlsxMock;

    beforeEach(() => {
        fetchMock = vi.fn();
        readXlsxMock = vi.fn();
        readSheetNamesMock = vi.fn();
        readXlsxMock.readSheetNames = readSheetNamesMock;
        writeXlsxMock = vi.fn().mockResolvedValue(undefined);

        setModuleExport(fetchModulePath, fetchMock);
        setModuleExport(readXlsxModulePath, readXlsxMock);
        setModuleExport(writeXlsxModulePath, writeXlsxMock);

        delete require.cache[moduleUnderTestPath];
        ({ exportXlsx, importXlsx } = require('../flotiq-xlsx-migrate.js'));

        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'time').mockImplementation(() => {});
        vi.spyOn(console, 'timeEnd').mockImplementation(() => {});
        vi.spyOn(console, 'clear').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete require.cache[moduleUnderTestPath];
        restoreModuleEntry(fetchModulePath, originalModuleEntries.fetch);
        restoreModuleEntry(readXlsxModulePath, originalModuleEntries.readXlsx);
        restoreModuleEntry(writeXlsxModulePath, originalModuleEntries.writeXlsx);
    });

    it('returns converted rows without writing a file when saveFile is false', async () => {
        fetchMock
            .mockResolvedValueOnce({
                status: 200,
                json: async () => ({
                    label: 'Articles',
                    schemaDefinition: {
                        allOf: [
                            {},
                            {
                                properties: {
                                    title: {},
                                    publishedAt: {}
                                }
                            }
                        ]
                    },
                    metaDefinition: {
                        propertiesConfig: {
                            title: { label: 'Title', inputType: 'text' },
                            publishedAt: { label: 'Published at', inputType: 'dateTime' }
                        }
                    }
                })
            })
            .mockResolvedValueOnce({
                status: 200,
                json: async () => ({
                    total_pages: 1,
                    total_count: 1,
                    count: 1,
                    data: [
                        {
                            id: 'article-1',
                            title: 'Hello world',
                            publishedAt: '2024-02-03T00:00:00.000Z'
                        }
                    ]
                })
            });

        const result = await exportXlsx({
            apiKey: 'test-key',
            ctdName: 'article',
            filePath: '.',
            saveFile: false,
            logResults: false
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(writeXlsxMock).not.toHaveBeenCalled();
        expect(result.directoryPath).toContain(`${path.sep}Articles.xlsx`);
        expect(result.coTotal).toBe(1);
        expect(result.coSuccess).toBe(1);
        expect(result.errors).toBeNull();
        expect(result.data).toEqual([
            [
                { value: 'id', fontWeight: 'bold' },
                { value: 'title', fontWeight: 'bold' },
                { value: 'publishedAt', fontWeight: 'bold' }
            ],
            [
                { value: 'article-1', type: String },
                { value: 'Hello world', type: String },
                {
                    format: 'd mmmm yyyy',
                    value: new Date('2024-02-03T00:00:00.000Z'),
                    type: Date
                }
            ]
        ]);
    });

    it('returns a validation error when the XLSX file path does not exist', async () => {
        const existsSyncSpy = vi.spyOn(require('fs'), 'existsSync').mockReturnValue(false);

        const result = await importXlsx({
            apiKey: 'test-key',
            ctdName: 'article',
            filePath: '/missing/file.xlsx',
            logResults: false
        });

        expect(existsSyncSpy).toHaveBeenCalledWith('/missing/file.xlsx');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(result).toEqual({
            param: 'filePath',
            errors: 'No such file in directory specified in filePath'
        });
    });

    it('imports workbook rows in batches and aggregates API results per sheet', async () => {
        vi.spyOn(require('fs'), 'existsSync').mockReturnValue(true);
        readSheetNamesMock.mockResolvedValue(['Sheet1']);
        readXlsxMock.mockResolvedValue([
            ['id', 'title', 'metadata'],
            ['article-1', 'First', '{"slug":"first"}'],
            ['article-2', 'Second', '{"slug":"second"}']
        ]);
        fetchMock
            .mockResolvedValueOnce({
                status: 200,
                json: async () => ({
                    metaDefinition: {
                        propertiesConfig: {
                            title: { label: 'Title', inputType: 'text' },
                            metadata: { label: 'Metadata', inputType: 'object' }
                        }
                    }
                })
            })
            .mockResolvedValueOnce({
                status: 200,
                json: async () => ({
                    batch_success_count: 1,
                    batch_error_count: 1,
                    errors: [{ id: 'article-2', errors: 'duplicate' }]
                })
            });

        const result = await importXlsx({
            apiKey: 'test-key',
            ctdName: 'article',
            filePath: '/tmp/articles.xlsx',
            batchLimit: 2,
            limit: 10,
            logResults: false
        });

        expect(readSheetNamesMock).toHaveBeenCalledWith(path.resolve('/tmp/articles.xlsx'));
        expect(readXlsxMock).toHaveBeenCalledWith(path.resolve('/tmp/articles.xlsx'), {
            sheet: 'Sheet1'
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1][1]).toEqual({
            method: 'post',
            body: JSON.stringify([
                { id: 'article-1', title: 'First', metadata: { slug: 'first' } },
                { id: 'article-2', title: 'Second', metadata: { slug: 'second' } }
            ]),
            headers: { 'Content-Type': 'application/json' }
        });
        expect(result).toEqual({
            Sheet1: {
                sheetImportedCoCount: 1,
                sheetErrorsCount: 1,
                sheetErrors: [{ id: 'article-2', errors: 'duplicate' }]
            }
        });
    });
});
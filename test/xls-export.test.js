import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeXlsxMock = vi.fn();
const getFlotiqApiMock = vi.fn();

vi.mock('write-excel-file/node', () => ({
    default: writeXlsxMock
}));

vi.mock('@flotiq/api', () => ({
    getFlotiqApi: getFlotiqApiMock
}));

vi.mock('@flotiq/api/src/logger.js', () => ({
    default: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn()
    }
}));

describe('xls-export', () => {
    beforeEach(() => {
        writeXlsxMock.mockReset();
        getFlotiqApiMock.mockReset();
        vi.restoreAllMocks();
    });

    it('returns converted rows without writing a file when saveFile is false', async () => {
        getFlotiqApiMock.mockReturnValue({
            fetchContentTypeDefinition: vi.fn().mockResolvedValue({
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
            }),
            fetchContentObjects: vi.fn().mockResolvedValue([
                {
                    id: 'article-1',
                    title: 'Hello world',
                    publishedAt: '2024-02-03T00:00:00.000Z'
                }
            ])
        });

        const { exportXlsx } = await import('../src/xls-export.js');

        const result = await exportXlsx({
            apiKey: 'test-key',
            ctdName: 'article',
            filePath: path.resolve('fixtures/exports'),
            saveFile: false,
            logResults: false
        });

        expect(getFlotiqApiMock).toHaveBeenCalledWith('https://api.flotiq.com/api/v1', 'test-key');
        expect(writeXlsxMock).not.toHaveBeenCalled();
        expect(result.directoryPath).toContain(`${path.sep}Articles.xlsx`);
        expect(result.coTotal).toBe(1);
        expect(result.coSuccess).toBe(1);
        expect(result.errors).toEqual([]);
        expect(result.data).toHaveLength(2);
    });

    it('creates output directory and writes xlsx when saveFile is true', async () => {
        const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        const mkdirSyncSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

        getFlotiqApiMock.mockReturnValue({
            fetchContentTypeDefinition: vi.fn().mockResolvedValue({
                label: 'Products',
                schemaDefinition: {
                    allOf: [
                        {},
                        {
                            properties: {
                                title: {}
                            }
                        }
                    ]
                },
                metaDefinition: {
                    propertiesConfig: {
                        title: { label: 'Title', inputType: 'text' }
                    }
                }
            }),
            fetchContentObjects: vi.fn().mockResolvedValue([
                {
                    id: 'product-1',
                    title: 'Product One'
                }
            ])
        });

        const { exportXlsx } = await import('../src/xls-export.js');

        const outputDir = path.resolve('fixtures/output');
        const result = await exportXlsx({
            apiKey: 'test-key',
            ctdName: 'product',
            filePath: outputDir,
            saveFile: true,
            logResults: false
        });

        expect(existsSyncSpy).toHaveBeenCalledWith(outputDir);
        expect(mkdirSyncSpy).toHaveBeenCalledWith(outputDir, { recursive: true });
        expect(writeXlsxMock).toHaveBeenCalledWith(expect.any(Array), {
            filePath: `${outputDir}/Products.xlsx`
        });
        expect(result.directoryPath).toBe(`${outputDir}/Products.xlsx`);
    });

    it('returns an error payload when fetching content objects fails', async () => {
        getFlotiqApiMock.mockReturnValue({
            fetchContentTypeDefinition: vi.fn().mockResolvedValue({
                label: 'Articles',
                schemaDefinition: {
                    allOf: [
                        {},
                        {
                            properties: {
                                title: {}
                            }
                        }
                    ]
                },
                metaDefinition: {
                    propertiesConfig: {
                        title: { label: 'Title', inputType: 'text' }
                    }
                }
            }),
            fetchContentObjects: vi.fn().mockRejectedValue(new Error('network issue'))
        });

        const { exportXlsx } = await import('../src/xls-export.js');

        const result = await exportXlsx({
            apiKey: 'test-key',
            ctdName: 'article',
            filePath: path.resolve('fixtures/exports'),
            saveFile: false,
            logResults: false
        });

        expect(result).toEqual({
            param: null,
            errors: 'Fetching content objects failed: Error  : network issue'
        });
    });
});

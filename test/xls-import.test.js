import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readXlsxMock = vi.fn();
const getFlotiqApiMock = vi.fn();

vi.mock('read-excel-file/node', () => ({
    default: readXlsxMock
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

describe('xls-import', () => {
    beforeEach(() => {
        readXlsxMock.mockReset();
        getFlotiqApiMock.mockReset();
    });

    it('imports workbook rows using the Flotiq API client', async () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        readXlsxMock.mockResolvedValue([
            {
                sheet: 'Sheet1',
                data: [
                    ['id', 'title'],
                    ['article-1', 'First']
                ]
            }
        ]);

        const requestMock = vi.fn().mockResolvedValue({
            status: 200,
            statusText: 'OK',
            data: {
                batch_success_count: 1,
                batch_error_count: 0,
                errors: []
            }
        });

        getFlotiqApiMock.mockReturnValue({
            fetchContentTypeDefinition: vi.fn().mockResolvedValue({
                metaDefinition: {
                    propertiesConfig: {
                        title: { label: 'Title', inputType: 'text' }
                    }
                }
            }),
            middleware: {
                request: requestMock
            }
        });

        const { importXlsx } = await import('../src/xls-import.js');

        const result = await importXlsx({
            apiKey: 'test-key',
            ctdName: 'article',
            filePath: path.resolve('fixtures/articles.xlsx'),
            batchLimit: 1,
            logResults: false
        });

        expect(getFlotiqApiMock).toHaveBeenCalledWith(
            'https://api.flotiq.com/api/v1',
            'test-key',
            { batchSize: 1 }
        );
        expect(requestMock).toHaveBeenCalledWith({
            url: '/content/article/batch?updateExisting=true',
            method: 'POST',
            data: [{ id: 'article-1', title: 'First' }],
            validateStatus: expect.any(Function)
        });
        expect(result).toEqual({
            Sheet1: {
                sheetImportedCoCount: 1,
                sheetErrorsCount: 0,
                sheetErrors: []
            }
        });
    });

    it('returns a validation error for missing files', async () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);

        const { importXlsx } = await import('../src/xls-import.js');

        const result = await importXlsx({
            apiKey: 'test-key',
            ctdName: 'article',
            filePath: '/missing/file.xlsx',
            logResults: false
        });

        expect(result).toEqual({
            param: 'filePath',
            errors: 'No such file in directory specified in filePath'
        });
    });
});

import fs from 'node:fs';
import path from 'node:path';

import readXlsxFile from 'read-excel-file/node';
import yup from 'yup';
import { getFlotiqApi } from '@flotiq/api';
import logger from '@flotiq/api/src/logger.js';

import config from './config.js';
import { ctdFieldTypes, recordToCo } from './converter.js';

const SHEET_CO_NUMBER_LIMIT = 10000;

const importOptionsSchema = yup.object().shape({
    ctdName: yup.string().required(),
    apiKey: yup.string().required(),
    filePath: yup.string().required(),
    limit: yup.number().integer().default(-1),
    batchLimit: yup.number().integer().max(100).min(1).default(100),
    updateExisting: yup.boolean().default(true),
    logResults: yup.boolean().default(true)
});

const createImportError = (param, errors) => {
    const error = new Error(Array.isArray(errors) ? errors.join(', ') : errors);

    error.param = param;
    error.errors = errors;

    return error;
};

const normalizeImportError = (error) => ({
    param: error?.params?.path || error?.param,
    errors: error?.errors || error?.message
});

const validateImportOptions = async (options) => {
    const resolvedOptions = await importOptionsSchema.validate(options);
    const allowedExtensions = ['.xlsx', '.xlsm'];

    if (!fs.existsSync(resolvedOptions.filePath)) {
        throw createImportError('filePath', 'No such file in directory specified in filePath');
    }

    if (!allowedExtensions.includes(path.parse(resolvedOptions.filePath).ext)) {
        throw createImportError(
            'filePath',
            `Wrong file extension, allowed extensions are: ${allowedExtensions}`
        );
    }

    return resolvedOptions;
};

const readWorkbook = async (filePath) => {
    const sourceFile = path.resolve(filePath);
    const workbook = {};

    const sheets = await readXlsxFile(sourceFile);
    for (const { sheet: sheetName, data: rows } of sheets) {
        const headerRow = rows[0] || [];

        workbook[sheetName] = rows.map((row) => {
            const record = {};

            for (let columnIndex = 0; columnIndex < headerRow.length; columnIndex++) {
                const header = headerRow[columnIndex];
                if (header === undefined || header === null || header === '') {
                    continue;
                }

                record[header] = row ? row[columnIndex] : undefined;
            }

            return record;
        });
    }

    return workbook;
};

const batchContentObjects = async (client, contentType, objects, updateExisting) => {
    const response = await client.middleware.request({
        url: `/content/${contentType}/batch?updateExisting=${updateExisting}`,
        method: 'POST',
        data: objects,
        validateStatus: () => true
    });

    return {
        status: response.status,
        statusText: response.statusText,
        json: async () => response.data
    };
};

const buildImportResult = (workbook) => {
    const result = {};

    for (const sheet in workbook) {
        result[sheet] = {
            sheetImportedCoCount: 0,
            sheetErrorsCount: 0,
            sheetErrors: []
        };
    }

    return result;
};

const countWorkbookObjects = (workbook) => {
    let totalCount = 0;

    for (const sheet in workbook) {
        totalCount += Math.max(0, workbook[sheet].length - 1);
    }

    return totalCount;
};

const processSheetImport = async ({
    client,
    sheetName,
    sheetRows,
    fieldTypes,
    options,
    importResult,
    counters,
}) => {
    sheetRows.shift();

    const coArray = [];
    for (let row = 0; row <= sheetRows.length && row <= options.limit; row++) {
        coArray[row] = recordToCo(sheetRows[row], fieldTypes);
    }
    coArray.pop();

    for (let batchIndex = 0; batchIndex < coArray.length; batchIndex += options.batchLimit) {
        const page = coArray.slice(batchIndex, batchIndex + options.batchLimit);
        await processBatchImport({
            client,
            ctdName: options.ctdName,
            updateExisting: options.updateExisting,
            page,
            sheetName,
            importResult,
            counters,
        });
    }
};

const processBatchImport = async ({
    client,
    ctdName,
    updateExisting,
    page,
    sheetName,
    importResult,
    counters,
}) => {
    try {
        const batchResponse = await batchContentObjects(client, ctdName, page, updateExisting);
        const batchResponseJson = await batchResponse.json();
        const batchErrors = Array.isArray(batchResponseJson?.errors) ? batchResponseJson.errors : [];

        importResult[sheetName].sheetErrors = importResult[sheetName].sheetErrors.concat(batchErrors);

        if (batchResponse.status < 200 || batchResponse.status >= 300) {
            importResult[sheetName].sheetErrorsCount += page.length;
            return;
        }

        const batchSuccessCount = typeof batchResponseJson?.batch_success_count === 'number'
            ? batchResponseJson.batch_success_count
            : page.length - batchErrors.length;
        const batchErrorCount = typeof batchResponseJson?.batch_error_count === 'number'
            ? batchResponseJson.batch_error_count
            : batchErrors.length;

        importResult[sheetName].sheetImportedCoCount += batchSuccessCount;
        importResult[sheetName].sheetErrorsCount += batchErrorCount;
        counters.coSuccessCount += batchSuccessCount;
    } catch (error) {
        const responseErrors = error?.response?.data?.errors;
        if (Array.isArray(responseErrors)) {
            importResult[sheetName].sheetErrors = importResult[sheetName].sheetErrors.concat(responseErrors);
        } else {
            importResult[sheetName].sheetErrors.push({
                id: null,
                errors: 'Cannot read Flotiq response. Please check if your APIKey has CREATE permission'
            });
        }
        importResult[sheetName].sheetErrorsCount += page.length;
    }
};

const importXlsx = async (options) => {
    const logResults = options.logResults;

    let resolvedOptions;
    try {
        resolvedOptions = await validateImportOptions(options);
    } catch (error) {
        const validationError = normalizeImportError(error);

        if (logResults !== false) {
            logger.error(`Errors have occurred: ${JSON.stringify(validationError)}`);
        }

        return validationError;
    }

    logger.info(`Starting import for: ${options.ctdName}`)
    const client = getFlotiqApi(config.apiUrl, resolvedOptions.apiKey, {
        batchSize: resolvedOptions.batchLimit
    });

    const ctd = await client.fetchContentTypeDefinition(resolvedOptions.ctdName);
    if (!ctd) {
        const errorResult = {
            param: null,
            errors: 'Fetching content type failed: content type definition not found'
        };

        if (logResults !== false) {
            logger.error(`Errors have occurred: ${JSON.stringify(errorResult)}`);
        }

        return errorResult;
    }

    const xlsxWorkbook = await readWorkbook(resolvedOptions.filePath);
    const fieldTypes = ctdFieldTypes(ctd);

    const counters = {
        coSuccessCount: 0
    };

    let coTotalCount = countWorkbookObjects(xlsxWorkbook);

    if (resolvedOptions.limit === -1) {
        resolvedOptions.limit = SHEET_CO_NUMBER_LIMIT;
    }
    if (coTotalCount > resolvedOptions.limit) {
        coTotalCount = resolvedOptions.limit;
    }



    const importResult = buildImportResult(xlsxWorkbook);
    for (const sheet in xlsxWorkbook) {
        await processSheetImport({
            client,
            sheetName: sheet,
            sheetRows: xlsxWorkbook[sheet],
            fieldTypes,
            options: resolvedOptions,
            importResult,
            counters,
        });
    }

    const errorsCount = Object.values(importResult)
        .reduce((total, sheetResult) => total + sheetResult.sheetErrorsCount, 0);

    const hasErrors = Object.values(importResult).some((sheetResult) => sheetResult.sheetErrorsCount > 0);

    if (logResults) {
        if (hasErrors) {
            logger.warn(`Content objects import completed with errors: ${counters.coSuccessCount} successfully imported out of ${coTotalCount}`);
        } else {
            logger.info(`Content objects successfully imported: ${counters.coSuccessCount} out of ${coTotalCount}`);
        }
    }

    if (hasErrors) {
        logger.warn('Import from xlsx finished with errors');
    }
    logger.info(`Errors: ${errorsCount}`);
    logger.info(`Objects total: ${coTotalCount}`);
    logger.info(`Objects imported: ${counters.coSuccessCount}`);
    logger.info(`Import from xlsx finished${resolvedOptions.filePath}`);

    return importResult;
};

export { importXlsx };
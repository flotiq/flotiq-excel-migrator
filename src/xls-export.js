import yup from 'yup';
import {coToRecord, ctdFieldTypes, ctdToHeader} from './converter.js';
import writeXlsxFile from 'write-excel-file/node';
import fs from 'node:fs';
import path from 'node:path';
import config from './config.js';
import {getFlotiqApi} from '@flotiq/api';
import logger from '@flotiq/api/src/logger.js';

const SHEET_CO_NUMBER_LIMIT = 10000;

const exportOptionsSchema = yup.object().shape({
    ctdName: yup.string().required(),
    apiKey: yup.string().required(),
    filePath: yup.string().default(''),
    limit: yup.number().integer().default(-1),
    saveFile: yup.boolean().default(true),
    logResults: yup.boolean().default(true)
});

const normalizeExportError = (error) => ({
    param: error?.params?.path || error?.param || null,
    errors: error?.errors || error?.message
});

const validateExportOptions = async (options) => exportOptionsSchema.validate(options);

const fetchExportContentObjects = async (client, ctdName, limit) => {
    try {
        return await client.fetchContentObjects(
            ctdName,
            0,
            limit,
            {
                field: 'internal.createdAt',
                direction: 'asc'
            }
        );
    } catch (error) {
        return normalizeExportError({
            param: null,
            errors: `Fetching content objects failed: Error ${error?.response?.status || ''} : ${error?.response?.statusText || error?.message || 'Unknown error'}`
        });
    }
};

const convertContentObjectsToRows = (contentObjects, fieldTypes, logResults) => {
    const rows = [];
    const errors = [];
    let coSuccess = 0;

    for (let index = 0; index < contentObjects.length; index++) {
        const result = coToRecord(contentObjects[index], fieldTypes);

        rows.push(result.row);
        if (result.coErrors.length > 0) {
            errors.push(result.coErrors);
            if (logResults) {
                logger.error(`Errors in row ${index + 1}:`);
                for (const rowError of result.coErrors) {
                    logger.error(`Error in property ${rowError.propertyLabel}: ${rowError.message}`);
                }
            }
        } else {
            coSuccess++;
        }
    }

    return {
        rows,
        errors,
        coSuccess
    };
};

const exportXlsx = async (options) => {
    const logResults = options?.logResults;

    let resolvedOptions;
    try {
        resolvedOptions = await validateExportOptions(options);
    } catch (error) {
        const validationError = normalizeExportError(error);

        if (logResults !== false) {
            logger.error(`Errors have occurred: ${JSON.stringify(validationError)}`);
        }

        return validationError;
    }

    logger.info(`Starting export for: ${resolvedOptions.ctdName}`);

    const client = getFlotiqApi(config.apiUrl, resolvedOptions.apiKey);
    let ctd;
    try {
        ctd = await client.fetchContentTypeDefinition(resolvedOptions.ctdName);
    } catch (error) {
        const ctdError = {
            param: null,
            errors: `Fetching content type failed: Error ${error?.response?.status || ''} : ${error?.response?.statusText || error?.message || 'Unknown error'}`
        };

        if (logResults !== false) {
            logger.error(`Errors have occurred: ${JSON.stringify(ctdError)}`);
        }

        return ctdError;
    }
    if (!ctd) {
        const ctdError = {
            param: null,
            errors: 'Fetching content type failed: content type definition not found'
        };

        if (logResults !== false) {
            logger.error(`Errors have occurred: ${JSON.stringify(ctdError)}`);
        }

        return ctdError;
    }

    const data = [];
    data[0] = ctdToHeader(ctd);
    const outputDirectory = path.resolve(resolvedOptions.filePath);
    const directoryPath = path.join(outputDirectory, `${ctd.label}.xlsx`);
    const response = {
        directoryPath,
        errors: [],
        coTotal: 0,
        coSuccess: 0
    };

    if (resolvedOptions.limit !== 0) {
        const exportLimit = resolvedOptions.limit === -1 ? SHEET_CO_NUMBER_LIMIT : resolvedOptions.limit;
        const fieldTypes = ctdFieldTypes(ctd);
        const contentObjects = await fetchExportContentObjects(client, resolvedOptions.ctdName, exportLimit);

        if (contentObjects?.errors) {
            if (logResults !== false) {
                logger.error(`Errors have occurred: ${JSON.stringify(contentObjects)}`);
            }
            return contentObjects;
        }

        response.coTotal = contentObjects.length;
        const conversionResult = convertContentObjectsToRows(contentObjects, fieldTypes, resolvedOptions.logResults);

        data.push(...conversionResult.rows);
        response.coSuccess = conversionResult.coSuccess;
        response.errors = conversionResult.errors;

        if (resolvedOptions.logResults) {
            if (conversionResult.errors.length > 0) {
                logger.error('Export errors occurred!');
                logger.warn(`Content objects partially exported: ${response.coSuccess} out of ${response.coTotal}`);
            } else {
                logger.info(`Content objects successfully exported: ${response.coSuccess} out of ${response.coTotal}`);
            }
        }
    }

    if (resolvedOptions.saveFile) {
        if (!fs.existsSync(outputDirectory)) {
            fs.mkdirSync(outputDirectory, {recursive: true});
        }
        await writeXlsxFile(data, {
            filePath: directoryPath
        });
    } else {
        response.data = data;
    }

    if (response.errors.length) {
        logger.warn('Export to xlsx finished with errors');
    }
    logger.info(`Errors: ${response.errors.length}`);
    logger.info(`Objects total: ${response.coTotal}`);
    logger.info(`Objects exported: ${response.coSuccess}`);
    logger.info(`Export to xlsx finished${response.directoryPath}`);

    return response;
};

export {exportXlsx};
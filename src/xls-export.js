import yup from 'yup';
import {coToRecord, ctdFieldTypes, ctdToHeader} from './converter.js';
import writeXlsxFile from 'write-excel-file/node';
import fs from 'node:fs';
import path from 'node:path';
import config from './config.js';
import {getFlotiqApi} from '@flotiq/api';
import logger from '@flotiq/api/src/logger.js';

const SHEET_CO_NUMBER_LIMIT = 10000;

const exportXlsx = async (options) => {
    const exportOptionsSchema = yup.object().shape({
        ctdName: yup.string().required(),
        apiKey: yup.string().required(),
        filePath: yup.string().default(""),
        limit: yup.number().integer().default(-1),
        saveFile: yup.boolean().default(true),
        logResults: yup.boolean().default(true)
    });
    const logResults = options.logResults;
    try {
        options = await exportOptionsSchema.validate(options);
    } catch (e) {
        options = {
            param: e?.params?.path || e.param,
            errors: e.errors
        };
    }

    if (options.errors) {
        if (logResults !== false) {
            logger.error(`Errors have occurred: ${JSON.stringify(options)}`)
        }
        return options;
    }
    logger.info(`Starting export for: ${options.ctdName}`);

    const client = getFlotiqApi(config.apiUrl, options.apiKey);
    let ctd;
    try {
        ctd = await client.fetchContentTypeDefinition(options.ctdName);
    } catch (e) {
        logger.error(`Failed fetch ctd: ${options.ctdName}`);
    }

    let data = [];
    data[0] = ctdToHeader(ctd);
    let dirPath = `${path.resolve(options.filePath)}/${ctd.label}.xlsx`;
    let response = {
        directoryPath: dirPath,
        errors: [],
        coTotal: 0,
        coSuccess: 0
    }

    if (options.limit !== 0) {
        if (options.limit === -1) {
            options.limit = SHEET_CO_NUMBER_LIMIT;
        }
        let coExported = 0;
        let errors = [];
        let fieldTypes = ctdFieldTypes(ctd);
        let co = [];

        try {
            co = await client.fetchContentObjects(
                options.ctdName,
                0,
                options.limit,
                {
                    field: 'internal.createdAt',
                    direction: 'asc'
                }
            );
        } catch (e) {
            options = {
                param: null,
                errors: `Fetching content objects failed: Error ${e?.response?.status || ''} : ${e?.response?.statusText || e?.message || 'Unknown error'}`
            };
            if (logResults !== false) {
                logger.error(`Errors have occurred: ${JSON.stringify(options)}`)
            }
            return options;
        }

        response.coTotal = co.length;
        for (let i = 0; i < co.length && coExported < options.limit; i++) {
            let result = (coToRecord(co[i], fieldTypes));
            data.push(result.row);
            if (result.coErrors.length > 0) {
                errors.push(result.coErrors);
                if (options.logResults) {
                    logger.error(`Errors in row ${coExported + 1}:`);
                    for (const rowError of result.coErrors) {
                        logger.error(`Error in property ${rowError.propertyLabel}: ${rowError.message}`)
                    }
                }
            } else {
                response.coSuccess++;
            }
            coExported++;
        }
        if (errors.length !== 0) {
            response.errors = errors;
        }
        if (options.logResults) {
            if (errors.length > 0) {
                logger.error('Export errors occurred!')
                logger.warn(`Content objects partially exported: ${response.coSuccess} out of ${response.coTotal}`)
            } else {
                logger.info(`Content objects successfully exported: ${response.coSuccess} out of ${response.coTotal}`)
            }
        }
    }
    if (options.saveFile) {
        if (!fs.existsSync(path.resolve(options.filePath))) {
            fs.mkdirSync(path.resolve(options.filePath), {recursive: true});
        }
        await writeXlsxFile(data, {
            filePath: dirPath
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
}

export {exportXlsx};
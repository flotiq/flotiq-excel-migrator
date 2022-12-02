const writeXlsxFile = require(`write-excel-file/node`);
const readXlsxFile = require('convert-excel-to-json');
const fs = require(`fs`);
const fetch = require(`node-fetch`);
const path = require(`path`);
const yup = require(`yup`);
const config = require("./config");
const { ctdToHeader, ctdFieldTypes, coToRecord, recordToCo } = require(`./converter`);
const SHEET_CO_NUMBER_LIMIT = 10000;

importXlsx = async (options) => {
    let importOptionsSchema = yup.object().shape({
        ctdName: yup.string().required(),
        apiKey: yup.string().required(),
        filePath: yup.string().required(),
        limit: yup.number().integer().default(-1),
        updateExisting: yup.boolean().default(true),
        logResults: yup.boolean().default(true)
    });
    const logResults = options.logResults;

    console.time("Data import time");

    let ctd = {}
    options = await importOptionsSchema.validate(options)
        .then((res) => {
            let allowedExtensions = [".xlsx", ".xlsm"]; //other extensions if needed go here
            if (!fs.existsSync(res.filePath)) {
                throw {
                    param: `filePath`,
                    errors: `No such file in directory specified in filePath`
                }
            } else if (!allowedExtensions.includes(path.parse(res.filePath).ext)) {
                throw {
                    param: `filePath`,
                    errors: `Wrong file extension, allowed extensions are: ${allowedExtensions}`
                }
            } else {
                return res;
            }
        })
        .then(async (res) => {
            ctd = await fetchContentTypeDefinition(res.apiKey, res.ctdName);
            if (ctd?.status < 200 || ctd?.status >= 300) {
                throw {
                    param: null,
                    errors: `Fetching content type failed:  Error ${ctd.status} : ${ctd.statusText}`
                };
            } else return res;
        })
        .catch((e) => {
            return {
                param: e?.params?.path || e.param,
                errors: e.errors
            }
        })

    if (options.errors) {
        if (logResults !== false) {
            console.log("Errors have occured:\n", options);
        }
        return options;
    }

    ctd = await ctd.json();

    let xlsxWorkbook = readXlsxFile({
        sourceFile: path.resolve(options.filePath),
        columnToKey: {
            '*': '{{columnHeader}}'
        }
    })
    let fieldTypes = ctdFieldTypes(ctd);

    let coTotalCount = 0;
    let coSuccessCount = 0;
    for (let sheet in xlsxWorkbook) {
        coTotalCount += xlsxWorkbook[sheet].length - 1;   
    }
    if (options.limit === -1) {
        options.limit = SHEET_CO_NUMBER_LIMIT;
    }
    if (coTotalCount > options.limit) {
        coTotalCount = options.limit;
    }
    
    let loading = (function() {
        if (logResults) {
        let h = ['|', '/', '-', '\\'];
        let i = 0;
        
            return setInterval(() => {
                i = (i > 3) ? 0 : i;
                console.clear();
                console.log(`Data import in progress... ${h[i]}\nExported objects: ${coSuccessCount} out of ${coTotalCount}`);
                i++;
            }, 300);
        }
    })();
    
    let importResult = {};
    for (let sheet in xlsxWorkbook) {
        importResult[sheet] = {
            sheetImportedCoCount: 0,
            sheetErrorsCount: 0,
            sheetErrors: []
        }
        xlsxWorkbook[sheet].shift();
        let coArray = [];
        for (let row = 0; row <= xlsxWorkbook[sheet].length && row <= options.limit; row++) {
            coArray[row] = recordToCo(xlsxWorkbook[sheet][row], fieldTypes);
        }
        coArray.pop();
        
        const limit = 100;
        for (let j = 0; j < coArray.length; j += limit) {
            let page = coArray.slice(j, j + limit);
            let batchResponse = await batchContentObjects(page, options.apiKey, options.ctdName, options.updateExisting);
            try {
                let batchResponseJson = await batchResponse.json()
                importResult[sheet].sheetErrors = importResult[sheet].sheetErrors.concat(batchResponseJson.errors);
                if (batchResponse?.status < 200 || batchResponse?.status >= 300) {
                    importResult[sheet].sheetErrorsCount += page.length;
                } else {
                    importResult[sheet].sheetImportedCoCount += batchResponseJson.batch_success_count;
                    importResult[sheet].sheetErrorsCount += batchResponseJson.batch_error_count;
                    coSuccessCount += batchResponseJson.batch_success_count;
                }
            } catch (e) {
                importResult[sheet].sheetErrors.push({ id: null, errors: `Cannot read Flotiq response. Please check if your APIKey has CREATE permission` });
                importResult[sheet].sheetErrorsCount += page.length;
            }
        }
    }
    console.log(`Import from xlsx finished`);
    clearInterval(loading);
    if (logResults) {
        console.clear();
        console.log(`Content objects successfully imported: ${coSuccessCount} out of ${coTotalCount}`)
        console.timeEnd(`Data import time`);
    }
    return importResult;
}

exportXlsx = async (options) => {
    const exportOptionsSchema = yup.object().shape({
        ctdName: yup.string().required(),
        apiKey: yup.string().required(),
        filePath: yup.string().default(""),
        limit: yup.number().integer().default(-1),
        saveFile: yup.boolean().default(true),
        logResults: yup.boolean().default(true)
    });
    const logResults = options.logResults;

    let ctd = {};
    options = await exportOptionsSchema.validate(options)
        .then(async (res) => {
            ctd = await fetchContentTypeDefinition(res.apiKey, res.ctdName);
            if (ctd?.status < 200 || ctd?.status >= 300) {
                throw {
                    param: null,
                    errors: `Fetching content type failed:  Error ${ctd.status} : ${ctd.statusText}`
                };
            }
            return res;
        })
        .catch((e) => {
            return {
                param: e?.params?.path || e.param,
                errors: e.errors
            }
        })

    if (options.errors) {
        if (logResults !== false) {
            console.log("Errors have occured:\n", options)
        }
        return options;
    }

    let data = [];
    
    ctd = await ctd.json();
    data[0] = ctdToHeader(ctd);
    let dirPath = `${ path.resolve(options.filePath) }/${ ctd.label }.xlsx`;
    let response = {
        directoryPath: dirPath,
        errors: null,
        coTotal: 0,
        coSuccess: 0
    }

    if (options.limit !== 0) {
        if (options.limit === -1) {
            options.limit = SHEET_CO_NUMBER_LIMIT;
        }
        console.time("Data export time");
        let coExported = 0;
        let co = await fetchContentObjects(options.apiKey, options.ctdName);
        let errors = [];
        let page = 1;
        let fieldTypes = ctdFieldTypes(ctd);

        if (co?.status < 200 || co?.status >= 300) {
            console.log(`Fetching content objects failed:\n   Error ${co.status} : ${co.statusText}`);
            return;
        }
        co = await co.json();
        const totalPages = co.total_pages;
        response.coTotal = await co.total_count;
        if (options.limit < response.coTotal && options.limit > 0) {
            response.coTotal = options.limit;
        }
        while (page <= totalPages) {
            for (let i = 0; i < co.count && coExported < options.limit; i++) {
                let result = (coToRecord(co.data[i], fieldTypes));
                data.push(result.row);
                if (result.coErrors.length !== 0) {
                    errors.push(result.coErrors);
                } else {
                    response.coSuccess++;
                }
                coExported++;
            }
            page++;
            if (page <= totalPages && coExported <= options.limit) {
                co = await (await fetchContentObjects(options.apiKey, options.ctdName, page)).json();
            }
        }
        if (errors.length !== 0) {
            response.errors = errors;
        }
        if (options.logResults) {
            let loading = (function() {
                let h = ['|', '/', '-', '\\'];
                let i = 0;
            
                return setInterval(() => {
                    i = (i > 3) ? 0 : i;
                    console.clear();
                    console.log(`Data export in progress... ${h[i]}\nExported objects: ${coExported} out of ${response.coTotal}`);
                    i++;
                }, 300);
            })();
            clearInterval(loading);
            if (errors.length !== 0) {
                console.log(`Export errors occured!\n`)
                for (let row in errors) {
                    console.log(`Errors in row ${Number(row) + 1}:`);
                    for (let error in errors[row]) {
                        console.log(`Error in property ${errors[row][error].propertyLabel}: ${errors[row][error].message}\n`)
                    }
                }
            }
            console.log(`Content objects successfully exported: ${response.coSuccess} out of ${response.coTotal}`)
            console.timeEnd(`Data export time`);
        }
    }
    if (options.saveFile) {
        if (!fs.existsSync(path.resolve(options.filePath))) {
            fs.mkdirSync(path.resolve(options.filePath), { recursive: true });
        }
        await writeXlsxFile(data, {
            filePath: dirPath
        });
    } else {
        response.data = data;
    }
    console.log(`Export to xlsx finished`);

    return response;
}

const fetchContentTypeDefinition = async (apiKey, ctdName) => {
    return fetch(
        `${config.apiUrl}/api/v1/internal/contenttype/${ctdName}?auth_token=${apiKey}`,
        { method: 'GET' }
    );
}

const fetchContentObjects = async (apiKey, ctdName, page = 1, limit = 100) => {
    return fetch(
        `${config.apiUrl}/api/v1/content/${ctdName}?page=${page}&limit=${limit}&order_by=internal.createdAt&order_direction=asc&auth_token=${apiKey}`,
        { method: 'GET' }
    );
}

const batchContentObjects = async (contentObjects, apiKey, ctdName, updateExisting) => {
        return await fetch(
            `${config.apiUrl}/api/v1/content/${ctdName}/batch?updateExisting=${updateExisting}&auth_token=${apiKey}`, {
                method: 'post',
                body: JSON.stringify(contentObjects),
                headers: {'Content-Type': 'application/json'}
        });
}

module.exports = { exportXlsx, importXlsx };

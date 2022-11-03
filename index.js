const writeXlsxFile = require(`write-excel-file/node`);
const readXlsxFile = require('convert-excel-to-json');
const fs = require(`fs`);
const fetch = require(`node-fetch`);
const path = require(`path`)
const { ctdToHeader, ctdFieldTypes, coToRecord, recordToCo } = require(`./converter`);
const SYS_LIMIT = 10000;

importXlsx = async (options) => {
    options = await validateImportOptions(options);
    
    let ctd = await fetchContentTypeDefinition(options.apiKey, options.ctdName);
    if (ctd?.status < 200 || ctd?.status >= 300) {
        console.log(`Fetching content type failed:\n   Error ${ctd.status} : ${ctd.statusText}`);
        return;
    }
    ctd = await ctd.json();

    let xlsxWorkbook = readXlsxFile({
        sourceFile: options.filePath,
        columnToKey: {
            '*': '{{columnHeader}}'
        }
    })
    let fieldTypes = ctdFieldTypes(ctd);

    let coTotalCount = 0;
    for (let sheet in xlsxWorkbook) {
        coTotalCount += xlsxWorkbook[sheet].length - 1;   
    }
    let coImportedCount = 0;
    let coErrorsCount = 0;
    let coErrors = [];

    if (options.logResults === true) {
        let loading = (function() {
            let h = ['|', '/', '-', '\\'];
            let i = 0;
        
            return setInterval(() => {
                i = (i > 3) ? 0 : i;
                console.clear();
                console.log(`Data export in progress... ${h[i]}\nExported objects: ${coImportedCount} out of ${coTotalCount}`);
                i++;
            }, 300);
        })();
        clearInterval(loading);
    }
    
    let importResult = {};
    for (let sheet in xlsxWorkbook) {
        xlsxWorkbook[sheet].shift();
        let coArray = [];
        if (options.limit === -1) {
            options.limit = SYS_LIMIT;
        }
        for (let row = 0; row <= xlsxWorkbook[sheet].length && row <= options.limit; row++) {
            coArray[row] = recordToCo(xlsxWorkbook[sheet][row], fieldTypes);
        }
        let batchResponse = await batchContentObjects(coArray, options.apiKey, options.ctdName, options.updateExisting);
        for (let batch in batchResponse) {
            let batchResponseJson = await batchResponse[batch].json();
            coImportedCount += batchResponseJson.batch_success_count;
            coErrorsCount += batchResponseJson.batch_error_count;
            coErrors = coErrors.concat(batchResponseJson.errors);
        }
        importResult[sheet] = {
            coImportedCount: coImportedCount,
            coErrorsCount: coErrorsCount,
            coErrors: coErrors
        }
    }
    console.log(`Import from xlsx finished`);
    return importResult;
}

const validateImportOptions = async (options) => {
    let allowedExtensions = ["xlsx", "xlsm"]; //other extensions like xls, xml require testing
    if (typeof options !== 'object' || !Object.keys(options).length) {
        throw "Missing or invalid argument for export options";
    } else if (!options.ctdName || typeof options.filePath !== "string") {
        throw "Property ctdName hasn't been properly declared";
    } else if (!options.filePath || typeof options.filePath !== "string") {
        throw "Property filePath hasn't been properly declared";
    } else if (!fs.existsSync(options.filePath)) {
        throw "No such file in specified filePath";
    } else if (allowedExtensions.includes(path.parse(options.filePath).ext)) {
        throw "File specified in filePath has wrong extension";
    } else if (!options.apiKey || typeof options.apiKey !== "string") {
        throw "Property apiKey hasn't been properly declared";
    }
    //default values
    if (!options.updateExisting) {
        options.updateExisting = false;
    }
    if (!options.logResults) {
        options.logResults = false;
    }
    if (!options.limit) {
        options.limit = -1;
    }
    return options;
}

exportXlsx = async (options) => {
    options = await validateExportOptions(options);
    let data = [];
    let ctd = await fetchContentTypeDefinition(options.apiKey, options.ctdName);
    if (ctd?.status < 200 || ctd?.status >= 300) {
        console.log(`Fetching content type failed:\n   Error ${ctd.status} : ${ctd.statusText}`);
        return;
    }
    ctd = await ctd.json();
    data[0] = ctdToHeader(ctd);
    let dirPath = `${ __dirname }/${ options.filePath }/${ ctd.label }.xlsx`;
    let response = {
        directoryPath: dirPath,
        errors: null
    }

    if (options.limit !== 0) {
        if (options.limit === -1) {
            options.limit = SYS_LIMIT;
        }
        console.time("Data export time");
        let coExported = 0;
        let coExportSuccess = 0;
        let co = await fetchContentObjects(options.apiKey, options.ctdName);
        let errors = [];
        let page = 1;
        let fieldTypes = ctdFieldTypes(ctd);

        if (co?.status < 200 || co?.status >= 300) {
            console.log(`Fetching content objects failed:\n   Error ${co.status} : ${co.statusText}`);
            return;
        }
        co = await co.json();
        let coTotalCount = await co.total_count;
        if (options.limit < coTotalCount && options.limit > 0) {
            coTotalCount = options.limit;
        }
        let totalPages = co.total_pages;

        while (page <= totalPages) {
            for (let i = 0; i < co.count && coExported < options.limit; i++) {
                let result = (coToRecord(co.data[i], fieldTypes));
                data.push(result.row);
                if (result.coErrors.length !== 0) {
                    errors.push(result.coErrors);
                } else {
                    coExportSuccess++;
                }
                coExported++;
            }
            page++;
            if (page <= totalPages && coExported <= options.limit) {
                co = await fetchContentObjects(options.apiKey, options.ctdName, page);
            }
        }
        response.coTotal = coTotalCount;
        response.co_success = coExportSuccess;
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
                    console.log(`Data export in progress... ${h[i]}\nExported objects: ${coExported} out of ${coTotalCount}`);
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
            console.log(`Content objects successfully exported: ${coExportSuccess} out of ${coTotalCount}`)
            console.timeEnd(`Data export time`);
        }
    }
    if (options.saveFile) {
        if (!fs.existsSync(`${ __dirname }/${ options.filePath }`)) {
            fs.mkdirSync(`${ __dirname }/${ options.filePath }`, { recursive: true });
        }
        await writeXlsxFile(data, {
            filePath: dirPath
        });
    } // else { //saves export data for write-excel-file/node
    //     response.data = data;
    // }
    console.log(`Export to xlsx finished`);

    return response;
}

const validateExportOptions = async (options) => {
    if (typeof options !== 'object' || !Object.keys(options).length) {
        throw "Missing or invalid argument for export options";
    } else if (!options.ctdName || typeof options.ctdName !== "string") {
        throw "Property ctdName hasn't been properly declared";
    } else if (!options.apiKey || typeof options.apiKey !== "string") {
        throw "Property apiKey hasn't been properly declared";
    } else if (options.filePath && typeof options.filePath !== "string") {
        throw "Property filePath must be a string";
    } else if (options.limit && typeof options.limit !== "number") {
        throw "Property limit must be a number";
    } else if (options.saveFile && typeof options.saveFile !== "boolean") {
        throw "Property saveFile must be a boolean";
    } else if (options.logResults && typeof options.logResults !== "boolean") {
        throw "Property logResults must be a string";
    }
    //default values
    if (!options.hasOwnProperty("limit")) {
        options.limit = -1;
    }
    if (!options.filePath) {
        options.filePath = "";
    }
    if (!options.saveFile) {
        options.saveFile = true;
    }
    if (!options.logResults) {
        options.logResults = false;
    }
    return options;
}

const fetchContentTypeDefinition = async (apiKey, ctdName) => {
    return fetch(
        `https://api.flotiq.com/api/v1/internal/contenttype/${ctdName}?auth_token=${apiKey}`,
        { method: 'GET' }
    );
}

const fetchContentObjects = async (apiKey, ctdName, page = 1, limit = 100) => {
    return fetch(
        `https://api.flotiq.com/api/v1/content/${ctdName}?page=${page}&limit=${limit}&order_by=internal.createdAt&order_direction=asc&auth_token=${apiKey}`,
        { method: 'GET' }
    );
}

const batchContentObjects = async (contentObjects, apiKey, ctdName, updateExisting) => {
    let result = [];
    const limit = 100;
    for (let j = 0; j < contentObjects.length; j += limit) {
        let page = contentObjects.slice(j, j + limit);
        result[ctdName] = await fetch(
            `https://api.flotiq.com/api/v1/content/${ctdName}/batch?updateExisting=${updateExisting}&auth_token=${apiKey}`, {
                method: 'post',
                body: JSON.stringify(page),
                headers: {'Content-Type': 'application/json'}
        });
    }
    return result;
}

module.exports = { exportXlsx, importXlsx };

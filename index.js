const writeXlsxFile = require(`write-excel-file/node`);
const fs = require('fs');
const fetch = require("node-fetch");
const { ctdToHeader, ctdFieldTypes, coToRecord } = require('./converter');

exportXlsx = async (options) => {
    options = await validateOptions(options);
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
            for (let i = 0; i < co.count && (options.limit === -1 || coExported < options.limit); i++) {
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

const validateOptions = async (options) => {
    if (typeof options !== 'object' || !Object.keys(options).length) {
        throw "Missing or invalid argument for export options";
    } else if (!options.ctdName || typeof options.ctdName !== "string") {
        throw "API Name of Content Type Definition hasn't been properly declared";
    } else if (!options.apiKey || typeof options.apiKey !== "string") {
        throw "API Key hasn't been properly declared";
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
    } else if (!options.filePath) {
        options.filePath = "";
    } else if (!options.saveFile) {
        options.saveFile = true;
    } else if (!options.logResults) {
        options.logResults = true;
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

module.exports = { exportXlsx };

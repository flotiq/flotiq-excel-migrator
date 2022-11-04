const writeXlsxFile = require(`write-excel-file/node`);
const fs = require(`fs`);
const fetch = require(`node-fetch`);
const yup = require(`yup`);
const { ctdToHeader, ctdFieldTypes, coToRecord } = require('./converter');
const SYS_LIMIT = 10000;

exportXlsx = async (options) => {
    let importOptionsSchema = yup.object().shape({
        ctdName: yup.string().required(),
        apiKey: yup.string().required(),
        filePath: yup.string().required(),
        limit: yup.number().integer().default(-1),
        saveFile: yup.boolean().default(true),
        logResults: yup.boolean().default(false)
    });
    const logResults = options.logResults;

    options = await importOptionsSchema.validate(options)
        .then((v) => {
            return v;
        })
        .catch((e) => {
            return {
                param: e.params.path,
                errors: e.errors
            }
        })

    if (options.errors) {
        if (logResults) {
            console.log("Errors have occured:\n", options)
        }
        return options;
    }

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
        errors: null,
        coTotal: 0,
        co_success: 0
    }

    if (options.limit !== 0) {
        if (options.limit === -1) {
            options.limit = SYS_LIMIT;
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
        response.coTotal = await co.total_count;
        if (options.limit < response.coTotal && options.limit > 0) {
            response.coTotal = options.limit;
        }
        while (page <= co.total_pages) {
            for (let i = 0; i < co.count && coExported < options.limit; i++) {
                let result = (coToRecord(co.data[i], fieldTypes));
                data.push(result.row);
                if (result.coErrors.length !== 0) {
                    errors.push(result.coErrors);
                } else {
                    response.co_success++;
                }
                coExported++;
            }
            page++;
            if (page <= co.total_pages && coExported <= options.limit) {
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
            console.log(`Content objects successfully exported: ${response.co_success} out of ${response.coTotal}`)
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

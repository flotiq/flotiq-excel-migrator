const writeXlsxFile = require(`write-excel-file/node`);
const fs = require('fs');
const fetch = require("node-fetch");
const { ctdToHeader, ctdFieldTypes, coToRecord } = require('./converter');

migrateXlsx = async (directoryPath, ctdName, apiKey, limit = -1) => {
    let data = [];
    directoryPath = __dirname + "\\" + directoryPath;
    let ctd = await fetchContentTypeDefinition(apiKey, ctdName);
    if (ctd?.status < 200 || ctd?.status >= 300) {
        console.log(`Fetching content type failed:\n   Error ${ctd.status} : ${ctd.statusText}`);
        return;
    }
    ctd = await ctd.json();
    data[0] = ctdToHeader(ctd);
    
    if (limit !== 0) {
        console.time("Data export time");
        let coExported = 0;
        let coExportSuccess = 0;
        let co = await fetchContentObjects(apiKey, ctdName);
        let errors = [];
        let page = 1;
        let fieldTypes = ctdFieldTypes(ctd);

        if (co?.status < 200 || co?.status >= 300) {
            console.log(`Fetching content objects failed:\n   Error ${co.status} : ${co.statusText}`);
            return;
        }
        co = await co.json();
        let coTotalCount = await co.total_count;
        if (limit < coTotalCount && limit > 0) {
            coTotalCount = limit;
        }
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
        let totalPages = co.total_pages;

        while (page <= totalPages) {
            for (let i = 0; i < co.count && (limit === -1 || coExported < limit); i++) {
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
            if (page <= totalPages && coExported <= limit) {
                co = await fetchContentObjects(apiKey, ctdName, page);
            }
        }
        clearInterval(loading);

        if (errors.length !== 0) {
            console.log(`Export errors occured!\n`)
            for (let row in errors) {
                console.log(`Errors in row ${Number(row)+1}:`);
                for (let error in errors[row]) {
                    console.log(`Error in property ${errors[row][error].propertyLabel}: ${errors[row][error].message}\n`)
                }
            }
        }
        console.log(`Content objects successfully exported: ${coExportSuccess} out of ${coTotalCount}`)
        console.timeEnd(`Data export time`);
    }
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, {recursive: true});
    }

    await writeXlsxFile(data, {
        filePath: `${directoryPath}/${ctd.label}.xlsx`
    });
    
    console.log(`Export to xls finished`)
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

module.exports = { migrateXlsx };

// testing
// migrateXlsx("[directory path]", "[ctd name]", "[apiKey]", [limit], /*limit - how many co to export -1 = all co*/);
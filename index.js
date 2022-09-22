const writeXlsxFile = require(`write-excel-file/node`);
const fetch = require("node-fetch");
const { ctdToHeader, ctdFieldTypes, coToRecord } = require('./converter');

migrateXlsx = async (apiKey, ctdName, exportCo) => {
    let data = [];
    let ctd = await fetchContentTypeDefinition(apiKey, ctdName);
    
    if (ctd?.status < 200 || ctd?.status >= 300) {
        console.log("Fetching content type failed:\n   Error", ctd.status, ":", ctd.statusText);
        return;
    }
    
    ctd = await ctd.json();
    
    data[0] = ctdToHeader(ctd);
    
    if (exportCo === "--export-co") {
        let co = await fetchContentObjects(apiKey, ctdName);

        if (co?.status < 200 || co?.status >= 300) {
            console.log("Fetching content objects failed:\n   Error", co.status, ":", co.statusText);
            return;
        }
        co = await co.json();

        let fieldTypes = ctdFieldTypes(ctd);

        let totalPages = co.total_pages;
        let page = 1;
        while (page <= totalPages) {
            for (let i = 0; i < co.count; i++) {
                data.push(coToRecord(co.data[i], fieldTypes));
            }
            page++;
            if (page <= totalPages) {
                co = await fetchContentObjects(apiKey, ctdName, page);
            }
        }   
    }

    await writeXlsxFile(data, {
        filePath: `./${ctd.label}-template.xlsx`
    });
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
// migrateXlsx("[apiKey]", "[ctd name]", "--export-co" /*Optional, exports content objects*/);
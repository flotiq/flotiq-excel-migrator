const MAX_STRING_LENGTH = 30000; //max string length allowed before throwing err (strings that are too long in single cell cause errors in ms excel)
const REFERENCE_SEPARATOR = ","; //used to seperate dataUrl for multiple references

const ctdToHeader = (data) => {
    let row = [{
        value: "id",
        fontWeight: `bold`
    }];
    for (field in data.schemaDefinition.allOf[1].properties) {
        let obj = {
            value: field,
            fontWeight: `bold` // additionall cell properties for table headers here
        }
        row.push(obj);
    }
    return row;
}

const ctdFieldTypes = (data) => {
    let fieldTypes = {};

    objTypes = {
        "richtext": String,
        "textMarkdown": "json",
        "text": String,
        "textarea": String,
        "number": Number,
        "dateTime": Date,
        "geo": "json",
        "datasource": "reference",
        "checkbox": Boolean,
        "email": String,
        "radio": String,
        "select": String,
        "object": "json",
        "block": "json"
    }

    for (field in data.metaDefinition.propertiesConfig) {
        fieldTypes[field] = {
            propertyLabel: data.metaDefinition.propertiesConfig[field].label,
            field: objTypes[data.metaDefinition.propertiesConfig[field].inputType]
        }
    }
    return fieldTypes;
}

const coToRecord = (data, fieldTypes) => {
    let row = [{
        value: data.id,
        type: String
    }];
    let coErrors = [];

    for (type in fieldTypes) {
        let obj = formatContent(data[type], fieldTypes[type].field);
        if (obj.error) {
            coErrors.push({
                propertyLabel: fieldTypes[type].propertyLabel,
                message: obj.error
            });
        } else if ((!Array.isArray(data[type]) || !!data[type].length) && data[type] && !obj.element.value) {
            coErrors.push({
                propertyLabel: fieldTypes[type].propertyLabel,
                message: `Data conversion failed`
            });
        }
        row.push(obj.element)
    }
    return {
        row: row,
        coErrors: coErrors
    }
}

const recordToCo = (data, fieldTypes) => {
    let co = {};
    for (let property in data) {
        if (property === "id") {
            co.id = data.id;
            continue;
        }
        switch (fieldTypes[property].field) {
            case String:
                co[property] = data[property];
                break;
            case Number:
                co[property] = Number(data[property]);
                break;
            case Date:
                co[property] = data[property]; //(todo) check
                break;
            case Boolean:
                if (data[property] === "TRUE") {
                    co[property] = true;
                } else if (data[property] === "FALSE") {
                    co[property] = false;
                }
                break;
            case "json":
                co[property] = JSON.parse(data[property]);
                break;
            case "reference":
                let references = data[property].split(',');
                co[property] = [];
                for (let ref in references) {
                    co[property].push({
                        type: "internal",
                        dataUrl: references[ref]
                    })
                }
                break;
            default:
                errorMessage = `Unknown field type`;
        }
    }
    return co;
}

const formatContent = (data, type) => {
    let element;
    let error = null;
    if (!data || data.length === 0) {
        return {
            element: { value: null },
            error: null
        }
    }
    switch (type) {
        case String:
            error = validate(data, String);
            element = {
                value: data.substring(0, MAX_STRING_LENGTH),
                type: String
            }
            break;
        case Number:
            element = {
                value: data,
                type: type
            }
            break;
        case Date:
            let date = new Date(data);
            error = validate(date, type);
            if (!error) {
                element = {
                    format: "d mmmm yyyy",
                    value: date,
                    type: type
                }
            } else {
                element = {
                    value: null
                }
            }
            break;
        case Boolean:
            element = {
                value: data,
                type: type
            }
            break;
        case "json":
            error = validate(JSON.stringify(data), String);
            element = {
                value: JSON.stringify(data).substring(0, MAX_STRING_LENGTH),
                type: String
            }
            break;
        case "reference":
            element = {
                value: data.map((obj) => (obj.dataUrl)).join(REFERENCE_SEPARATOR),
                type: String
            }
            break;
        default:
            element = {
                value: null
            }
            break;
    }
    return {
        element: element,
        error: error
    }
}

let validate = (data, type) => {
    let errorMessage = "";
    switch (type) {
        case Date:
            if (
                typeof data !== `object` ||
                data === null ||
                typeof data.getTime !== `function` ||
                isNaN(data)
            ) {
                errorMessage = `Invalid date`;
            }
            break;
        case String:
            if (data && data.length > MAX_STRING_LENGTH) {
                errorMessage = `String too long (length reduced to ${MAX_STRING_LENGTH})`;
                data = data.substring(0, 100) + `[...]`;
            }
            break;
        default:
            errorMessage = `Unknown field type`;
    }
    if (errorMessage) {
        return `${errorMessage}\nData: ${data}`;
    } return null;
}

module.exports = { ctdToHeader, ctdFieldTypes, coToRecord, recordToCo };

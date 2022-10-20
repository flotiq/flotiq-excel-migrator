const maxStringLength = 30000; //max string length allowed before throwing err (strings that are too long in single cell cause errors in ms excel)
const referenceSep = ","; //used to seperate dataUrl for multiple references

const ctdToHeader = (data) => {
    let row = [];
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
        // console.log(data.metaDefinition.propertiesConfig[field].inputType); //DEL
        fieldTypes[field] = {
            propertyLabel: data.metaDefinition.propertiesConfig[field].label,
            field: objTypes[data.metaDefinition.propertiesConfig[field].inputType]
        }
    }
    return fieldTypes;
}

const coToRecord = (data, fieldTypes) => {
    let row = [];
    let coErrors = [];
    // console.log(data);

    for (type in fieldTypes) {
        // console.log(data[type], fieldTypes[type].field)
        let obj = formatContent(data[type], fieldTypes[type].field);
        if (obj.error) {
            coErrors.push({
                propertyLabel: fieldTypes[type].propertyLabel,
                message: obj.error
            });
        }
        row.push(obj.element)
    }
    return {
        row: row,
        coErrors: coErrors
    }
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
                value: data.substring(0, maxStringLength),
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
            data = JSON.stringify(data, null, 2);
            error = validate(data, String);
            element = {
                value: data.substring(0, maxStringLength),
                type: String
            }
            break;
        case "reference":
            let value = [];
            for (let obj in data) {
                value.push(data[obj].dataUrl);
            }
            element = {
                value: data = value.join(referenceSep),
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
                typeof data !== 'object' ||
                data !== null ||
                typeof data.getTime !== 'function' ||
                isNaN(data)
            ) {
                errorMessage = `Invalid date`;
            }
            break;
        case String:
            if (data && data.length > maxStringLength) {
                errorMessage = "Json object too long";
                data = data.substring(0, 100) + "[...]";
            }
            break;
        default:
            errorMessage = "Unknown field type";
    }
    if (errorMessage) {
        return `${errorMessage}\nData: ${data}`;
    } return null;
}
module.exports = { ctdToHeader, ctdFieldTypes, coToRecord };
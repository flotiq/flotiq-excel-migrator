const ctdToHeader = (data) => {
    let row = [];
    for (field in data.schemaDefinition.allOf[1].properties) {
        let obj = {
            value: field,
            fontWeight: `bold` // additionall cell properties here
        }
        row.push(obj);
    }
    return row;
}

const ctdFieldTypes = (data) => {
    let fieldTypes = {};

    objTypes = {
        "richtext": String,
        "textMarkdown": String,
        "text": String,
        "number": Number,
        "dateTime": Date,
        "geo": "", //TBU
        "datasource": "", //TBU
        "checkbox": Boolean,
    }

    for (field in data.metaDefinition.propertiesConfig) {
        fieldTypes[field] = objTypes[data.metaDefinition.propertiesConfig[field].inputType];
    }
    
    return fieldTypes;
}

const coToRecord = (data, fieldTypes) => {
    let row = [];

    for (type in fieldTypes) {
        let obj = formatContent(data[type], fieldTypes[type]);
            
        row.push(obj)
    }
    return row;
}

// todo convert all flotiq data types
const formatContent = (data, type) => {
    switch (type) {
        case String:
            return {
                value: data,
                type: type
            }
        case Number:
            return {
                value: data,
                type: type
            }
        case Date:
            return {
                format: "d mmmm yyyy",
                value: dateIsValid(new Date(data)),
                type: type
            }
        case Boolean:
            return {
                value: data,
                type: type
            }
        default:
            return {
                value: null
            }
    }
}

function dateIsValid(date) {
    if (
        typeof date === 'object' &&
        date !== null &&
        typeof date.getTime === 'function' &&
        !isNaN(date)
    ) {
        return date;
    }
    return null;
}

module.exports = { ctdToHeader, ctdFieldTypes, coToRecord };
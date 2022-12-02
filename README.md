# Flotiq-Excel migrator

This module migrates Flotiq data to and from an xlsx file.
It was made solely for [flotiq-cli](https://github.com/flotiq/flotiq-cli). However, you can use it independently.

## Setup

Add this module to your project and import functions from flotiq-xlsx-migrate.js.

Run `yarn` to install packages.

## Export

`exportXlsx` is the module's function for exporting Flotiq CTD and CO to the xlsx file.

### Usage

Call function exportXlsx with options object as an attribute, for example:

```
let flotiqXlsx = require("flotiq-excel-migrator")
let exportOptions = { 
    apiKey: "[Flotiq API Key]",
    ctdName: "[CTD API Name]"
}
const exportFromFlotiq = async () => {
    let result = await flotiqXlsx.exportXlsx(exportOptions);
    console.log(result);
}
exportFromFlotiq();
```

Function returns the following information:
* FilePath
* Number of Content Objects for export
* Number of Content Objects successfully exported
* errors data

### Options parameters

Options object accepts the following parameters:
* apiKey - API key to your Flotiq account,
* ctdName - API name of Content Type Definition you wish to export,
* filePath (optional) - the directory to which the xlsx file is to be saved, the current directory by default,
* limit (optional) - Number of Content Objects you wish to export, exports up to 10 000 Content Objects by default,
* saveFile (optional) - boolean value determining whether to save the xlsx file in the directory, true by default. If the value is false, the function will return the parameter `data` with data from Flotiq converted for MS Excel,
* logResults (optional) - boolean value determining whether to type out results into the console, false by default.

### Notes

 * Exported CTD is saved as plain text of properties id's. No metadata is being exported.
 * `Max string length` for all values is set to 30.000 because MS Excel has trouble handling text with length > 30 000 in one cell.

### Result example

```
{
  directoryPath: '[_dirname]//test.xlsx',
  errors: null,
  coTotal: 3,
  co_success: 3
}
```

## Import

`importXlsx` is the module's function for importing an xlsx file to Flotiq.

### Usage

Call function exportXlsx with options object as an attribute, for example:

```
let flotiqXlsx = require("flotiq-excel-migrator")
let importOptions = { 
    apiKey: "[Flotiq API Key]",
    ctdName: "[CTD API Name]",
    filePath: "[path to xlsx file]"
}
const importToFlotiq = async () => {
    let result = await flotiqXlsx.importXlsx(importOptions);
    console.log(result);
}
importToFlotiq();
```

Function returns the following promise:
For every sheet in the workbook:
* Number of Content Objects successfully imported
* Number of errors in Content Object import
* errors data (object)

If options validation error occurs, the function will not return the number of errors and CO exported; instead, it will return information about the invalid options parameter.

### Options parameters

Options object accepts the following parameters:
* apiKey - API key to your Flotiq account,
* ctdName - API name of Content Type Definition you wish to export,
* filePath - the directory to the xlsx file you wish to import data from,
* limit (optional) - Number of Content Objects you wish to import, imports up to 10 000 Content Objects by default,
* logResults (optional) - boolean value determining whether to type out results into the console, false by default.
* updateExisting (optional) boolean value determining whether to update existing Content Objects, true by default.

### Notes

* valid XLSX file looks just like the one that exportXlsx saves. The first row on the sheet (header) should have the names of CTD's properties. Every following row is a separate Content Object, for example:

| id | name | age |
|--|--|--|
| person-1 | John | 30 |
| person-2 | Alex | 20 |

* importXlsx allows you to import many sheets from the same workbook. However, these sheets must be dedicated to the same CTD and have this CTD's properties in the header.
* Parameter LIMIT limits the number of Content Objects you will import from XLSX works individually for every sheet in the workbook.

### Result example

Notice that the import function gives different results for every sheet from your xlsx file, so to read result errors `result.[excel sheet name].sheetErrors`.

```
{
  Sheet1: {
    sheetImportedCoCount: 98,
    sheetErrorsCount: 2,
    sheetErrors: [ [Object] ]
  }
  Sheet2: {
    sheetImportedCoCount: 100,
    sheetErrorsCount: 0,
    sheetErrors: []
    }
}
```

## Data mapping

The form in which Flotiq data is exported to / imported from xlsx varies on property type:

| Flotiq field property | Form in which data is exported to xlsx |
|--|--|
| Text | Text |
| Textarea | Text |
| Markdown | Text (with markdown syntax) |
| Rich text | Text (with HTML tags) |
| Email | Text |
| Number | Number (with ms excel's default decimal separator) |
| Radio | Text |
| Checkbox | TRUE / FALSE |
| Select | Text |
| Relation | API Url's in the form of text, separated with commas, for example: `/api/v1/content/[ctdName]/[coName1],/api/v1/content/[ctdName]/[coName2]` |
| List | JSON |
| Geo | JSON |
| Media | API Url in form of text, separated with commas, for example: `/api/v1/content/_media/[mediaId1],/api/v1/content/_media/[mediaId2]` |
| Date time | Date |
| Block | JSON |

## Notes

 * `Max string length` for all values is set to 30.000 because MS Excel has trouble handling text with length > 30 000 in one cell.

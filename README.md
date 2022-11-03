# Flotiq-Excel migrator

Module for migrating Flotiq data to and from xlsx file.

## Setup

Run `npm install`

Add this module to your project and import functions from index.js

## Export

`exportXlsx` is the module's function for exporting Flotiq CTD and CO to xlsx file.

### Usage

Call function exportXlsx with options object as attribute, for example:
> let export_options = { 
>   apiKey: "[Flotiq API Key]",
>   ctdName: "[CTD API Name]"
> }
> exportXlsx(export_options)`

Function returns following information:
* filePath
* number of Content Objects for export
* number of Content Objects successfully exported
* errors data

### Options parameters

Options objects accepts following parameters:
* apiKey - API key to your Flotiq account,
* ctdName - API name of Content Type Definition you wish to export,
* filePath (optional) - the directory to which the xlsx file is to be saved, current directory by default,
* limit (optional) - number of Content Objects you wish to export, exports up to 10 000 Content Objects by default,
* saveFile (optional) - boolean value determining whether to save the xlsx file in directory, true by default,
* logResults (optional) - boolean value determining whether to type out results into the console, false by default.

### Notes

 - Exported CTD is saved as plain text of properties id's. No meta data is being exported.
 - `Max string length` for all values is set to 30 000. This can be changed by changing the const value in converter.js, however ms excel has trouble handling text with length > 30 000 in one cell

## Import

`importXlsx` is the module's function for importing xlsx file to Flotiq.

### Usage

Call function exportXlsx with options object as attribute, for example:
> let import_options = { 
>   apiKey: "[Flotiq API Key]",
>   ctdName: "[CTD API Name]"
>   filePath: "[path to xlsx file]"
> }
> importXlsx(import_options)`

Function returns following information:
For every sheet in xlsx workbook:
* number of Content Objects successfully imported
* number of errors in Content Objec import
* errors data

### Options parameters

Options objects accepts following parameters:
* apiKey - API key to your Flotiq account,
* ctdName - API name of Content Type Definition you wish to export,
* filePath - the directory to xlsx file you wish to import data from,
* limit (optional) - number of Content Objects you wish to import, imports up to 10 000 Content Objects by default,
* logResults (optional) - boolean value determining whether to type out results into the console, false by default.
* updateExisting (optional) boolean value determining whether to update existing Content Objetcs.

### Notes

- valid XLSX file looks just like the one that exportXlsx saves. First row on the sheet (header) should have names of CTD's properties, every following row is a separate Content Object, for example:

| id | name | age |
|--|--|--|
| person-1 | John | 30 |
| person-2 | Alex | 20 |

- importXlsx allows you to import many sheets from the same workbook at once, however all of these sheets have to be dedicated to the same CTD and have this CTD's properties in the header.

## Data mapping

Form in which Flotiq data is exported to / imported from xlsx varies on property type:

| Flotiq field property | Form in which data is exported to xlsx |
|--|--|
| Text | Text |
| Textarea | Text |
| Markdown | Text (with markdown syntax) |
| Rich text | Text (with html tags) |
| Email | Text |
| Number | Number (with ms excel's default decimal separator) |
| Radio | Text |
| Checkbox | TRUE / FALSE |
| Select | Text |
| Relation | API Url's in form of text, separated with commas*, for example: `/api/v1/content/[ctdName]/[coName1],/api/v1/content/[ctdName]/[coName2]` |
| List | JSON |
| Geo | JSON |
| Media | API Url in form of text, separated with commas*, for example: `/api/v1/content/_media/[mediaId1],/api/v1/content/_media/[mediaId2]` |
| Date time | Date |
| Block | JSON |

*separator can be changed by changing the const value in converter.js
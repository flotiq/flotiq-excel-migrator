# Flotiq-Excel migrator

Module for exporting Content Type Definitions and Content objects from Flotiq to xlsx file.

## Setup

Run `npm install`

Add this module to your project and import function migrateXlsx from index.js

## Usage

Call function migrateXlsx with options object as attribute, for example:
```
let migrate_options = { 
  apiKey: "[flotiq API Key]",
  ctdName: "[CTD API Name]"
}
migrateXlsx(migrate_options)
```

Function return following information:
* filePath
* number of Content Objects for export
* number of Content Objects successfully exported
* errors data

### Options parameters

Options objects accepts following parameters:
* apiKey - API key to your Flotiq account,
* ctdName - API name of Content Type Definition you wish to export,
* filePath (optional) - the directory to which the xlsx file is to be saved, current directory by default,
* limit (optional) - number of Content Objects you wish to export, exports all Content Objects by default,
* saveFile (optional) - boolean value determining whether to save the xlsx file in directory, true by default,
* logResults (optional) - boolean value determining whether to type out results into the console, true by default.

## Data mapping

Form in which Flotiq data is exported to xlsx varies on property type:

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

## Notes

 - `Max string length` is set to 30 000 for all values. This can be changed by changing the const value in converter.js, however ms excel has trouble handling text with length > 30 000 in one cell

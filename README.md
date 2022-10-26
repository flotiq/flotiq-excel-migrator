# Flotiq-Excel migrator

Module for exporting Content Type Definitions and Content objects from Flotiq to xlsx file.

## Setup

Run `npm install`

Add this module to your project and import function migrateXlsx from index.js

## Usage

Call function migrateXlsx with following parameters:

`directoryPath` - directory path for exported xlsx file. Empty string `""` will result in file being saved inside your project directory.

`ctdName` - API name of Content Type Definition you wish to export.

`apiKey` - API key to your Flotiq account.

`limit` - (optional) number of Content Objects you wish to export"
 - 0 - only CTD propery names will be exported into column headers,
 - -1 - (default) all Content  Objects will be exported.

 Example:
 `migrateXlsx("project", "blogPost", "[apiKey]", 100)`

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

 - `Max string length` for all values is set to 30 000. This can be changed by changing the const value in converter.js, however ms excel has trouble handling text with length > 30 000 in one cell

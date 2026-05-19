import { describe, expect, it } from 'vitest';
import { ctdToHeader, ctdFieldTypes, coToRecord, recordToCo } from '../converter.js';

describe('converter', () => {
    it('creates a header row from the CTD schema definition', () => {
        const ctd = {
            schemaDefinition: {
                allOf: [
                    {},
                    {
                        properties: {
                            title: {},
                            count: {}
                        }
                    }
                ]
            }
        };

        expect(ctdToHeader(ctd)).toEqual([
            { value: 'id', fontWeight: 'bold' },
            { value: 'title', fontWeight: 'bold' },
            { value: 'count', fontWeight: 'bold' }
        ]);
    });

    it('maps Flotiq input types to converter field types', () => {
        const ctd = {
            metaDefinition: {
                propertiesConfig: {
                    title: { label: 'Title', inputType: 'text' },
                    publishedAt: { label: 'Published at', inputType: 'dateTime' },
                    metadata: { label: 'Metadata', inputType: 'object' },
                    related: { label: 'Related', inputType: 'datasource' }
                }
            }
        };

        expect(ctdFieldTypes(ctd)).toEqual({
            title: { propertyLabel: 'Title', field: String },
            publishedAt: { propertyLabel: 'Published at', field: Date },
            metadata: { propertyLabel: 'Metadata', field: 'json' },
            related: { propertyLabel: 'Related', field: 'reference' }
        });
    });

    it('converts a content object into an Excel row and reports truncated strings', () => {
        const fieldTypes = {
            title: { propertyLabel: 'Title', field: String },
            isPublished: { propertyLabel: 'Published', field: Boolean },
            metadata: { propertyLabel: 'Metadata', field: 'json' },
            related: { propertyLabel: 'Related', field: 'reference' }
        };
        const longText = 'x'.repeat(30005);

        const result = coToRecord({
            id: 'article-1',
            title: longText,
            isPublished: true,
            metadata: { slug: 'article-1' },
            related: [
                { dataUrl: '/api/v1/content/article/related-1' },
                { dataUrl: '/api/v1/content/article/related-2' }
            ]
        }, fieldTypes);

        expect(result.row[0]).toEqual({ value: 'article-1', type: String });
        expect(result.row[1].value).toHaveLength(30000);
        expect(result.row[2]).toEqual({ value: true, type: Boolean });
        expect(result.row[3]).toEqual({ value: '{"slug":"article-1"}', type: String });
        expect(result.row[4]).toEqual({
            value: '/api/v1/content/article/related-1,/api/v1/content/article/related-2',
            type: String
        });
        expect(result.coErrors).toEqual([
            expect.objectContaining({ propertyLabel: 'Title' })
        ]);
        expect(result.coErrors[0].message).toContain('String too long');
    });

    it('converts an Excel record back into a content object', () => {
        const fieldTypes = {
            title: { propertyLabel: 'Title', field: String },
            count: { propertyLabel: 'Count', field: Number },
            isPublished: { propertyLabel: 'Published', field: Boolean },
            metadata: { propertyLabel: 'Metadata', field: 'json' },
            related: { propertyLabel: 'Related', field: 'reference' }
        };

        expect(recordToCo({
            id: 'article-1',
            title: 'Hello',
            count: '12',
            isPublished: 'TRUE',
            metadata: '{"slug":"hello"}',
            related: '/api/v1/content/article/1,/api/v1/content/article/2'
        }, fieldTypes)).toEqual({
            id: 'article-1',
            title: 'Hello',
            count: 12,
            isPublished: true,
            metadata: { slug: 'hello' },
            related: [
                { type: 'internal', dataUrl: '/api/v1/content/article/1' },
                { type: 'internal', dataUrl: '/api/v1/content/article/2' }
            ]
        });
    });

    it('skips null fields when converting an Excel record', () => {
        const fieldTypes = {
            title: { propertyLabel: 'Title', field: String },
            count: { propertyLabel: 'Count', field: Number },
            metadata: { propertyLabel: 'Metadata', field: 'json' }
        };

        expect(recordToCo({
            id: 'article-1',
            title: null,
            count: '12',
            metadata: null
        }, fieldTypes)).toEqual({
            id: 'article-1',
            count: 12
        });
    });
});
import type { Connector, SyncRecord } from '../types.js';
import { platformKey, ratingOutOfTen, richText } from '../utils.js';
import { openReadOnlyDatabase, queryRows } from './sqlite.js';

export type MonitorReview = {
  id: string;
  sourceName: string;
  propertyCode: string;
  rating: number;
  ratingScale?: number;
  title?: string;
  text?: string;
  language?: string;
  publishedAt?: string;
  authorName?: string;
};

export const mapMonitorReview = (review: MonitorReview): SyncRecord => ({
  object: 'reviews',
  externalSource: `review:${platformKey(review.sourceName)}`,
  externalId: review.id,
  fields: {
    name: review.title ?? `${review.sourceName} review`,
    platform: review.sourceName,
    rating: ratingOutOfTen(review.rating, review.ratingScale ?? 5),
    title: review.title,
    text: richText(review.text),
    language: review.language,
    publishedAt: review.publishedAt,
    replied: false,
    reviewerName: review.authorName,
  },
  links: review.propertyCode
    ? [
        {
          field: 'propertyId',
          object: 'properties',
          externalSource: 'apaleo',
          externalId: review.propertyCode,
        },
      ]
    : [],
});

export const createReviewMonitorConnector = (path: string): Connector => ({
  name: 'review-monitor',
  async *read() {
    const database = openReadOnlyDatabase(path);
    try {
      const rows = queryRows<MonitorReview>(
        database,
        `SELECT r.id, s.name AS sourceName, p.code AS propertyCode, r.rating, COALESCE(s.ratingScale, 5) AS ratingScale, r.title, r.text, r.language, r.publishedAt, r.authorName FROM Review r JOIN Source s ON s.id = r.sourceId JOIN Place p ON p.id = r.placeId`,
      );
      for (const row of rows) yield mapMonitorReview(row);
    } finally {
      database.close();
    }
  },
});

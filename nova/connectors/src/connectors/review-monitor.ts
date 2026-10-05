import type { Connector, SyncRecord } from '../types.js';
import { platformKey, ratingOutOfTen, richText } from '../utils.js';
import { openReadOnlyDatabase, queryRows } from './sqlite.js';

export type MonitorReview = {
  id: string;
  sourceName: string;
  placeName?: string;
  propertyCode?: string;
  rating: number;
  ratingScale?: number;
  title?: string;
  text?: string;
  language?: string;
  publishedAt?: string;
  authorName?: string;
  repliedAt?: string | number | null;
};

export const mapMonitorReview = (review: MonitorReview): SyncRecord => ({
  object: 'reviews',
  externalSource: `review:${platformKey(review.sourceName)}`,
  externalId: review.id,
  fields: {
    name:
      review.title ??
      [review.placeName, `${review.sourceName} review`]
        .filter(Boolean)
        .join(' · '),
    platform: review.sourceName,
    rating: ratingOutOfTen(review.rating, review.ratingScale ?? 5),
    title: review.title,
    text: richText(review.text),
    language: review.language,
    publishedAt: review.publishedAt,
    replied: review.repliedAt != null,
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
        // Rating is already normalised to 0-5; externalId is the platform's own id, which
        // Welcome's Channex feed uses too, so both sources land on one record.
        `SELECT COALESCE(r.externalId, r.id) AS id, r.platform AS sourceName, p.name AS placeName, r.rating, 5 AS ratingScale, r.title, r.text, r.language, r.publishedAt, r.author AS authorName, r.repliedAt FROM Review r JOIN Place p ON p.id = r.placeId`,
      );
      for (const row of rows) yield mapMonitorReview(row);
    } finally {
      database.close();
    }
  },
});

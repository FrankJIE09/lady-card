import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// The room payload is private server state; tokens and remaining deck never leave the API.
export const rooms = sqliteTable('rooms', {
  code: text('code').primaryKey(),
  payload: text('payload').notNull(),
  revision: integer('revision').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, (table) => [index('rooms_expires_at_idx').on(table.expiresAt)]);

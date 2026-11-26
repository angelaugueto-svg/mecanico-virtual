import { sql } from 'drizzle-orm';
import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  date,
  integer,
} from 'drizzle-orm/pg-core';

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    username: text('username').notNull(),
    phone: text('phone').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    greetingDate: date('greeting_date'),
  },
  (t) => [
    uniqueIndex('clients_username_lower_unique').on(sql`lower(${t.username})`),
    uniqueIndex('clients_phone_unique').on(t.phone),
  ],
);

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accessPeriods = pgTable('access_periods', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  priceUsd: integer('price_usd').notNull().default(3),
  status: text('status').notNull().default('active'),
  bank: text('bank'),
  referenceNorm: text('reference_norm'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  payerName: text('payer_name').notNull(),
  cedula: text('cedula').notNull(),
  amountBs: numeric('amount_bs', { precision: 14, scale: 2 }).notNull(),
  reference: text('reference').notNull(),
  referenceNorm: text('reference_norm').notNull(),
  bank: text('bank').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const consultations = pgTable('consultations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Client = typeof clients.$inferSelect;
export type AccessPeriod = typeof accessPeriods.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Consultation = typeof consultations.$inferSelect;
export type NewClient = typeof clients.$inferInsert;

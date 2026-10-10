import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => 'bytea',
  fromDriver: (v) => Buffer.from(v),
});

// One Postgres schema for local dev (PGlite) and production (Supabase / Neon).
// Data that comes from outside carries source, license and fetched_at.

const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const provenance = {
  source: text('source').notNull(),
  sourceUrl: text('source_url'),
  license: text('license'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
};

// ---------- Accounts ----------

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Sign in with an email or an Indian mobile number (stored as +91XXXXXXXXXX).
  email: text('email').unique(),
  phone: text('phone').unique(),
  passwordHash: text('password_hash'), // null for Google-only accounts
  googleSub: text('google_sub').unique(),
  contactVerified: boolean('contact_verified').notNull().default(false),
  createdAt: created(),
});

export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone'),
  nationality: text('nationality'),
  homeCity: text('home_city'),
  personaId: text('persona_id'),
  personaAnswers: jsonb('persona_answers').$type<Record<string, string>>(),
  personaNotes: jsonb('persona_notes').$type<Record<string, string>>(),
  preferences: jsonb('preferences').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  language: text('language').notNull().default('en'),
  seniorMode: boolean('senior_mode').notNull().default(false),
  updatedAt: updated(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(), // random, referenced from the session cookie
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userAgent: text('user_agent'),
    createdAt: created(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const passwordResets = pgTable('password_resets', {
  tokenHash: text('token_hash').primaryKey(), // only the hash is stored
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: created(),
});

/** One-time codes for sign-up, code log-in and password reset. Only a hash is stored. */
export const otpCodes = pgTable(
  'otp_codes',
  {
    id: serial('id').primaryKey(),
    contact: text('contact').notNull(),
    purpose: text('purpose').notNull(), // signup | login | reset
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [index('otp_contact_idx').on(t.contact, t.purpose)],
);

// ---------- Reference data (seeded from open datasets) ----------

export const airports = pgTable(
  'airports',
  {
    iata: text('iata').primaryKey(),
    icao: text('icao'),
    name: text('name').notNull(),
    city: text('city').notNull(),
    country: text('country').notNull(),
    lat: real('lat').notNull(),
    lon: real('lon').notNull(),
    tz: text('tz'),
    routeCount: integer('route_count').notNull().default(0),
    ...provenance,
  },
  (t) => [index('airports_city_idx').on(t.city)],
);

export const airlines = pgTable('airlines', {
  iata: text('iata').primaryKey(),
  icao: text('icao'),
  name: text('name').notNull(),
  country: text('country'),
  ...provenance,
});

export const routes = pgTable(
  'routes',
  {
    id: serial('id').primaryKey(),
    airlineIata: text('airline_iata').notNull(),
    srcIata: text('src_iata').notNull(),
    dstIata: text('dst_iata').notNull(),
    stops: integer('stops').notNull().default(0),
    equipment: text('equipment'),
    ...provenance,
  },
  (t) => [index('routes_pair_idx').on(t.srcIata, t.dstIata)],
);

export const destinations = pgTable('destinations', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  region: text('region').notNull(), // for grouping the dropdown
  isDomestic: boolean('is_domestic').notNull(),
  lat: real('lat').notNull(),
  lon: real('lon').notNull(),
  airportIata: text('airport_iata'),
  description: text('description'),
  bestTime: text('best_time'),
  idealDays: integer('ideal_days'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  personaTags: text('persona_tags').array().notNull().default(sql`'{}'::text[]`),
  dailyCostInr: jsonb('daily_cost_inr').$type<{ shoestring: number; moderate: number; comfort: number; luxury: number }>(),
  featured: boolean('featured').notNull().default(false),
  imageUrl: text('image_url'),
  imageThumbUrl: text('image_thumb_url'),
  imageCredit: text('image_credit'),
  imageLicense: text('image_license'),
  ...provenance,
});

/** Typical daily cost per person by travel style, split by category (INR). Refreshed by a script. */
export const destinationCostIndex = pgTable(
  'destination_cost_index',
  {
    destinationId: integer('destination_id')
      .notNull()
      .references(() => destinations.id, { onDelete: 'cascade' }),
    style: text('style').notNull(), // shoestring | moderate | comfort | luxury
    stay: integer('stay').notNull(), // per person per night
    food: integer('food').notNull(),
    transport: integer('transport').notNull(),
    activities: integer('activities').notNull(),
    ...provenance,
  },
  (t) => [primaryKey({ columns: [t.destinationId, t.style] })],
);

const placeColumns = () => ({
  id: serial('id').primaryKey(),
  destinationId: integer('destination_id')
    .notNull()
    .references(() => destinations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  lat: real('lat'),
  lon: real('lon'),
  rating: real('rating'),
  imageUrl: text('image_url'),
  personaTags: text('persona_tags').array().notNull().default(sql`'{}'::text[]`),
  externalId: text('external_id'),
  ...provenance,
});

export const attractions = pgTable(
  'attractions',
  {
    ...placeColumns(),
    category: text('category'),
    description: text('description'),
    openingHours: text('opening_hours'),
    fee: text('fee'),
    famous: boolean('famous').notNull().default(false),
    website: text('website'),
    phone: text('phone'),
  },
  (t) => [index('attractions_dest_idx').on(t.destinationId), uniqueIndex('attractions_ext_idx').on(t.source, t.externalId)],
);

export const restaurants = pgTable(
  'restaurants',
  {
    ...placeColumns(),
    cuisine: text('cuisine'),
    priceLevel: integer('price_level'),
    vegetarian: boolean('vegetarian'),
    openingHours: text('opening_hours'),
    diets: text('diets').array().notNull().default(sql`'{}'::text[]`),
    website: text('website'),
    phone: text('phone'),
    reservation: text('reservation'),
  },
  (t) => [index('restaurants_dest_idx').on(t.destinationId), uniqueIndex('restaurants_ext_idx').on(t.source, t.externalId)],
);

export const hotelsCache = pgTable(
  'hotels_cache',
  {
    ...placeColumns(),
    provider: text('provider').notNull(),
    kind: text('kind'), // hotel | hostel | guest_house | apartment | resort …
    stars: real('stars'),
    pricePerNightInr: integer('price_per_night_inr'),
    priceIsEstimate: boolean('price_is_estimate').notNull().default(true),
    amenities: text('amenities').array().notNull().default(sql`'{}'::text[]`),
    address: text('address'),
    cancellation: text('cancellation'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [index('hotels_dest_idx').on(t.destinationId), uniqueIndex('hotels_ext_idx').on(t.provider, t.externalId)],
);

export const flightsCache = pgTable('flights_cache', {
  cacheKey: text('cache_key').primaryKey(), // provider + route + dates + pax
  provider: text('provider').notNull(),
  payload: jsonb('payload').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// ---------- Trips ----------

export const trips = pgTable(
  'trips',
  {
    id: text('id').primaryKey(), // made on the device, so trips can be created offline
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    origin: text('origin'),
    destinationId: integer('destination_id').references(() => destinations.id),
    destinationName: text('destination_name').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    travellers: integer('travellers').notNull().default(1),
    budgetInr: integer('budget_inr'),
    status: text('status').notNull().default('upcoming'), // upcoming | active | completed
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('trips_user_idx').on(t.userId)],
);

export const tripDrafts = pgTable(
  'trip_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    step: text('step').notNull().default('destination'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    version: integer('version').notNull().default(1), // optimistic concurrency
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('drafts_user_idx').on(t.userId)],
);

export const tripItems = pgTable(
  'trip_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // flight | hotel | activity | transport
    title: text('title').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    priceInr: integer('price_inr'),
    provider: text('provider'),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: created(),
  },
  (t) => [index('trip_items_trip_idx').on(t.tripId)],
);

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tripId: text('trip_id').references(() => trips.id, { onDelete: 'cascade' }),
  tripItemId: uuid('trip_item_id').references(() => tripItems.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('pending'), // pending | confirmed | cancelled | simulated
  amountInr: integer('amount_inr').notNull().default(0),
  provider: text('provider'),
  providerRef: text('provider_ref'),
  paymentStatus: text('payment_status'),
  // Added for payments and cancellations (all nullable: additive).
  clientId: text('client_id').unique(), // the booking's id on the device
  kind: text('kind'), // flight | hotel | experience | transport
  title: text('title'),
  currency: text('currency').notNull().default('INR'),
  paymentId: uuid('payment_id'),
  source: text('source').notNull().default('in_app'), // in_app | external
  pnr: text('pnr'),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  cancellationPolicy: jsonb('cancellation_policy'),
  details: jsonb('details'),
  pointsUsed: integer('points_used').notNull().default(0),
  refundedInr: integer('refunded_inr').notNull().default(0),
  createdAt: created(),
});

/** One payment attempt (Razorpay order or the demo provider). Card details are never stored. */
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
  provider: text('provider').notNull(), // razorpay | mock
  providerOrderId: text('provider_order_id').notNull().unique(),
  providerPaymentId: text('provider_payment_id'),
  amountInr: integer('amount_inr').notNull(),
  currency: text('currency').notNull().default('INR'),
  method: text('method'), // card | upi | netbanking …
  status: text('status').notNull().default('created'), // created | paid | failed | refunded | partially_refunded
  idempotencyKey: text('idempotency_key').notNull().unique(),
  createdAt: created(),
  updatedAt: updated(),
});

/** Every provider event, once (webhooks are retried, so the event id is unique). */
export const paymentEvents = pgTable('payment_events', {
  id: serial('id').primaryKey(),
  paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'cascade' }),
  providerEventId: text('provider_event_id').unique(),
  type: text('type').notNull(),
  payload: jsonb('payload'),
  createdAt: created(),
});

export const cancellationRequests = pgTable('cancellation_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
  /** The booking as it was (also used for bookings made outside Voyage). */
  booking: jsonb('booking').notNull(),
  status: text('status').notNull().default('draft'),
  reason: text('reason'),
  refundMethod: text('refund_method'),
  expectedBy: timestamp('expected_by', { withTimezone: true }),
  providerRef: text('provider_ref'), // refund id or provider cancellation id
  refundedInr: integer('refunded_inr').notNull().default(0),
  autoFollowUp: boolean('auto_follow_up').notNull().default(false),
  version: integer('version').notNull().default(1),
  statusChangedAt: timestamp('status_changed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: created(),
  updatedAt: updated(),
});

export const refundQuotes = pgTable('refund_quotes', {
  id: serial('id').primaryKey(),
  requestId: uuid('request_id')
    .notNull()
    .references(() => cancellationRequests.id, { onDelete: 'cascade' }),
  refundInr: integer('refund_inr').notNull(),
  feeInr: integer('fee_inr').notNull(),
  components: jsonb('components').notNull(),
  method: text('method').notNull(),
  days: integer('days').notNull(),
  source: text('source').notNull(), // rules | razorpay | duffel | amadeus | mock
  notes: jsonb('notes'),
  createdAt: created(),
});

/** Timeline and audit log of a cancellation. */
export const refundEvents = pgTable('refund_events', {
  id: serial('id').primaryKey(),
  requestId: uuid('request_id')
    .notNull()
    .references(() => cancellationRequests.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // status | email | note | suggestion | reply
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  actor: text('actor').notNull(), // user | system | provider
  note: text('note'),
  data: jsonb('data'),
  createdAt: created(),
});

/** Everything Voyage would send (email, SMS, WhatsApp, call, push). In demo mode it stops here. */
export const outboundMessages = pgTable('outbound_emails', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull().default('email'), // email | sms | whatsapp | voice | push
  toAddress: text('to_address').notNull(), // masked for phone numbers
  cc: text('cc'),
  replyTo: text('reply_to'),
  subject: text('subject'),
  body: text('body').notNull(),
  status: text('status').notNull().default('dry_run'), // dry_run | sent | failed
  provider: text('provider'),
  relatedType: text('related_type'), // cancellation | booking | notification
  relatedId: text('related_id'),
  createdAt: created(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});

/** Support contacts for providers. Only details verified on the provider's own site. */
export const providerContacts = pgTable('provider_contacts', {
  id: serial('id').primaryKey(),
  provider: text('provider').notNull().unique(),
  name: text('name').notNull(),
  kind: text('kind').notNull(), // airline | hotel | ota | rail | ride
  supportUrl: text('support_url').notNull(),
  email: text('email'),
  phone: text('phone'),
  verified: boolean('verified').notNull().default(false),
  ...provenance,
});

/** Airline credit shells and vouchers issued instead of money back. */
export const creditShells = pgTable('credit_shells', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
  provider: text('provider').notNull(),
  amountInr: integer('amount_inr').notNull(),
  code: text('code'),
  expiresOn: date('expires_on'),
  createdAt: created(),
});

/** A trip's living itinerary: the current plan (days and items) and its version. */
export const itineraries = pgTable('itineraries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tripId: text('trip_id').notNull().unique(),
  version: integer('version').notNull().default(1),
  plan: jsonb('plan').notNull(), // { days: [{ date, items: [...] }], postponed: [...] }
  createdAt: created(),
  updatedAt: updated(),
});

/** Every change to an itinerary, with the reason and a readable diff; used for Undo. */
export const itineraryVersions = pgTable(
  'itinerary_versions',
  {
    id: serial('id').primaryKey(),
    itineraryId: uuid('itinerary_id')
      .notNull()
      .references(() => itineraries.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    reason: text('reason').notNull(),
    changes: jsonb('changes').notNull(), // string[]
    plan: jsonb('plan').notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex('itinerary_versions_unique').on(t.itineraryId, t.version)],
);

export const savedPlaces = pgTable('saved_places', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // destination | attraction | restaurant | hotel
  refId: text('ref_id').notNull(),
  name: text('name').notNull(),
  createdAt: created(),
});

// ---------- Documents, chat, sentiment ----------

export const verificationDocuments = pgTable('verification_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  docType: text('doc_type').notNull(), // passport | visa | boarding-pass | insurance | hotel | id | other
  idType: text('id_type'), // for docType id: aadhaar | pan | driving_licence | voter | other
  title: text('title').notNull().default('Document'),
  holder: text('holder'),
  tripId: text('trip_id'),
  expiresOn: date('expires_on'),
  storagePath: text('storage_path').notNull(),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  status: text('status').notNull().default('pending'), // pending | verified | rejected
  maskedNumber: text('masked_number'), // e.g. XXXX XXXX 4417; never the full number
  extracted: jsonb('extracted').$type<Record<string, unknown>>(),
  createdAt: created(),
  updatedAt: updated(),
});

/** The encrypted file behind a document (AES-256-GCM). Only the server can read it. */
export const documentBlobs = pgTable('document_blobs', {
  docId: uuid('doc_id')
    .primaryKey()
    .references(() => verificationDocuments.id, { onDelete: 'cascade' }),
  iv: bytea('iv').notNull(),
  tag: bytea('tag').notNull(),
  data: bytea('data').notNull(),
});

export const chatConversations = pgTable('chat_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('New chat'),
  createdAt: created(),
  updatedAt: updated(),
});

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // user | assistant | tool
    content: text('content').notNull(),
    toolCalls: jsonb('tool_calls'),
    createdAt: created(),
  },
  (t) => [index('chat_messages_conv_idx').on(t.conversationId)],
);

export const airlineReviews = pgTable('airline_reviews', {
  id: serial('id').primaryKey(),
  airlineIata: text('airline_iata').notNull(),
  text: text('text').notNull(),
  rating: real('rating'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  sentiment: text('sentiment'), // positive | neutral | negative
  score: real('score'),
  aspects: jsonb('aspects').$type<Record<string, number>>(),
  externalId: text('external_id'),
  ...provenance,
});

export const airlineSentimentScores = pgTable('airline_sentiment_scores', {
  airlineIata: text('airline_iata').primaryKey(),
  overall: real('overall').notNull(),
  aspects: jsonb('aspects').$type<Record<string, number>>(),
  reviewCount: integer('review_count').notNull(),
  sources: text('sources').array().notNull().default(sql`'{}'::text[]`),
  updatedAt: updated(),
});

// ---------- Offline sync ----------

/** Each offline change is applied once: its idempotency key and the answer given are kept. */
export const syncReceipts = pgTable('sync_receipts', {
  idempotencyKey: text('idempotency_key').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  result: jsonb('result'),
  createdAt: created(),
});

/**
 * The traveller's on-device records (bookings, documents' metadata, expenses, journey
 * progress…), one row per record, with a revision for conflict detection. Trips are
 * also copied into the typed trips table.
 */
export const userRecords = pgTable(
  'user_records',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tbl: text('tbl').notNull(),
    recordId: text('record_id').notNull(),
    payload: jsonb('payload'),
    rev: integer('rev').notNull(),
    deleted: boolean('deleted').notNull().default(false),
    updatedAt: updated(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tbl, t.recordId] })],
);

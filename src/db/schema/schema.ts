import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  numeric,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema.js';

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  category: text('category'),
  date: text('date').notNull(),
  venue: text('venue').notNull(),
  location: text('location').notNull(),
  price: numeric('price').default('0'),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').references(() => user.id),
  isLocal: boolean('is_local').default(false),
});

export const savedEvents = pgTable(
  'saved_events',
  {
    id: text('id').primaryKey(),
    deviceId: text('device_id').notNull(),
    eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueDevice: uniqueIndex('saved_events_device_event_idx').on(table.deviceId, table.eventId),
  })
);

export const eventMessages = pgTable('event_messages', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const eventInterest = pgTable(
  'event_interest',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueDevice: uniqueIndex('event_interest_event_device_idx').on(table.eventId, table.deviceId),
  })
);

export const eventGoing = pgTable(
  'event_going',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueDevice: uniqueIndex('event_going_event_device_idx').on(table.eventId, table.deviceId),
  })
);

export const eventLikes = pgTable(
  'event_likes',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueDevice: uniqueIndex('event_likes_event_device_idx').on(table.eventId, table.deviceId),
  })
);

export const eventPhotos = pgTable('event_photos', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  uploadedBy: text('uploaded_by'),
  sortOrder: integer('sort_order').default(0),
  imageData: text('image_data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const eventPresence = pgTable(
  'event_presence',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(),
    userId: text('user_id'),
    userName: text('user_name'),
    lastSeen: timestamp('last_seen', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueDevice: uniqueIndex('event_presence_event_device_idx').on(table.eventId, table.deviceId),
  })
);

export const dmConversations = pgTable(
  'dm_conversations',
  {
    id: text('id').primaryKey(),
    user1Id: text('user1_id').notNull(),
    user2Id: text('user2_id').notNull(),
    lastMessage: text('last_message'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueUsers: uniqueIndex('dm_conversations_users_idx').on(table.user1Id, table.user2Id),
  })
);

export const dmMessages = pgTable('dm_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => dmConversations.id, { onDelete: 'cascade' }),
  senderId: text('sender_id').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const friendships = pgTable(
  'friendships',
  {
    id: text('id').primaryKey(),
    user1Id: text('user1_id').notNull(),
    user2Id: text('user2_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueUsers: uniqueIndex('friendships_users_idx').on(table.user1Id, table.user2Id),
  })
);

export const friendRequests = pgTable(
  'friend_requests',
  {
    id: text('id').primaryKey(),
    fromUserId: text('from_user_id').notNull(),
    toUserId: text('to_user_id').notNull(),
    status: text('status').default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueUsers: uniqueIndex('friend_requests_users_idx').on(table.fromUserId, table.toUserId),
  })
);

export const cityRooms = pgTable('city_rooms', {
  id: text('id').primaryKey(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  displayName: text('display_name').notNull(),
  memberCount: integer('member_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const cityRoomMembers = pgTable(
  'city_room_members',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id').notNull().references(() => cityRooms.id),
    userId: text('user_id').notNull().references(() => user.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueRoomUser: uniqueIndex('city_room_members_room_user_idx').on(table.roomId, table.userId),
  })
);

export const cityMessages = pgTable('city_messages', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => cityRooms.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => user.id),
  userName: text('user_name'),
  userImage: text('user_image'),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const jobs = pgTable('jobs', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  company: text('company').notNull(),
  location: text('location').notNull(),
  type: text('type').notNull(),
  category: text('category').notNull(),
  description: text('description').notNull(),
  salaryMin: numeric('salary_min'),
  salaryMax: numeric('salary_max'),
  applyUrl: text('apply_url'),
  applyEmail: text('apply_email'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  postedBy: text('posted_by').notNull().references(() => user.id),
});

export const blockedUsers = pgTable(
  'blocked_users',
  {
    id: text('id').primaryKey(),
    blockerId: text('blocker_id').notNull(),
    blockedId: text('blocked_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueUsers: uniqueIndex('blocked_users_users_idx').on(table.blockerId, table.blockedId),
  })
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    sessionName: text('session_name').notNull(),
    status: text('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  }
);

export const careers = pgTable('careers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  salary: numeric('salary').notNull(),
  description: text('description'),
  icon: text('icon'),
});

export const housingOptions = pgTable('housing_options', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  monthlyCost: numeric('monthly_cost').notNull(),
  description: text('description'),
});

export const budgetModules = pgTable('budget_modules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  monthlyCost: numeric('monthly_cost').notNull(),
  description: text('description'),
  isOptional: boolean('is_optional').default(true),
});

export const randomEvents = pgTable('random_events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  financialImpact: numeric('financial_impact').notNull(),
  category: text('category'),
});

export const studentSessions = pgTable('student_sessions', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  studentName: text('student_name').notNull(),
  careerId: text('career_id').references(() => careers.id),
  housingId: text('housing_id').references(() => housingOptions.id),
  monthlyBudget: numeric('monthly_budget'),
  savings: numeric('savings').default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

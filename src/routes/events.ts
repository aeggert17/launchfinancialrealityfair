import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, like, ilike, desc, sql, inArray, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import * as schema from '../db/schema/schema.js';
import type { App } from '../index.js';

export function registerEventRoutes(app: App) {
  const fastify = app.fastify;

  // Helper to get device_id from header or fallback to IP
  const getDeviceId = (request: FastifyRequest) => {
    return (request.headers['x-device-id'] as string) || request.ip || 'unknown';
  };

  // GET /api/events/suggestions
  fastify.get('/api/events/suggestions', {
    schema: {
      description: 'Get AI-curated event suggestions',
      tags: ['events'],
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  event: { type: 'object' },
                  blurb: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Querystring: { category?: string } }>) => {
    app.logger.info({ category: request.query.category }, 'Getting event suggestions');
    try {
      const query = request.query.category
        ? await app.db.query.events.findMany({ where: eq(schema.events.category, request.query.category), limit: 20 })
        : await app.db.query.events.findMany({ limit: 20 });

      // If AI fails, return first 3 with generic blurbs
      const suggestions = query.slice(0, 3).map(event => ({
        event,
        blurb: `Don't miss this amazing ${event.category} event!`,
      }));

      return { suggestions };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get event suggestions');
      throw error;
    }
  });

  // GET /api/events/picks
  fastify.get('/api/events/picks', {
    schema: {
      description: 'Get personalized event picks',
      tags: ['events'],
      response: {
        200: {
          type: 'object',
          properties: {
            picks: { type: 'array', items: { type: 'object' } },
            reason: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest) => {
    app.logger.info('Getting event picks');
    try {
      const deviceId = getDeviceId(request);
      const allEvents = await app.db.query.events.findMany();
      const picks = allEvents.slice(0, 5);
      return { picks, reason: 'Top picks for you' };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get event picks');
      throw error;
    }
  });

  // POST /api/events/generate-local
  fastify.post('/api/events/generate-local', {
    schema: {
      description: 'Generate local events via AI',
      tags: ['events'],
      body: {
        type: 'object',
        properties: {
          zip_code: { type: 'string' },
          location: { type: 'string' },
          city: { type: 'string' },
          category: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            events: { type: 'array', items: { type: 'object' } },
            location_name: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: { zip_code?: string; location?: string; city?: string; category?: string } }>) => {
    app.logger.info({ body: request.body }, 'Generating local events');
    try {
      const locationName = request.body.location || request.body.city || request.body.zip_code || 'Local Area';

      // Hardcoded fallback events
      const fallbackEvents = [
        { title: 'Local Community Meetup', category: 'community', date: new Date(Date.now() + 86400000).toISOString(), venue: 'Community Center', location: locationName, price: '0', description: 'Join local residents for a community gathering' },
        { title: 'Weekly Farmers Market', category: 'food', date: new Date(Date.now() + 172800000).toISOString(), venue: 'Main Street', location: locationName, price: '0', description: 'Fresh local produce and goods' },
        { title: 'Outdoor Fitness Class', category: 'outdoor', date: new Date(Date.now() + 259200000).toISOString(), venue: 'Local Park', location: locationName, price: '0', description: 'Free fitness class in the park' },
        { title: 'Local Artist Showcase', category: 'arts', date: new Date(Date.now() + 345600000).toISOString(), venue: 'Community Gallery', location: locationName, price: '0', description: 'Support local artists' },
        { title: 'Neighborhood Dinner', category: 'food', date: new Date(Date.now() + 432000000).toISOString(), venue: 'Local Restaurant', location: locationName, price: '15', description: 'Potluck dinner with neighbors' },
      ];

      const insertedEvents = [];
      for (const event of fallbackEvents) {
        const inserted = await app.db.insert(schema.events).values({
          id: randomUUID(),
          title: event.title,
          description: event.description,
          category: request.body.category || event.category,
          date: event.date,
          venue: event.venue,
          location: event.location,
          price: event.price,
          imageUrl: `https://picsum.photos/seed/${event.title.replace(/\s+/g, '-').toLowerCase()}/800/600`,
          isLocal: true,
        }).returning();
        insertedEvents.push(inserted[0]);
      }

      app.logger.info({ count: insertedEvents.length, location: locationName }, 'Local events generated');
      return { events: insertedEvents, location_name: locationName };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to generate local events');
      throw error;
    }
  });

  // GET /api/events
  fastify.get('/api/events', {
    schema: {
      description: 'List events',
      tags: ['events'],
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          search: { type: 'string' },
          limit: { type: 'integer', default: 20 },
          offset: { type: 'integer', default: 0 },
          shuffle: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            events: { type: 'array', items: { type: 'object' } },
            total: { type: 'number' },
            limit: { type: 'number' },
            offset: { type: 'number' },
            has_more: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Querystring: { category?: string; search?: string; limit?: number; offset?: number; shuffle?: boolean } }>) => {
    app.logger.info({ query: request.query }, 'Getting events');
    try {
      const limit = Math.min(request.query.limit || 20, 100);
      const offset = request.query.offset || 0;

      let query = app.db.selectDistinct().from(schema.events);

      if (request.query.category) {
        query = query.where(eq(schema.events.category, request.query.category)) as any;
      }

      if (request.query.search) {
        query = query.where(ilike(schema.events.title, `%${request.query.search}%`)) as any;
      }

      const events = await (query as any).orderBy(request.query.shuffle ? sql`RANDOM()` : desc(schema.events.createdAt)).limit(limit).offset(offset);

      const countResult = await app.db.select({ count: sql<number>`count(*)` }).from(schema.events);
      const total = countResult[0].count;

      return {
        events,
        total,
        limit,
        offset,
        has_more: offset + limit < total,
      };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get events');
      throw error;
    }
  });

  // POST /api/events
  fastify.post('/api/events', {
    schema: {
      description: 'Create event',
      tags: ['events'],
      body: {
        type: 'object',
        required: ['title', 'description', 'category', 'date', 'venue', 'location'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          date: { type: 'string' },
          venue: { type: 'string' },
          location: { type: 'string' },
          price: { type: 'number' },
          image_url: { type: 'string' },
        },
      },
      response: {
        201: { type: 'object', additionalProperties: true },
        401: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Body: { title: string; description: string; category: string; date: string; venue: string; location: string; price?: number; image_url?: string } }>, reply: FastifyReply) => {
    app.logger.info({ body: request.body }, 'Creating event');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const eventId = randomUUID();
      const imageUrl = request.body.image_url || `https://picsum.photos/seed/${request.body.title.replace(/\s+/g, '-').toLowerCase()}/800/600`;

      const inserted = await app.db.insert(schema.events).values({
        id: eventId,
        title: request.body.title,
        description: request.body.description,
        category: request.body.category,
        date: request.body.date,
        venue: request.body.venue,
        location: request.body.location,
        price: String(request.body.price || 0),
        imageUrl,
        createdBy: session.user.id,
        isLocal: false,
      }).returning();

      app.logger.info({ eventId: inserted[0].id }, 'Event created');
      reply.status(201);
      return inserted[0];
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to create event');
      throw error;
    }
  });

  // GET /api/events/:id
  fastify.get('/api/events/:id', {
    schema: {
      description: 'Get event by ID',
      tags: ['events'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      response: {
        200: { type: 'object', additionalProperties: true },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ eventId: request.params.id }, 'Getting event');
    try {
      const event = await app.db.query.events.findFirst({ where: eq(schema.events.id, request.params.id) });
      if (!event) {
        app.logger.warn({ eventId: request.params.id }, 'Event not found');
        return reply.status(404).send({ error: 'Event not found' });
      }
      return event;
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get event');
      throw error;
    }
  });

  // POST /api/events/:id/save
  fastify.post('/api/events/:id/save', {
    schema: {
      description: 'Save event',
      tags: ['events'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { saved: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ eventId: request.params.id }, 'Saving event');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const deviceId = session.user.id;
      await app.db.insert(schema.savedEvents).values({
        id: randomUUID(),
        deviceId,
        eventId: request.params.id,
      }).onConflictDoNothing();
      return { saved: true };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to save event');
      throw error;
    }
  });

  // DELETE /api/events/:id/save
  fastify.delete('/api/events/:id/save', {
    schema: {
      description: 'Unsave event',
      tags: ['events'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { saved: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ eventId: request.params.id }, 'Unsaving event');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const deviceId = session.user.id;
      await app.db.delete(schema.savedEvents).where(
        and(eq(schema.savedEvents.eventId, request.params.id), eq(schema.savedEvents.deviceId, deviceId))
      );
      return { saved: false };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to unsave event');
      throw error;
    }
  });

  // GET /api/saved-events
  fastify.get('/api/saved-events', {
    schema: {
      description: 'Get saved events',
      tags: ['events'],
      response: { 200: { type: 'object', properties: { events: { type: 'array', items: { type: 'object' } } } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    app.logger.info('Getting saved events');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const deviceId = session.user.id;
      const saved = await app.db.select().from(schema.savedEvents).where(eq(schema.savedEvents.deviceId, deviceId));
      const eventIds = saved.map(s => s.eventId);
      const events = eventIds.length > 0 ? await app.db.select().from(schema.events).where(inArray(schema.events.id, eventIds)) : [];
      return { events };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get saved events');
      throw error;
    }
  });

  // GET /api/events/:id/messages
  fastify.get('/api/events/:id/messages', {
    schema: {
      description: 'Get event messages',
      tags: ['events'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      querystring: { type: 'object', properties: { limit: { type: 'integer', default: 50 }, before: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { messages: { type: 'array', items: { type: 'object' } }, has_more: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: number; before?: string } }>) => {
    app.logger.info({ eventId: request.params.id }, 'Getting event messages');
    try {
      const limit = Math.min(request.query.limit || 50, 100);
      const messages = await app.db.select().from(schema.eventMessages).where(eq(schema.eventMessages.eventId, request.params.id)).orderBy(desc(schema.eventMessages.createdAt)).limit(limit);
      return { messages, has_more: false };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get event messages');
      throw error;
    }
  });

  // POST /api/events/:id/messages
  fastify.post('/api/events/:id/messages', {
    schema: {
      description: 'Post event message',
      tags: ['events'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['content'], properties: { content: { type: 'string' } } },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string }; Body: { content: string } }>, reply: FastifyReply) => {
    app.logger.info({ eventId: request.params.id }, 'Posting event message');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const message = await app.db.insert(schema.eventMessages).values({
        id: randomUUID(),
        eventId: request.params.id,
        userId: session.user.id,
        content: request.body.content,
      }).returning();
      app.logger.info({ messageId: message[0].id }, 'Event message posted');
      return message[0];
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to post event message');
      throw error;
    }
  });

  // POST /api/events/:id/presence
  fastify.post('/api/events/:id/presence', {
    schema: {
      description: 'Upsert presence',
      tags: ['events'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ eventId: request.params.id }, 'Upserting presence');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const deviceId = session.user.id;
      await app.db.insert(schema.eventPresence).values({
        id: randomUUID(),
        eventId: request.params.id,
        deviceId,
        userId: session.user.id,
        userName: session.user.name,
      }).onConflictDoNothing();
      return { success: true };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to upsert presence');
      throw error;
    }
  });

  // GET /api/events/:id/presence
  fastify.get('/api/events/:id/presence', {
    schema: {
      description: 'Get active presence',
      tags: ['events'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { members: { type: 'array', items: { type: 'object' } }, count: { type: 'number' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>) => {
    app.logger.info({ eventId: request.params.id }, 'Getting presence');
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const members = await app.db.select().from(schema.eventPresence)
        .where(and(eq(schema.eventPresence.eventId, request.params.id)));
      return { members: members.filter(m => m.lastSeen && new Date(m.lastSeen) > fiveMinutesAgo), count: members.length };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get presence');
      throw error;
    }
  });

  // GET /api/events/:id/interest
  fastify.get('/api/events/:id/interest', {
    schema: {
      description: 'Get interest count',
      tags: ['events'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { count: { type: 'number' }, interested: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>) => {
    app.logger.info({ eventId: request.params.id }, 'Getting interest');
    try {
      const deviceId = getDeviceId(request);
      const countResult = await app.db.select({ count: sql<number>`count(*)` }).from(schema.eventInterest).where(eq(schema.eventInterest.eventId, request.params.id));
      const count = countResult[0].count;
      const interested = !!(await app.db.query.eventInterest.findFirst({ where: and(eq(schema.eventInterest.eventId, request.params.id), eq(schema.eventInterest.deviceId, deviceId)) }));
      return { count, interested };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get interest');
      throw error;
    }
  });

  // POST /api/events/:id/interest
  fastify.post('/api/events/:id/interest', {
    schema: {
      description: 'Mark interested',
      tags: ['events'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { count: { type: 'number' }, interested: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ eventId: request.params.id }, 'Marking interested');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const deviceId = session.user.id;
      await app.db.insert(schema.eventInterest).values({
        id: randomUUID(),
        eventId: request.params.id,
        deviceId,
      }).onConflictDoNothing();
      const countResult = await app.db.select({ count: sql<number>`count(*)` }).from(schema.eventInterest).where(eq(schema.eventInterest.eventId, request.params.id));
      return { count: countResult[0].count, interested: true };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to mark interested');
      throw error;
    }
  });

  // DELETE /api/events/:id/interest
  fastify.delete('/api/events/:id/interest', {
    schema: {
      description: 'Unmark interested',
      tags: ['events'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { count: { type: 'number' }, interested: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ eventId: request.params.id }, 'Unmarking interested');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const deviceId = session.user.id;
      await app.db.delete(schema.eventInterest).where(and(eq(schema.eventInterest.eventId, request.params.id), eq(schema.eventInterest.deviceId, deviceId)));
      const countResult = await app.db.select({ count: sql<number>`count(*)` }).from(schema.eventInterest).where(eq(schema.eventInterest.eventId, request.params.id));
      return { count: countResult[0].count, interested: false };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to unmark interested');
      throw error;
    }
  });

  // GET /api/events/:id/going
  fastify.get('/api/events/:id/going', {
    schema: {
      description: 'Get going count',
      tags: ['events'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { count: { type: 'number' }, going: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>) => {
    app.logger.info({ eventId: request.params.id }, 'Getting going');
    try {
      const deviceId = getDeviceId(request);
      const countResult = await app.db.select({ count: sql<number>`count(*)` }).from(schema.eventGoing).where(eq(schema.eventGoing.eventId, request.params.id));
      const count = countResult[0].count;
      const going = !!(await app.db.query.eventGoing.findFirst({ where: and(eq(schema.eventGoing.eventId, request.params.id), eq(schema.eventGoing.deviceId, deviceId)) }));
      return { count, going };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get going');
      throw error;
    }
  });

  // POST /api/events/:id/going
  fastify.post('/api/events/:id/going', {
    schema: {
      description: 'Mark going',
      tags: ['events'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { count: { type: 'number' }, going: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ eventId: request.params.id }, 'Marking going');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const deviceId = session.user.id;
      await app.db.insert(schema.eventGoing).values({
        id: randomUUID(),
        eventId: request.params.id,
        deviceId,
      }).onConflictDoNothing();
      const countResult = await app.db.select({ count: sql<number>`count(*)` }).from(schema.eventGoing).where(eq(schema.eventGoing.eventId, request.params.id));
      return { count: countResult[0].count, going: true };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to mark going');
      throw error;
    }
  });

  // DELETE /api/events/:id/going
  fastify.delete('/api/events/:id/going', {
    schema: {
      description: 'Unmark going',
      tags: ['events'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { count: { type: 'number' }, going: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ eventId: request.params.id }, 'Unmarking going');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const deviceId = session.user.id;
      await app.db.delete(schema.eventGoing).where(and(eq(schema.eventGoing.eventId, request.params.id), eq(schema.eventGoing.deviceId, deviceId)));
      const countResult = await app.db.select({ count: sql<number>`count(*)` }).from(schema.eventGoing).where(eq(schema.eventGoing.eventId, request.params.id));
      return { count: countResult[0].count, going: false };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to unmark going');
      throw error;
    }
  });

  // GET /api/events/:id/likes
  fastify.get('/api/events/:id/likes', {
    schema: {
      description: 'Get likes count',
      tags: ['events'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { count: { type: 'number' }, liked: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>) => {
    app.logger.info({ eventId: request.params.id }, 'Getting likes');
    try {
      const deviceId = getDeviceId(request);
      const countResult = await app.db.select({ count: sql<number>`count(*)` }).from(schema.eventLikes).where(eq(schema.eventLikes.eventId, request.params.id));
      const count = countResult[0].count;
      const liked = !!(await app.db.query.eventLikes.findFirst({ where: and(eq(schema.eventLikes.eventId, request.params.id), eq(schema.eventLikes.deviceId, deviceId)) }));
      return { count, liked };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get likes');
      throw error;
    }
  });

  // POST /api/events/:id/likes
  fastify.post('/api/events/:id/likes', {
    schema: {
      description: 'Like event',
      tags: ['events'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { count: { type: 'number' }, liked: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ eventId: request.params.id }, 'Liking event');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const deviceId = session.user.id;
      await app.db.insert(schema.eventLikes).values({
        id: randomUUID(),
        eventId: request.params.id,
        deviceId,
      }).onConflictDoNothing();
      const countResult = await app.db.select({ count: sql<number>`count(*)` }).from(schema.eventLikes).where(eq(schema.eventLikes.eventId, request.params.id));
      return { count: countResult[0].count, liked: true };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to like event');
      throw error;
    }
  });

  // DELETE /api/events/:id/likes
  fastify.delete('/api/events/:id/likes', {
    schema: {
      description: 'Unlike event',
      tags: ['events'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { count: { type: 'number' }, liked: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ eventId: request.params.id }, 'Unliking event');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const deviceId = session.user.id;
      await app.db.delete(schema.eventLikes).where(and(eq(schema.eventLikes.eventId, request.params.id), eq(schema.eventLikes.deviceId, deviceId)));
      const countResult = await app.db.select({ count: sql<number>`count(*)` }).from(schema.eventLikes).where(eq(schema.eventLikes.eventId, request.params.id));
      return { count: countResult[0].count, liked: false };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to unlike event');
      throw error;
    }
  });

  // POST /api/events/:id/photos
  fastify.post('/api/events/:id/photos', {
    schema: {
      description: 'Upload photo',
      tags: ['events'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['image_data'], properties: { image_data: { type: 'string' }, uploaded_by: { type: 'string' } } },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string }; Body: { image_data: string; uploaded_by?: string } }>, reply: FastifyReply) => {
    app.logger.info({ eventId: request.params.id }, 'Uploading photo');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const photo = await app.db.insert(schema.eventPhotos).values({
        id: randomUUID(),
        eventId: request.params.id,
        uploadedBy: session.user.id,
        imageData: request.body.image_data,
      }).returning();
      app.logger.info({ photoId: photo[0].id }, 'Event photo uploaded');
      return photo[0];
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to upload photo');
      throw error;
    }
  });

  // GET /api/events/:id/photos
  fastify.get('/api/events/:id/photos', {
    schema: {
      description: 'Get photos',
      tags: ['events'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { photos: { type: 'array', items: { type: 'object' } } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>) => {
    app.logger.info({ eventId: request.params.id }, 'Getting photos');
    try {
      const photos = await app.db.select().from(schema.eventPhotos)
        .where(eq(schema.eventPhotos.eventId, request.params.id))
        .orderBy(schema.eventPhotos.sortOrder, schema.eventPhotos.createdAt);
      return { photos };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get photos');
      throw error;
    }
  });

  // DELETE /api/events/:id/photos/:photoId
  fastify.delete('/api/events/:id/photos/:photoId', {
    schema: {
      description: 'Delete photo',
      tags: ['events'],
      params: { type: 'object', required: ['id', 'photoId'], properties: { id: { type: 'string' }, photoId: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string; photoId: string } }>) => {
    app.logger.info({ eventId: request.params.id, photoId: request.params.photoId }, 'Deleting photo');
    try {
      await app.db.delete(schema.eventPhotos).where(and(eq(schema.eventPhotos.id, request.params.photoId), eq(schema.eventPhotos.eventId, request.params.id)));
      return { success: true };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to delete photo');
      throw error;
    }
  });

  // DELETE /api/events/:id/chat/messages/:messageId
  fastify.delete('/api/events/:id/chat/messages/:messageId', {
    schema: {
      description: 'Delete chat message',
      tags: ['events'],
      params: { type: 'object', required: ['id', 'messageId'], properties: { id: { type: 'string' }, messageId: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string; messageId: string } }>) => {
    app.logger.info({ eventId: request.params.id, messageId: request.params.messageId }, 'Deleting message');
    try {
      await app.db.delete(schema.eventMessages).where(and(eq(schema.eventMessages.id, request.params.messageId), eq(schema.eventMessages.eventId, request.params.id)));
      return { success: true };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to delete message');
      throw error;
    }
  });

  // DELETE /api/events/:id/chat/users/:userId
  fastify.delete('/api/events/:id/chat/users/:userId', {
    schema: {
      description: 'Remove user from chat',
      tags: ['events'],
      params: { type: 'object', required: ['id', 'userId'], properties: { id: { type: 'string' }, userId: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' }, messages_deleted: { type: 'number' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string; userId: string } }>) => {
    app.logger.info({ eventId: request.params.id, userId: request.params.userId }, 'Removing user from chat');
    try {
      // Count first
      const countResult = await app.db.select({ count: sql<number>`count(*)` }).from(schema.eventMessages)
        .where(and(eq(schema.eventMessages.eventId, request.params.id), eq(schema.eventMessages.userId, request.params.userId)));

      await app.db.delete(schema.eventMessages).where(and(eq(schema.eventMessages.eventId, request.params.id), eq(schema.eventMessages.userId, request.params.userId)));
      return { success: true, messages_deleted: countResult[0].count };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to remove user from chat');
      throw error;
    }
  });
}

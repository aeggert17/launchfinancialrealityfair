import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import * as schema from '../db/schema/schema.js';
import type { App } from '../index.js';

export function registerCityRoomRoutes(app: App) {
  const fastify = app.fastify;

  // GET /api/city-rooms
  fastify.get('/api/city-rooms', {
    schema: {
      description: 'Get city rooms',
      tags: ['city-rooms'],
      response: { 200: { type: 'object', properties: { rooms: { type: 'array', items: { type: 'object' } } } } },
    },
  }, async (request: FastifyRequest) => {
    app.logger.info('Getting city rooms');
    try {
      const rooms = await app.db.select().from(schema.cityRooms).orderBy(schema.cityRooms.memberCount);
      return { rooms };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get rooms');
      throw error;
    }
  });

  // POST /api/city-rooms
  fastify.post('/api/city-rooms', {
    schema: {
      description: 'Create city room',
      tags: ['city-rooms'],
      body: { type: 'object', required: ['city', 'state'], properties: { city: { type: 'string' }, state: { type: 'string' } } },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  }, async (request: FastifyRequest<{ Body: { city: string; state: string } }>, reply: FastifyReply) => {
    app.logger.info({ city: request.body.city, state: request.body.state }, 'Creating city room');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const existing = await app.db.query.cityRooms.findFirst({
        where: and(eq(schema.cityRooms.city, request.body.city), eq(schema.cityRooms.state, request.body.state)),
      });

      if (existing) return existing;

      const created = await app.db.insert(schema.cityRooms).values({
        id: randomUUID(),
        city: request.body.city,
        state: request.body.state,
        displayName: `${request.body.city}, ${request.body.state}`,
        memberCount: 0,
      }).returning();

      app.logger.info({ roomId: created[0].id }, 'City room created');
      return created[0];
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to create room');
      throw error;
    }
  });

  // GET /api/city-rooms/:id/messages
  fastify.get('/api/city-rooms/:id/messages', {
    schema: {
      description: 'Get room messages',
      tags: ['city-rooms'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      querystring: { type: 'object', properties: { limit: { type: 'integer', default: 50 }, before: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { messages: { type: 'array', items: { type: 'object' } }, has_more: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: number; before?: string } }>) => {
    app.logger.info({ roomId: request.params.id }, 'Getting room messages');
    try {
      const limit = Math.min(request.query.limit || 50, 100);
      const messages = await app.db.select().from(schema.cityMessages)
        .where(eq(schema.cityMessages.roomId, request.params.id))
        .limit(limit);
      return { messages, has_more: false };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get messages');
      throw error;
    }
  });

  // POST /api/city-rooms/:id/messages
  fastify.post('/api/city-rooms/:id/messages', {
    schema: {
      description: 'Post room message',
      tags: ['city-rooms'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['content'], properties: { content: { type: 'string' }, user_name: { type: 'string' }, user_image: { type: 'string' } } },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string }; Body: { content: string; user_name?: string; user_image?: string } }>, reply: FastifyReply) => {
    app.logger.info({ roomId: request.params.id }, 'Posting room message');
    try {
      const message = await app.db.insert(schema.cityMessages).values({
        id: randomUUID(),
        roomId: request.params.id,
        userId: null,
        userName: request.body.user_name,
        userImage: request.body.user_image,
        content: request.body.content,
      }).returning();

      app.logger.info({ messageId: message[0].id }, 'City room message posted');
      return message[0];
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to post message');
      throw error;
    }
  });

  // POST /api/city-rooms/:id/join
  fastify.post('/api/city-rooms/:id/join', {
    schema: {
      description: 'Join city room',
      tags: ['city-rooms'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ roomId: request.params.id }, 'Joining room');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      await app.db.insert(schema.cityRoomMembers).values({
        id: randomUUID(),
        roomId: request.params.id,
        userId: session.user.id,
      }).onConflictDoNothing();

      const room = await app.db.query.cityRooms.findFirst({ where: eq(schema.cityRooms.id, request.params.id) });
      if (room) {
        await app.db.update(schema.cityRooms).set({ memberCount: room.memberCount + 1 }).where(eq(schema.cityRooms.id, request.params.id));
      }

      return { success: true };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to join room');
      throw error;
    }
  });
}

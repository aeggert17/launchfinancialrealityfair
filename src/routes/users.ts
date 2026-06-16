import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, ilike, sql, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import * as schema from '../db/schema/schema.js';
import * as authSchema from '../db/schema/auth-schema.js';
import type { App } from '../index.js';

export function registerUserRoutes(app: App) {
  const fastify = app.fastify;

  // GET /api/users
  fastify.get('/api/users', {
    schema: {
      description: 'List users',
      tags: ['users'],
      querystring: { type: 'object', properties: { q: { type: 'string' }, limit: { type: 'integer', default: 20 }, offset: { type: 'integer', default: 0 } } },
      response: { 200: { type: 'object', properties: { users: { type: 'array', items: { type: 'object' } }, total: { type: 'number' }, has_more: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Querystring: { q?: string; limit?: number; offset?: number } }>) => {
    app.logger.info({ query: request.query }, 'Getting users');
    try {
      const limit = Math.min(request.query.limit || 20, 100);
      const offset = request.query.offset || 0;
      const countResult = await app.db.select({ count: sql<number>`count(*)` }).from(authSchema.user);
      const total = countResult[0].count;
      const users = await app.db.select().from(authSchema.user).limit(limit).offset(offset);
      return { users, total, has_more: offset + limit < total };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get users');
      throw error;
    }
  });

  // GET /api/users/search
  fastify.get('/api/users/search', {
    schema: {
      description: 'Search users',
      tags: ['users'],
      querystring: { type: 'object', properties: { q: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { users: { type: 'array', items: { type: 'object' } } } } },
    },
  }, async (request: FastifyRequest<{ Querystring: { q?: string } }>) => {
    app.logger.info({ query: request.query.q }, 'Searching users');
    try {
      const q = request.query.q || '';
      const users = q ? await app.db.select().from(authSchema.user).where(ilike(authSchema.user.name, `%${q}%`)) : [];
      return { users };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to search users');
      throw error;
    }
  });

  // PATCH /api/users/me
  fastify.patch('/api/users/me', {
    schema: {
      description: 'Update profile',
      tags: ['users'],
      body: { type: 'object', properties: { image: { type: 'string' }, name: { type: 'string' } } },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  }, async (request: FastifyRequest<{ Body: { image?: string; name?: string } }>, reply: FastifyReply) => {
    app.logger.info('Updating profile');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const updates: Record<string, string | boolean> = {};
      if (request.body.name !== undefined) updates.name = request.body.name;
      if (request.body.image !== undefined) updates.image = request.body.image;

      const updated = await app.db.update(authSchema.user).set(updates).where(eq(authSchema.user.id, session.user.id)).returning();
      app.logger.info({ userId: updated[0].id }, 'Profile updated');
      return updated[0];
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to update profile');
      throw error;
    }
  });

  // GET /api/users/me/event-history
  fastify.get('/api/users/me/event-history', {
    schema: {
      description: 'Get user event history',
      tags: ['users'],
      response: { 200: { type: 'object', properties: { events: { type: 'array', items: { type: 'object' } }, total: { type: 'number' } } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    app.logger.info('Getting event history');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const events = await app.db.select().from(schema.eventGoing)
        .innerJoin(schema.events, eq(schema.eventGoing.eventId, schema.events.id))
        .where(eq(schema.eventGoing.deviceId, session.user.id));

      return { events: events.map(e => e.events), total: events.length };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get event history');
      throw error;
    }
  });

  // GET /api/users/me/privacy
  fastify.get('/api/users/me/privacy', {
    schema: {
      description: 'Get privacy settings',
      tags: ['users'],
      response: { 200: { type: 'object', properties: { is_private: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    app.logger.info('Getting privacy settings');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      return { is_private: false };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get privacy settings');
      throw error;
    }
  });

  // PATCH /api/users/me/privacy
  fastify.patch('/api/users/me/privacy', {
    schema: {
      description: 'Update privacy settings',
      tags: ['users'],
      body: { type: 'object', required: ['is_private'], properties: { is_private: { type: 'boolean' } } },
      response: { 200: { type: 'object', properties: { is_private: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Body: { is_private: boolean } }>, reply: FastifyReply) => {
    app.logger.info('Updating privacy settings');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      return { is_private: request.body.is_private };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to update privacy settings');
      throw error;
    }
  });

  // GET /api/users/blocked
  fastify.get('/api/users/blocked', {
    schema: {
      description: 'Get blocked users',
      tags: ['users'],
      response: { 200: { type: 'object', properties: { blocked: { type: 'array', items: { type: 'object' } } } } },
    },
  }, async (request: FastifyRequest) => {
    app.logger.info('Getting blocked users');
    try {
      const blocked = await app.db.select().from(schema.blockedUsers);
      return { blocked };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get blocked users');
      throw error;
    }
  });

  // POST /api/users/:id/block
  fastify.post('/api/users/:id/block', {
    schema: {
      description: 'Block user',
      tags: ['users'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ userId: request.params.id }, 'Blocking user');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      await app.db.insert(schema.blockedUsers).values({
        id: randomUUID(),
        blockerId: session.user.id,
        blockedId: request.params.id,
      }).onConflictDoNothing();
      return { success: true };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to block user');
      throw error;
    }
  });

  // DELETE /api/users/:id/block
  fastify.delete('/api/users/:id/block', {
    schema: {
      description: 'Unblock user',
      tags: ['users'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ userId: request.params.id }, 'Unblocking user');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      await app.db.delete(schema.blockedUsers).where(eq(schema.blockedUsers.blockedId, request.params.id));
      return { success: true };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to unblock user');
      throw error;
    }
  });
}

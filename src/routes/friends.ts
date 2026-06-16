import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, or, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import * as schema from '../db/schema/schema.js';
import type { App } from '../index.js';

export function registerFriendsRoutes(app: App) {
  const fastify = app.fastify;

  // GET /api/friends
  fastify.get('/api/friends', {
    schema: {
      description: 'Get friends',
      tags: ['friends'],
      response: { 200: { type: 'object', properties: { friends: { type: 'array', items: { type: 'object' } } } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    app.logger.info('Getting friends');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const friendships = await app.db.select().from(schema.friendships)
        .where(or(eq(schema.friendships.user1Id, session.user.id), eq(schema.friendships.user2Id, session.user.id)));
      return { friends: friendships };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get friends');
      throw error;
    }
  });

  // GET /api/friends/requests
  fastify.get('/api/friends/requests', {
    schema: {
      description: 'Get friend requests',
      tags: ['friends'],
      response: { 200: { type: 'object', properties: { requests: { type: 'array', items: { type: 'object' } } } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    app.logger.info('Getting friend requests');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const requests = await app.db.select().from(schema.friendRequests)
        .where(and(eq(schema.friendRequests.toUserId, session.user.id), eq(schema.friendRequests.status, 'pending')));
      return { requests };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get requests');
      throw error;
    }
  });

  // GET /api/friends/requests/sent
  fastify.get('/api/friends/requests/sent', {
    schema: {
      description: 'Get sent friend requests',
      tags: ['friends'],
      response: { 200: { type: 'object', properties: { requests: { type: 'array', items: { type: 'object' } } } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    app.logger.info('Getting sent friend requests');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const requests = await app.db.select().from(schema.friendRequests)
        .where(eq(schema.friendRequests.fromUserId, session.user.id));
      return { requests };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get sent requests');
      throw error;
    }
  });

  // POST /api/friends/request
  fastify.post('/api/friends/request', {
    schema: {
      description: 'Send friend request',
      tags: ['friends'],
      body: { type: 'object', required: ['to_user_id'], properties: { to_user_id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { request_id: { type: 'string' } } } },
    },
  }, async (request: FastifyRequest<{ Body: { to_user_id: string } }>, reply: FastifyReply) => {
    app.logger.info({ toUserId: request.body.to_user_id }, 'Sending friend request');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const created = await app.db.insert(schema.friendRequests).values({
        id: randomUUID(),
        fromUserId: session.user.id,
        toUserId: request.body.to_user_id,
        status: 'pending',
      }).returning();
      return { request_id: created[0].id };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to send request');
      throw error;
    }
  });

  // POST /api/friends/requests/:id/accept
  fastify.post('/api/friends/requests/:id/accept', {
    schema: {
      description: 'Accept friend request',
      tags: ['friends'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ requestId: request.params.id }, 'Accepting friend request');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const req = await app.db.query.friendRequests.findFirst({ where: eq(schema.friendRequests.id, request.params.id) });
      if (!req) throw new Error('Request not found');

      await app.db.update(schema.friendRequests).set({ status: 'accepted' }).where(eq(schema.friendRequests.id, request.params.id));

      const [user1, user2] = [req.fromUserId, req.toUserId].sort();
      await app.db.insert(schema.friendships).values({
        id: randomUUID(),
        user1Id: user1,
        user2Id: user2,
      }).onConflictDoNothing();

      return { success: true };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to accept request');
      throw error;
    }
  });

  // POST /api/friends/requests/:id/decline
  fastify.post('/api/friends/requests/:id/decline', {
    schema: {
      description: 'Decline friend request',
      tags: ['friends'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ requestId: request.params.id }, 'Declining friend request');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      await app.db.update(schema.friendRequests).set({ status: 'declined' }).where(eq(schema.friendRequests.id, request.params.id));
      return { success: true };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to decline request');
      throw error;
    }
  });

  // DELETE /api/friends/:friendshipId
  fastify.delete('/api/friends/:friendshipId', {
    schema: {
      description: 'Delete friendship',
      tags: ['friends'],
      params: { type: 'object', required: ['friendshipId'], properties: { friendshipId: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { friendshipId: string } }>, reply: FastifyReply) => {
    app.logger.info({ friendshipId: request.params.friendshipId }, 'Deleting friendship');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      await app.db.delete(schema.friendships).where(eq(schema.friendships.id, request.params.friendshipId));
      return { success: true };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to delete friendship');
      throw error;
    }
  });

  // GET /api/friends/status/:userId
  fastify.get('/api/friends/status/:userId', {
    schema: {
      description: 'Get friendship status',
      tags: ['friends'],
      params: { type: 'object', required: ['userId'], properties: { userId: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { status: { type: 'string' }, request_id: { type: 'string' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    app.logger.info({ userId: request.params.userId }, 'Getting friendship status');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const friendship = await app.db.query.friendships.findFirst({
        where: or(
          and(eq(schema.friendships.user1Id, session.user.id), eq(schema.friendships.user2Id, request.params.userId)),
          and(eq(schema.friendships.user1Id, request.params.userId), eq(schema.friendships.user2Id, session.user.id))
        ),
      });

      if (friendship) return { status: 'friends' };

      const pending = await app.db.query.friendRequests.findFirst({
        where: or(
          and(eq(schema.friendRequests.fromUserId, session.user.id), eq(schema.friendRequests.toUserId, request.params.userId), eq(schema.friendRequests.status, 'pending')),
          and(eq(schema.friendRequests.fromUserId, request.params.userId), eq(schema.friendRequests.toUserId, session.user.id), eq(schema.friendRequests.status, 'pending'))
        ),
      });

      if (pending) {
        const status = pending.fromUserId === session.user.id ? 'pending_sent' : 'pending_received';
        return { status, request_id: pending.id };
      }

      return { status: 'none' };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get status');
      throw error;
    }
  });
}

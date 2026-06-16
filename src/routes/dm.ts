import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, or, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import * as schema from '../db/schema/schema.js';
import * as authSchema from '../db/schema/auth-schema.js';
import type { App } from '../index.js';

export function registerDmRoutes(app: App) {
  const fastify = app.fastify;

  // GET /api/dm/conversations
  fastify.get('/api/dm/conversations', {
    schema: {
      description: 'Get conversations',
      tags: ['dm'],
      response: { 200: { type: 'object', properties: { conversations: { type: 'array', items: { type: 'object' } } } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    app.logger.info('Getting conversations');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const conversations = await app.db.select().from(schema.dmConversations)
        .where(or(eq(schema.dmConversations.user1Id, session.user.id), eq(schema.dmConversations.user2Id, session.user.id)));
      return { conversations };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get conversations');
      throw error;
    }
  });

  // POST /api/dm/conversations
  fastify.post('/api/dm/conversations', {
    schema: {
      description: 'Create conversation',
      tags: ['dm'],
      body: { type: 'object', required: ['other_user_id'], properties: { other_user_id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { conversation_id: { type: 'string' } } } },
    },
  }, async (request: FastifyRequest<{ Body: { other_user_id: string } }>, reply: FastifyReply) => {
    app.logger.info({ otherUserId: request.body.other_user_id }, 'Creating conversation');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const conversationId = randomUUID();
      const existing = await app.db.query.dmConversations.findFirst({
        where: or(
          and(eq(schema.dmConversations.user1Id, session.user.id), eq(schema.dmConversations.user2Id, request.body.other_user_id)),
          and(eq(schema.dmConversations.user1Id, request.body.other_user_id), eq(schema.dmConversations.user2Id, session.user.id))
        ),
      });

      if (existing) {
        return { conversation_id: existing.id };
      }

      const [user1, user2] = [session.user.id, request.body.other_user_id].sort();
      const created = await app.db.insert(schema.dmConversations).values({
        id: conversationId,
        user1Id: user1,
        user2Id: user2,
      }).returning();

      return { conversation_id: created[0].id };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to create conversation');
      throw error;
    }
  });

  // GET /api/dm/conversations/:id/messages
  fastify.get('/api/dm/conversations/:id/messages', {
    schema: {
      description: 'Get conversation messages',
      tags: ['dm'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      querystring: { type: 'object', properties: { limit: { type: 'integer', default: 50 }, before: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { messages: { type: 'array', items: { type: 'object' } }, has_more: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: number; before?: string } }>) => {
    app.logger.info({ conversationId: request.params.id }, 'Getting conversation messages');
    try {
      const limit = Math.min(request.query.limit || 50, 100);
      const messages = await app.db.select().from(schema.dmMessages)
        .where(eq(schema.dmMessages.conversationId, request.params.id))
        .orderBy(desc(schema.dmMessages.createdAt))
        .limit(limit);
      return { messages, has_more: false };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get messages');
      throw error;
    }
  });

  // POST /api/dm/conversations/:id/messages
  fastify.post('/api/dm/conversations/:id/messages', {
    schema: {
      description: 'Send message',
      tags: ['dm'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['content'], properties: { content: { type: 'string' } } },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string }; Body: { content: string } }>, reply: FastifyReply) => {
    app.logger.info({ conversationId: request.params.id }, 'Sending message');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const message = await app.db.insert(schema.dmMessages).values({
        id: randomUUID(),
        conversationId: request.params.id,
        senderId: session.user.id,
        content: request.body.content,
      }).returning();

      await app.db.update(schema.dmConversations).set({
        lastMessage: request.body.content,
        lastMessageAt: new Date(),
      }).where(eq(schema.dmConversations.id, request.params.id));

      app.logger.info({ messageId: message[0].id }, 'DM message sent');
      return message[0];
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to send message');
      throw error;
    }
  });
}

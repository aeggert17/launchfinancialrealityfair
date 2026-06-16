import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import * as schema from '../db/schema/schema.js';
import type { App } from '../index.js';

function generateSessionCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function registerGameRoutes(app: App) {
  const fastify = app.fastify;

  // POST /api/test-mode/init
  fastify.post('/api/test-mode/init', {
    schema: {
      description: 'Initialize test mode session',
      tags: ['game'],
      response: { 200: { type: 'object', properties: { session_id: { type: 'string' }, session_name: { type: 'string' }, code: { type: 'string' } } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    app.logger.info('Initializing test mode');
    try {
      let session = await app.db.query.sessions.findFirst({ where: eq(schema.sessions.code, 'DEMO') });
      if (!session) {
        const [created] = await app.db.insert(schema.sessions).values({
          id: randomUUID(),
          code: 'DEMO',
          sessionName: 'Test Mode Session',
          status: 'active',
        }).returning();
        session = created;
      }
      app.logger.info({ sessionId: session.id }, 'Test mode initialized');
      return { session_id: session.id, session_name: session.sessionName, code: session.code };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to initialize test mode');
      throw error;
    }
  });

  // POST /api/sessions/join
  fastify.post('/api/sessions/join', {
    schema: {
      description: 'Join game session',
      tags: ['game'],
      body: { type: 'object', required: ['session_code', 'student_name'], properties: { session_code: { type: 'string' }, student_name: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { student_session_id: { type: 'string' }, session_id: { type: 'string' }, session_name: { type: 'string' }, code: { type: 'string' }, student_name: { type: 'string' } } }, 404: { type: 'object', properties: { error: { type: 'string' } } } },
    },
  }, async (request: FastifyRequest<{ Body: { session_code: string; student_name: string } }>, reply: FastifyReply) => {
    app.logger.info({ sessionCode: request.body.session_code }, 'Joining session');
    try {
      const session = await app.db.query.sessions.findFirst({
        where: eq(schema.sessions.code, request.body.session_code.toUpperCase()),
      });

      if (!session || session.status !== 'active') {
        app.logger.warn({ sessionCode: request.body.session_code }, 'Session not found or not active');
        return reply.status(404).send({ error: 'Session not found or not active' });
      }

      const [studentSession] = await app.db.insert(schema.studentSessions).values({
        id: randomUUID(),
        sessionId: session.id,
        studentName: request.body.student_name,
      }).returning();

      app.logger.info({ studentSessionId: studentSession.id }, 'Student joined session');
      return {
        student_session_id: studentSession.id,
        session_id: session.id,
        session_name: session.sessionName,
        code: session.code,
        student_name: studentSession.studentName,
      };
    } catch (error) {
      app.logger.error({ err: error, body: request.body }, 'Failed to join session');
      throw error;
    }
  });

  // GET /api/sessions/:id
  fastify.get('/api/sessions/:id', {
    schema: {
      description: 'Get session by ID',
      tags: ['game'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object' }, 404: { type: 'object', properties: { error: { type: 'string' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ sessionId: request.params.id }, 'Getting session');
    try {
      const session = await app.db.query.sessions.findFirst({ where: eq(schema.sessions.id, request.params.id) });
      if (!session) {
        app.logger.warn({ sessionId: request.params.id }, 'Session not found');
        return reply.status(404).send({ error: 'Session not found' });
      }
      return reply.status(200).send(session);
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get session');
      throw error;
    }
  });

  // GET /api/admin/sessions
  fastify.get('/api/admin/sessions', {
    schema: {
      description: 'Get all sessions with student counts',
      tags: ['game'],
      response: { 200: { type: 'array', items: { type: 'object' } } },
    },
  }, async (request: FastifyRequest) => {
    app.logger.info('Getting all sessions');
    try {
      const sessions = await app.db.select().from(schema.sessions).orderBy(desc(schema.sessions.createdAt));
      const result = [];
      for (const session of sessions) {
        const count = await app.db.select({ count: sql<number>`count(*)` }).from(schema.studentSessions).where(eq(schema.studentSessions.sessionId, session.id));
        result.push({
          ...session,
          student_count: count[0].count,
        });
      }
      return result;
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get sessions');
      throw error;
    }
  });

  // POST /api/admin/sessions
  fastify.post('/api/admin/sessions', {
    schema: {
      description: 'Create new game session',
      tags: ['game'],
      body: { type: 'object', required: ['session_name'], properties: { session_name: { type: 'string' }, code: { type: 'string' } } },
      response: { 201: { type: 'object', properties: { session_id: { type: 'string' }, session_name: { type: 'string' }, code: { type: 'string' } } } },
    },
  }, async (request: FastifyRequest<{ Body: { session_name: string; code?: string } }>, reply: FastifyReply) => {
    app.logger.info({ sessionName: request.body.session_name }, 'Creating session');
    try {
      const code = request.body.code || generateSessionCode();
      const [session] = await app.db.insert(schema.sessions).values({
        id: randomUUID(),
        sessionName: request.body.session_name,
        code,
        status: 'active',
      }).returning();

      app.logger.info({ sessionId: session.id, code }, 'Session created');
      reply.status(201);
      return {
        session_id: session.id,
        session_name: session.sessionName,
        code: session.code,
      };
    } catch (error) {
      app.logger.error({ err: error, body: request.body }, 'Failed to create session');
      throw error;
    }
  });

  // GET /api/careers
  fastify.get('/api/careers', {
    schema: {
      description: 'Get all careers',
      tags: ['game'],
      response: { 200: { type: 'array', items: { type: 'object' } } },
    },
  }, async (request: FastifyRequest) => {
    app.logger.info('Getting careers');
    try {
      const careers = await app.db.select().from(schema.careers).orderBy(schema.careers.salary);
      return careers;
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get careers');
      throw error;
    }
  });

  // GET /api/admin/careers
  fastify.get('/api/admin/careers', {
    schema: {
      description: 'Get all careers (admin)',
      tags: ['game'],
      response: { 200: { type: 'array', items: { type: 'object' } } },
    },
  }, async (request: FastifyRequest) => {
    app.logger.info('Getting careers (admin)');
    try {
      const careers = await app.db.select().from(schema.careers).orderBy(schema.careers.salary);
      return careers;
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get careers');
      throw error;
    }
  });

  // GET /api/housing-options
  fastify.get('/api/housing-options', {
    schema: {
      description: 'Get all housing options',
      tags: ['game'],
      response: { 200: { type: 'array', items: { type: 'object' } } },
    },
  }, async (request: FastifyRequest) => {
    app.logger.info('Getting housing options');
    try {
      const housing = await app.db.select().from(schema.housingOptions).orderBy(schema.housingOptions.monthlyCost);
      return housing;
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get housing options');
      throw error;
    }
  });

  // GET /api/budget-modules
  fastify.get('/api/budget-modules', {
    schema: {
      description: 'Get all budget modules',
      tags: ['game'],
      response: { 200: { type: 'array', items: { type: 'object' } } },
    },
  }, async (request: FastifyRequest) => {
    app.logger.info('Getting budget modules');
    try {
      const modules = await app.db.select().from(schema.budgetModules).orderBy(schema.budgetModules.category, schema.budgetModules.monthlyCost);
      return modules;
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get budget modules');
      throw error;
    }
  });

  // GET /api/random-events
  fastify.get('/api/random-events', {
    schema: {
      description: 'Get all random events',
      tags: ['game'],
      response: { 200: { type: 'array', items: { type: 'object' } } },
    },
  }, async (request: FastifyRequest) => {
    app.logger.info('Getting random events');
    try {
      const events = await app.db.select().from(schema.randomEvents);
      return events;
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get random events');
      throw error;
    }
  });

  // GET /api/random-events/random
  fastify.get('/api/random-events/random', {
    schema: {
      description: 'Get random event',
      tags: ['game'],
      response: { 200: { type: 'object' } },
    },
  }, async (request: FastifyRequest) => {
    app.logger.info('Getting random event');
    try {
      const events = await app.db.select().from(schema.randomEvents);
      if (events.length === 0) {
        return { title: 'No events', description: '', financialImpact: 0, category: '' };
      }
      const randomEvent = events[Math.floor(Math.random() * events.length)];
      return randomEvent;
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get random event');
      throw error;
    }
  });

  // PATCH /api/student-sessions/:id
  fastify.patch('/api/student-sessions/:id', {
    schema: {
      description: 'Update student session',
      tags: ['game'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', properties: { career_id: { type: 'string' }, housing_id: { type: 'string' }, monthly_budget: { type: 'number' }, savings: { type: 'number' } } },
      response: { 200: { type: 'object' }, 404: { type: 'object', properties: { error: { type: 'string' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string }; Body: { career_id?: string; housing_id?: string; monthly_budget?: number; savings?: number } }>, reply: FastifyReply) => {
    app.logger.info({ studentSessionId: request.params.id }, 'Updating student session');
    try {
      const studentSession = await app.db.query.studentSessions.findFirst({ where: eq(schema.studentSessions.id, request.params.id) });
      if (!studentSession) {
        app.logger.warn({ studentSessionId: request.params.id }, 'Student session not found');
        return reply.status(404).send({ error: 'Student session not found' });
      }

      const updates: Record<string, any> = {};
      if (request.body.career_id !== undefined) updates.careerId = request.body.career_id;
      if (request.body.housing_id !== undefined) updates.housingId = request.body.housing_id;
      if (request.body.monthly_budget !== undefined) updates.monthlyBudget = String(request.body.monthly_budget);
      if (request.body.savings !== undefined) updates.savings = String(request.body.savings);

      const [updated] = await app.db.update(schema.studentSessions).set(updates).where(eq(schema.studentSessions.id, request.params.id)).returning();
      app.logger.info({ studentSessionId: updated.id }, 'Student session updated');
      return updated;
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to update student session');
      throw error;
    }
  });
}

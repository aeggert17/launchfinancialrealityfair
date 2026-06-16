import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, ilike, sql, desc, or } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import * as schema from '../db/schema/schema.js';
import type { App } from '../index.js';

export function registerJobRoutes(app: App) {
  const fastify = app.fastify;

  // GET /api/jobs
  fastify.get('/api/jobs', {
    schema: {
      description: 'List jobs',
      tags: ['jobs'],
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          type: { type: 'string' },
          search: { type: 'string' },
          limit: { type: 'integer', default: 20 },
          offset: { type: 'integer', default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            jobs: { type: 'array', items: { type: 'object' } },
            total: { type: 'number' },
            has_more: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Querystring: { category?: string; type?: string; search?: string; limit?: number; offset?: number } }>) => {
    app.logger.info({ query: request.query }, 'Getting jobs');
    try {
      const limit = Math.min(request.query.limit || 20, 100);
      const offset = request.query.offset || 0;

      const conditions = [eq(schema.jobs.isActive, true)];
      if (request.query.category) conditions.push(eq(schema.jobs.category, request.query.category));
      if (request.query.type) conditions.push(eq(schema.jobs.type, request.query.type));
      if (request.query.search) conditions.push(ilike(schema.jobs.title, `%${request.query.search}%`));

      const jobs = await app.db.select().from(schema.jobs).where(and(...conditions)).orderBy(desc(schema.jobs.createdAt)).limit(limit).offset(offset);

      const countResult = await app.db.select({ count: sql<number>`count(*)` }).from(schema.jobs).where(eq(schema.jobs.isActive, true));
      const total = countResult[0].count;

      return { jobs, total, has_more: offset + limit < total };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get jobs');
      throw error;
    }
  });

  // POST /api/jobs
  fastify.post('/api/jobs', {
    schema: {
      description: 'Post job',
      tags: ['jobs'],
      body: {
        type: 'object',
        required: ['title', 'company', 'location', 'type', 'category', 'description'],
        properties: {
          title: { type: 'string' },
          company: { type: 'string' },
          location: { type: 'string' },
          type: { type: 'string' },
          category: { type: 'string' },
          description: { type: 'string' },
          salary_min: { type: 'number' },
          salary_max: { type: 'number' },
          apply_url: { type: 'string' },
          apply_email: { type: 'string' },
        },
      },
      response: { 201: { type: 'object', additionalProperties: true } },
    },
  }, async (
    request: FastifyRequest<{
      Body: {
        title: string;
        company: string;
        location: string;
        type: string;
        category: string;
        description: string;
        salary_min?: number;
        salary_max?: number;
        apply_url?: string;
        apply_email?: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    app.logger.info({ body: request.body }, 'Posting job');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const job = await app.db.insert(schema.jobs).values({
        id: randomUUID(),
        title: request.body.title,
        company: request.body.company,
        location: request.body.location,
        type: request.body.type,
        category: request.body.category,
        description: request.body.description,
        salaryMin: request.body.salary_min ? String(request.body.salary_min) : undefined,
        salaryMax: request.body.salary_max ? String(request.body.salary_max) : undefined,
        applyUrl: request.body.apply_url,
        applyEmail: request.body.apply_email,
        postedBy: session.user.id,
      }).returning();

      app.logger.info({ jobId: job[0].id }, 'Job posted');
      reply.status(201);
      return job[0];
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to post job');
      throw error;
    }
  });

  // GET /api/jobs/mine
  fastify.get('/api/jobs/mine', {
    schema: {
      description: 'Get my jobs',
      tags: ['jobs'],
      response: { 200: { type: 'object', properties: { jobs: { type: 'array', items: { type: 'object' } } } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    app.logger.info('Getting my jobs');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const jobs = await app.db.query.jobs.findMany({ where: eq(schema.jobs.postedBy, session.user.id) });
      return { jobs };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get my jobs');
      throw error;
    }
  });

  // GET /api/jobs/:id
  fastify.get('/api/jobs/:id', {
    schema: {
      description: 'Get job by ID',
      tags: ['jobs'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', additionalProperties: true }, 404: { type: 'object', properties: { error: { type: 'string' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ jobId: request.params.id }, 'Getting job');
    try {
      const job = await app.db.query.jobs.findFirst({ where: eq(schema.jobs.id, request.params.id) });
      if (!job) {
        app.logger.warn({ jobId: request.params.id }, 'Job not found');
        return reply.status(404).send({ error: 'Job not found' });
      }
      return job;
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to get job');
      throw error;
    }
  });

  // DELETE /api/jobs/:id
  fastify.delete('/api/jobs/:id', {
    schema: {
      description: 'Delete job',
      tags: ['jobs'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    app.logger.info({ jobId: request.params.id }, 'Deleting job');
    try {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const job = await app.db.query.jobs.findFirst({ where: eq(schema.jobs.id, request.params.id) });
      if (!job) {
        app.logger.warn({ jobId: request.params.id }, 'Job not found');
        return reply.status(404).send({ error: 'Job not found' });
      }

      if (job.postedBy !== session.user.id) {
        app.logger.warn({ jobId: request.params.id }, 'Unauthorized');
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      await app.db.delete(schema.jobs).where(eq(schema.jobs.id, request.params.id));
      return { success: true };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to delete job');
      throw error;
    }
  });
}

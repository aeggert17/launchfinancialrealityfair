import { createApplication } from "@specific-dev/framework";
import { randomUUID } from 'crypto';
import * as appSchema from './db/schema/schema.js';
import * as authSchema from './db/schema/auth-schema.js';
import { registerEventRoutes } from './routes/events.js';
import { registerUserRoutes } from './routes/users.js';
import { registerDmRoutes } from './routes/dm.js';
import { registerFriendsRoutes } from './routes/friends.js';
import { registerCityRoomRoutes } from './routes/city-rooms.js';
import { registerJobRoutes } from './routes/jobs.js';
import { registerGameRoutes } from './routes/game.js';

const schema = { ...appSchema, ...authSchema };

export const app = await createApplication(schema);
export type App = typeof app;

app.withAuth();

// Seed data on startup
async function seedData() {
  try {
    const existingEvents = await app.db.query.events.findMany();
    if (existingEvents.length === 0) {
      app.logger.info('Seeding events data...');

      const eventData = [
        { title: 'Jazz Night at Blue Note', category: 'music', date: '2025-08-10T20:00:00', venue: 'Blue Note Jazz Club', location: 'New York, NY', price: '25', imageUrl: 'https://picsum.photos/seed/jazz-night/800/600' },
        { title: 'Brooklyn Food Festival', category: 'food', date: '2025-08-12T11:00:00', venue: 'Prospect Park', location: 'Brooklyn, NY', price: '10', imageUrl: 'https://picsum.photos/seed/food-festival/800/600' },
        { title: 'LA Tech Summit', category: 'tech', date: '2025-08-14T09:00:00', venue: 'Convention Center', location: 'Los Angeles, CA', price: '50', imageUrl: 'https://picsum.photos/seed/tech-summit/800/600' },
        { title: 'Chicago Marathon Training Run', category: 'sports', date: '2025-08-15T07:00:00', venue: 'Grant Park', location: 'Chicago, IL', price: '0', imageUrl: 'https://picsum.photos/seed/marathon-run/800/600' },
        { title: 'Art in the Park', category: 'arts', date: '2025-08-16T10:00:00', venue: 'Millennium Park', location: 'Chicago, IL', price: '0', imageUrl: 'https://picsum.photos/seed/art-park/800/600' },
        { title: 'Rooftop Yoga Session', category: 'outdoor', date: '2025-08-17T08:00:00', venue: 'The Standard Hotel', location: 'New York, NY', price: '15', imageUrl: 'https://picsum.photos/seed/rooftop-yoga/800/600' },
        { title: 'Community Garden Cleanup', category: 'community', date: '2025-08-18T09:00:00', venue: 'Riverside Community Garden', location: 'Austin, TX', price: '0', imageUrl: 'https://picsum.photos/seed/garden-cleanup/800/600' },
        { title: 'Saturday Night Salsa', category: 'nightlife', date: '2025-08-19T21:00:00', venue: 'Havana Club', location: 'Miami, FL', price: '20', imageUrl: 'https://picsum.photos/seed/salsa-night/800/600' },
        { title: 'Board Game Bonanza', category: 'games', date: '2025-08-20T14:00:00', venue: 'Tabletop Tavern', location: 'Seattle, WA', price: '5', imageUrl: 'https://picsum.photos/seed/board-games/800/600' },
        { title: 'Sunset Hangout at the Beach', category: 'hangout', date: '2025-08-21T18:00:00', venue: 'Santa Monica Beach', location: 'Santa Monica, CA', price: '0', imageUrl: 'https://picsum.photos/seed/beach-hangout/800/600' },
        { title: 'Hip Hop Open Mic', category: 'music', date: '2025-08-22T19:00:00', venue: 'The Bowery Electric', location: 'New York, NY', price: '10', imageUrl: 'https://picsum.photos/seed/hip-hop-mic/800/600' },
        { title: 'Taco & Tequila Festival', category: 'food', date: '2025-08-23T12:00:00', venue: 'Fair Park', location: 'Dallas, TX', price: '15', imageUrl: 'https://picsum.photos/seed/taco-festival/800/600' },
        { title: 'Startup Pitch Night', category: 'tech', date: '2025-08-25T18:00:00', venue: 'WeWork SOMA', location: 'San Francisco, CA', price: '0', imageUrl: 'https://picsum.photos/seed/startup-pitch/800/600' },
        { title: 'Outdoor Movie Night', category: 'community', date: '2025-08-27T20:00:00', venue: 'Dolores Park', location: 'San Francisco, CA', price: '0', imageUrl: 'https://picsum.photos/seed/outdoor-movie/800/600' },
        { title: 'Rock Climbing Social', category: 'outdoor', date: '2025-08-29T10:00:00', venue: 'Brooklyn Boulders', location: 'Brooklyn, NY', price: '20', imageUrl: 'https://picsum.photos/seed/rock-climbing/800/600' },
      ];

      for (const event of eventData) {
        await app.db.insert(appSchema.events).values({
          id: randomUUID(),
          title: event.title,
          description: `Join us for ${event.title}! This is a great event for all ages.`,
          category: event.category,
          date: event.date,
          venue: event.venue,
          location: event.location,
          price: event.price,
          imageUrl: event.imageUrl,
          createdBy: null,
          isLocal: false,
        });
      }

      app.logger.info('Seeding city rooms data...');

      const cityData = [
        { city: 'New York', state: 'NY', displayName: 'New York, NY' },
        { city: 'Los Angeles', state: 'CA', displayName: 'Los Angeles, CA' },
        { city: 'Chicago', state: 'IL', displayName: 'Chicago, IL' },
      ];

      for (const city of cityData) {
        await app.db.insert(appSchema.cityRooms).values({
          id: randomUUID(),
          city: city.city,
          state: city.state,
          displayName: city.displayName,
          memberCount: 0,
        });
      }

      app.logger.info('Seeding game data...');

      // Seed sessions
      const demoSession = await app.db.query.sessions.findFirst({ where: (schema: any) => schema.eq(appSchema.sessions.code, 'DEMO') });
      if (!demoSession) {
        await app.db.insert(appSchema.sessions).values({
          id: randomUUID(),
          code: 'DEMO',
          sessionName: 'Test Mode Session',
          status: 'active',
        });
      }

      // Seed careers with ON CONFLICT for safe re-deploys
      const careersData = [
        { id: 'a1b2c3d4-0001-0000-0000-000000000001', name: 'Registered Nurse', salary: '62000', description: 'Healthcare professional providing patient care', icon: '🏥' },
        { id: 'a1b2c3d4-0002-0000-0000-000000000002', name: 'Software Developer', salary: '72000', description: 'Builds apps and software systems', icon: '💻' },
        { id: 'a1b2c3d4-0003-0000-0000-000000000003', name: 'Electrician', salary: '58000', description: 'Licensed trades professional', icon: '⚡' },
        { id: 'a1b2c3d4-0004-0000-0000-000000000004', name: 'Teacher', salary: '45000', description: 'Educates students in K-12 schools', icon: '📚' },
        { id: 'a1b2c3d4-0005-0000-0000-000000000005', name: 'Retail Manager', salary: '42000', description: 'Manages store operations and staff', icon: '🛍️' },
        { id: 'a1b2c3d4-0006-0000-0000-000000000006', name: 'Graphic Designer', salary: '48000', description: 'Creates visual content and branding', icon: '🎨' },
        { id: 'a1b2c3d4-0007-0000-0000-000000000007', name: 'Automotive Technician', salary: '52000', description: 'Repairs and maintains vehicles', icon: '🔧' },
        { id: 'a1b2c3d4-0008-0000-0000-000000000008', name: 'Administrative Assistant', salary: '38000', description: 'Supports office operations', icon: '📋' },
      ];
      for (const career of careersData) {
        await app.db.insert(appSchema.careers).values(career).onConflictDoNothing();
      }

      // Seed housing options
      const existingHousing = await app.db.query.housingOptions.findMany();
      if (existingHousing.length === 0) {
        const housingData = [
          { name: 'Studio Apartment', monthlyCost: '800', description: 'Small but affordable' },
          { name: '1-Bedroom Apartment', monthlyCost: '1200', description: 'Comfortable solo living' },
          { name: 'Shared House', monthlyCost: '600', description: 'Split costs with roommates' },
          { name: 'Luxury Condo', monthlyCost: '2200', description: 'High-end living' },
        ];
        for (const housing of housingData) {
          await app.db.insert(appSchema.housingOptions).values({
            id: randomUUID(),
            ...housing,
          });
        }
      }

      // Seed budget modules
      const existingModules = await app.db.query.budgetModules.findMany();
      if (existingModules.length === 0) {
        const modulesData = [
          { name: 'Groceries', category: 'food', monthlyCost: '300', description: 'Weekly grocery shopping', isOptional: false },
          { name: 'Dining Out', category: 'food', monthlyCost: '150', description: 'Restaurants and takeout', isOptional: true },
          { name: 'Car Payment', category: 'transport', monthlyCost: '350', description: 'Monthly car loan payment', isOptional: true },
          { name: 'Public Transit', category: 'transport', monthlyCost: '80', description: 'Bus and subway pass', isOptional: true },
          { name: 'Health Insurance', category: 'health', monthlyCost: '200', description: 'Basic health coverage', isOptional: false },
          { name: 'Entertainment', category: 'leisure', monthlyCost: '100', description: 'Streaming, hobbies, fun', isOptional: true },
        ];
        for (const module of modulesData) {
          await app.db.insert(appSchema.budgetModules).values({
            id: randomUUID(),
            ...module,
          });
        }
      }

      // Seed random events
      const existingEvents2 = await app.db.query.randomEvents.findMany();
      if (existingEvents2.length === 0) {
        const eventsData = [
          { title: 'Car Breakdown', description: 'Your car needs emergency repairs', financialImpact: '-500', category: 'transport' },
          { title: 'Tax Refund', description: 'You received a tax refund!', financialImpact: '800', category: 'income' },
          { title: 'Medical Bill', description: 'Unexpected doctor visit', financialImpact: '-300', category: 'health' },
          { title: 'Bonus at Work', description: 'Your employer gave you a bonus!', financialImpact: '600', category: 'income' },
          { title: 'Appliance Repair', description: 'Your refrigerator broke down', financialImpact: '-250', category: 'home' },
        ];
        for (const evt of eventsData) {
          await app.db.insert(appSchema.randomEvents).values({
            id: randomUUID(),
            ...evt,
          });
        }
      }

      app.logger.info('Seed data completed');
    }
  } catch (error) {
    app.logger.error({ err: error }, 'Failed to seed data');
  }
}

// Register routes
registerEventRoutes(app);
registerUserRoutes(app);
registerDmRoutes(app);
registerFriendsRoutes(app);
registerCityRoomRoutes(app);
registerJobRoutes(app);
registerGameRoutes(app);

// Seed data
await seedData();

await app.run();
app.logger.info('Application running');

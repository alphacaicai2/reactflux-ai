import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import 'dotenv/config';

// Import routes
import aiRoutes from './routes/ai.js';
import digestRoutes from './routes/digest.js';

// Import services
import { SchedulerService } from './services/scheduler.js';

// Create Hono app
const app = new Hono();

// Configuration
const PORT = parseInt(process.env.PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: process.env.CORS_ORIGIN || '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}));

// Custom trailing slash handler - redirect to non-trailing slash
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  const path = url.pathname;
  // Only trim trailing slashes for API routes (not root)
  if (path.length > 1 && path.endsWith('/')) {
    const search = url.search;
    const newPath = path.slice(0, -1);
    return c.redirect(newPath + search, 308);
  }
  await next();
});

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'ReactFlux AI Backend',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// API routes
app.route('/api/ai', aiRoutes);
app.route('/api/digests', digestRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ success: false, error: 'Not Found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ success: false, error: 'Internal Server Error' }, 500);
});

// Start server
console.log(`Starting ReactFlux AI Backend...`);
console.log(`Port: ${PORT}`);
console.log(`Host: ${HOST}`);

// Initialize scheduler
SchedulerService.initialize();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  SchedulerService.stopAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  SchedulerService.stopAll();
  process.exit(0);
});

serve({
  fetch: app.fetch,
  port: PORT,
  hostname: HOST
}, (info) => {
  console.log(`Server running at http://${info.address}:${info.port}`);
});

export default app;

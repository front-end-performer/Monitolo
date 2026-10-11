// GET /api/system: a route is just "HTTP request → call service → send JSON".
import { Router } from 'express';
import { getSystemInfo } from '../services/system-service.ts';

export const systemRouter: Router = Router();

// Express 5 catches errors thrown from async handlers and passes them to the
// error handler in server.ts. No try/catch needed here.
systemRouter.get('/system', async (_req, res) => {
  res.json(await getSystemInfo());
});

// GET /api/processes
import { Router } from 'express';
import { listProcesses } from '../services/system-service.ts';

export const processesRouter: Router = Router();

processesRouter.get('/processes', async (_req, res) => {
  res.json(await listProcesses());
});

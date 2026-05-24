import { Router, Request, Response } from 'express';
import { query } from '../config/database';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  let dbOk = false;
  try {
    const result = await query('SELECT 1');
    if (result && result.rowCount !== null) {
      dbOk = true;
    }
  } catch (error) {
    dbOk = false;
  }

  const statusObj = {
    status: 'ok',
    db: dbOk,
    timestamp: new Date().toISOString()
  };

  if (dbOk) {
    res.status(200).json(statusObj);
  } else {
    res.status(500).json(statusObj);
  }
});

export default router;

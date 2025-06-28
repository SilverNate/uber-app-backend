import express from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db/pool';
import { pub } from '../redis/pubsub';

const router = express.Router();

router.post('/request', async (req: Request, res: Response) => {
  const { rider_id, origin_lat, origin_lng, dest_lat, dest_lng } = req.body;

  const result = await pool.query(
    `INSERT INTO rides (rider_id, origin_lat, origin_lng, dest_lat, dest_lng, status)
     VALUES ($1, $2, $3, $4, $5, 'requested') RETURNING *`,
    [rider_id, origin_lat, origin_lng, dest_lat, dest_lng]
  );

  const ride = result.rows[0];
  await pub.publish('ride_requested', JSON.stringify(ride));

  res.status(201).json({ ride });
});

export default router;
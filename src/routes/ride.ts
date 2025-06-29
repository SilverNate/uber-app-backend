import express from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db/pool';
import Redis from 'ioredis';


const router = express.Router();
const pub = new Redis({ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) });
const sub = new Redis({ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) });
const redis = new Redis({ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) });


router.post('/request', async (req: Request, res: Response) => {
  try {
    const { rider_id, origin_lat, origin_lng, dest_lat, dest_lng } = req.body;
    if (!rider_id || !origin_lat || !origin_lng || !dest_lat || !dest_lng) {
      return res.status(400).json({ error: 'Missing required ride parameters' });
    }

    const result = await pool.query(
      `INSERT INTO rides (rider_id, origin_lat, origin_lng, dest_lat, dest_lng, status)
       VALUES ($1, $2, $3, $4, $5, 'requested') RETURNING *`,
      [rider_id, origin_lat, origin_lng, dest_lat, dest_lng]
    );

    const ride = result.rows[0];
    await pub.publish('ride_requested', JSON.stringify(ride));

    res.status(201).json({ ride });
  } catch (err: any) {
    console.error('Ride request failed:', err);
    res.status(500).json({ error: err.message || 'Failed to request ride' });
  }
});

router.get('/status/:rideId', async (req: Request, res: Response) => {
  try {
    const rideId = req.params.rideId;
    const result = await pool.query('SELECT * FROM rides WHERE id = $1', [rideId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Ride not found' });
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('Status check failed:', err);
    res.status(500).json({ error: err.message || 'Could not fetch ride status' });
  }
});

router.post('/accept/:rideId', async (req: Request, res: Response) => {
  try {
    const rideId = req.params.rideId;
    const { driver_id } = req.body;
    if (!driver_id) {
      return res.status(400).json({ error: 'Missing driver_id' });
    }

    const result = await pool.query('SELECT * FROM rides WHERE id = $1', [rideId]);
    const ride = result.rows[0];
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    if (ride.status !== 'matched') {
      return res.status(400).json({ error: 'Ride not available for acceptance' });
    }

    await pool.query(
      'UPDATE rides SET status = $1, driver_id = $2 WHERE id = $3',
      ['accepted', driver_id, rideId]
    );

    await pub.publish('ride_accepted', JSON.stringify({ ...ride, driver_id, status: 'accepted' }));

    res.json({ message: 'Ride accepted', ride_id: rideId });
  } catch (err: any) {
    console.error('Ride acceptance failed:', err);
    res.status(500).json({ error: err.message || 'Could not accept ride' });
  }
});

router.post('/start/:rideId', async (req: Request, res: Response) => {
  try {
    const rideId = req.params.rideId;
    const result = await pool.query('SELECT * FROM rides WHERE id = $1', [rideId]);
    const ride = result.rows[0];
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status !== 'accepted') return res.status(400).json({ error: 'Ride not in accepted state' });

    await pool.query('UPDATE rides SET status = $1 WHERE id = $2', ['in_progress', rideId]);
    await pub.publish('ride_started', JSON.stringify({ ...ride, status: 'in_progress' }));
    res.json({ message: 'Ride started', ride_id: rideId });
  } catch (err: any) {
    console.error('Start ride failed:', err);
    res.status(500).json({ error: err.message || 'Could not start ride' });
  }
});

router.post('/complete/:rideId', async (req: Request, res: Response) => {
  try {
    const rideId = req.params.rideId;
    const result = await pool.query('SELECT * FROM rides WHERE id = $1', [rideId]);
    const ride = result.rows[0];
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status !== 'in_progress') return res.status(400).json({ error: 'Ride not in progress' });

    await pool.query('UPDATE rides SET status = $1 WHERE id = $2', ['completed', rideId]);
    await pub.publish('ride_completed', JSON.stringify({ ...ride, status: 'completed' }));
    res.json({ message: 'Ride completed', ride_id: rideId });
  } catch (err: any) {
    console.error('Complete ride failed:', err);
    res.status(500).json({ error: err.message || 'Could not complete ride' });
  }
});

sub.subscribe('ride_requested', (err) => {
  if (err) console.error('Failed to subscribe to ride_requested channel');
});

sub.on('message', async (channel, message) => {
  if (channel === 'ride_requested') {
    const ride = JSON.parse(message);
    console.log('Matching driver for ride ID:', ride.id);

    // Simulate assigning a driver_id (random UUID for now)
    const driverId = '00000000-0000-0000-0000-000000000001';
    await pool.query(
      'UPDATE rides SET status = $1, driver_id = $2 WHERE id = $3',
      ['matched', driverId, ride.id]
    );

    console.log(`Ride ${ride.id} matched with driver ${driverId}`);
    await pub.publish('ride_matched', JSON.stringify({ ...ride, driver_id: driverId, status: 'matched' }));
  }
});

router.get('/history/rider/:riderId', async (req: Request, res: Response) => {
  try {
    const { riderId } = req.params;
    const result = await pool.query('SELECT * FROM rides WHERE rider_id = $1 ORDER BY created_at DESC', [riderId]);
    res.json(result.rows);
  } catch (err: any) {
    console.error('Rider history failed:', err);
    res.status(500).json({ error: err.message || 'Could not fetch rider history' });
  }
});

router.get('/history/driver/:driverId', async (req: Request, res: Response) => {
  try {
    const { driverId } = req.params;
    const result = await pool.query('SELECT * FROM rides WHERE driver_id = $1 ORDER BY created_at DESC', [driverId]);
    res.json(result.rows);
  } catch (err: any) {
    console.error('Driver history failed:', err);
    res.status(500).json({ error: err.message || 'Could not fetch driver history' });
  }
});


router.post('/rate/:rideId', async (req: Request, res: Response) => {
  try {
    const { rating, comment } = req.body;
    const rideId = req.params.rideId;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Invalid rating (1-5)' });
    }
    await pool.query('UPDATE rides SET rating = $1, comment = $2 WHERE id = $3', [rating, comment, rideId]);
    res.json({ message: 'Rating submitted' });
  } catch (err: any) {
    console.error('Rating failed:', err);
    res.status(500).json({ error: err.message || 'Failed to rate ride' });
  }
});

router.get('/ratings/driver/:driverId', async (req, res) => {
  try {
    const { driverId } = req.params;
    const result = await pool.query(
      'SELECT AVG(rating)::numeric(3,2) AS avg_rating FROM rides WHERE driver_id = $1 AND rating IS NOT NULL',
      [driverId]
    );
    res.json({ driver_id: driverId, avg_rating: result.rows[0].avg_rating });
  } catch (err: any) {
    console.error('Rating avg error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/location/driver/:driverId', async (req, res) => {
  try {
    const driverId = req.params.driverId;
    const data = await redis.hget('driver_locations', driverId);
    if (!data) return res.status(404).json({ error: 'Location not found' });
    res.json(JSON.parse(data));
  } catch (err: any) {
    console.error('Fetch location error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/location/:driverId', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const driverId = req.params.driverId;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Missing lat/lng' });
    }
    const payload = JSON.stringify({ lat, lng, ts: Date.now() });
    await redis.hset('driver_locations', driverId, payload);
    await redis.publish('driver_location', payload);
    res.json({ message: 'Location stored and published' });
  } catch (err: any) {
    console.error('Location update failed:', err);
    res.status(500).json({ error: err.message || 'Failed to update location' });
  }
});

export default router;
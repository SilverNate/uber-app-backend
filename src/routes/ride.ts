import express from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db/pool';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';


const router = express.Router();
const pub = new Redis({ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) });
const sub = new Redis({ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) });
const redis = new Redis({ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) });

function isAdmin(req: Request, res: Response, next: Function) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }
  try {
    const token = auth.split(' ')[1];
    const payload: any = jwt.verify(token, process.env.JWT_SECRET!);
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

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
    
    const location = JSON.parse(data);
    const isStale = Date.now() - location.ts > 10_000;
    if (isStale) {
      return res.status(410).json({ error: 'Driver location is stale' });
    }

    res.json(location);
  } catch (err: any) {
    console.error('Fetch location error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/location/driver/:driverId', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const driverId = req.params.driverId;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Missing lat/lng' });
    }
    
    const timestamp = Date.now();
    const payload = JSON.stringify({ lat, lng, ts: timestamp });
    await redis.hset('driver_locations', driverId, payload);
    await redis.publish('driver_location', payload);
    await redis.sadd('active_drivers', driverId);
    await redis.set(`driver_last_seen:${driverId}`, timestamp.toString(), 'EX', 15);

    res.json({ message: 'Location stored and published' });
  } catch (err: any) {
    console.error('Location update failed:', err);
    res.status(500).json({ error: err.message || 'Failed to update location' });
  }
});

router.get('/drivers/nearby', async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    if (!lat || !lng || !radius) return res.status(400).json({ error: 'Missing lat/lng/radius' });

    const centerLat = parseFloat(lat as string);
    const centerLng = parseFloat(lng as string);
    const kmRadius = parseFloat(radius as string);
    const cacheKey = `nearby:${centerLat.toFixed(3)}:${centerLng.toFixed(3)}:${kmRadius}`;

    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const allDrivers = await redis.smembers('active_drivers');
    const results = [];

  for (const driverId of allDrivers) {
      const lastSeen = await redis.get(`driver_last_seen:${driverId}`);
      if (!lastSeen || Date.now() - parseInt(lastSeen) > 15_000) {
        await redis.srem('active_drivers', driverId);
        continue;
      }

      const raw = await redis.hget('driver_locations', driverId);
      if (!raw) continue;
      const loc = JSON.parse(raw);
      const dist = haversine(centerLat, centerLng, loc.lat, loc.lng);
      if (dist <= kmRadius) {
        results.push({ driverId, lat: loc.lat, lng: loc.lng, distance_km: dist });
      }
    }

    await redis.setex(cacheKey, 10, JSON.stringify(results));
    res.json(results);
  } catch (err: any) {
    console.error('Nearby driver lookup failed:', err);
    res.status(500).json({ error: err.message });
  }
});

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

router.get('/fare/estimate', async (req, res) => {
  try {
    const { origin_lat, origin_lng, dest_lat, dest_lng } = req.query;
    if (!origin_lat || !origin_lng || !dest_lat || !dest_lng) {
      return res.status(400).json({ error: 'Missing coordinates' });
    }

    const distance = haversine(
      parseFloat(origin_lat as string),
      parseFloat(origin_lng as string),
      parseFloat(dest_lat as string),
      parseFloat(dest_lng as string)
    );

    const baseFare = 1;      // USD
    const perKm = 0.5;        // USD/km
    const fare = baseFare + distance * perKm;

    res.json({ distance_km: distance, estimated_fare: fare.toFixed(2) });
  } catch (err: any) {
    console.error('Fare estimate failed:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/cancel/:rideId', async (req, res) => {
  try {
    const rideId = req.params.rideId;
    const result = await pool.query('SELECT status FROM rides WHERE id = $1', [rideId]);
    const ride = result.rows[0];
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status === 'completed') return res.status(400).json({ error: 'Ride already completed' });

    await pool.query('UPDATE rides SET status = $1 WHERE id = $2', ['cancelled', rideId]);
    res.json({ message: 'Ride cancelled' });
  } catch (err: any) {
    console.error('Cancel ride failed:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/charge/:rideId', async (req, res) => {
  try {
    const rideId = req.params.rideId;
    const result = await pool.query('SELECT * FROM rides WHERE id = $1', [rideId]);
    const ride = result.rows[0];
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status !== 'completed') return res.status(400).json({ error: 'Ride not completed yet' });

    const distance = haversine(ride.origin_lat, ride.origin_lng, ride.dest_lat, ride.dest_lng);
    const baseFare = 1;
    const perKm = 0.5;
    const total = baseFare + distance * perKm;

    await pool.query('UPDATE rides SET fare = $1 WHERE id = $2', [total, rideId]);
    await pool.query('INSERT INTO earnings (driver_id, ride_id, amount) VALUES ($1, $2, $3)', [ride.driver_id, rideId, total]);

    res.json({ charged: total.toFixed(2), ride_id: rideId });
  } catch (err: any) {
    console.error('Charge failed:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/earnings/driver/:driverId', async (req, res) => {
  try {
    const driverId = req.params.driverId;
    const result = await pool.query(
      'SELECT COUNT(*) AS total_rides, SUM(amount)::numeric(10,2) AS total_earned FROM earnings WHERE driver_id = $1',
      [driverId]
    );
    res.json({
      driver_id: driverId,
      total_rides: parseInt(result.rows[0].total_rides, 10),
      total_earned: result.rows[0].total_earned || '0.00'
    });
  } catch (err: any) {
    console.error('Earnings summary failed:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/dashboard', isAdmin, async (req, res) => {
  try {
    const [rides, earnings, drivers] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total_rides FROM rides'),
      pool.query('SELECT SUM(amount)::numeric(10,2) AS total_revenue FROM earnings'),
      pool.query('SELECT COUNT(DISTINCT driver_id) AS total_drivers FROM rides')
    ]);

    res.json({
      total_rides: parseInt(rides.rows[0].total_rides, 10),
      total_revenue: earnings.rows[0].total_revenue || '0.00',
      total_drivers: parseInt(drivers.rows[0].total_drivers, 10)
    });
  } catch (err: any) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' });
  }

  // Static example credentials (use DB in production)
  const ADMIN_USER = process.env.ADMIN_USER || 'admin';
  const ADMIN_PASS = process.env.ADMIN_PASS || 'secret';

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ role: 'admin', username }, process.env.JWT_SECRET!, { expiresIn: '1d' });
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

export default router;
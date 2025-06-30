import { Server } from 'socket.io';
import { pool } from './db/pool'; // your DB connection
import Redis from 'ioredis';

const redis = new Redis({ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) });

export function initSocket(server: any) {
  const io = new Server(server, {
    cors: {
      origin: '*',
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId as string;
    const role = socket.handshake.query.role as string;
    const driver_id = socket.handshake.query.userId as string;

    socket.join(userId);
    if (role === 'driver') socket.join('drivers');

    socket.on('book_ride', async (data) => {
      const { rider_id, origin, destination } = data;
      try {
        const result = await pool.query(
          `INSERT INTO rides (rider_id, origin_lat, origin_lng, dest_lat, dest_lng, status)
           VALUES ($1, $2, $3, $4, $5, 'requested') RETURNING *`,
          [rider_id, origin[0], origin[1], destination[0], destination[1]]
        );

        const ride = result.rows[0];
        io.to('drivers').emit('ride_requested', ride);
        socket.emit('ride_created', { ride });
      } catch (err) {
        console.error('Error creating ride:', err);
        socket.emit('error', { message: 'Ride creation failed' });
      }
    });

    socket.on('accept_ride', async ({ driver_id, ride_id }) => {
      try {
        const result = await pool.query(
          `UPDATE rides SET driver_id = $1, status = 'accepted'
           WHERE id = $2 AND status = 'requested' RETURNING *`,
          [driver_id, ride_id]
        );

        if (!result.rows.length) {
          return socket.emit('error', { message: 'Ride already taken or not found' });
        }

        const ride = result.rows[0];
        io.to(ride.rider_id).emit('ride_accepted', ride);
        
        io.sockets.sockets.get(ride.rider_id)?.join(ride.driver_id);
        
        socket.emit('ride_assigned', ride);
      } catch (err) {
        console.error('Error accepting ride:', err);
        socket.emit('error', { message: 'Ride acceptance failed' });
      }
    });

    socket.on('driver_location', async ({ lat, lng }) => {
        const driver_id = socket.handshake.query.userId as string;
        const ts = Date.now();
        const location = { driver_id, lat, lng, ts };


        // Optional: check active ride status from DB
        const result = await pool.query(
          `SELECT id FROM rides WHERE driver_id = $1 AND status IN ('accepted', 'enroute') ORDER BY created_at DESC LIMIT 1`,
          [driver_id]
        );
        const activeRide = result.rows[0];
        if (!activeRide) return; // skip if no active ride
    
        // Store in Redis (for polling support)
        await redis.hset('driver_locations', driver_id, JSON.stringify(location));
        await redis.expire('driver_locations', 60);
    
        // Store location history (for replay)
        await redis.rpush(`ride:${activeRide.id}:track`, JSON.stringify({ lat, lng, ts }));
        await redis.expire(`ride:${activeRide.id}:track`, 60 * 60); // 1 hour retention

        // Broadcast to rider(s)
        io.to(driver_id).emit('rider_location_update', location);
    });

    socket.on('rider_location_update', (data) => {
        // { driver_id, lat, lng, ts }
        console.log('Driver moving:', data);
    });

    socket.on('ride_completed', async ({ ride_id }) => {
      const result = await pool.query('SELECT driver_id FROM rides WHERE id = $1', [ride_id]);
      const driver_id = result.rows[0]?.driver_id;
      if (!driver_id) return;
        
      io.to(driver_id).emit('notify', {
        type: 'success',
        title: 'Ride Completed',
        body: `Ride ${ride_id} is completed!`
      });
    });
    
    socket.on('ride_cancelled', async ({ ride_id }) => {
      const result = await pool.query('SELECT rider_id FROM rides WHERE id = $1', [ride_id]);
      const rider_id = result.rows[0]?.rider_id;
      if (!rider_id) return;
    
      io.to(rider_id).emit('notify', {
        type: 'warning',
        title: 'Ride Cancelled',
        body: `Your ride ${ride_id} was cancelled.`
      });
    });

  });

  return io;
}

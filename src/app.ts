import express from 'express';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import './redis/pubsub';
import rideRoutes from './routes/ride';

dotenv.config();

const app = express();
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/rides', rideRoutes);

export default app;

import express from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool';
import type { Request, Response } from 'express';

const router = express.Router();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, phone, password } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, phone, password) VALUES ($1, $2, $3) RETURNING id',
      [name, phone, hashed]
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (err: any) {
    console.error('Registration failed:', err);
    res.status(500).json({ error: err.detail || err.message || 'Registration failed' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ id: user.id, name: user.name });
  } catch (err: any) {
    console.error('Login failed:', err);
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});


export default router;

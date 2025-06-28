"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const pool_1 = require("../db/pool");
const router = express_1.default.Router();
router.post('/register', async (req, res) => {
    const { name, phone, password } = req.body;
    const hashed = await bcryptjs_1.default.hash(password, 10);
    const result = await pool_1.pool.query('INSERT INTO users (name, phone, password) VALUES ($1, $2, $3) RETURNING id', [name, phone, hashed]);
    res.json({ id: result.rows[0].id });
});
router.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    const result = await pool_1.pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    const user = result.rows[0];
    if (!user || !(await bcryptjs_1.default.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ id: user.id, name: user.name });
});
exports.default = router;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const pool_1 = require("../db/pool");
const pubsub_1 = require("../redis/pubsub");
const router = express_1.default.Router();
router.post('/request', async (req, res) => {
    const { rider_id, origin_lat, origin_lng, dest_lat, dest_lng } = req.body;
    const result = await pool_1.pool.query(`INSERT INTO rides (rider_id, origin_lat, origin_lng, dest_lat, dest_lng, status)
     VALUES ($1, $2, $3, $4, $5, 'requested') RETURNING *`, [rider_id, origin_lat, origin_lng, dest_lat, dest_lng]);
    const ride = result.rows[0];
    await pubsub_1.pub.publish('ride_requested', JSON.stringify(ride));
    res.status(201).json({ ride });
});
exports.default = router;

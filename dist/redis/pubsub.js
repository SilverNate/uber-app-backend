"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pub = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const pub = new ioredis_1.default({ host: process.env.REDIS_HOST });
exports.pub = pub;
const sub = new ioredis_1.default({ host: process.env.REDIS_HOST });
sub.subscribe('ride_requested', () => {
    console.log('Subscribed to ride_requested channel');
});
sub.on('message', (channel, message) => {
    if (channel === 'ride_requested') {
        console.log('New ride requested:', message);
    }
});

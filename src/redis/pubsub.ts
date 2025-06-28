import Redis from 'ioredis';

const pub = new Redis({ host: process.env.REDIS_HOST });
const sub = new Redis({ host: process.env.REDIS_HOST });

sub.subscribe('ride_requested', () => {
  console.log('Subscribed to ride_requested channel');
});

sub.on('message', (channel, message) => {
  if (channel === 'ride_requested') {
    console.log('New ride requested:', message);
  }
});

export { pub };
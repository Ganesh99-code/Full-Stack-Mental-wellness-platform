import Redis from 'ioredis';

let redis;

if (process.env.NODE_ENV !== 'production') {
  if (!global.redisClient) {
    global.redisClient = new Redis(process.env.REDIS_URI);
    global.redisClient.on('error', (err) => console.error('Redis Client Error:', err.message));
  }
  redis = global.redisClient;
} else {
  redis = new Redis(process.env.REDIS_URI);
  redis.on('error', (err) => console.error('Redis Client Error:', err.message));
}

export default redis;

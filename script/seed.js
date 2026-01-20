import { createClient } from "redis";

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379"
});

async function seedRedis() {
    await redisClient.connect();
    console.log("flushing redis !!");
    await redisClient.flushDb();
    await redisClient.disconnect()
}
seedRedis();



import { createClient } from "redis";

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379"
});

async function seedRedis() {
    await redisClient.connect();
    console.log("flushing db !!");
    await redisClient.flushDb();
    console.log("setting key ticket_count !!");
    await redisClient.set('ticket_count',10);
    await redisClient.disconnect()
}
seedRedis();



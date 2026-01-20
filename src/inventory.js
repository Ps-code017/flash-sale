import redisClient from "./redisClient.js";
    
const BUY_TICKET_LUA_SCRIPT = `
-- KEYS[1] = purchase_attempt:{saleId}:{userId}
-- ARGV[1] = TTL in seconds

if redis.call("EXISTS", KEYS[1]) == 1 then
  return -1
end

redis.call("SET", KEYS[1], 1, "EX", ARGV[1])
return 1
`;

export const tryPurchase = async ({ saleId, userId }) => {
  const TTL_SECONDS = 3600; // 1 hour, configurable

  const result = await redisClient.eval(
    BUY_TICKET_LUA_SCRIPT,
    {
      keys: [`purchase_attempt:${saleId}:${userId}`],
      arguments: [String(TTL_SECONDS)],
    }
  );

  return result; // 1 = allowed, -1 = duplicate
};

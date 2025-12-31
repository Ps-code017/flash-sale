// export let ticketLeft = 10;
// import { Mutex } from "async-mutex";
// const mutex = new Mutex();

// const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// // export const decrementTicket = async () => {


// //     const release=await mutex.acquire();
    
// //     try {
// //         if (ticketLeft > 0) {
// //             await sleep(50);
// //             ticketLeft--;
// //             return true;
// //         }
// //         return false;
// //     } catch (error) {
// //         console.error("Error in decrementTicket:", error);
// //         return false;
// //     }finally{
// //         release();
// //     }
// // };

import redisClient from "./redisClient.js";



 const BUY_TICKET_LUA_SCRIPT=`
if redis.call("EXISTS",KEYS[2])==1 then
    return -1
end

local tickets=tonumber(redis.call("GET",KEYS[1]))
if tickets<=0 then
    return 0
end

redis.call("DECR",KEYS[1])
redis.call("SET",KEYS[2],1)
return 1
`

export const buy_ticket=async(userId)=>{
    const result=await redisClient.eval(BUY_TICKET_LUA_SCRIPT,{
        keys:[
            'ticket_count',
            `user_ticket_${userId}`
        ]
    }) 
    return result;
} 
        
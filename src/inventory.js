export let ticketLeft = 10;
import { Mutex } from "async-mutex";
const mutex = new Mutex();

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

export const decrementTicket = async () => {

    const release=await mutex.acquire();
    
    try {
        if (ticketLeft > 0) {
            await sleep(50);
            ticketLeft--;
            return true;
        }
        return false;
    } catch (error) {
        console.error("Error in decrementTicket:", error);
        return false;
    }finally{
        release();
    }
};
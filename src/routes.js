import { Router } from 'express';
const router=Router();

import { createOrder } from './orderService.js';
import {tryPurchase} from "./inventory.js"

const SALE_ID = "11111111-1111-1111-1111-111111111111";

router.post('/buy', async (req, res) => {
    const {userId}=req.body;
    if(!userId){
        return res.status(400).json({success:false,message:"userId is required"});
    }
    try {
        const redisRes=await tryPurchase({saleId:SALE_ID,userId})
        if(redisRes==-1){
            console.log("Duplicate purchase attempt for userId:", userId);
            return res.status(400).json({success:false,message:"Duplicate purchase attempt detected"});
        }
    
        const orderRes=await createOrder({saleId:SALE_ID,userId});
        if(!orderRes.success){
            console.log("Sold out for userId:", userId);
            return res.status(400).json({success:false,message:orderRes.message});
        }
        console.log("Order created successfully for userId:", userId, "OrderId:", orderRes.orderId);
        return res.status(200).json({success:true,orderId:orderRes.orderId,ticketId:orderRes.ticketId});
    } catch (error) {
        console.error("Error in /buy route:", error);
        return res.status(500).json({success:false,message:"Internal Server Error"});
    }
})

export default router;
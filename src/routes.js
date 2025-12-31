import { Router } from 'express';
const router=Router();
import { buy_ticket, } from './inventory.js';


router.post('/buy', async (req, res) => {
    const userId=req.body.userId;
    if(!userId){
        return res.status(400).json({success:false,message:"User ID is required"});
    }
    const result=await buy_ticket(userId)
    if(result===1){
        console.log(`Ticket successfully purchased for user ${userId}`);
        res.status(200).json({ success: true, message: "Ticket purchased successfully" });
    }else if(result===0){
        console.log(`Tickets are sold out. User ${userId} could not purchase a ticket.`);
        res.status(400).json({ success: false, message: "Sold Out" });
    }
    if(result===-1){
        console.log(`User ${userId} has already purchased a ticket.`);
        res.status(400).json({ success: false, message: "User has already purchased a ticket" });
    }
});

export default router;
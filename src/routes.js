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
        res.status(200).json({ success: true, message: "Ticket purchased successfully" });
    }else if(result===0){
        res.status(400).json({ success: false, message: "Sold Out" });
    }
    if(result===-1){
        res.status(400).json({ success: false, message: "User has already purchased a ticket" });
    }
});

export default router;
import { Router } from 'express';
const router=Router();
import { decrementTicket, ticketLeft } from './inventory.js';


router.post('/buy', async (req, res) => {
    console.log("Current tickets:", ticketLeft);
    
    
    const success = await decrementTicket(); 

    if (success) {
        res.status(200).json({ success: true, ticketsLeft: ticketLeft });
    } else {
        res.status(400).json({ success: false, message: "Sold Out" });
    }
});

export default router;
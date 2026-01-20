import { pool } from "./db.js";
import {v4 as uuidv4} from "uuid";

export const createOrder=async({saleId,userId})=>{
    const client=await pool.connect();

    try {
        await client.query('BEGIN');
    
        const ticketRes=await client.query(
            `SELECT id FROM tickets WHERE sale_id=$1 AND status ='AVAILABLE' LIMIT 1 FOR UPDATE SKIP LOCKED`,[saleId]
        )
        console.log("ticket result",ticketRes)
        if(ticketRes.rows.length==0) {
            await client.query('ROLLBACK');
            return {success:false,message:"Sold Out"};
        }
    
        const ticketId=ticketRes.rows[0].id;
    
        const orderId=uuidv4();
    
        await client.query(
            `INSERT INTO orders (id,sale_id, ticket_id, user_id) VALUES ($1, $2, $3, $4)`,
            [orderId,saleId, ticketId, userId]
        );
    
        await client.query(`
            UPDATE tickets SET status='SOLD' WHERE id=$1
        `,[ticketId]);
    
        await client.query('COMMIT');
    
        return {success:true, orderId,ticketId};
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }finally{
        client.release();
    }
}
import express from 'express';
const app=express();

import ticketRouter from './routes.js';

app.use(express.json());
app.use('/tickets', ticketRouter);

app.listen(3000,()=>{
    console.log("Server started on port 3000");
});
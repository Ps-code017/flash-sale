import express from 'express';
const app=express();

import ticketRouter from './routes.js';

app.use(express.json());
app.use('/tickets', ticketRouter);

const PORT=process.env.PORT || 3000;
app.listen(PORT,()=>{
    console.log(`Server started on port ${PORT}`);
});
import { consumer, connectConsumer } from "../kafka/consumer.js";
import { pool } from "../db.js";

const handleOrderCreated = async (event) => {
  const { orderId, userId, ticketId } = event.payload;

 
  console.log("Sending notification...");
  console.log(`User ${userId} purchased ticket ${ticketId}`);
  console.log(`Order ID: ${orderId}`);
};

export const startNotificationConsumer = async () => {
  await connectConsumer();

  console.log("Notification consumer started");

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const parsed = JSON.parse(message.value.toString());
        const eventId = parsed.eventId;
        const client=await pool.connect();
        try{
            await client.query("BEGIN");
            await client.query(`INSERT INTO processed_events (event_id) VALUES ($1)`, [eventId]);

            console.log("Received event:", parsed.eventType);
    
            if (parsed.eventType === "ORDER_CREATED") {
              await handleOrderCreated(parsed);
            }
            await client.query("COMMIT");

        } catch (err) {
            await client.query("ROLLBACK");
            if (err.code === "23505") {
                console.log("Duplicate event detected, skipping. Event ID:", eventId);
                return;
            }
            else console.error("Error processing event, rolling back:", err);
        } finally {

            client.release();
        }
      } catch (err) {
        console.error("Error processing message:", err);
      }
    },
  });
};

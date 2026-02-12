import { consumer, connectConsumer } from "../kafka/consumer.js";

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

        console.log("Received event:", parsed.eventType);

        if (parsed.eventType === "ORDER_CREATED") {
          await handleOrderCreated(parsed);
        }

      } catch (err) {
        console.error("Error processing message:", err);
      }
    },
  });
};

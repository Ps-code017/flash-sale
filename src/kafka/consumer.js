import { Kafka } from "kafkajs";

const kafka = new Kafka({
  clientId: "notification-service",
  brokers: ["localhost:9092"],
});

export const consumer = kafka.consumer({ groupId: "notification-group" });

export const connectConsumer = async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: "order-events", fromBeginning: false });
}
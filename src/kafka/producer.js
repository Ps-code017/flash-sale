import { Kafka } from "kafkajs";

const kafka = new Kafka({
  clientId: "flash-sale-service",
  brokers: ["localhost:9092"],
});

export const producer = kafka.producer();

export const connectProducer = async () => {
  await producer.connect();
};

import { pool } from "../db.js";
import { producer, connectProducer } from "../kafka/producer.js";

const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 2000;

const publishEvent = async (event) => {
  await producer.send({
    topic: "order-events",
    messages: [
      {
        key: event.aggregate_id,
        value: JSON.stringify({
          eventId: event.id,
          eventType: event.event_type,
          payload: event.payload,
        }),
      },
    ],
  });
};

const processOutbox = async () => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `
      SELECT *
      FROM outbox
      WHERE status = 'PENDING'
      ORDER BY created_at
      LIMIT $1
      FOR UPDATE SKIP LOCKED
      `,
      [BATCH_SIZE]
    );

    await client.query("COMMIT");

    for (const event of rows) {
      try {
        await publishEvent(event);

        await pool.query(
          `
          UPDATE outbox
          SET status = 'SENT',
              processed_at = NOW()
          WHERE id = $1
          `,
          [event.id]
        );

      } catch (err) {
        console.error("Kafka publish failed, will retry:", err.message);
        // do NOT mark as SENT
      }
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Outbox worker error:", err);
  } finally {
    client.release();
  }
};

export const startOutboxWorker = async () => {
  await connectProducer();

  console.log("Outbox worker started");

  setInterval(processOutbox, POLL_INTERVAL_MS);
};

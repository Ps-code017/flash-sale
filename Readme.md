# FlashSale

A distributed, high-concurrency flash-sale ticket system built to survive the exact failure modes that take down naive "check inventory → decrement inventory" implementations: race conditions, horizontal scaling, crashes mid-transaction, and dual writes across systems.

The project is built in phases, where each phase exists to fix a specific correctness or durability gap exposed by the previous one.

## Problem Statement

A flash sale means many concurrent users competing for limited inventory. The core bug in any naive implementation is that "check remaining stock" and "decrement remaining stock" are two separate operations — not atomic — so under concurrency, multiple requests can pass the check before any of them updates the count, resulting in overselling.

## Architecture Evolution

### Phase 0 — Naive in-memory counter
A plain `if (ticketLeft > 0) ticketLeft--` with no protection. Because of async I/O (simulated with a sleep) between the check and the decrement, two concurrent requests can both pass the check before either updates state — `ticketLeft` goes negative and the same ticket is sold to multiple users.

### Phase 1 — In-memory mutex
A lock inside the Node process serializes access, preventing negative inventory on a single instance. However, this only works for a single process — deploying multiple instances (e.g. behind a load balancer, or in Docker) means each instance has its own memory and its own mutex. Server 1 has no idea Server 2 just sold the last ticket.

**Conclusion:** in-memory locks guarantee correctness only in single-node deployments and do not scale horizontally.

### Phase 2 — Redis + Lua (distributed atomicity)
Since multiple servers need to safely read and modify **shared** state, the counter moves to Redis — a fast, single-threaded, shared in-memory store. But moving state to Redis alone doesn't guarantee atomicity, since check-and-decrement are still two round trips. The fix is bundling both operations into a single **Lua script**, which Redis executes as one atomic unit with no interleaving from other commands.

- **Idempotency:** each purchase is gated by storing the user's ID as a Redis key, preventing duplicate purchases.
- **TTL on idempotency keys:** without an expiry, a user's idempotency key could outlive the sale it was created for, incorrectly blocking them from future sales. TTL is set slightly longer than the sale's business validity window.
- **Load testing:** verified with **k6**, running multiple Node instances (different ports) against one shared Redis instance. Under concurrent load, inventory never went below zero — proving the Lua script's atomicity holds under horizontal scaling.

**Conclusion:** Redis + Lua gives atomic check-and-update across any number of stateless servers.

### Phase 3 — Postgres (durability)
Redis solves concurrency but not durability. Two failure scenarios it doesn't handle:
1. Redis decrements inventory and records the idempotency key, but the app crashes before an order is persisted — the ticket is "gone" with no order to show for it.
2. Redis is RAM-based. A crash or restart can wipe its state, risking tickets being resold.

Postgres is introduced as the **source of truth**, with Redis demoted to a fast concurrency gate:
- **ACID transactions** ensure an order is either fully created or not created at all.
- **Write-Ahead Logging (WAL)** ensures writes are durable on disk before being acknowledged.
- Core transaction: `BEGIN → SELECT ticket FOR UPDATE SKIP LOCKED → INSERT order → UPDATE ticket SET status = SOLD → COMMIT`.

**The Golden Phase-3 Principle:** no distributed rollbacks are attempted between Redis and Postgres. Postgres defines the truth; Redis is allowed to be eventually consistent and rebuilt from Postgres if needed.

### Phase 4 — Kafka + Transactional Outbox (decoupling side effects)
Once a ticket is sold, other services need to react (confirmation emails, analytics, etc.) without doing so synchronously inside the request path. This introduces the **dual-write problem**: writing an order to Postgres and an event to Kafka can't be done atomically across two different systems — a crash between the two leaves them out of sync.

**Solution: Transactional Outbox pattern.**
- In the *same* Postgres transaction as the order insert, a row is also inserted into an `outbox` table with `status = PENDING`. Since it's one transaction, both writes succeed or neither does.
- A separate background **outbox worker** polls for `PENDING` rows (`FOR UPDATE SKIP LOCKED` so multiple workers don't grab the same row), publishes each to Kafka, and marks it `SENT` on acknowledgment.
- If the worker crashes between Kafka's ack and marking the row `SENT`, the event is republished on restart — **at-least-once delivery**. Downstream consumers must therefore be idempotent, but no event is ever silently lost.

**Kafka partitioning:** messages are keyed by `aggregate_id` (e.g. order ID), so all events for the same order hash to the same partition. Kafka guarantees FIFO ordering within a partition, so `ORDER_CREATED` is always processed before `ORDER_PAID` for the same order.

**Outbox table schema:**
```sql
CREATE TABLE outbox (
  id UUID PRIMARY KEY,
  aggregate_type TEXT NOT NULL,        -- e.g. 'ORDER'
  aggregate_id UUID NOT NULL,          -- order_id
  event_type TEXT NOT NULL,            -- 'ORDER_CREATED'
  payload JSONB NOT NULL,              -- event data
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | SENT | FAILED
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP
);

CREATE INDEX idx_outbox_status_created ON outbox (status, created_at);
```

### Idempotent Consumers
Since Kafka delivery is at-least-once, consumers (e.g. the notification service) are built to safely handle duplicate events without double-processing (e.g. sending duplicate confirmation emails).

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Concurrency gate | Redis + Lua | Atomic check-and-decrement, idempotency keys |
| Source of truth | PostgreSQL | Durable order storage, row-level locking |
| Event backbone | Apache Kafka | Decoupled, ordered event delivery |
| Consistency pattern | Transactional Outbox | Solves the dual-write problem |
| Load testing | k6 | Validates atomicity under concurrent, multi-instance load |

## Project Structure

```
FlashSale/
├── k6/
│   └── test.js                  # Load test script simulating concurrent purchase requests
├── script/
│   └── seed.js                  # Seeds initial ticket inventory
├── src/
│   ├── consumers/
│   │   └── notificationConsumer.js   # Idempotent consumer for order-created events (e.g. emails)
│   ├── kafka/
│   │   ├── consumer.js          # Kafka consumer setup
│   │   └── producer.js          # Kafka producer / event publishing
│   ├── workers/
│   │   └── outboxWorker.js      # Polls outbox table, publishes to Kafka, marks rows SENT
│   ├── db.js                    # Postgres connection/pool setup
│   ├── index.js                 # App entry point
│   ├── inventory.js             # Redis + Lua inventory check/decrement logic
│   ├── orderService.js          # Core order transaction (lock ticket → insert order → outbox)
│   ├── redisClient.js           # Redis client setup
│   ├── routes.js                # API routes
│   ├── startConsumer.js         # Bootstraps the Kafka consumer process
│   └── startWorker.js           # Bootstraps the outbox worker process
├── .gitignore
└── package.json
```

## Running Locally

1. Start Postgres and Redis (locally or via Docker).
2. Seed initial inventory:
   ```
   node script/seed.js
   ```
3. Start the API server:
   ```
   node src/index.js
   ```
4. Start the outbox worker (publishes events to Kafka):
   ```
   node src/startWorker.js
   ```
5. Start the Kafka consumer (handles side effects like notifications):
   ```
   node src/startConsumer.js
   ```
6. Load test with k6 against multiple instances to verify atomicity under concurrency:
   ```
   k6 run k6/test.js
   ```

## Key Takeaways

- Check-then-act is never atomic by default — every layer of this system (Redis, Postgres, Kafka) exists to make a specific operation atomic or durable.
- Horizontal scalability requires shared, externalized state — not per-process locks.
- Durability and atomicity are different guarantees — Redis gives you speed and atomicity, Postgres gives you durability and correctness of record.
- Cross-system consistency (dual writes) is solved by writing to one system transactionally (the outbox table) and relaying asynchronously — not by trying to make two systems commit together.
- At-least-once delivery is an acceptable and expected trade-off, provided consumers are idempotent.

## Open Items / Future Work

- Forward and backward recovery strategies for distributed rollbacks
- Deeper dive into JSONB usage and indexing in Postgres
- Kafka internals: log segments, consumer group rebalancing
- Package.json scripts for one-command startup of all services

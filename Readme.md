# FlashSale

A distributed, high-concurrency flash-sale ticketing system built to survive the exact failure modes that break naive "check inventory → decrement inventory" implementations: race conditions, horizontal scaling, crashes mid-transaction, and dual writes across distributed systems.

Rather than simply combining Redis, PostgreSQL, and Kafka, this project evolves in phases, where every new component exists to solve a specific correctness, scalability, or durability problem exposed by the previous phase.

---

# Architecture

```text
                    Purchase Request
                           │
                    Express API Server
                           │
                 Redis + Lua Script
        (Atomic inventory check & decrement)
                           │
          ┌────────────────┴────────────────┐
          │                                 │
      Sold Out                        Inventory Reserved
                                            │
                              PostgreSQL Transaction
          (Lock Ticket → Create Order → Insert Outbox Event)
                                            │
                                         COMMIT
                                            │
                                      Outbox Worker
                                            │
                                   Publish to Kafka
                                            │
                          ┌─────────────────┴────────────────┐
                          │                                  │
                 Notification Service             Analytics Service
```

---

# Problem Statement

A flash sale means thousands of concurrent users competing for a very limited inventory.

The classic implementation looks like this:

```js
if (ticketsLeft > 0) {
    ticketsLeft--;
}
```

This appears correct until multiple requests execute concurrently.

Both requests can read `ticketsLeft = 1` before either decrements it, causing:

- Overselling
- Negative inventory
- Duplicate ticket allocation

The entire project is about eliminating these failure modes while remaining horizontally scalable.

---

# Architecture Evolution

## Phase 0 — Naive In-Memory Counter

A simple

```cpp
if(ticketLeft > 0)
    ticketLeft--;
```

with simulated async delay between the check and decrement.

Because check and update are separate operations, concurrent requests both pass the condition before either updates the value.

Result:

- Inventory becomes negative
- Same ticket sold multiple times

---

## Phase 1 — In-Memory Mutex

A mutex serializes access inside a single Node.js process.

This prevents race conditions **only inside one server instance**.

However, multiple servers behind a load balancer each maintain:

- separate memory
- separate inventory
- separate mutex

Server A has no idea Server B already sold the last ticket.

### Conclusion

In-memory locks provide correctness only for single-node deployments and cannot scale horizontally.

---

## Phase 2 — Redis + Lua (Distributed Atomicity)

Inventory is moved into Redis so every application instance operates on shared state.

However, simply moving data to Redis isn't enough.

Doing:

```
GET inventory
DECR inventory
```

still involves two network round trips.

Another client may interleave between them.

Instead, both operations are executed inside a single Lua script.

Redis executes Lua scripts atomically because Redis itself is single-threaded.

The entire sequence:

- Check inventory
- Check duplicate purchase
- Decrement inventory
- Create idempotency key

executes as one indivisible operation.

### Why Lua instead of WATCH/MULTI?

Redis optimistic transactions (`WATCH/MULTI`) require retries under contention.

Lua executes everything as a single command, avoiding retry loops and providing lower latency during heavy traffic.

### Idempotency

Duplicate purchases are prevented by storing

```
purchase:<saleId>:<userId>
```

as a Redis key.

### TTL

The idempotency key expires shortly after the sale ends.

Without expiration, users could incorrectly remain blocked from participating in future flash sales.

### Load Testing

The system was validated using **k6** against multiple API instances sharing one Redis server.

Result:

- Inventory never became negative
- No duplicate purchases
- Atomicity held under concurrent multi-instance load

### Conclusion

Redis + Lua provides distributed atomic check-and-update across any number of stateless servers.

---

## Phase 3 — PostgreSQL (Durability)

Redis guarantees atomicity but **not durability**.

Two important failures remain.

### Failure 1

Redis decrements inventory.

Application crashes.

Order never reaches the database.

Inventory disappears forever.

### Failure 2

Redis is RAM-backed.

A restart or crash may lose inventory state.

To solve this, PostgreSQL becomes the source of truth.

Redis becomes only a fast concurrency gate.

Core transaction:

```
BEGIN

SELECT ... FOR UPDATE SKIP LOCKED

INSERT order

UPDATE ticket SET status='SOLD'

INSERT outbox event

COMMIT
```

### Why FOR UPDATE SKIP LOCKED?

Multiple workers or requests can safely process different rows without blocking each other.

Already locked rows are skipped instead of waiting.

This improves throughput while preventing duplicate processing.

### PostgreSQL Guarantees

- ACID transactions
- WAL (Write-Ahead Logging)
- Row-level locking
- Crash recovery

### Golden Rule

No distributed rollback is attempted between Redis and PostgreSQL.

PostgreSQL defines truth.

Redis can always be rebuilt from PostgreSQL.

---

## Phase 4 — Kafka + Transactional Outbox

Creating an order triggers downstream work:

- confirmation emails
- analytics
- billing
- notifications

Publishing directly to Kafka inside the request creates the **dual-write problem**.

Possible failure:

```
Insert Order

Application crashes

Kafka publish never happens
```

or

```
Kafka publish succeeds

Application crashes

Database transaction rolls back
```

The database and Kafka become inconsistent.

### Transactional Outbox

Instead of writing directly to Kafka,

the application inserts an event into an `outbox` table **inside the same PostgreSQL transaction**.

```
BEGIN

Insert Order

Insert Outbox Event

COMMIT
```

Now both succeed or both fail.

A background worker:

- polls pending rows
- publishes to Kafka
- marks rows SENT

using

```
FOR UPDATE SKIP LOCKED
```

so multiple workers never process the same row.

### Failure Recovery

If the worker crashes after Kafka acknowledges the event but before updating the row to `SENT`, the event will be published again after restart.

Therefore the system provides

**at-least-once delivery.**

---

# Kafka Partitioning

Kafka messages are partitioned using

```
order_id
```

as the message key.

This guarantees:

- all events of one order go to the same partition
- FIFO ordering for that order
- parallel processing across different orders

Example:

```
ORDER_CREATED

↓

ORDER_PAID

↓

ORDER_COMPLETED
```

The order is always preserved.

---

# Idempotent Consumers

Kafka intentionally provides at-least-once delivery.

Consumers therefore maintain processed-event IDs.

Receiving the same event twice does **not**

- send duplicate emails
- duplicate analytics
- duplicate billing

---

# Database Schema

## Tickets

```sql
CREATE TABLE tickets (
    id UUID PRIMARY KEY,
    status TEXT NOT NULL
);
```

## Orders

```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    ticket_id UUID NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Outbox

```sql
CREATE TABLE outbox (
    id UUID PRIMARY KEY,
    aggregate_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP
);

CREATE INDEX idx_outbox_status_created
ON outbox(status, created_at);
```

---

# REST API

| Method | Endpoint | Description |
|----------|-----------|------------|
| POST | `/purchase` | Purchase a ticket |
| GET | `/orders/:userId` | Fetch purchased tickets |
| GET | `/inventory` | Remaining inventory |

---

# Tech Stack

| Layer | Technology | Purpose |
|------|------------|---------|
| API | Node.js + Express | Request handling |
| Concurrency Gate | Redis + Lua | Atomic inventory updates |
| Source of Truth | PostgreSQL | Durable storage |
| Messaging | Apache Kafka | Event streaming |
| Consistency Pattern | Transactional Outbox | Solves dual writes |
| Load Testing | k6 | Concurrent testing |

---

# Project Structure

```
FlashSale/
├── k6/
│   └── test.js
├── script/
│   └── seed.js
├── src/
│   ├── consumers/
│   ├── kafka/
│   ├── workers/
│   ├── db.js
│   ├── inventory.js
│   ├── orderService.js
│   ├── redisClient.js
│   ├── routes.js
│   ├── startConsumer.js
│   ├── startWorker.js
│   └── index.js
├── package.json
└── README.md
```

---

# Running Locally

```bash
# Seed inventory
node script/seed.js

# Start API
node src/index.js

# Start Outbox Worker
node src/startWorker.js

# Start Kafka Consumer
node src/startConsumer.js

# Run load tests
k6 run k6/test.js
```

---

# Failure Scenarios Covered

✅ Concurrent purchase requests

✅ Multiple API servers

✅ Duplicate purchase attempts

✅ Worker crash after Kafka publish

✅ API crash before database commit

✅ Redis restart

✅ At-least-once Kafka delivery

---

# Key Takeaways

- Check-then-act is never atomic by default.
- Atomicity and durability solve different problems.
- Horizontal scaling requires shared state.
- Distributed transactions should be avoided whenever possible.
- Transactional Outbox eliminates dual-write inconsistency.
- Event-driven systems require idempotent consumers.
- Eventual consistency is often the most practical distributed systems design.

---

# Future Improvements

- Distributed rollback and recovery strategies
- Dead Letter Queue (DLQ) for failed Kafka events
- Redis persistence (AOF/RDB) benchmarking
- JSONB indexing optimizations
- Kafka internals (ISR, log segments, consumer rebalancing)
- Docker Compose for one-command startup
- CI/CD with GitHub Actions

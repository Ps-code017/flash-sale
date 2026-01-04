# ⚡ Distributed Flash Sale System

A **high-concurrency backend system** designed to handle flash sales (e.g., ticket booking) with **strict inventory control**.  
It uses **Redis Lua Scripts** to guarantee **atomicity**, prevent **race conditions**, and ensure **idempotent purchases** in a distributed environment.

---

## 📖 The Challenge

In a high-demand event, thousands of users try to buy a limited number of tickets simultaneously.  
Naive database-based solutions break down due to:

### ❌ Problems with Traditional Approaches

- **Race Conditions**  
  Two users read *“1 ticket left”* at the same time → both buy it → **overselling**.

- **Double Purchases**  
  Network retries or timeouts cause users to resend requests → **duplicate charges**.

- **Distributed Servers**  
  Multiple Node.js instances make in-memory locks useless.

---

## 🚀 The Solution

This system moves the **critical section** (check + reserve) into Redis using **atomic Lua scripts**.

### ✅ Key Guarantees

#### 1. Concurrency Control (Atomicity)
- A **Redis Lua Script** checks inventory and decrements stock in **one atomic operation**.
- Redis guarantees **no other request can interleave** while the script is running.

#### 2. Idempotency
- Each purchase request is stamped with a **User ID**.
- If the same user retries:
  - The system detects the duplicate
  - Returns the **previous result**
  - **Does not decrement inventory again**

#### 3. Distributed Safety
- Works correctly even with **multiple Node.js server instances**
- Redis acts as the **centralized coordination point**

---

## 🛠 Tech Stack

- **Runtime:** Node.js (Express)
- **Database:** Redis (Key-Value Store + Lua Scripting)
- **Infrastructure:** Docker & Docker Compose
- **Testing:** k6 (Load Testing & Performance Benchmarking)
- **CI/CD:** GitHub Actions

---

## 📂 Project Structure

```bash
├── src/
│   ├── index.js           # Entry point (Express Server)
│   ├── routes.js          # API Routes
│   ├── inventory.js       # Business Logic
│   └── redisClient.js     # Redis Connection Wrapper
├── k6/
│   ├── test.js            # Load Test Script
└── README.md

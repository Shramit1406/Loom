# BLE Mesh Network Backend Integration Guide

## 🔋 Understanding the Bluetooth Mesh (For Backend Developers)

Your backend doesn't handle the BLE mesh directly — it's handled **on the mobile devices**. But you need to understand it to build the backend properly.

---

## 📡 What is BLE Mesh?

**BLE Mesh = Walkie-talkie network between phones**

```
Phone A (User)  ◄─────BLE─────► Phone B (Police)
  │                              │
  └────────────────────┬─────────┘
                       │
                    Phone C (Another user)
                       │
                    (can relay messages through network)
```

Each phone:
- **Advertises itself** (tells others "I'm here")
- **Scans for others** (listens for nearby phones)
- **Relays messages** (passes messages from other phones)
- **Keeps messages alive** using TTL (Time-To-Live)

---

## 🚨 How SOS Flows Through the Mesh

### Scenario: User in dead zone sends SOS

```
PHONE A (User)               PHONE B (Driver nearby)      PHONE C (Police far away)
  │                                │                             │
  │ Press SOS button               │                             │
  │ Create packet:                 │                             │
  │ - Message ID: "MSG_1234"       │                             │
  │ - TTL: 5                       │                             │
  │ - Sender: USER_A               │                             │
  │ - Lat/Lon: 28.5355, 77.3910   │                             │
  │ - Hop path: [USER_A]           │                             │
  │                                │                             │
  ├─────BLE Broadcast─────────────►│                             │
  │                                │ Relay!                      │
  │                                ├───BLE Broadcast────────────►│
  │                                │ - TTL: 4 (decremented)      │
  │                                │ - Hop path: [USER_A, DRIVER_B]
  │                                │                             │
  │                                │                             │ Police receives!
  │                                │                             │ If online: Send to backend
  │                                │                             │ (BLE doesn't do this part)
```

### The Backend Part (What You Handle)

```
PHONE C (Police with internet)
│
├─ BLE receives SOS from Phone B
├─ Recognizes it's police role
├─ Makes HTTP call to backend:
│
│  POST /sos/report {
│    sender: "USER_A",
│    lat: 28.5355,
│    lon: 77.3910,
│    ttl: 4,
│    hopPath: ["USER_A", "DRIVER_B"],
│    meshNodeId: "MSG_1234"
│  }
│
└─ Backend stores this for dashboard display
```

---

## 📦 What is an SOS Packet?

**Binary packet structure** (what phones send via BLE):

```
┌─────────────────────────────────────────────────┐
│ PACKET HEADER (13 bytes)                        │
├────┬─────────┬─────────┬──────┬────┬───────────┤
│ PH │Message │Sender ID(4 bytes)│TTL │Checksum │
│ 1  │ ID (2) │                  │ 1  │  1      │
├─────for example:──────────────────────────────┤
│ 0x01 │ MSG_1234 │ USER_ABC │ 5 │ XXX │
└─────────────────────────────────────────────────┘
     Packet Type        (TTL)   (Hops left)
     0x01 = SOS Alert
     0x02 = Acknowledgement
     0x03 = Heartbeat
     0x04 = Police Beacon

┌──────────────────────────────────┐
│ PAYLOAD (variable length)        │
├──────────────────────────────────┤
│ GPS: lat (8) + lon (8)           │
│ Timestamp (4 bytes)              │
│ Emergency reason/notes           │
└──────────────────────────────────┘
```

**Key Points:**
- `0x01` = SOS emergency signal
- `0x02` = Police acknowledges they're helping
- `0x03` = "I'm alive" heartbeat (peer discovery)
- `0x04` = "Police here" announcement
- **TTL**: Starts at 5, decrements with each relay. When 0, packet dies.
- **Message ID**: Prevents duplicates (if phone gets MSG_1234 twice, ignores 2nd)

---

## 🔄 Backend Receives SOS - What Happens?

### When Police Phone Gets SOS (via BLE mesh), It Calls:

```javascript
POST /sos/report

Body:
{
  "userId": "USER_ABC123",        // Who sent it
  "latitude": 28.5355,
  "longitude": 77.3910,
  "nodeId": "USER_ABC123",        // BLE mesh node ID
  "meshNodePath": [               // Route it took
    "USER_ABC123",                // Started here
    "DRIVER_XYZ789",              // Relayed through driver
    "POLICE_OMEGA111"             // Reached police phone
  ],
  "ttl": 3,                       // TTL remaining
  "messageId": "MSG_1234567"      // Unique ID (prevents duplicates)
}

Response:
{
  "status": "received",
  "sosId": "sos_uuid_9876",
  "timestamp": "2026-03-26T10:30:00Z"
}
```

### Backend Stores This:

```sql
INSERT INTO sos_alerts (
  id, sender_id, latitude, longitude, 
  hop_path, ttl, message_id, status, created_at
) VALUES (
  'sos_uuid_9876',
  'USER_ABC123',
  28.5355,
  77.3910,
  ARRAY['USER_ABC123', 'DRIVER_XYZ789', 'POLICE_OMEGA111'],
  3,
  'MSG_1234567',
  'active',
  NOW()
);
```

### Backend's Job Now:

1. **✅ Deduplication** - If it receives the same `messageId` again, ignore it
   ```javascript
   // Check if already stored
   const existing = await db.query(
     'SELECT id FROM sos_alerts WHERE message_id = $1',
     [messageId]
   );
   if (existing.rows.length > 0) return; // Duplicate, ignore
   ```

2. **✅ Store for audit** - Keep record forever (GDPR compliant with deletion policy)

3. **✅ Notify police dashboard** - Send to WebSocket for real-time update
   ```javascript
   io.emit('new_sos', {
     sosId: 'sos_uuid_9876',
     lat: 28.5355,
     lon: 77.3910,
     sender: 'USER_ABC123'
   });
   ```

4. **✅ Store location** - Update location_history table
   ```sql
   INSERT INTO location_history (
     user_id, latitude, longitude, recorded_at
   ) VALUES ('USER_ABC123', 28.5355, 77.3910, NOW());
   ```

5. **❌ DO NOT** - Send another HTTP request (BLE mesh handles routing, not backend)

---

## 📊 Multi-Hop Example

### Scenario: 3-hop relay to reach police

```
Situation:
- User A (28.5355, 77.3910) presses SOS
- User A has NO internet (emergency!)
- User A CAN connect to nearby Driver B via BLE
- Driver B CAN connect to Police C via BLE
- Police C HAS internet

Network:
┌────────────┐        ┌────────────┐        ┌────────────┐
│  USER A    │        │  DRIVER B  │        │  POLICE C  │
│ (No wifi)  │        │ (Has BLE)  │        │ (Has inet) │
└─────┬──────┘        └─────┬──────┘        └─────┬──────┘
      │                     │                     │
      └─File SOS───────────►│                     │
      (TTL=5)               │                     │
                    TTL: 4  │                     │
                    ├───Relay SOS──────────────►│
                            │                   Http POST
                            └──────────────POST to backend
```

### Hop-by-hop:

**Step 1: USER A creates packet**
```
Packet = {
  type: 0x01 (SOS),
  sender: USER_A,
  message_id: MSG_1001,
  ttl: 5,
  hop_path: [USER_A],
  lat: 28.5355,
  lon: 77.3910
}
```

**Step 2: DRIVER B relays**
```
DRIVER B receives via BLE:
- Checks: "Is this my node ID?" NO
- Checks: "Am I in the hop_path?" NO
- Checks: "TTL > 0?" YES (5 > 0)
- Action: Relay!

New packet = {
  type: 0x01,
  sender: USER_A,
  message_id: MSG_1001,  // SAME ID (no duplicate)
  ttl: 4,                // ← DECREMENTED
  hop_path: [USER_A, DRIVER_B],  // ← Added self
  lat: 28.5355,
  lon: 77.3910
}

DRIVER B broadcasts this to all connected peers
```

**Step 3: POLICE C receives & sends to backend**
```
POLICE C receives via BLE:
- Checks hop_path: I'm NOT in it ✓
- Checks TTL: 4 > 0 ✓
- Checks message_id: Haven't seen MSG_1001 before ✓
- Checks: "Am I police?" YES
- Action: 
  1. Add to local inbox (show on UI)
  2. Check: "Do I have internet?" YES
  3. Send to backend:

POST /sos/report {
  userId: USER_A,
  lat: 28.5355,
  lon: 77.3910,
  messageId: MSG_1001,
  meshNodePath: [USER_A, DRIVER_B, POLICE_C],
  ttl: 4
}

Backend receives & stores:
- Dedup check: MSG_1001 not seen before ✓
- Store to DB ✓
- Update police dashboard ✓
```

**Step 4: Maximum hops reached**
```
If a 6th device receives the packet:
TTL would be: 5→4→3→2→1→0

At TTL=1, next relay would make TTL=0
Packet dies, not relayed further
```

---

## 🚫 Common Mistakes (Avoid These)

### ❌ Mistake 1: Backend tries to relay SOS
**WRONG:**
```javascript
// DON'T do this!
POST /sos/report → Backend → sends HTTP to other police phones
```
**WHY**: BLE mesh already handles routing. You'd double-send and waste bandwidth.

**RIGHT**: Backend just stores & displays on dashboard

---

### ❌ Mistake 2: Treating mesh like traditional API
**WRONG:**
```javascript
// "Let me ask backend to relay to next hop"
Phone A → Backend → Backend tells Phone B
```
**WHY**: Network might be down. Entire point of BLE mesh is offline capability.

**RIGHT**: BLE mesh handles routing peer-to-peer. Backend is read-only archive.

---

### ❌ Mistake 3: Not deduplicating
**WRONG:**
```javascript
// Store every packet received
POST /sos/report {messageId: MSG_1001}  // First time
POST /sos/report {messageId: MSG_1001}  // Same packet relayed from another device
→ Database has 2 entries for same emergency!
```

**RIGHT:**
```javascript
// Check if messageId exists
const exists = await db.query(
  'SELECT id FROM sos_alerts WHERE message_id = $1',
  [messageId]
);
if (exists.rows.length > 0) {
  return 400; // Skip duplicate
}
```

---

### ❌ Mistake 4: Waiting for internet to send SOS
**WRONG:**
```kotlin
// In app code (but you need to understand this)
if (hasInternet) {
  sendSOSToBackend() // ← Only if online
}
```
**WHY**: User might be in dead zone!

**RIGHT:**
```kotlin
// Always send via BLE mesh (offline works)
meshManager.sendSOS(...)

// If online, relay to backend too
if (hasInternet) {
  backendPresenceOfMindCall()
}
```

---

## 🔌 Backend Endpoints for BLE Mesh Events

### Endpoint 1: Receive SOS (When police has internet)

```javascript
/**
 * POST /sos/report
 * 
 * Called by: Police phone (when receives SOS via BLE mesh)
 * Purpose: Archive SOS to backend for dashboard + history
 */

router.post('/sos/report', authenticate, async (req, res) => {
  const {
    userId,           // Who sent it (USER_ABC123)
    latitude,         // GPS location
    longitude,
    meshNodePath,     // Relay path: [USER_ABC, DRIVER_XYZ]
    messageId,        // Unique ID of this SOS
    ttl              // TTL remaining
  } = req.body;

  // CRITICAL: Deduplication
  const existing = await db.query(
    'SELECT id FROM sos_alerts WHERE message_id = $1',
    [messageId]
  );

  if (existing.rows.length > 0) {
    return res.status(200).json({ 
      status: 'duplicate',
      message: 'SOS already recorded'
    });
  }

  // Store new SOS
  const result = await db.query(
    `INSERT INTO sos_alerts 
     (sender_id, latitude, longitude, hop_path, ttl, message_id, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW())
     RETURNING id`,
    [userId, latitude, longitude, meshNodePath, ttl, messageId]
  );

  const sosId = result.rows[0].id;

  // Broadcast to police dashboard via WebSocket
  io.emit('new_sos_incident', {
    sosId,
    userId,
    lat: latitude,
    lon: longitude,
    relayedBy: meshNodePath[meshNodePath.length - 1],
    timestamp: new Date()
  });

  res.json({ status: 'received', sosId });
});
```

---

### Endpoint 2: Get SOS Incidents (For Police Dashboard)

```javascript
/**
 * GET /sos/incidents
 * 
 * Called by: Police web dashboard
 * Purpose: Get all active SOS on map
 */

router.get('/sos/incidents', authenticate, requirePoliceRole, async (req, res) => {
  const incidents = await db.query(
    `SELECT id, sender_id, latitude, longitude, hop_path, ttl, 
            message_id, created_at, status
     FROM sos_alerts
     WHERE status = 'active'
     ORDER BY created_at DESC`
  );

  res.json({
    count: incidents.rows.length,
    incidents: incidents.rows.map(row => ({
      sosId: row.id,
      sender: row.sender_id,
      location: {
        lat: row.latitude,
        lon: row.longitude
      },
      relayPath: row.hop_path,
      recoveryHops: row.ttl,
      reportedAt: row.created_at
    }))
  });
});
```

---

### Endpoint 3: Police Acknowledges SOS

```javascript
/**
 * PUT /sos/incidents/:sosId/acknowledge
 * 
 * Called by: Police web dashboard
 * Purpose: Mark SOS as "we're responding"
 */

router.put('/sos/incidents/:sosId/acknowledge', authenticate, async (req, res) => {
  const { sosId } = req.params;

  await db.query(
    `UPDATE sos_alerts 
     SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $1
     WHERE id = $2`,
    [req.user.id, sosId]
  );

  // Broadcast update to dashboard
  io.emit('sos_acknowledged', { sosId });

  res.json({ status: 'acknowledged' });
});
```

---

## 📊 Database Queries for BLE Mesh Data

### Query 1: Find all SOS from a user (audit trail)

```sql
SELECT id, latitude, longitude, hop_path, ttl, 
       created_at, status
FROM sos_alerts
WHERE sender_id = 'USER_ABC123'
ORDER BY created_at DESC;
```

Output:
```
id          | latitude | longitude | hop_path                      | ttl | created_at
sos_001     | 28.5355  | 77.3910   | {USER_ABC123, DRIVER_XYZ789} | 4   | 2026-03-26 10:30
sos_002     | 28.5360  | 77.3915   | {USER_ABC123}                | 5   | 2026-03-26 10:35
```

---

### Query 2: Find incidents relayed most (who helps most?)

```sql
SELECT sender_id, COUNT(*) as sos_count, 
       ARRAY_AGG(DISTINCT hop_path[1]) as helped_relay_of
FROM sos_alerts
WHERE LENGTH(hop_path) > 1  -- Was relayed
GROUP BY sender_id
ORDER BY sos_count DESC
LIMIT 10;
```

This shows: "User DRIVER_XYZ helped relay 15 SOSs"

---

### Query 3: Map view - all active SOS in last 1 hour

```sql
SELECT id, latitude, longitude, status, created_at, sender_id
FROM sos_alerts
WHERE status IN ('active', 'acknowledged')
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

Result shows 10 red pins on police dashboard map.

---

## 🔄 Full Sequence Diagram

```
User Phone (offline)          Driver Phone            Police Phone (online)       Backend
    │                              │                        │                       │
    ├─ User presses SOS ──────────►│                        │                       │
    │  (TTL=5, MSG_1001)           │                        │                       │
    │                              │                        │                       │
    │                              ├─ Relays to Police ───►│                       │
    │                              │  (TTL=4, MSG_1001)    │                       │
    │                              │                       │                       │
    │                              │                       ├─ POST /sos/report ───►│
    │                              │                       │  (archive SOS)        │
    │                              │                       │                       ├─ Dedup check
    │                              │                       │                       ├─ Store to DB
    │                              │                       │◄────────────────────┤
    │                              │                       │  {sosId: uuid}      │
    │                              │                       │                       ├─ Emit WebSocket
    │                              │                       │                       │  to dashboard
    │                              │                       │                       │
    │                              │                       │ Police opens dashboard┤
    │                              │                       │ and sees SOS on map   │
    │                              │                       │ ← Gets /sos/incidents│
    │                              │                       │◄────────────────────┤
    │                              │                       │ [sosData for map]    │
```

---

## 🎯 What Backend Does vs. Doesn't Do

| Function | Who Handles | Backend's Role |
|----------|-------------|----------------|
| Create SOS packet | Mobile App | — |
| Route via BLE mesh | Mobile App (P2P) | — |
| Relay to next device | Mobile App (BLE) | — |
| Archive for audit | Backend | ✅ Store messsage |
| Display on map | Police Dashboard | ✅ Provide data |
| Respond to emergency | Police (manual) | ✅ Log response |
| Calculate recovery route | Maps API | ✅ Call API |
| Send updates to police | Backend | ✅ WebSocket |

---

## ✅ You're Ready When:

1. ✅ You understand TTL decrements at each hop
2. ✅ You understand message deduplication (same messageId = same SOS)
3. ✅ You understand backend is **archival only** (not routing)
4. ✅ You can write query to find all SOS from User ABC
5. ✅ You can write endpoint to store SOS + broadcast to dashboard
6. ✅ You can explain why backend should NOT send HTTP to other phones

---

**Next Step**: Build the `/sos/report` endpoint first. That's your foundation.

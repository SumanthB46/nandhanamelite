# Nandhanam Elite - Google Sheets & Google Apps Script Setup Guide (v2)

This guide walks you through setting up the enterprise-grade Google Sheets database and Google Apps Script API layer for **Nandhanam Elite Tourist Home**.

---

## 1. Google Sheets Architecture

The system uses 3 synchronized sheets with permanent audit snapshots:

### Sheet 1: `Rooms` (Option A: Physical Units)
| Column | Description | Example |
| :--- | :--- | :--- |
| `room_id` | Unique physical room code | `R001` |
| `room_name` | Room title displayed to guests | `AC Luxury Room` |
| `description` | Full room description | `Spacious air-conditioned room...` |
| `price_per_night` | Base rate per night | `2000` |
| `capacity` | Max guests permitted | `2` |
| `amenities` | Comma-separated amenities | `AC, Wi-Fi, Hot Water...` |
| `image_url` | High-resolution photo | `https://...` |
| `status` | Active or Inactive | `Active` |
| `created_at` | Date added | `2026-08-20 14:00:00` |
| `updated_at` | Last price/detail update | `2026-08-20 14:00:00` |

### Sheet 2: `Bookings` (With Price Snapshot & Concurrency Protection)
| Column | Description | Example |
| :--- | :--- | :--- |
| `booking_id` | Unique atomic ID | `BK-20260820-4182` |
| `room_id` | Reserved room code | `R001` |
| `room_name` | Room name at booking time | `AC Luxury Room` |
| `guest_name` | Full customer name | `Rahul Sharma` |
| `phone` | WhatsApp / Phone number | `+91 98765 43210` |
| `email` | Customer email | `rahul@example.com` |
| `check_in` | Check-in date | `2026-08-25` |
| `check_out` | Check-out date | `2026-08-27` |
| `adults` | Number of adults | `2` |
| `children` | Number of children | `0` |
| `total_guests` | Total guest count | `2` |
| `price_per_night`| **Permanent rate snapshot** | `2000` |
| `total_amount` | **Total stay price snapshot** | `4000` |
| `status` | `Pending`, `Confirmed`, `Cancelled`, `Completed`, `Expired` | `Pending` |
| `notes` | Special guest requests | `Late check-in around 5 PM` |
| `created_at` | Timestamp (Asia/Kolkata) | `2026-08-20 14:35:10` |
| `updated_at` | Timestamp (Asia/Kolkata) | `2026-08-20 14:35:10` |

### Sheet 3: `Settings`
- `property_name`: `Nandhanam Elite Tourist Home`
- `phone`: `+91 94470 00000`
- `whatsapp`: `+91 94470 00000`
- `email`: `nandhanamelite@gmail.com`
- `timezone`: `Asia/Kolkata`
- `pending_expiry_hours`: `24`
- `check_in_time`: `2:00 PM`
- `check_out_time`: `11:00 AM`

---

## 2. Step-by-Step Setup

### Step 1: Create Spreadsheet
1. Open [Google Sheets](https://sheets.google.com) and create a new sheet named **`Nandhanam Elite Booking Database`**.

### Step 2: Paste Google Apps Script
1. In Google Sheets, click **Extensions** > **Apps Script**.
2. Replace all content in `Code.gs` with the code from [`google_apps_script.js`](./google_apps_script.js).
3. Save the script (`Ctrl + S`).

### Step 3: Run Initial One-Click Auto-Setup
1. In the Apps Script toolbar dropdown, choose **`initialSetup`** and click **Run**.
2. Grant authorization permissions when prompted.
3. Switch back to your Google Sheet: all 3 tabs (`Rooms`, `Bookings`, `Settings`) will be created and formatted with gold styling and initial active room listings.

### Step 4: Deploy as Web App API
1. Click **Deploy** (top right) > **New deployment**.
2. Select type: **Web app**.
3. Configuration:
   - **Description**: `Nandhanam Elite Booking Engine API v2`
   - **Execute as**: `Me (your-email@gmail.com)`
   - **Who has access**: `Anyone` *(Allows frontend availability queries and booking requests)*
4. Click **Deploy** and copy your **Web App URL**.

### Step 5: Link to Frontend
1. Open [`script.js`](./script.js).
2. Set `APPS_SCRIPT_URL` to your copied Web App URL:
   ```javascript
   const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
   ```

---

## 3. How Concurrency & Rules Work

- **Atomic Lock (`LockService`)**: When a guest submits a booking, the script acquires a script lock for up to 15 seconds. It reads current bookings, checks date overlaps, snapshots the current room price from the `Rooms` sheet, generates `BK-YYYYMMDD-XXXX`, appends the row, and releases the lock. Two concurrent guests can never double-book the same room.
- **Pending Blocks Availability**: `Pending` and `Confirmed` reservations block date overlaps.
- **Pending Expiration**: If a `Pending` request is left unconfirmed for longer than 24 hours, it is treated as expired, automatically freeing the dates for other customers.
- **Early Checkout**: When a customer checks out early, simply edit the `check_out` date in the `Bookings` sheet. The room immediately becomes available from that date forward.
- **Cancellation**: Set `status` to `Cancelled`. The row is kept for audit history and the room is immediately released.

---

## 4. Stay Owner Workflow & WhatsApp Confirmation Process

### The Business Flow:
1. **Website Request**: Customer fills the form & receives **Booking Request Received** screen with ID `BK-YYYYMMDD-XXXX`.
2. **Pending Hold**: The room is immediately held under `Pending` in the Google Sheet (blocking overlapping searches).
3. **Owner WhatsApp Outreach**: The owner receives the request (via Sheet / Customer WhatsApp message) and sends payment instructions:
   ```
   Hello [Guest Name], thank you for your booking request (ID: BK-20260820-XXXX) at Nandhanam Elite Tourist Home!
   To confirm your reservation, please pay the total amount of ₹[Total Amount] via UPI: [your-upi-id@okaxis] or scan our QR code.
   ```
4. **Payment Verification**: Once the customer completes payment, the owner changes `status` in the `Bookings` sheet from **`Pending`** to **`Confirmed`**.
5. **Official Booking Confirmation Sent via WhatsApp**: The owner sends the final confirmation to the customer:
   ```
   Booking Confirmed ✅
   Nandhanam Elite Tourist Home
   ----------------------------------------
   Booking ID: BK-20260820-XXXX
   Room: AC Luxury Room
   Check-in: 25 Aug 2026 (From 2:00 PM)
   Check-out: 28 Aug 2026 (Until 11:00 AM)
   Guests: 2 Adults
   ----------------------------------------
   Payment received successfully.
   Your room has been confirmed and allocated!
   📍 Location: Kaithakod Junction, Vengalloor Bypass, Thodupuzha
   📞 Contact: +91 94470 00000
   We look forward to hosting you!
   ```

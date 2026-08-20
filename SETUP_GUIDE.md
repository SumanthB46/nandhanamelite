# Nandhanam Elite - Google Sheets & Google Apps Script Setup Guide

This guide explains how to set up the Google Sheets database and Google Apps Script API layer for the Nandhanam Elite Homestay booking website.

---

## Step 1: Create a Google Sheet

1. Open [Google Sheets](https://sheets.google.com) and create a **New Blank Spreadsheet**.
2. Rename the spreadsheet to: `Nandhanam Elite Booking Database`.

---

## Step 2: Add Google Apps Script Code

1. In your Google Sheet menu bar, click on **Extensions** > **Apps Script**.
2. Replace everything in the script editor (`Code.gs`) with the contents of the [`google_apps_script.js`](./google_apps_script.js) file from this repository.
3. Click the **Save** icon (diskette) or press `Ctrl + S`.

---

## Step 3: Run Initial Setup (One-Click Database Creation)

1. In the Apps Script toolbar dropdown (next to "Debug"), select the function **`initialSetup`**.
2. Click **Run**.
3. Google will ask for **Authorization**:
   - Click *Review Permissions* -> Select your Google account -> Click *Advanced* -> Click *Go to Nandhanam Elite (unsafe)* -> Click *Allow*.
4. Switch back to your Google Sheet tab. You will see 3 pre-formatted tabs created automatically:
   - **`Rooms`**: Contains room ID, room name, price, capacity, status, and description.
   - **`Bookings`**: Holds customer booking records, check-in/out dates, status (`Pending`, `Confirmed`, `Cancelled`, `Completed`), and notes.
   - **`Settings`**: Holds property contact information, check-in/out times, and property details.

---

## Step 4: Deploy as a Public Web App API

1. In the Apps Script editor, click the blue **Deploy** button (top right) -> **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in the deployment details:
   - **Description**: `Nandhanam Elite Booking Engine API v1`
   - **Execute as**: `Me (your-email@gmail.com)`
   - **Who has access**: `Anyone` *(Crucial: allows the public website to check availability & submit bookings)*
4. Click **Deploy**.
5. Copy the **Web App URL** (it looks like `https://script.google.com/macros/s/AKfycb.../exec`).

---

## Step 5: Connect to the Frontend Website

1. Open [`script.js`](./script.js) in your website code.
2. Near the top of the file, paste your Web App URL into the `APPS_SCRIPT_URL` variable:
   ```javascript
   const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
   ```
3. Save the file. Your website is now live-connected to Google Sheets!

---

## How Availability and Double-Booking Prevention Work

- **Availability Engine**:
  When a guest selects dates, the script calculates:
  $$\text{Is Overlapping} = (\text{Check-in} < \text{Existing Check-out}) \text{ AND } (\text{Check-out} > \text{Existing Check-in})$$
- **Atomic Locking**:
  When submitting a booking, Apps Script obtains a server-side lock (`LockService.getScriptLock()`), re-verifies availability immediately before writing to the Sheet, appends the row, generates a unique Booking ID (e.g. `NE-202608-4182`), and releases the lock.
- **Early Vacating**:
  If a guest vacates early (e.g., booked until 30th Aug, leaves on 28th Aug), simply change the `check_out` date in the `Bookings` sheet to `2026-08-28`. The room instantly becomes available for other guests starting from 28th Aug.
- **Cancellation**:
  Change the `status` column from `Pending` or `Confirmed` to `Cancelled`. The room is immediately freed up for booking.

# 🏨 Nandhanam Elite Tourist Home - Stay Owner Control Panel Guide

Welcome to your homestay management guide! 

You **do not need any coding knowledge** or access to hosting servers to run your website. Your private **Google Sheet** is your live, real-time control panel. Whenever you update values in Google Sheets, the website reflects those changes automatically!

---

## 🗺️ How It Works (The Control Panel Flow)

```
STAY OWNER
    │
    ▼ (Edit cells in Google Sheets)
PRIVATE GOOGLE SHEET
    ├── Tab 1: Rooms (Prices, Photos, Availability)
    ├── Tab 2: Bookings (Reservations, Guest Info, Status)
    └── Tab 3: Settings (Phone, WhatsApp, Address, Times)
    │
    ▼ (Syncs automatically via Google Apps Script)
PUBLIC WEBSITE
```

---

## 🛏️ 1. Managing Rooms (Prices, Availability & Details)

Open your Google Sheet and click on the **`Rooms`** tab.

### A. How to Change a Room Price
1. Find the room row (e.g., `R001` - AC Luxury Room).
2. Click on the **`price_per_night`** column.
3. Type the new price (e.g., change `2000` to `2500`).
4. **Done!** The website will immediately calculate stay quotes and availability using ₹2,500/night for all new searches.
   > **Note:** Existing past bookings in the `Bookings` tab will keep their original booked price. Changing room rates never alters past customer records.

### B. How to Temporarily Block/Disable a Room (Maintenance or Offline Walk-In)
1. Find the room row.
2. Under the **`status`** column, change `Active` to **`Inactive`**.
3. **Done!** The room will no longer appear on the website and customers cannot book it.
4. When maintenance is done, change `Inactive` back to **`Active`** to reopen bookings.

### C. How to Add a New Room (e.g., 4th Room)
Simply add a new row at the bottom of the `Rooms` tab:
* **`room_id`**: `R004` (must be unique)
* **`room_name`**: `Deluxe Twin Bedroom`
* **`description`**: `Spacious twin bedroom with air conditioning and modern attached bathroom.`
* **`price_per_night`**: `2200`
* **`capacity`**: `2`
* **`amenities`**: `Air Conditioning, Twin Beds, Attached Bathroom, 24/7 Hot Water, Wi-Fi`
* **`image_url`**: `https://... (Direct photo link)`
* **`status`**: `Active`
* **`created_at`**: Today's date/time
* **`updated_at`**: Today's date/time

The new room will automatically appear on the website!

---

## 📋 2. Managing Bookings & Verifying Payments

Open your Google Sheet and click on the **`Bookings`** tab.

### The Complete Customer Flow:
1. **Guest Request**: Customer selects dates on the website and submits a reservation request.
2. **Pending State**: The booking appears in your `Bookings` tab with status **`Pending`**. The room is held for 5 minutes.
3. **WhatsApp Contact**: Customer contacts you on WhatsApp with their Booking ID (e.g., `BK-20260821-3RX2YG4X`).
4. **Payment**: You share your UPI ID or QR code.
5. **Confirmation**: Customer transfers payment and sends a screenshot.
6. **Owner Verifies**: You verify funds in your bank/UPI app.
7. **Mark Confirmed / Done**: In the `Bookings` tab, click the dropdown in the `status` column and change **`Pending`** to **`Confirmed`** (or **`Done`**).
8. **WhatsApp Reply**: Reply to the customer with:
   > *"Payment received and verified! Your booking (BK-20260821-3RX2YG4X) for AC Luxury Room is CONFIRMED. Check-in: 25-Aug-2026 at 2:00 PM. We look forward to hosting you!"*

### Booking Status Dropdown Reference:
| Status in Dropdown | Meaning | Room Availability Impact |
| :--- | :--- | :--- |
| **`Pending`** | Guest just submitted form (awaiting payment) | **Blocks room for 5 minutes** |
| **`Confirmed`** or **`Done`** | Payment verified by stay owner | **Blocks room for full stay dates** |
| **`Expired`** | Guest did not confirm within 5 minutes | **Room released automatically** |
| **`Cancelled`** | Guest cancelled or refund issued | **Room released automatically** |
| **`Completed`** | Guest has checked out and departed | **Kept for audit & income records** |

### How to Handle an Early Check-Out:
* If a guest leaves early, simply change the **`check_out`** date in the `Bookings` tab to today's date. The room instantly becomes available for other guests starting tomorrow!

### How to Handle a Cancellation:
* Change `status` from `Confirmed` to **`Cancelled`**. The room is immediately released for new bookings while preserving the history for your records.

---

## ⚙️ 3. Managing Property Information & Contact Details

Open your Google Sheet and click on the **`Settings`** tab.

| Setting Name | Description | Example Value |
| :--- | :--- | :--- |
| `property_name` | Official title of your tourist home | `Nandhanam Elite Tourist Home` |
| `phone` | Call helpline number | `+91 94470 00000` |
| `whatsapp` | WhatsApp booking number (with country code) | `919447000000` |
| `email` | Customer contact email | `nandhanamelite@gmail.com` |
| `address` | Full physical address for Google Maps & navigation | `Kaithakod Junction, Vengalloor Bypass, Thodupuzha East PO, Pin: 685585` |
| `check_in_time` | Standard guest check-in time | `2:00 PM` |
| `check_out_time`| Standard guest check-out time | `11:00 AM` |
| `pending_expiry_minutes` | Automatic hold duration | `5` |

---

## 💡 Quick Tips for the Stay Owner

1. **Keep the Sheet Private**: Never share the Google Sheet link with guests. Only you and trusted staff should have edit access.
2. **Never Treat WhatsApp as Proof**: Always check your bank/UPI app before changing status from `Pending` to `Confirmed`.
3. **Backup & Safety**: Google Sheets automatically saves your revision history. If you make a mistake, you can always press `Ctrl + Z` or check version history.
4. **Zero Code Needed**: You never need to touch website files, HTML, or JavaScript to run your daily operations!

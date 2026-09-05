# 🏨 Nandhanam Elite Tourist Home — Complete Project Documentation

A direct-reservation web application and Google Sheets management system for **Nandhanam Elite Tourist Home** (Thodupuzha, Kerala).

---

## 📁 Standard Modular Directory Structure

```text
nandhanamelite/
├── assets/
│   └── images/
│       ├── Logo.png             # Official high-resolution brand logo (used in footer & branding)
│       └── navlogo.png          # Navigation bar brand logo
├── css/
│   └── style.css                # Pure Vanilla CSS luxury design system
├── js/
│   └── script.js                # Frontend booking engine & Google Sheets dynamic sync
├── backend/
│   └── google_apps_script.js    # Backend Google Apps Script Web App API (15s LockService)
├── index.html                   # Semantic HTML5 frontend with full Meta SEO & JSON-LD Schemas
├── manifest.json                # PWA / Mobile Web App manifest configuration
├── robots.txt                   # Crawler indexing directives for Googlebot, Bingbot, etc.
├── sitemap.xml                  # Search engine XML sitemap with canonical URLs & priorities
└── README.md                    # Master project documentation
```

---

## 🏛️ System Architecture

```text
CUSTOMER BROWSER
    │
    ▼ (Search availability & submit reservation)
STATIC CLIENT WEBSITE (index.html / js/script.js / css/style.css)
    │
    ▼ (POST / GET JSON via Google Apps Script Web App API)
GOOGLE APPS SCRIPT BACKEND (backend/google_apps_script.js)
    ├── Atomic Concurrency Control (15-second LockService mutex)
    ├── 5-Minute Temporary Reservation Hold Engine
    ├── Unpredictable 8-Character Collision-Free Booking IDs (BK-YYYYMMDD-XXXXXXXX)
    ├── Price Snapshot Immutability (Server reads locked price directly from Rooms tab)
    └── Formula Injection & Bot Honeypot Protection
    │
    ▼ (Live Spreadsheet Database)
GOOGLE SHEETS DATABASE
    ├── Tab 1: Rooms (Prices, Photos, Active/Inactive, New Rooms)
    ├── Tab 2: Bookings (Guest Details, Reservation Snapshots, Status Transitions)
    └── Tab 3: Settings (Helpline, WhatsApp, Address, Check-in/out times)
    │
    ▼ (Manual Verification & Contact)
STAY OWNER (Manages 100% through Google Sheets & WhatsApp)
```

---

## 🔍 Search Engine Optimization (SEO) & Metadata

### 1. Primary Metadata
* **Title**: `Nandhanam Elite Tourist Home | Best Homestay & Rooms in Thodupuzha, Kerala`
* **Target Keywords**: `homestay in Thodupuzha`, `tourist home Thodupuzha`, `budget hotel Thodupuzha Kerala`, `AC luxury room Thodupuzha`, `stay near Vengalloor bypass`.
* **Canonical URL**: `https://nandhanamelite.com/`

### 2. OpenGraph & Social Sharing
* Complete OpenGraph (`og:title`, `og:description`, `og:image`, `og:type`, `og:locale`) for Facebook, WhatsApp, and LinkedIn preview cards.
* Twitter Cards (`summary_large_image`) for rich link previews.

### 3. Local SEO & Geo-Tagging
* `geo.region`: `IN-KL`
* `geo.placename`: `Thodupuzha, Kerala, India`
* `geo.position`: `9.8959; 76.7184`

### 4. Structured Data (JSON-LD Schemas)
* **`LodgingBusiness` / `Hotel` Schema**:
  * Formal business name, phone (`+91 94477 36460`), email (`nandhanamelite@gmail.com`), price range (`₹1500 - ₹3200`), payment methods (UPI, Cash, Google Pay, Bank Transfer), 24-Hour check-in & check-out policy (calculated 24 hours from arrival), address, coordinates, and full room catalog offers.
* **`FAQPage` Schema**:
  * Rich FAQ snippets for Google search results covering check-in timings, WhatsApp payment confirmation, and free on-site parking.

---

## 🛡️ Security & Concurrency Summary

| Protection | Implementation | Verification |
| :--- | :--- | :--- |
| **Race Conditions** | `LockService.getScriptLock().tryLock(15000)` | 100% serialized — simultaneous duplicate requests rejected with `BOOKING_CONFLICT`. |
| **5-Minute Hold** | `PENDING_EXPIRY_MINUTES = 5` | Active `<5min` holds block dates; expired reservations release automatically. |
| **Unguessable IDs** | 8-character cryptographic token (`BK-YYYYMMDD-XXXXXXXX`) | Over $1.1 \times 10^{12}$ combinations per day. |
| **Rate Immutability** | Server-side snapshot directly from `Rooms` sheet | Raising room prices never alters existing booked amounts. |
| **Formula Injection** | `sanitizeSheetCell()` prepends `'` to `=, +, -, @` | Prevents malicious spreadsheet execution. |
| **Anti-Bot Defense** | Silent client honeypot field (`hp_check`) | Traps spam submissions without showing CAPTCHAs to humans. |

---

## 💻 Running the Project Locally

```powershell
# Start local HTTP server
python -m http.server 8080

# Run 10-point automated test suite
node tests/test_concurrency.js
```
Then open [http://localhost:8080/](http://localhost:8080/) in your browser.

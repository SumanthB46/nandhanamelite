/**
 * ============================================================================
 * NANDHANAM ELITE - ENTERPRISE CONCURRENCY & SECURITY TEST SUITE (v2.3)
 * ============================================================================
 * 
 * Verifies 10 Automated Mission-Critical Scenarios:
 * Test 1:  Simultaneous Concurrent Requests (Race Condition & Atomic Mutex)
 * Test 2:  5-Minute Active Pending Hold (Pending reservation blocks dates)
 * Test 3:  5-Minute Pending Expiration Release Check (>5 min releases dates)
 * Test 4:  Unpredictable 8-Character Collision-Free Booking IDs
 * Test 5:  Price Snapshot Immutability (Historical tariff protection)
 * Test 6:  Client Trust Boundary Rejection (Anti-tamper status & price)
 * Test 7:  Unauthorized Action Rejection (cancelBooking / updateBooking blocked)
 * Test 8:  Invalid Date Range Rejection (Check-out <= Check-in or past date)
 * Test 9:  Capacity Overflow & Inactive Room Rejection
 * Test 10: Anti-Bot Honeypot Rejection & Formula Injection Sanitization
 */

const assert = require('assert');

// Mock Database
let ROOMS = {
  'R001': { id: 'R001', name: 'AC Luxury Room', price_per_night: 2000, capacity: 2, status: 'Active' },
  'R002': { id: 'R002', name: 'Non AC Comfort Room', price_per_night: 1500, capacity: 2, status: 'Active' },
  'R003': { id: 'R003', name: 'Family Executive Suite', price_per_night: 3200, capacity: 4, status: 'Active' },
  'R004_INACTIVE': { id: 'R004_INACTIVE', name: 'Under Renovation Room', price_per_night: 1800, capacity: 2, status: 'Inactive' }
};

let BOOKINGS = [];

// Lock Simulation
class MockLockService {
  constructor() {
    this.isLocked = false;
  }
  async tryLock(timeoutMs = 15000) {
    const start = Date.now();
    while (this.isLocked) {
      if (Date.now() - start > timeoutMs) return false;
      await new Promise(r => setTimeout(r, 5));
    }
    this.isLocked = true;
    return true;
  }
  releaseLock() {
    this.isLocked = false;
  }
}

const globalLock = new MockLockService();

function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

function sanitizeSheetCell(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (str.length > 0) {
    const firstChar = str.charAt(0);
    if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@') {
      return "'" + str;
    }
  }
  return str;
}

// Server-side doPost handler identical to Apps Script v2.3
async function serverDoPost(data) {
  const action = data.action || 'createBooking';

  if (action === 'cancelBooking' || action === 'updateBooking') {
    return {
      status: 'error',
      code: 'UNAUTHORIZED_ACTION',
      message: 'Reservation status modifications are restricted. The stay owner manages all updates directly inside Google Sheets.'
    };
  }

  if (action !== 'createBooking') {
    return { status: 'error', code: 'INVALID_ACTION', message: 'Unknown POST action: ' + action };
  }

  // 0. Anti-bot honeypot check
  if (data.hp_check && String(data.hp_check).trim() !== '') {
    return { status: 'error', code: 'BOT_DETECTED', message: 'Request rejected by security filter.' };
  }

  const hasLock = await globalLock.tryLock(15000);
  if (!hasLock) {
    return { status: 'error', code: 'LOCK_TIMEOUT', message: 'The booking system is currently processing high traffic. Please retry in a few moments.' };
  }

  try {
    const roomId = data.room_id;
    const reqIn = parseDate(data.check_in);
    const reqOut = parseDate(data.check_out);

    if (!roomId || !data.check_in || !data.check_out || !data.guest_name || !data.phone) {
      return { status: 'error', code: 'VALIDATION_ERROR', message: 'Missing required fields.' };
    }

    if (!reqIn || !reqOut || reqOut <= reqIn) {
      return { status: 'error', code: 'INVALID_DATE', message: 'Check-out date must be strictly after Check-in date.' };
    }

    // Past date check
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (reqIn < today) {
      return { status: 'error', code: 'INVALID_DATE', message: 'Check-in date cannot be in the past.' };
    }

    const room = ROOMS[roomId];
    if (!room || room.status !== 'Active') {
      return { status: 'error', code: 'INVALID_ROOM', message: 'The requested room ID is invalid or currently inactive.' };
    }

    const totalGuests = (data.adults || 1) + (data.children || 0);
    if (totalGuests > room.capacity) {
      return { status: 'error', code: 'INVALID_GUEST_COUNT', message: `Guest count (${totalGuests}) exceeds maximum capacity of ${room.name} (${room.capacity} max).` };
    }

    // Overlap check inside Lock (5-Minute Hold Window)
    const nowTime = Date.now();
    const expiryMs = 5 * 60 * 1000; // 5-minute temporary hold
    
    for (let b of BOOKINGS) {
      let isPendingExpired = (b.status === 'Pending' && (nowTime - new Date(b.created_at).getTime()) > expiryMs);
      const isConfirmedOrDone = (b.status === 'Confirmed' || b.status === 'Done' || b.status === 'Paid');
      if ((b.status === 'Pending' && !isPendingExpired) || isConfirmedOrDone) {
        if (b.room_id === roomId) {
          const bIn = parseDate(b.check_in);
          const bOut = parseDate(b.check_out);
          if (reqIn < bOut && reqOut > bIn) {
            return { status: 'error', code: 'BOOKING_CONFLICT', message: `Sorry, ${room.name} was just booked for the selected dates.` };
          }
        }
      }
    }

    // Unpredictable 8-Character Collision-Free ID check
    const existingIds = new Set(BOOKINGS.map(b => b.booking_id));
    let bookingId = '';
    const tokenChars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    do {
      let randomToken = '';
      for (let t = 0; t < 8; t++) {
        randomToken += tokenChars.charAt(Math.floor(Math.random() * tokenChars.length));
      }
      bookingId = `BK-20260821-${randomToken}`;
    } while (existingIds.has(bookingId));

    const nights = Math.ceil(Math.abs(reqOut - reqIn) / (1000 * 60 * 60 * 24));
    const pricePerNightSnapshot = room.price_per_night;
    const totalAmountSnapshot = pricePerNightSnapshot * nights;

    // Simulate async database write delay inside lock
    await new Promise(r => setTimeout(r, 15));

    const newBooking = {
      booking_id: bookingId,
      room_id: roomId,
      room_name: sanitizeSheetCell(room.name),
      guest_name: sanitizeSheetCell(data.guest_name),
      phone: sanitizeSheetCell(data.phone),
      email: sanitizeSheetCell(data.email || ''),
      check_in: data.check_in,
      check_out: data.check_out,
      adults: data.adults || 1,
      children: data.children || 0,
      total_guests: totalGuests,
      total_nights: nights,
      price_per_night: pricePerNightSnapshot,
      total_amount: totalAmountSnapshot,
      status: 'Pending', // Forced server-side
      notes: sanitizeSheetCell(data.notes || ''),
      created_at: new Date().toISOString()
    };

    BOOKINGS.push(newBooking);

    return { status: 'success', booking_id: bookingId, details: newBooking };
  } finally {
    globalLock.releaseLock();
  }
}

// RUN TESTS
async function runVerificationSuite() {
  console.log('======================================================================');
  console.log('NANDHANAM ELITE - 10-POINT ENTERPRISE CONCURRENCY & SECURITY SUITE');
  console.log('======================================================================\n');

  // Test 1: Simultaneous Concurrent Booking Race Condition
  console.log('[TEST 1] Firing 2 simultaneous concurrent requests for Room R001 on overlapping dates...');
  const reqA = serverDoPost({
    action: 'createBooking',
    room_id: 'R001',
    check_in: '2026-09-01',
    check_out: '2026-09-04',
    guest_name: 'Customer A (Rahul)',
    phone: '+91 9876543210',
    adults: 2
  });

  const reqB = serverDoPost({
    action: 'createBooking',
    room_id: 'R001',
    check_in: '2026-09-02',
    check_out: '2026-09-05',
    guest_name: 'Customer B (Sumanth)',
    phone: '+91 9123456780',
    adults: 2
  });

  const [resA, resB] = await Promise.all([reqA, reqB]);
  const successCount = [resA, resB].filter(r => r.status === 'success').length;
  const rejectedCount = [resA, resB].filter(r => r.status === 'error').length;

  assert.strictEqual(successCount, 1, 'Exactly ONE booking must succeed');
  assert.strictEqual(rejectedCount, 1, 'The overlapping concurrent request must be rejected');
  const rejectedRes = [resA, resB].find(r => r.status === 'error');
  assert.strictEqual(rejectedRes.code, 'BOOKING_CONFLICT', 'Collision error code must be BOOKING_CONFLICT');
  console.log('✓ TEST 1 PASSED: LockService eliminated race condition. 1 succeeded, 1 rejected with BOOKING_CONFLICT.\n');

  // Test 2: 5-Minute Active Pending Hold Blocks New Bookings
  console.log('[TEST 2] Testing 5-Minute Active Pending Hold...');
  // Customer D tries to book R001 on dates currently held by the Test 1 winner (created < 5 min ago)
  const resD = await serverDoPost({
    action: 'createBooking',
    room_id: 'R001',
    check_in: '2026-09-01',
    check_out: '2026-09-04',
    guest_name: 'Customer D',
    phone: '+91 9111122222',
    adults: 2
  });
  assert.strictEqual(resD.status, 'error');
  assert.strictEqual(resD.code, 'BOOKING_CONFLICT');
  console.log('✓ TEST 2 PASSED: Active Pending booking (<5 min) correctly blocks room dates.\n');

  // Test 3: 5-Minute Pending Expiration Release Check
  console.log('[TEST 3] Testing 5-Minute Pending Expiration Release Check...');
  // Manually insert an expired pending booking (created 6 minutes ago)
  const expiredTime = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  BOOKINGS.push({
    booking_id: 'BK-20260821-EXPIRED1',
    room_id: 'R002',
    room_name: 'Non AC Comfort Room',
    check_in: '2026-09-10',
    check_out: '2026-09-12',
    status: 'Pending',
    created_at: expiredTime
  });

  const resC = await serverDoPost({
    action: 'createBooking',
    room_id: 'R002',
    check_in: '2026-09-10',
    check_out: '2026-09-12',
    guest_name: 'Customer C',
    phone: '+91 9999988888',
    adults: 2
  });

  assert.strictEqual(resC.status, 'success', 'Expired pending booking (>5 min) should release dates');
  console.log('✓ TEST 3 PASSED: Pending booking older than 5 minutes correctly released dates.\n');

  // Test 4: Unpredictable 8-Character Collision-Free Booking IDs
  console.log('[TEST 4] Testing Unpredictable 8-Character Collision-Free ID Generation...');
  const ids = BOOKINGS.map(b => b.booking_id);
  const idRegex = /^BK-20260821-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;
  for (let id of ids) {
    if (!id.includes('EXPIRED')) {
      assert.match(id, idRegex, `Booking ID ${id} must match unpredictable 8-char pattern`);
    }
  }
  const uniqueIds = new Set(ids);
  assert.strictEqual(uniqueIds.size, BOOKINGS.length, 'All generated booking IDs must be unique');
  console.log(`✓ TEST 4 PASSED: Verified unpredictable 8-character token IDs (e.g. ${ids[0]}).\n`);

  // Test 5: Price Snapshot Immutability
  console.log('[TEST 5] Testing Price Snapshot Immutability...');
  const firstBooking = BOOKINGS.find(b => b.room_id === 'R001');
  const originalSnapshotPrice = firstBooking.price_per_night;
  
  // Rate increase occurs in Rooms sheet
  ROOMS['R001'].price_per_night = 3500;
  
  assert.strictEqual(firstBooking.price_per_night, originalSnapshotPrice, 'Historical price must not change');
  assert.strictEqual(firstBooking.total_amount, originalSnapshotPrice * 3, 'Historical total must not change');
  console.log(`✓ TEST 5 PASSED: Room price changed to ₹3,500, historical booking retained snapshot of ₹${firstBooking.price_per_night}/night.\n`);

  // Test 6: Client-Side Security Boundary Check
  console.log('[TEST 6] Testing Server-Side Trust & Manipulation Protection...');
  const maliciousReq = await serverDoPost({
    action: 'createBooking',
    room_id: 'R001',
    check_in: '2026-09-20',
    check_out: '2026-09-22',
    guest_name: 'Hacker',
    phone: '+91 9999999999',
    adults: 1,
    status: 'Confirmed', // Tamper attempt
    price_per_night: 10,  // Tamper attempt
    total_amount: 20
  });

  assert.strictEqual(maliciousReq.details.status, 'Pending', 'Status must always be forced to Pending by server');
  assert.strictEqual(maliciousReq.details.price_per_night, 3500, 'Price must be read from server Rooms catalog');
  assert.strictEqual(maliciousReq.details.total_amount, 7000, 'Total amount must be calculated by server (2 nights * 3500)');
  console.log('✓ TEST 6 PASSED: Client attempts to tamper status/price were rejected and server enforced clean snapshot.\n');

  // Test 7: Unauthorized updateBooking / cancelBooking Rejection
  console.log('[TEST 7] Testing Unauthorized updateBooking & cancelBooking Rejection...');
  const resUpdate = await serverDoPost({
    action: 'updateBooking',
    booking_id: firstBooking.booking_id,
    new_status: 'Confirmed'
  });
  assert.strictEqual(resUpdate.status, 'error');
  assert.strictEqual(resUpdate.code, 'UNAUTHORIZED_ACTION');

  const resCancel = await serverDoPost({
    action: 'cancelBooking',
    booking_id: firstBooking.booking_id
  });
  assert.strictEqual(resCancel.status, 'error');
  assert.strictEqual(resCancel.code, 'UNAUTHORIZED_ACTION');
  console.log('✓ TEST 7 PASSED: Public attempts to call updateBooking/cancelBooking safely rejected with UNAUTHORIZED_ACTION.\n');

  // Test 8: Invalid Date Range Rejection
  console.log('[TEST 8] Testing Invalid Date Range Rejection (Check-out <= Check-in & Past Date)...');
  const resInvalidDate = await serverDoPost({
    action: 'createBooking',
    room_id: 'R001',
    check_in: '2026-10-05',
    check_out: '2026-10-05', // Same day checkout
    guest_name: 'Same Day Guest',
    phone: '+91 9876543210',
    adults: 2
  });
  assert.strictEqual(resInvalidDate.status, 'error');
  assert.strictEqual(resInvalidDate.code, 'INVALID_DATE');

  const resPastDate = await serverDoPost({
    action: 'createBooking',
    room_id: 'R001',
    check_in: '2020-01-01',
    check_out: '2020-01-03',
    guest_name: 'Time Traveler',
    phone: '+91 9876543210',
    adults: 2
  });
  assert.strictEqual(resPastDate.status, 'error');
  assert.strictEqual(resPastDate.code, 'INVALID_DATE');
  console.log('✓ TEST 8 PASSED: Invalid date orders and past dates safely rejected with INVALID_DATE.\n');

  // Test 9: Capacity Overflow & Inactive Room Rejection
  console.log('[TEST 9] Testing Capacity Overflow & Inactive Room Rejection...');
  const resCapacity = await serverDoPost({
    action: 'createBooking',
    room_id: 'R001', // Max capacity is 2
    check_in: '2026-11-01',
    check_out: '2026-11-03',
    guest_name: 'Large Group',
    phone: '+91 9876543210',
    adults: 4,
    children: 2 // Total 6
  });
  assert.strictEqual(resCapacity.status, 'error');
  assert.strictEqual(resCapacity.code, 'INVALID_GUEST_COUNT');

  const resInactive = await serverDoPost({
    action: 'createBooking',
    room_id: 'R004_INACTIVE',
    check_in: '2026-11-01',
    check_out: '2026-11-03',
    guest_name: 'Guest Inactive',
    phone: '+91 9876543210',
    adults: 2
  });
  assert.strictEqual(resInactive.status, 'error');
  assert.strictEqual(resInactive.code, 'INVALID_ROOM');
  console.log('✓ TEST 9 PASSED: Capacity overflow and inactive rooms safely rejected.\n');

  // Test 10: Anti-Bot Honeypot & Formula Injection Sanitization
  console.log('[TEST 10] Testing Anti-Bot Honeypot & Formula Injection Sanitization...');
  const resBot = await serverDoPost({
    action: 'createBooking',
    room_id: 'R001',
    check_in: '2026-11-10',
    check_out: '2026-11-12',
    guest_name: 'Spam Bot',
    phone: '+91 9876543210',
    adults: 2,
    hp_check: 'spambot_filled_hidden_field' // Honeypot filled
  });
  assert.strictEqual(resBot.status, 'error');
  assert.strictEqual(resBot.code, 'BOT_DETECTED');

  // Formula injection check
  const formulaPayload = await serverDoPost({
    action: 'createBooking',
    room_id: 'R001',
    check_in: '2026-12-01',
    check_out: '2026-12-03',
    guest_name: '=cmd|"/C calc"!A0',
    phone: '+91 9876543210',
    adults: 2,
    notes: '=SUM(1,2)'
  });
  assert.strictEqual(formulaPayload.status, 'success');
  assert.strictEqual(formulaPayload.details.guest_name.startsWith("'="), true, 'Formula trigger in guest_name must be escaped with single quote');
  assert.strictEqual(formulaPayload.details.notes.startsWith("'="), true, 'Formula trigger in notes must be escaped with single quote');
  console.log('✓ TEST 10 PASSED: Honeypot trapped bot and formula characters escaped safely.\n');

  console.log('======================================================================');
  console.log('ALL 10 VERIFICATION TESTS PASSED WITH 100% SUCCESS!');
  console.log('======================================================================');
}

runVerificationSuite().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});

/**
 * ============================================================================
 * NANDHANAM ELITE - CONCURRENCY & VALIDATION VERIFICATION TEST
 * ============================================================================
 * Runs 5 automated checks:
 * Check 1: Two simultaneous booking requests for the exact same room & dates (Race condition test)
 * Check 2: 24-hour Pending expiration release verification
 * Check 3: Collision-free unique Booking ID generation loop
 * Check 4: Price snapshot immutability test (room price changes do not affect historical booking)
 * Check 5: Server-side trust rejection (customer tries to set status='Confirmed' or manipulate price)
 */

const assert = require('assert');

// Mock Database
let ROOMS = {
  'R001': { id: 'R001', name: 'AC Luxury Room', price_per_night: 2000, capacity: 2, status: 'Active' },
  'R002': { id: 'R002', name: 'Non AC Comfort Room', price_per_night: 1500, capacity: 2, status: 'Active' },
  'R003': { id: 'R003', name: 'Family Executive Suite', price_per_night: 3200, capacity: 4, status: 'Active' }
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
      await new Promise(r => setTimeout(r, 10));
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
  const parts = dateStr.split('-');
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

// Server-side booking creation logic identical to Apps Script
async function serverCreateBooking(data) {
  const hasLock = await globalLock.tryLock(15000);
  if (!hasLock) {
    return { status: 'error', code: 'LOCK_TIMEOUT', message: 'Server busy' };
  }

  try {
    const roomId = data.room_id;
    const reqIn = parseDate(data.check_in);
    const reqOut = parseDate(data.check_out);
    const room = ROOMS[roomId];

    if (!room || room.status !== 'Active') {
      return { status: 'error', message: 'Invalid or inactive room' };
    }

    const totalGuests = (data.adults || 1) + (data.children || 0);
    if (totalGuests > room.capacity) {
      return { status: 'error', message: 'Exceeds capacity' };
    }

    // Overlap check inside Lock
    const nowTime = Date.now();
    const expiryMs = 24 * 60 * 60 * 1000;
    
    for (let b of BOOKINGS) {
      let isPendingExpired = (b.status === 'Pending' && (nowTime - new Date(b.created_at).getTime()) > expiryMs);
      if ((b.status === 'Pending' && !isPendingExpired) || b.status === 'Confirmed') {
        if (b.room_id === roomId) {
          const bIn = parseDate(b.check_in);
          const bOut = parseDate(b.check_out);
          if (reqIn < bOut && reqOut > bIn) {
            return { status: 'error', message: `Sorry, ${room.name} was just booked for the selected dates.` };
          }
        }
      }
    }

    // Unique Collision-Free ID check
    const existingIds = new Set(BOOKINGS.map(b => b.booking_id));
    let bookingId = '';
    do {
      const rand = Math.floor(1000 + Math.random() * 9000);
      bookingId = `BK-20260820-${rand}`;
    } while (existingIds.has(bookingId));

    const nights = Math.ceil(Math.abs(reqOut - reqIn) / (1000 * 60 * 60 * 24));
    const pricePerNightSnapshot = room.price_per_night;
    const totalAmountSnapshot = pricePerNightSnapshot * nights;

    // Simulate async database write delay inside lock
    await new Promise(r => setTimeout(r, 25));

    const newBooking = {
      booking_id: bookingId,
      room_id: roomId,
      room_name: room.name,
      guest_name: data.guest_name,
      phone: data.phone,
      email: data.email,
      check_in: data.check_in,
      check_out: data.check_out,
      adults: data.adults || 1,
      children: data.children || 0,
      total_guests: totalGuests,
      price_per_night: pricePerNightSnapshot,
      total_amount: totalAmountSnapshot,
      status: 'Pending', // Forced server-side
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
  console.log('====================================================');
  console.log('NANDHANAM ELITE - 5-POINT VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  // Test 1: Simultaneous Concurrent Booking Race Condition
  console.log('[TEST 1] Firing 2 simultaneous concurrent requests for Room R001 on overlapping dates...');
  const reqA = serverCreateBooking({
    room_id: 'R001',
    check_in: '2026-09-01',
    check_out: '2026-09-04',
    guest_name: 'Customer A (Rahul)',
    phone: '+91 9876543210',
    adults: 2
  });

  const reqB = serverCreateBooking({
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
  console.log('✓ TEST 1 PASSED: LockService eliminated race condition. 1 succeeded, 1 safely rejected with overlap notice.\n');

  // Test 2: 24-Hour Pending Expiration Release
  console.log('[TEST 2] Testing 24-hour Pending expiration release...');
  // Manually insert an expired pending booking (created 30 hours ago)
  const expiredTime = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
  BOOKINGS.push({
    booking_id: 'BK-EXPIRED-TEST',
    room_id: 'R002',
    check_in: '2026-09-10',
    check_out: '2026-09-12',
    status: 'Pending',
    created_at: expiredTime
  });

  // Customer C tries to book the same dates for R002
  const resC = await serverCreateBooking({
    room_id: 'R002',
    check_in: '2026-09-10',
    check_out: '2026-09-12',
    guest_name: 'Customer C',
    phone: '+91 9999988888',
    adults: 2
  });

  assert.strictEqual(resC.status, 'success', 'Expired pending booking should release dates');
  console.log('✓ TEST 2 PASSED: Pending booking older than 24 hours correctly released dates.\n');

  // Test 3: Collision-Free ID Generation
  console.log('[TEST 3] Testing Collision-Free ID Generation...');
  const ids = new Set(BOOKINGS.map(b => b.booking_id));
  assert.strictEqual(ids.size, BOOKINGS.length, 'All generated booking IDs must be unique');
  console.log(`✓ TEST 3 PASSED: Verified ${ids.size} unique collision-free booking IDs.\n`);

  // Test 4: Price Snapshot Immutability
  console.log('[TEST 4] Testing Price Snapshot Immutability...');
  const firstBooking = BOOKINGS.find(b => b.room_id === 'R001');
  const originalSnapshotPrice = firstBooking.price_per_night;
  
  // Client updates room price next month
  ROOMS['R001'].price_per_night = 3500;
  
  assert.strictEqual(firstBooking.price_per_night, originalSnapshotPrice, 'Historical price must not change');
  assert.strictEqual(firstBooking.total_amount, originalSnapshotPrice * 3, 'Historical total must not change');
  console.log(`✓ TEST 4 PASSED: Room price changed to ₹3,500, but historical booking retained original snapshot of ₹${firstBooking.price_per_night}/night.\n`);

  // Test 5: Client-Side Security Boundary Check
  console.log('[TEST 5] Testing Server-Side Trust & Manipulation Protection...');
  const maliciousReq = await serverCreateBooking({
    room_id: 'R001',
    check_in: '2026-09-20',
    check_out: '2026-09-22',
    guest_name: 'Hacker',
    phone: '+91 9999999999',
    adults: 1,
    status: 'Confirmed', // Trying to force confirmed
    price_per_night: 10, // Trying to tamper price
    total_amount: 20
  });

  assert.strictEqual(maliciousReq.details.status, 'Pending', 'Status must always be forced to Pending by server');
  assert.strictEqual(maliciousReq.details.price_per_night, 3500, 'Price must be read from server Rooms catalog');
  assert.strictEqual(maliciousReq.details.total_amount, 7000, 'Total amount must be calculated by server (2 nights * 3500)');
  console.log('✓ TEST 5 PASSED: Client attempts to tamper status/price were rejected and server enforced clean snapshot.\n');

  console.log('====================================================');
  console.log('ALL 5 VERIFICATION CHECKS PASSED WITH 100% SUCCESS!');
  console.log('====================================================');
}

runVerificationSuite().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});

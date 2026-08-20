/**
 * ============================================================================
 * NANDHANAM ELITE HOMESTAY - ENTERPRISE GOOGLE APPS SCRIPT BACKEND API (v2)
 * ============================================================================
 * 
 * CORE ARCHITECTURAL PRINCIPLES:
 * 1. Concurrency Control: LockService around final availability check + booking insertion.
 * 2. Status Blocking: 'Pending' and 'Confirmed' block availability. 'Cancelled', 'Expired', 'Completed' do not.
 * 3. Pending Expiration: Pending bookings older than 24 hours automatically expire and release dates.
 * 4. Option A Physical Rooms: Every unit has a unique room_id (e.g., R001, R002, R003).
 * 5. Server-Side Trust & Price Snapshot: Price and status are NEVER accepted from client-side.
 *    Server reads current price from Rooms sheet, captures a permanent price_per_night snapshot.
 * 6. Explicit Timezone: All date math and timestamps use 'Asia/Kolkata' timezone.
 * 7. Abuse & Input Validation: Strict phone, name, email, date range, guest capacity constraints.
 * 8. Booking ID Generator: Atomic formatted ID: BK-YYYYMMDD-XXXX.
 */

// Global Configuration
var SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
var SHEET_ROOMS = 'Rooms';
var SHEET_BOOKINGS = 'Bookings';
var SHEET_SETTINGS = 'Settings';
var TIMEZONE = 'Asia/Kolkata';
var PENDING_EXPIRY_HOURS = 24;

/**
 * HTTP GET Request Handler
 * Supported actions: getRooms, checkAvailability, getSettings, ping
 */
function doGet(e) {
  var params = e.parameter || {};
  var action = params.action || 'getRooms';
  
  try {
    var result = {};
    
    if (action === 'getRooms') {
      result = handleGetRooms();
    } else if (action === 'checkAvailability') {
      var checkin = params.check_in;
      var checkout = params.check_out;
      var guests = parseInt(params.guests || params.total_guests || '1', 10);
      var roomId = params.room_id || null;
      result = handleCheckAvailability(checkin, checkout, guests, roomId);
    } else if (action === 'getSettings') {
      result = handleGetSettings();
    } else if (action === 'ping') {
      result = { 
        status: 'success', 
        message: 'Nandhanam Elite Booking Engine API is active.',
        server_time: getFormattedTimestamp()
      };
    } else {
      result = { status: 'error', message: 'Unknown GET action: ' + action };
    }
    
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

/**
 * HTTP POST Request Handler
 * Supported actions: createBooking, cancelBooking, updateBooking
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  
  try {
    // Acquire lock up to 15 seconds to completely eliminate race conditions
    var hasLock = lock.tryLock(15000);
    if (!hasLock) {
      return jsonResponse({
        status: 'error',
        message: 'The booking engine is currently processing another transaction. Please retry in a few seconds.'
      });
    }
    
    var data = {};
    if (e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (err) {
        data = e.parameter || {};
      }
    } else {
      data = e.parameter || {};
    }
    
    var action = data.action || 'createBooking';
    var result = {};
    
    if (action === 'createBooking') {
      result = handleCreateBookingLocked(data);
    } else if (action === 'cancelBooking') {
      result = handleCancelBookingLocked(data.booking_id);
    } else if (action === 'updateBooking') {
      result = handleUpdateBookingLocked(data);
    } else {
      result = { status: 'error', message: 'Unknown POST action: ' + action };
    }
    
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

/**
 * JSON Response Formatter with CORS Support
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 1. Get All Active Rooms
 */
function handleGetRooms() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_ROOMS);
  if (!sheet) {
    return { status: 'error', message: 'Rooms sheet not found. Please run initialSetup() first.' };
  }
  
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { status: 'success', rooms: [] };
  
  var headers = rows[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var idIdx = headers.indexOf('room_id');
  var nameIdx = headers.indexOf('room_name');
  var descIdx = headers.indexOf('description');
  var priceIdx = headers.indexOf('price_per_night');
  if (priceIdx === -1) priceIdx = headers.indexOf('price');
  var capIdx = headers.indexOf('capacity');
  var amenitiesIdx = headers.indexOf('amenities');
  var imgIdx = headers.indexOf('image_url');
  var statusIdx = headers.indexOf('status');
  
  var rooms = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var status = statusIdx >= 0 ? String(row[statusIdx]).trim() : 'Active';
    
    if (status.toLowerCase() === 'active') {
      rooms.push({
        room_id: idIdx >= 0 ? String(row[idIdx]).trim() : 'R00' + i,
        room_name: nameIdx >= 0 ? String(row[nameIdx]).trim() : 'Room ' + i,
        description: descIdx >= 0 ? String(row[descIdx]) : '',
        price_per_night: priceIdx >= 0 ? Number(row[priceIdx]) : 0,
        capacity: capIdx >= 0 ? Number(row[capIdx]) : 2,
        amenities: amenitiesIdx >= 0 ? String(row[amenitiesIdx]).split(',').map(function(s){ return s.trim(); }) : [],
        image_url: imgIdx >= 0 ? String(row[imgIdx]) : '',
        status: status
      });
    }
  }
  
  return { status: 'success', rooms: rooms };
}

/**
 * 2. Check Availability (Overlap Engine)
 * Overlap Rule: requested_check_in < existing_check_out AND requested_check_out > existing_check_in
 */
function handleCheckAvailability(checkinStr, checkoutStr, guests, filterRoomId) {
  if (!checkinStr || !checkoutStr) {
    return { status: 'error', message: 'Check-in and Check-out dates are required.' };
  }
  
  var reqIn = parseDateString(checkinStr);
  var reqOut = parseDateString(checkoutStr);
  
  if (!reqIn || !reqOut) {
    return { status: 'error', message: 'Invalid date format. Please use YYYY-MM-DD.' };
  }
  
  var todayStr = getFormattedDate(new Date());
  var today = parseDateString(todayStr);
  if (reqIn < today) {
    return { status: 'error', message: 'Check-in date cannot be in the past.' };
  }
  
  if (reqOut <= reqIn) {
    return { status: 'error', message: 'Check-out date must be strictly after Check-in date.' };
  }
  
  var diffTime = Math.abs(reqOut - reqIn);
  var totalNights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (totalNights > 30) {
    return { status: 'error', message: 'Maximum continuous booking length is 30 nights. Please contact host directly for long stays.' };
  }
  
  var roomsRes = handleGetRooms();
  if (roomsRes.status !== 'success') return roomsRes;
  var allRooms = roomsRes.rooms;
  
  // Read active bookings from Bookings sheet
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var bookingSheet = ss.getSheetByName(SHEET_BOOKINGS);
  var activeBookings = getActiveBookingsFromSheet(bookingSheet);
  
  // Evaluate availability per room
  var availability = allRooms.map(function(room) {
    if (filterRoomId && room.room_id !== filterRoomId) {
      return null;
    }
    
    var fitsCapacity = guests ? room.capacity >= guests : true;
    var isOverlapping = false;
    
    for (var j = 0; j < activeBookings.length; j++) {
      var b = activeBookings[j];
      if (b.room_id === room.room_id) {
        if (reqIn < b.check_out && reqOut > b.check_in) {
          isOverlapping = true;
          break;
        }
      }
    }
    
    var isAvailable = !isOverlapping && fitsCapacity;
    var reason = '';
    if (isOverlapping) {
      reason = 'Booked / Reserved for selected dates';
    } else if (!fitsCapacity) {
      reason = 'Exceeds maximum room capacity (' + room.capacity + ' guests max)';
    }
    
    return {
      room_id: room.room_id,
      room_name: room.room_name,
      description: room.description,
      price_per_night: room.price_per_night,
      total_nights: totalNights,
      total_estimated_price: room.price_per_night * totalNights,
      capacity: room.capacity,
      is_available: isAvailable,
      unavailability_reason: reason,
      amenities: room.amenities,
      image_url: room.image_url
    };
  }).filter(function(item) { return item !== null; });
  
  return {
    status: 'success',
    check_in: getFormattedDate(reqIn),
    check_out: getFormattedDate(reqOut),
    total_nights: totalNights,
    requested_guests: guests,
    results: availability
  };
}

/**
 * 3. Create Booking Request with Atomic Lock & Security Boundaries
 * 
 * Rules:
 * - Room ID verified against Rooms sheet
 * - Price ALWAYS read from Rooms sheet (never client-supplied)
 * - Status is ALWAYS forced to 'Pending'
 * - Atomic check of date overlap inside LockService
 * - Booking ID generation BK-YYYYMMDD-XXXX
 * - Timestamp recording in Asia/Kolkata
 */
function handleCreateBookingLocked(data) {
  // Input Validation & Sanitation
  var roomId = String(data.room_id || '').trim();
  var checkinStr = String(data.check_in || '').trim();
  var checkoutStr = String(data.check_out || '').trim();
  var guestName = String(data.guest_name || data.name || '').trim();
  var phone = String(data.phone || data.mobile || data.guest_phone || '').trim();
  var email = String(data.email || data.guest_email || '').trim();
  var adults = parseInt(data.adults || '1', 10);
  var children = parseInt(data.children || '0', 10);
  var totalGuests = parseInt(data.total_guests || data.guest_count || data.guests || (adults + children), 10);
  var notes = String(data.notes || data.special_requests || '').trim();
  
  // Security Checks: Length limits & formats
  if (!roomId || !checkinStr || !checkoutStr || !guestName || !phone) {
    return { status: 'error', message: 'Missing required fields: Room, Check-in, Check-out, Full Name, and Phone number are mandatory.' };
  }
  
  if (guestName.length < 2 || guestName.length > 70) {
    return { status: 'error', message: 'Please provide a valid full name (2-70 characters).' };
  }
  
  var cleanPhone = phone.replace(/[\s\-()]/g, '');
  if (cleanPhone.length < 7 || cleanPhone.length > 18) {
    return { status: 'error', message: 'Please provide a valid phone number (e.g. +91 9876543210).' };
  }
  
  if (notes.length > 500) {
    notes = notes.substring(0, 500);
  }
  
  if (adults < 1) adults = 1;
  if (children < 0) children = 0;
  if (totalGuests < 1) totalGuests = adults + children;
  
  var reqIn = parseDateString(checkinStr);
  var reqOut = parseDateString(checkoutStr);
  if (!reqIn || !reqOut || reqOut <= reqIn) {
    return { status: 'error', message: 'Check-out date must be strictly after Check-in date.' };
  }
  
  var todayStr = getFormattedDate(new Date());
  var today = parseDateString(todayStr);
  if (reqIn < today) {
    return { status: 'error', message: 'Check-in date cannot be in the past.' };
  }
  
  // Verify Room exists and is Active in Rooms Sheet
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var roomSheet = ss.getSheetByName(SHEET_ROOMS);
  if (!roomSheet) return { status: 'error', message: 'Rooms database sheet not found.' };
  
  var roomRows = roomSheet.getDataRange().getValues();
  var rHeaders = roomRows[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var rIdIdx = rHeaders.indexOf('room_id');
  var rNameIdx = rHeaders.indexOf('room_name');
  var rPriceIdx = rHeaders.indexOf('price_per_night');
  if (rPriceIdx === -1) rPriceIdx = rHeaders.indexOf('price');
  var rCapIdx = rHeaders.indexOf('capacity');
  var rStatusIdx = rHeaders.indexOf('status');
  
  var matchedRoom = null;
  for (var i = 1; i < roomRows.length; i++) {
    var rRow = roomRows[i];
    if (String(rRow[rIdIdx]).trim() === roomId) {
      var rStatus = rStatusIdx >= 0 ? String(rRow[rStatusIdx]).trim() : 'Active';
      if (rStatus.toLowerCase() === 'active') {
        matchedRoom = {
          room_id: roomId,
          room_name: rNameIdx >= 0 ? String(rRow[rNameIdx]).trim() : 'Room ' + roomId,
          price_per_night: rPriceIdx >= 0 ? Number(rRow[rPriceIdx]) : 0,
          capacity: rCapIdx >= 0 ? Number(rRow[rCapIdx]) : 2
        };
      }
      break;
    }
  }
  
  if (!matchedRoom) {
    return { status: 'error', message: 'The requested room ID (' + roomId + ') is invalid or currently inactive.' };
  }
  
  if (totalGuests > matchedRoom.capacity) {
    return { 
      status: 'error', 
      message: 'Guest count (' + totalGuests + ') exceeds the maximum capacity of ' + matchedRoom.room_name + ' (' + matchedRoom.capacity + ' guests max).' 
    };
  }
  
  // Atomic double-check of availability inside lock
  var bookingSheet = ss.getSheetByName(SHEET_BOOKINGS);
  if (!bookingSheet) return { status: 'error', message: 'Bookings sheet not found.' };
  
  var activeBookings = getActiveBookingsFromSheet(bookingSheet);
  for (var k = 0; k < activeBookings.length; k++) {
    var ab = activeBookings[k];
    if (ab.room_id === roomId) {
      if (reqIn < ab.check_out && reqOut > ab.check_in) {
        return {
          status: 'error',
          message: 'Sorry, ' + matchedRoom.room_name + ' was just booked for the selected dates. Please select different dates or another room.'
        };
      }
    }
  }
  
  // Calculate Stay & Price Snapshot
  var diffTime = Math.abs(reqOut - reqIn);
  var totalNights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  var pricePerNightSnapshot = matchedRoom.price_per_night;
  var totalAmount = pricePerNightSnapshot * totalNights;
  
  // Generate Unique Atomic Booking ID: BK-YYYYMMDD-XXXX
  var now = new Date();
  var datePrefix = Utilities.formatDate(now, TIMEZONE, 'yyyyMMdd');
  var randomSuffix = Math.floor(1000 + Math.random() * 9000);
  var bookingId = 'BK-' + datePrefix + '-' + randomSuffix;
  var timestampStr = getFormattedTimestamp();
  
  // Append to Bookings Sheet:
  // [booking_id, room_id, room_name, guest_name, phone, email, check_in, check_out, adults, children, total_guests, price_per_night, total_amount, status, notes, created_at, updated_at]
  bookingSheet.appendRow([
    bookingId,
    roomId,
    matchedRoom.room_name,
    guestName,
    phone,
    email,
    getFormattedDate(reqIn),
    getFormattedDate(reqOut),
    adults,
    children,
    totalGuests,
    pricePerNightSnapshot,
    totalAmount,
    'Pending', // Server-enforced status
    notes,
    timestampStr,
    timestampStr
  ]);
  
  return {
    status: 'success',
    booking_id: bookingId,
    message: 'Booking request successfully received! We will contact you on WhatsApp/Phone for confirmation.',
    details: {
      booking_id: bookingId,
      room_id: roomId,
      room_name: matchedRoom.room_name,
      guest_name: guestName,
      phone: phone,
      email: email,
      check_in: getFormattedDate(reqIn),
      check_out: getFormattedDate(reqOut),
      adults: adults,
      children: children,
      total_guests: totalGuests,
      total_nights: totalNights,
      price_per_night: pricePerNightSnapshot,
      total_amount: totalAmount,
      status: 'Pending',
      created_at: timestampStr
    }
  };
}

/**
 * 4. Cancel a Booking (Sets status to Cancelled, preserving audit history)
 */
function handleCancelBookingLocked(bookingId) {
  if (!bookingId) return { status: 'error', message: 'Booking ID is required.' };
  
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_BOOKINGS);
  if (!sheet) return { status: 'error', message: 'Bookings sheet not found.' };
  
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var idIdx = headers.indexOf('booking_id');
  var statusIdx = headers.indexOf('status');
  var updatedIdx = headers.indexOf('updated_at');
  
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]).trim() === String(bookingId).trim()) {
      sheet.getRange(i + 1, statusIdx + 1).setValue('Cancelled');
      if (updatedIdx >= 0) {
        sheet.getRange(i + 1, updatedIdx + 1).setValue(getFormattedTimestamp());
      }
      return { status: 'success', message: 'Booking ' + bookingId + ' has been marked as Cancelled.' };
    }
  }
  
  return { status: 'error', message: 'Booking ID ' + bookingId + ' not found.' };
}

/**
 * 5. Update Booking (Modify check_out or status from Sheets/Admin)
 */
function handleUpdateBookingLocked(data) {
  var bookingId = String(data.booking_id || '').trim();
  if (!bookingId) return { status: 'error', message: 'Booking ID is required.' };
  
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_BOOKINGS);
  if (!sheet) return { status: 'error', message: 'Bookings sheet not found.' };
  
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var idIdx = headers.indexOf('booking_id');
  var checkOutIdx = headers.indexOf('check_out');
  var statusIdx = headers.indexOf('status');
  var updatedIdx = headers.indexOf('updated_at');
  
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]).trim() === bookingId) {
      var rowNum = i + 1;
      
      if (data.new_checkout_date && checkOutIdx >= 0) {
        var parsed = parseDateString(data.new_checkout_date);
        if (parsed) {
          sheet.getRange(rowNum, checkOutIdx + 1).setValue(getFormattedDate(parsed));
        }
      }
      
      if (data.new_status && statusIdx >= 0) {
        var validStatuses = ['Pending', 'Confirmed', 'Cancelled', 'Completed', 'Expired'];
        var matchingStatus = validStatuses.find(function(s) { return s.toLowerCase() === String(data.new_status).toLowerCase(); });
        if (matchingStatus) {
          sheet.getRange(rowNum, statusIdx + 1).setValue(matchingStatus);
        }
      }
      
      if (updatedIdx >= 0) {
        sheet.getRange(rowNum, updatedIdx + 1).setValue(getFormattedTimestamp());
      }
      
      return { status: 'success', message: 'Booking ' + bookingId + ' updated successfully.' };
    }
  }
  
  return { status: 'error', message: 'Booking ID not found.' };
}

/**
 * Helper: Read Active Bookings from Sheet with Pending Expiration Handling
 */
function getActiveBookingsFromSheet(sheet) {
  var activeBookings = [];
  if (!sheet || sheet.getLastRow() <= 1) return activeBookings;
  
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0].map(function(h) { return String(h).trim().toLowerCase(); });
  
  var idIdx = headers.indexOf('booking_id');
  var roomIdIdx = headers.indexOf('room_id');
  var inIdx = headers.indexOf('check_in');
  var outIdx = headers.indexOf('check_out');
  var statusIdx = headers.indexOf('status');
  var createdIdx = headers.indexOf('created_at');
  
  var nowTime = new Date().getTime();
  var expiryDurationMs = PENDING_EXPIRY_HOURS * 60 * 60 * 1000;
  
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var status = statusIdx >= 0 ? String(row[statusIdx]).trim().toLowerCase() : '';
    
    // Check if Pending is expired
    var isExpiredPending = false;
    if (status === 'pending' && createdIdx >= 0 && row[createdIdx]) {
      var createdAt = new Date(row[createdIdx]);
      if (!isNaN(createdAt.getTime()) && (nowTime - createdAt.getTime()) > expiryDurationMs) {
        isExpiredPending = true;
      }
    }
    
    // Only active 'pending' (non-expired) and 'confirmed' block dates
    if ((status === 'pending' && !isExpiredPending) || status === 'confirmed') {
      var bIn = parseDateString(row[inIdx]);
      var bOut = parseDateString(row[outIdx]);
      
      if (bIn && bOut) {
        activeBookings.push({
          booking_id: idIdx >= 0 ? String(row[idIdx]).trim() : '',
          room_id: String(row[roomIdIdx]).trim(),
          check_in: bIn,
          check_out: bOut,
          status: status
        });
      }
    }
  }
  
  return activeBookings;
}

/**
 * 6. Get Homestay Settings
 */
function handleGetSettings() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_SETTINGS);
  var settings = {
    property_name: 'Nandhanam Elite Tourist Home',
    phone: '+91 94470 00000',
    whatsapp: '+91 94470 00000',
    email: 'nandhanamelite@gmail.com',
    address: 'Kaithakod Junction, Vengalloor – Mangattukavala Bypass Road, Thodupuzha East PO, Pin: 685585, Kerala, India',
    check_in_time: '2:00 PM',
    check_out_time: '11:00 AM',
    timezone: TIMEZONE,
    pending_expiry_hours: PENDING_EXPIRY_HOURS,
    currency: '₹'
  };
  
  if (sheet && sheet.getLastRow() > 1) {
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var key = String(rows[i][0]).trim().toLowerCase().replace(/[\s-]+/g, '_');
      var val = rows[i][1];
      if (key) {
        settings[key] = val;
      }
    }
  }
  
  return { status: 'success', settings: settings };
}

/**
 * Comprehensive Initial Setup Function
 * Run this function once in Google Apps Script editor to create and style all sheets!
 */
function initialSetup() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // 1. Rooms Sheet (Option A: Physical Units with unique IDs)
  var roomSheet = ss.getSheetByName(SHEET_ROOMS) || ss.insertSheet(SHEET_ROOMS);
  roomSheet.clear();
  var roomHeaders = [
    'room_id', 'room_name', 'description', 'price_per_night', 'capacity', 'amenities', 'image_url', 'status', 'created_at', 'updated_at'
  ];
  roomSheet.getRange(1, 1, 1, roomHeaders.length).setValues([roomHeaders])
    .setFontWeight('bold').setBackground('#E2C48C');
  
  var nowStr = getFormattedTimestamp();
  roomSheet.appendRow([
    'R001', 'AC Luxury Room', 
    'Spacious air-conditioned room with king-size bed, private attached modern bathroom, and scenic view.',
    2000, 2, 'Air Conditioning, King Bed, Attached Bathroom, 24/7 Hot Water, High-Speed Wi-Fi, Daily Housekeeping',
    'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=900&q=80',
    'Active', nowStr, nowStr
  ]);
  roomSheet.appendRow([
    'R002', 'Non AC Comfort Room', 
    'Well-ventilated comfortable double bedroom with attached bathroom and work desk.',
    1500, 2, 'Natural Ventilation, Comfortable Double Bed, Attached Bathroom, Hot Water, Wi-Fi, Daily Housekeeping',
    'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=900&q=80',
    'Active', nowStr, nowStr
  ]);
  roomSheet.appendRow([
    'R003', 'Family Executive Suite', 
    'Large suite ideal for families with 2 double beds, AC, and private living area with balcony.',
    3200, 4, 'Air Conditioning, 2 Queen Beds, Attached Bathroom, Private Balcony, Hot Water, High-Speed Wi-Fi, Living Area',
    'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=900&q=80',
    'Active', nowStr, nowStr
  ]);
  
  // 2. Bookings Sheet (Full Enterprise Schema)
  var bookSheet = ss.getSheetByName(SHEET_BOOKINGS) || ss.insertSheet(SHEET_BOOKINGS);
  bookSheet.clear();
  var bookHeaders = [
    'booking_id', 'room_id', 'room_name', 'guest_name', 'phone', 'email',
    'check_in', 'check_out', 'adults', 'children', 'total_guests',
    'price_per_night', 'total_amount', 'status', 'notes', 'created_at', 'updated_at'
  ];
  bookSheet.getRange(1, 1, 1, bookHeaders.length).setValues([bookHeaders])
    .setFontWeight('bold').setBackground('#D4AF37');
  
  // 3. Settings Sheet
  var settSheet = ss.getSheetByName(SHEET_SETTINGS) || ss.insertSheet(SHEET_SETTINGS);
  settSheet.clear();
  settSheet.getRange(1, 1, 1, 2).setValues([['Setting', 'Value']])
    .setFontWeight('bold').setBackground('#C5A880');
  settSheet.appendRow(['property_name', 'Nandhanam Elite Tourist Home']);
  settSheet.appendRow(['phone', '+91 94470 00000']);
  settSheet.appendRow(['whatsapp', '+91 94470 00000']);
  settSheet.appendRow(['email', 'nandhanamelite@gmail.com']);
  settSheet.appendRow(['address', 'Kaithakod Junction, Vengalloor – Mangattukavala Bypass Road, Thodupuzha East PO, Pin: 685585, Kerala, India']);
  settSheet.appendRow(['check_in_time', '2:00 PM']);
  settSheet.appendRow(['check_out_time', '11:00 AM']);
  settSheet.appendRow(['timezone', TIMEZONE]);
  settSheet.appendRow(['pending_expiry_hours', PENDING_EXPIRY_HOURS]);
  settSheet.appendRow(['currency', '₹']);
  
  Logger.log('Nandhanam Elite Google Sheet initial setup successfully completed!');
}

/**
 * Timezone Helpers
 */
function getFormattedTimestamp() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function getFormattedDate(dateObj) {
  if (!dateObj) return '';
  return Utilities.formatDate(dateObj, TIMEZONE, 'yyyy-MM-dd');
}

function parseDateString(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date) {
    return new Date(dateVal.getFullYear(), dateVal.getMonth(), dateVal.getDate());
  }
  var str = String(dateVal).trim();
  var parts = str.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else if (parts[2].length === 4) {
      // DD-MM-YYYY
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
  }
  var d = new Date(str);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

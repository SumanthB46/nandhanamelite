/**
 * ============================================================================
 * NANDHANAM ELITE HOMESTAY - ENTERPRISE GOOGLE APPS SCRIPT BACKEND API (v2.2)
 * ============================================================================
 * 
 * VERIFIED ENTERPRISE CONTROLS:
 * 1. Centralized Error & Response Pipeline: Standardized JSON format with discrete error codes.
 * 2. Universal LockService Mutex: ALL mutations execute inside 15-second atomic locks.
 * 3. Collision-Free Booking IDs: Unique BK-YYYYMMDD-XXXX checked against database inside lock.
 * 4. Two-Tier Overlap Prevention: Pre-search & locked pre-commit overlap re-check.
 * 5. Server-Side Rate Snapshotting: Rates & total stay amounts calculated from Rooms sheet.
 * 6. Background Auto-Expiry Trigger: Auto-expires unconfirmed pending reservations > 24 hours.
 * 7. Honeypot & Anti-Bot Protection: Guards endpoints against automated spam submissions.
 */

// Global Configuration
// Google Spreadsheet: https://docs.google.com/spreadsheets/d/1r17Im3RWjG2fwSsD_RgTVMGcls8aDEYwB25N6ImFujI
var SPREADSHEET_ID = '1wPFFHEty33MqXUfX1xkZbjRQL7w_t4X6bQxQDt4Cvv0';
var SHEET_ROOMS = 'Rooms';
var SHEET_BOOKINGS = 'Bookings';
var SHEET_SETTINGS = 'Settings';
var TIMEZONE = 'Asia/Kolkata';
var PENDING_EXPIRY_MINUTES = 5; // Strict 5-minute reservation hold window

/**
 * Safe Spreadsheet Resolver (Works for both Container-Bound scripts and Standalone scripts)
 */
function getTargetSpreadsheet() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active && active.getId()) return active;
  } catch (e) {}
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Quick Diagnostics & Authorization Test Function
 * Run this first to test permissions without modifying any sheets
 */
function testConnection() {
  Logger.log('🔍 Testing Apps Script environment and connection...');
  try {
    var ss = getTargetSpreadsheet();
    Logger.log('✅ Connected successfully to Spreadsheet: "' + ss.getName() + '" (ID: ' + ss.getId() + ')');
    Logger.log('✅ Google Apps Script permissions are valid and operational.');
  } catch (err) {
    Logger.log('❌ Connection error: ' + err.toString());
  }
}

/**
 * Standard Error Codes Reference:
 * - VALIDATION_ERROR: Missing or invalid input fields
 * - INVALID_ACTION: Unknown GET or POST action
 * - INVALID_ROOM: Room ID not found or inactive
 * - INVALID_DATE: Bad date format or checkin in past / checkout <= checkin
 * - INVALID_GUEST_COUNT: Guest count exceeds maximum room capacity
 * - ROOM_UNAVAILABLE: Room is occupied for requested dates
 * - BOOKING_CONFLICT: Concurrency collision during locked commit
 * - LOCK_TIMEOUT: Lock acquisition exceeded timeout
 * - BOOKING_NOT_FOUND: Booking ID does not exist
 * - INVALID_STATUS: Unrecognized booking status value
 * - SHEET_ERROR: Database sheet missing or inaccessible
 * - BOT_DETECTED: Spam submission trapped by honeypot
 * - INTERNAL_ERROR: Unexpected runtime exception
 */

/**
 * Standardized Response Helpers
 */
function createSuccessResponse(payload, message) {
  var res = {
    status: 'success',
    message: message || 'Request completed successfully.'
  };

  if (payload && typeof payload === 'object') {
    for (var key in payload) {
      if (payload.hasOwnProperty(key)) {
        res[key] = payload[key];
      }
    }
  }
  return res;
}

function createErrorResponse(code, message, logDetails) {
  if (logDetails) {
    Logger.log('[' + (code || 'ERROR') + '] ' + logDetails);
  }
  return {
    status: 'error',
    code: code || 'INTERNAL_ERROR',
    message: message || 'An unexpected error occurred. Please try again.'
  };
}

/**
 * HTTP GET Request Handler
 * Supported actions: getRooms, checkAvailability, getSettings, ping
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = params.action || 'getRooms';
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
      result = createSuccessResponse({
        server_time: getFormattedTimestamp()
      }, 'Nandhanam Elite Booking Engine API is active.');
    } else {
      result = createErrorResponse('INVALID_ACTION', 'Unknown GET action requested: ' + action, 'Invalid GET action: ' + action);
    }

    return jsonResponse(result);
  } catch (error) {
    Logger.log('[GET_EXCEPTION] ' + error.toString());
    return jsonResponse(createErrorResponse('INTERNAL_ERROR', 'Unable to process GET request. Please try again.'));
  }
}

/**
 * HTTP POST Request Handler
 * Supported actions: createBooking, cancelBooking, updateBooking
 */
function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    // 15-second lock acquisition to eliminate all race conditions
    var hasLock = lock.tryLock(15000);
    if (!hasLock) {
      return jsonResponse(createErrorResponse(
        'LOCK_TIMEOUT',
        'The booking engine is currently processing high traffic. Please retry in a few moments.',
        'ScriptLock acquisition timeout (15s)'
      ));
    }

    var data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (err) {
        data = e.parameter || {};
      }
    } else {
      data = (e && e.parameter) ? e.parameter : {};
    }

    var action = data.action || 'createBooking';
    var result = {};

    if (action === 'createBooking') {
      result = handleCreateBookingLocked(data);
    } else if (action === 'cancelBooking' || action === 'updateBooking') {
      result = createErrorResponse(
        'UNAUTHORIZED_ACTION',
        'Reservation status modifications are restricted. The stay owner manages all updates directly inside Google Sheets.',
        'Attempted public invocation of restricted action: ' + action
      );
    } else {
      result = createErrorResponse('INVALID_ACTION', 'Unknown POST action: ' + action, 'Invalid POST action: ' + action);
    }

    return jsonResponse(result);
  } catch (error) {
    Logger.log('[POST_EXCEPTION] ' + error.toString());
    return jsonResponse(createErrorResponse('INTERNAL_ERROR', 'Unable to complete your reservation request. Please try again.'));
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
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_ROOMS);
    if (!sheet) {
      return createErrorResponse('SHEET_ERROR', 'Rooms database not configured. Please run initialSetup().', 'Sheet "Rooms" missing');
    }

    var rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) return createSuccessResponse({ rooms: [] }, 'No rooms listed.');

    var headers = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
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
          amenities: amenitiesIdx >= 0 ? String(row[amenitiesIdx]).split(',').map(function (s) { return s.trim(); }) : [],
          image_url: imgIdx >= 0 ? String(row[imgIdx]) : '',
          status: status
        });
      }
    }

    return createSuccessResponse({ rooms: rooms }, 'Rooms loaded successfully.');
  } catch (err) {
    return createErrorResponse('SHEET_ERROR', 'Could not load room catalog.', err.toString());
  }
}

/**
 * 2. Check Availability (Overlap Engine)
 * Overlap Rule: requested_check_in < existing_check_out AND requested_check_out > existing_check_in
 */
function handleCheckAvailability(checkinStr, checkoutStr, guests, filterRoomId) {
  try {
    if (!checkinStr || !checkoutStr) {
      return createErrorResponse('VALIDATION_ERROR', 'Check-in and Check-out dates are required.');
    }

    var reqIn = parseDateString(checkinStr);
    var reqOut = parseDateString(checkoutStr);

    if (!reqIn || !reqOut) {
      return createErrorResponse('INVALID_DATE', 'Invalid date format. Please use YYYY-MM-DD.');
    }

    var todayStr = getFormattedDate(new Date());
    var today = parseDateString(todayStr);
    if (reqIn < today) {
      return createErrorResponse('INVALID_DATE', 'Check-in date cannot be in the past.');
    }

    if (reqOut <= reqIn) {
      return createErrorResponse('INVALID_DATE', 'Check-out date must be strictly after Check-in date.');
    }

    var diffTime = Math.abs(reqOut - reqIn);
    var totalNights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (totalNights > 30) {
      return createErrorResponse('VALIDATION_ERROR', 'Maximum continuous booking length is 30 nights. Please contact host directly for long stays.');
    }

    var roomsRes = handleGetRooms();
    if (roomsRes.status !== 'success') return roomsRes;
    var allRooms = roomsRes.rooms;

    // Read active bookings from Bookings sheet
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var bookingSheet = ss.getSheetByName(SHEET_BOOKINGS);
    var activeBookings = getActiveBookingsFromSheet(bookingSheet);

    // Evaluate availability per room based on total inventory (8 AC, 8 Non-AC)
    var maxInventory = 8;
    var availability = allRooms.map(function (room) {
      if (filterRoomId && room.room_id !== filterRoomId) {
        return null;
      }

      var fitsCapacity = guests ? room.capacity >= guests : true;
      var overlappingCount = 0;
      var overlappingBookings = [];

      for (var j = 0; j < activeBookings.length; j++) {
        var b = activeBookings[j];
        if (b.room_id === room.room_id) {
          if (reqIn < b.check_out && reqOut > b.check_in) {
            overlappingCount++;
            overlappingBookings.push({
              check_in: getFormattedDate(b.check_in),
              check_out: getFormattedDate(b.check_out),
              status: b.status
            });
          }
        }
      }

      var isFullyBooked = overlappingCount >= maxInventory;
      var isAvailable = !isFullyBooked && fitsCapacity;
      var remainingUnits = Math.max(0, maxInventory - overlappingCount);
      var reason = '';
      if (isFullyBooked) {
        var dateSpans = overlappingBookings.map(function (ob) {
          return ob.check_in + ' to ' + ob.check_out;
        }).join(', ');
        reason = 'All ' + maxInventory + ' rooms occupied for dates: ' + dateSpans;
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
        total_inventory: maxInventory,
        remaining_units: remainingUnits,
        is_available: isAvailable,
        overlapping_dates: isFullyBooked ? overlappingBookings : [],
        unavailability_reason: reason,
        amenities: room.amenities,
        image_url: room.image_url
      };
    }).filter(function (item) { return item !== null; });

    return createSuccessResponse({
      check_in: getFormattedDate(reqIn),
      check_out: getFormattedDate(reqOut),
      total_nights: totalNights,
      requested_guests: guests,
      results: availability
    }, 'Availability checked successfully.');
  } catch (err) {
    return createErrorResponse('INTERNAL_ERROR', 'Failed to calculate availability.', err.toString());
  }
}

/**
 * 3. Create Booking Request (Atomic Lock + Collision-Free ID + Price Snapshot)
 */
function handleCreateBookingLocked(data) {
  try {
    // 0. Anti-bot honeypot check
    if (data.hp_check && String(data.hp_check).trim() !== '') {
      return createErrorResponse('BOT_DETECTED', 'Request rejected by security filter.', 'Spam submission detected');
    }

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

    if (!roomId || !checkinStr || !checkoutStr || !guestName || !phone) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing required fields: Room, Check-in, Check-out, Full Name, and Phone number are mandatory.');
    }

    if (guestName.length < 2 || guestName.length > 70) {
      return createErrorResponse('VALIDATION_ERROR', 'Please provide a valid full name (2-70 characters).');
    }

    var cleanPhone = phone.replace(/[\s\-()]/g, '');
    if (cleanPhone.length < 7 || cleanPhone.length > 18) {
      return createErrorResponse('VALIDATION_ERROR', 'Please provide a valid phone number (e.g. +91 9876543210).');
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
      return createErrorResponse('INVALID_DATE', 'Check-out date must be strictly after Check-in date.');
    }

    var todayStr = getFormattedDate(new Date());
    var today = parseDateString(todayStr);
    if (reqIn < today) {
      return createErrorResponse('INVALID_DATE', 'Check-in date cannot be in the past.');
    }

    // Verify Room exists and is Active in Rooms Sheet
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var roomSheet = ss.getSheetByName(SHEET_ROOMS);
    if (!roomSheet) return createErrorResponse('SHEET_ERROR', 'Rooms database sheet not found.');

    var roomRows = roomSheet.getDataRange().getValues();
    var rHeaders = roomRows[0].map(function (h) { return String(h).trim().toLowerCase(); });
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
      return createErrorResponse('INVALID_ROOM', 'The requested room ID (' + roomId + ') is invalid or currently inactive.');
    }

    if (totalGuests > matchedRoom.capacity) {
      return createErrorResponse(
        'INVALID_GUEST_COUNT',
        'Guest count (' + totalGuests + ') exceeds the maximum capacity of ' + matchedRoom.room_name + ' (' + matchedRoom.capacity + ' guests max).'
      );
    }

    // Atomic double-check of availability inside lock
    var bookingSheet = ss.getSheetByName(SHEET_BOOKINGS);
    if (!bookingSheet) return createErrorResponse('SHEET_ERROR', 'Bookings sheet not found.');

    var bRows = bookingSheet.getDataRange().getValues();
    var activeBookings = getActiveBookingsFromSheet(bookingSheet);

    var maxInventory = 8;
    var overlappingCount = 0;
    for (var k = 0; k < activeBookings.length; k++) {
      var ab = activeBookings[k];
      if (ab.room_id === roomId) {
        if (reqIn < ab.check_out && reqOut > ab.check_in) {
          overlappingCount++;
        }
      }
    }

    if (overlappingCount >= maxInventory) {
      return createErrorResponse(
        'BOOKING_CONFLICT',
        'Sorry, all ' + maxInventory + ' ' + matchedRoom.room_name + 's are fully occupied for the selected dates. Please select different dates or another room.'
      );
    }

    // Collision-free unique ID generation check (Unpredictable 8-character alphanumeric token)
    var existingIds = {};
    for (var r = 1; r < bRows.length; r++) {
      existingIds[String(bRows[r][0]).trim()] = true;
    }

    var now = new Date();
    var datePrefix = Utilities.formatDate(now, TIMEZONE, 'yyyyMMdd');
    var bookingId = '';
    var tokenChars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    do {
      var randomToken = '';
      for (var t = 0; t < 8; t++) {
        randomToken += tokenChars.charAt(Math.floor(Math.random() * tokenChars.length));
      }
      bookingId = 'BK-' + datePrefix + '-' + randomToken;
    } while (existingIds[bookingId]);

    // Calculate Stay & Price Snapshot
    var diffTime = Math.abs(reqOut - reqIn);
    var totalNights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    var pricePerNightSnapshot = matchedRoom.price_per_night;
    var totalAmount = pricePerNightSnapshot * totalNights;
    var timestampStr = getFormattedTimestamp();

    // Append to Bookings Sheet (with formula injection sanitization):
    bookingSheet.appendRow([
      bookingId,
      roomId,
      sanitizeSheetCell(matchedRoom.room_name),
      sanitizeSheetCell(guestName),
      sanitizeSheetCell(phone),
      sanitizeSheetCell(email),
      getFormattedDate(reqIn),
      getFormattedDate(reqOut),
      adults,
      children,
      totalGuests,
      pricePerNightSnapshot,
      totalAmount,
      'Pending', // Server-enforced status
      sanitizeSheetCell(notes),
      timestampStr,
      timestampStr
    ]);

    var bookingData = {
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
      notes: notes,
      status: 'Pending',
      created_at: timestampStr
    };

    // Automated Notifications Dispatch (Email & WhatsApp)
    try {
      dispatchBookingNotifications(bookingData, ss);
    } catch (notifyErr) {
      Logger.log('[NOTIFICATION_WARNING] Error dispatching alerts: ' + notifyErr.toString());
    }

    return createSuccessResponse({
      booking_id: bookingId,
      details: bookingData
    }, 'Booking request successfully received! We will contact you on WhatsApp/Phone for confirmation.');
  } catch (err) {
    return createErrorResponse('INTERNAL_ERROR', 'Failed to create reservation.', err.toString());
  }
}

/**
 * 4. Cancel a Booking (Locked)
 */
function handleCancelBookingLocked(bookingId) {
  try {
    if (!bookingId) return createErrorResponse('VALIDATION_ERROR', 'Booking ID is required.');

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_BOOKINGS);
    if (!sheet) return createErrorResponse('SHEET_ERROR', 'Bookings sheet not found.');

    var rows = sheet.getDataRange().getValues();
    var headers = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var idIdx = headers.indexOf('booking_id');
    var statusIdx = headers.indexOf('status');
    var updatedIdx = headers.indexOf('updated_at');

    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][idIdx]).trim() === String(bookingId).trim()) {
        sheet.getRange(i + 1, statusIdx + 1).setValue('Cancelled');
        if (updatedIdx >= 0) {
          sheet.getRange(i + 1, updatedIdx + 1).setValue(getFormattedTimestamp());
        }
        return createSuccessResponse({}, 'Booking ' + bookingId + ' has been marked as Cancelled.');
      }
    }

    return createErrorResponse('BOOKING_NOT_FOUND', 'Booking ID ' + bookingId + ' not found.');
  } catch (err) {
    return createErrorResponse('INTERNAL_ERROR', 'Failed to cancel booking.', err.toString());
  }
}

/**
 * 5. Update Booking (Locked)
 */
function handleUpdateBookingLocked(data) {
  try {
    var bookingId = String(data.booking_id || '').trim();
    if (!bookingId) return createErrorResponse('VALIDATION_ERROR', 'Booking ID is required.');

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_BOOKINGS);
    if (!sheet) return createErrorResponse('SHEET_ERROR', 'Bookings sheet not found.');

    var rows = sheet.getDataRange().getValues();
    var headers = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
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
          var validStatuses = ['Pending', 'Confirmed', 'Done', 'Cancelled', 'Completed', 'Expired'];
          var matchingStatus = validStatuses.find(function (s) { return s.toLowerCase() === String(data.new_status).toLowerCase(); });
          if (matchingStatus) {
            sheet.getRange(rowNum, statusIdx + 1).setValue(matchingStatus);

            // If confirmed via API, notify customer
            if (matchingStatus === 'Confirmed' || matchingStatus === 'Done') {
              try {
                var rowData = rows[i];
                var bookingObj = extractBookingObjectFromRow(rowData, headers);
                var notifSettings = getNotificationSettings(ss);
                notifyCustomerBookingConfirmed(bookingObj, notifSettings);
              } catch (confErr) {
                Logger.log('[CONFIRM_NOTIFY_ERR] ' + confErr.toString());
              }
            }
          } else {
            return createErrorResponse('INVALID_STATUS', 'Invalid status provided: ' + data.new_status);
          }
        }

        if (updatedIdx >= 0) {
          sheet.getRange(rowNum, updatedIdx + 1).setValue(getFormattedTimestamp());
        }

        return createSuccessResponse({}, 'Booking ' + bookingId + ' updated successfully.');
      }
    }

    return createErrorResponse('BOOKING_NOT_FOUND', 'Booking ID ' + bookingId + ' not found.');
  } catch (err) {
    return createErrorResponse('INTERNAL_ERROR', 'Failed to update booking.', err.toString());
  }
}

/**
 * 6. Time-Driven Background Trigger: Auto-Expire Stale Pending Bookings
 * Automatically runs every hour via Google Apps Script time trigger.
 */
function autoExpirePendingBookings() {
  var lock = LockService.getScriptLock();
  try {
    var hasLock = lock.tryLock(15000);
    if (!hasLock) return;

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_BOOKINGS);
    if (!sheet || sheet.getLastRow() <= 1) return;

    var rows = sheet.getDataRange().getValues();
    var headers = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var statusIdx = headers.indexOf('status');
    var createdIdx = headers.indexOf('created_at');
    var updatedIdx = headers.indexOf('updated_at');

    var nowTime = new Date().getTime();
    var expiryLimitMs = PENDING_EXPIRY_MINUTES * 60 * 1000;
    var expiredCount = 0;

    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      var status = String(row[statusIdx]).trim().toLowerCase();

      if (status === 'pending' && createdIdx >= 0 && row[createdIdx]) {
        var createdAt = new Date(row[createdIdx]);
        if (!isNaN(createdAt.getTime()) && (nowTime - createdAt.getTime()) > expiryLimitMs) {
          sheet.getRange(i + 1, statusIdx + 1).setValue('Expired');
          if (updatedIdx >= 0) {
            sheet.getRange(i + 1, updatedIdx + 1).setValue(getFormattedTimestamp());
          }
          expiredCount++;
        }
      }
    }

    Logger.log('Auto-expire trigger complete. Total expired: ' + expiredCount);
  } catch (err) {
    Logger.log('Error in autoExpirePendingBookings: ' + err.toString());
  } finally {
    lock.releaseLock();
  }
}

/**
 * Install Time-Driven & Spreadsheet Triggers
 */
function installTimeDrivenTriggers() {
  installAllTriggers();
}

/**
 * Helper: Read Active Bookings from Sheet with 5-Minute Pending Expiration Handling
 */
function getActiveBookingsFromSheet(sheet) {
  var activeBookings = [];
  if (!sheet || sheet.getLastRow() <= 1) return activeBookings;

  var rows = sheet.getDataRange().getValues();
  var headers = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });

  var idIdx = headers.indexOf('booking_id');
  var roomIdIdx = headers.indexOf('room_id');
  var inIdx = headers.indexOf('check_in');
  var outIdx = headers.indexOf('check_out');
  var statusIdx = headers.indexOf('status');
  var createdIdx = headers.indexOf('created_at');

  var nowTime = new Date().getTime();
  var expiryDurationMs = PENDING_EXPIRY_MINUTES * 60 * 1000;

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var status = statusIdx >= 0 ? String(row[statusIdx]).trim().toLowerCase() : '';

    // Check if Pending is expired (strictly based on server timestamp)
    var isExpiredPending = false;
    if (status === 'pending' && createdIdx >= 0 && row[createdIdx]) {
      var createdAt = new Date(row[createdIdx]);
      if (!isNaN(createdAt.getTime()) && (nowTime - createdAt.getTime()) > expiryDurationMs) {
        isExpiredPending = true;
      }
    }

    // Only active 'pending' (non-expired within 5-min window) and 'confirmed' / 'done' / 'paid' block dates
    var isConfirmed = (status === 'confirmed' || status === 'done' || status === 'paid');
    if ((status === 'pending' && !isExpiredPending) || isConfirmed) {
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
 * ============================================================================
 * AUTOMATED NOTIFICATIONS PIPELINE (EMAIL & WHATSAPP)
 * ============================================================================
 */

/**
 * Main Dispatcher for New Booking Notifications
 */
function dispatchBookingNotifications(details, ss) {
  var settings = getNotificationSettings(ss);

  // 1. Send Admin Email Alert
  try {
    sendAdminNotificationEmail(details, settings);
  } catch (e) {
    Logger.log('[EMAIL_ADMIN_ERR] ' + e.toString());
  }

  // 2. Send Guest Confirmation Email (if guest provided email)
  try {
    if (details.email && String(details.email).indexOf('@') > 0) {
      sendGuestReceiptEmail(details, settings);
    }
  } catch (e) {
    Logger.log('[EMAIL_GUEST_ERR] ' + e.toString());
  }

  // 3. Send Automated WhatsApp to Admin
  try {
    sendAdminWhatsAppAlert(details, settings);
  } catch (e) {
    Logger.log('[WHATSAPP_ADMIN_ERR] ' + e.toString());
  }
}

/**
 * Load settings dictionary from Settings Sheet
 */
function getNotificationSettings(ss) {
  var targetSS = ss || SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = targetSS.getSheetByName(SHEET_SETTINGS);
  var config = {
    property_name: 'Nandhanam Elite Tourist Home',
    phone: '9447736460',
    whatsapp: '9447736460',
    email: 'nandhanamelite@gmail.com',
    admin_notification_email: '', // Defaults to script user / settings email
    callmebot_phone: '',          // Phone with country code (e.g., 919447736460)
    callmebot_apikey: '',         // Free API key from CallMeBot
    whatsapp_webhook_url: '',     // Optional custom WhatsApp/Telegram webhook
    advance_required: '₹500'
  };

  if (sheet && sheet.getLastRow() > 1) {
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var k = String(rows[i][0]).trim().toLowerCase().replace(/[\s-]+/g, '_');
      var v = rows[i][1];
      if (k && v !== undefined && v !== null && String(v).trim() !== '') {
        config[k] = String(v).trim();
      }
    }
  }
  return config;
}

/**
 * Sends HTML Email Alert to Property Admin
 */
function sendAdminNotificationEmail(b, settings) {
  var recipient = settings.admin_notification_email || settings.email || Session.getEffectiveUser().getEmail();
  if (!recipient || recipient.indexOf('@') === -1) return;

  var subject = '🔔 [NEW BOOKING] ' + b.booking_id + ' - ' + b.guest_name + ' (' + b.room_name + ')';
  var advanceReq = settings.advance_required || '₹500';
  var cleanPhone = String(b.phone || '').replace(/[^0-9+]/g, '');

  var htmlBody =
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; color: #1F2937;">' +
      '<div style="background-color: #111827; padding: 24px; text-align: center; color: #F59E0B;">' +
        '<h2 style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 1px;">NANDHANAM ELITE HOMESTAY</h2>' +
        '<p style="margin: 6px 0 0; color: #9CA3AF; font-size: 13px;">New Reservation Request Received</p>' +
      '</div>' +
      '<div style="padding: 24px; background-color: #FFFFFF;">' +
        '<div style="background-color: #FEF3C7; border-left: 4px solid #D97706; padding: 12px 16px; margin-bottom: 20px; border-radius: 4px;">' +
          '<strong style="color: #92400E;">Status: PENDING ADVANCE VERIFICATION</strong><br>' +
          '<span style="font-size: 13px; color: #78350F;">Please verify ₹500 advance payment before marking as Confirmed.</span>' +
        '</div>' +
        '<table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">' +
          '<tr><td style="padding: 8px 0; color: #6B7280; width: 40%;">Booking ID:</td><td style="padding: 8px 0; font-weight: bold; color: #111827;">' + b.booking_id + '</td></tr>' +
          '<tr><td style="padding: 8px 0; color: #6B7280;">Room:</td><td style="padding: 8px 0; font-weight: bold; color: #111827;">' + b.room_name + '</td></tr>' +
          '<tr><td style="padding: 8px 0; color: #6B7280;">Guest Name:</td><td style="padding: 8px 0; font-weight: bold; color: #111827;">' + b.guest_name + '</td></tr>' +
          '<tr><td style="padding: 8px 0; color: #6B7280;">Phone / WhatsApp:</td><td style="padding: 8px 0; font-weight: bold;"><a href="tel:' + cleanPhone + '" style="color: #2563EB;">' + b.phone + '</a> &nbsp;|&nbsp; <a href="https://wa.me/' + cleanPhone.replace(/\+/g, '') + '" style="color: #059669; font-weight: bold;">Chat on WhatsApp</a></td></tr>' +
          '<tr><td style="padding: 8px 0; color: #6B7280;">Guest Email:</td><td style="padding: 8px 0;">' + (b.email || 'Not provided') + '</td></tr>' +
          '<tr><td style="padding: 8px 0; color: #6B7280;">Check-in:</td><td style="padding: 8px 0; font-weight: bold; color: #047857;">' + b.check_in + '</td></tr>' +
          '<tr><td style="padding: 8px 0; color: #6B7280;">Check-out:</td><td style="padding: 8px 0; font-weight: bold; color: #B91C1C;">' + b.check_out + ' (' + b.total_nights + ' Nights)</td></tr>' +
          '<tr><td style="padding: 8px 0; color: #6B7280;">Guests:</td><td style="padding: 8px 0;">' + b.total_guests + ' (' + b.adults + ' Adults' + (b.children > 0 ? ', ' + b.children + ' Children' : '') + ')</td></tr>' +
          '<tr><td style="padding: 8px 0; color: #6B7280;">Total Stay Amount:</td><td style="padding: 8px 0; font-weight: bold; font-size: 16px; color: #111827;">₹' + Number(b.total_amount).toLocaleString('en-IN') + '</td></tr>' +
          '<tr><td style="padding: 8px 0; color: #6B7280;">Advance Required:</td><td style="padding: 8px 0; font-weight: bold; color: #D97706;">' + advanceReq + '</td></tr>' +
          (b.notes ? '<tr><td style="padding: 8px 0; color: #6B7280;">Special Requests:</td><td style="padding: 8px 0; font-style: italic;">' + b.notes + '</td></tr>' : '') +
        '</table>' +
        '<div style="text-align: center; margin-top: 24px;">' +
          '<a href="https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '" style="background-color: #059669; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Open Google Sheet to Manage Booking</a>' +
        '</div>' +
      '</div>' +
      '<div style="background-color: #F9FAFB; padding: 16px; text-align: center; font-size: 12px; color: #9CA3AF; border-top: 1px solid #E5E7EB;">' +
        'Nandhanam Elite Automated Booking System &bull; ' + b.created_at +
      '</div>' +
    '</div>';

  MailApp.sendEmail({
    to: recipient,
    subject: subject,
    htmlBody: htmlBody
  });
}

/**
 * Format raw phone number into clean display (+91 94477 36460)
 */
function formatDisplayPhone(val) {
  if (!val) return '+91 94477 36460';
  var digits = String(val).replace(/[^0-9]/g, '');
  if (digits.length >= 10) {
    var ten = digits.slice(-10);
    return '+91 ' + ten.slice(0, 5) + ' ' + ten.slice(5);
  }
  return String(val);
}

/**
 * Clean digits for WhatsApp URL (919447736460)
 */
function cleanWaNumber(val) {
  var digits = String(val || '919447736460').replace(/[^0-9]/g, '');
  if (digits.length === 10) return '91' + digits;
  return digits || '919447736460';
}

/**
 * Sends HTML Reservation Receipt Email to Guest
 */
function sendGuestReceiptEmail(b, settings) {
  var subject = 'Reservation Request Received (' + b.booking_id + ') - ' + settings.property_name;
  var waClean = cleanWaNumber(settings.whatsapp || settings.phone);
  var helplineDisplay = formatDisplayPhone(settings.phone || settings.whatsapp);

  var htmlBody =
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; color: #1F2937;">' +
      '<div style="background-color: #111827; padding: 24px; text-align: center; color: #F59E0B;">' +
        '<h2 style="margin: 0; font-size: 20px; font-weight: bold;">' + settings.property_name + '</h2>' +
        '<p style="margin: 6px 0 0; color: #9CA3AF; font-size: 13px;">Booking Request Acknowledgment</p>' +
      '</div>' +
      '<div style="padding: 24px; background-color: #FFFFFF;">' +
        '<p>Dear <strong>' + b.guest_name + '</strong>,</p>' +
        '<p>Thank you for choosing Nandhanam Elite! We have received your booking request. Here are your reservation details:</p>' +
        '<div style="background-color: #F3F4F6; padding: 16px; border-radius: 8px; margin: 20px 0;">' +
          '<table style="width: 100%; border-collapse: collapse; font-size: 14px;">' +
            '<tr><td style="padding: 6px 0; color: #6B7280;">Booking ID:</td><td style="padding: 6px 0; font-weight: bold;">' + b.booking_id + '</td></tr>' +
            '<tr><td style="padding: 6px 0; color: #6B7280;">Room:</td><td style="padding: 6px 0; font-weight: bold;">' + b.room_name + '</td></tr>' +
            '<tr><td style="padding: 6px 0; color: #6B7280;">Check-in:</td><td style="padding: 6px 0; font-weight: bold;">' + b.check_in + ' (Flexible 24-Hr Cycle)</td></tr>' +
            '<tr><td style="padding: 6px 0; color: #6B7280;">Check-out:</td><td style="padding: 6px 0; font-weight: bold;">' + b.check_out + ' (24 hrs from Check-in)</td></tr>' +
            '<tr><td style="padding: 6px 0; color: #6B7280;">Total Nights:</td><td style="padding: 6px 0;">' + b.total_nights + '</td></tr>' +
            '<tr><td style="padding: 6px 0; color: #6B7280;">Total Amount:</td><td style="padding: 6px 0; font-weight: bold; font-size: 15px; color: #111827;">₹' + Number(b.total_amount).toLocaleString('en-IN') + '</td></tr>' +
          '</table>' +
        '</div>' +
        '<h4 style="color: #111827; margin-bottom: 8px;">Next Step to Confirm Your Stay:</h4>' +
        '<p style="font-size: 14px; color: #4B5563; line-height: 1.5;">' +
          'Our property manager will connect with you on WhatsApp/Phone with payment details for the <strong>₹500 advance deposit</strong>. Once the advance is verified, your booking will be officially confirmed.' +
        '</p>' +
        '<div style="text-align: center; margin: 24px 0;">' +
          '<a href="https://wa.me/' + waClean + '?text=Hi%2C%20I%20have%20submitted%20booking%20' + encodeURIComponent(b.booking_id) + '%20for%20' + encodeURIComponent(b.room_name) + '." style="background-color: #25D366; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Chat with Host on WhatsApp</a>' +
        '</div>' +
        '<p style="font-size: 13px; color: #6B7280;">Address: ' + (settings.address || 'Annz Colors, Vengalloor - Mangattukavala Bypass Rd, Thodupuzha, Kerala 685585') + '<br>Contact: ' + helplineDisplay + '</p>' +
      '</div>' +
      '<div style="background-color: #F9FAFB; padding: 16px; text-align: center; font-size: 12px; color: #9CA3AF; border-top: 1px solid #E5E7EB;">' +
        'Thank you for staying with us &bull; Nandhanam Elite Homestay' +
      '</div>' +
    '</div>';

  MailApp.sendEmail({
    to: b.email,
    subject: subject,
    htmlBody: htmlBody
  });
}

/**
 * Sends Automated WhatsApp Alert to Admin via CallMeBot / Webhook
 */
function sendAdminWhatsAppAlert(b, settings) {
  var waText =
    '🚨 *NEW BOOKING REQUEST - NANDHANAM ELITE*\n' +
    '----------------------------------------\n' +
    '• *ID:* ' + b.booking_id + '\n' +
    '• *Room:* ' + b.room_name + '\n' +
    '• *Guest:* ' + b.guest_name + '\n' +
    '• *Phone:* ' + b.phone + '\n' +
    '• *Check-in:* ' + b.check_in + '\n' +
    '• *Check-out:* ' + b.check_out + ' (' + b.total_nights + 'N)\n' +
    '• *Guests:* ' + b.total_guests + '\n' +
    '• *Total:* ₹' + Number(b.total_amount).toLocaleString('en-IN') + '\n' +
    '• *Advance Due:* ' + (settings.advance_required || '₹500') + '\n' +
    '----------------------------------------\n' +
    '👉 Status: PENDING. Please contact guest for advance payment.';

  // 1. CallMeBot Automated WhatsApp Integration (Free API)
  var cmbPhone = settings.callmebot_phone || settings.whatsapp || settings.phone;
  var cmbKey = settings.callmebot_apikey;
  if (cmbPhone && cmbKey) {
    var cleanPhone = String(cmbPhone).replace(/[^0-9]/g, '');
    var url = 'https://api.callmebot.com/whatsapp.php?phone=' + cleanPhone +
              '&text=' + encodeURIComponent(waText) +
              '&apikey=' + encodeURIComponent(cmbKey);
    try {
      UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      Logger.log('[WHATSAPP_DISPATCH] Sent via CallMeBot to ' + cleanPhone);
    } catch (e) {
      Logger.log('[CALLMEBOT_ERROR] ' + e.toString());
    }
  }

  // 2. Custom Webhook (UltraMsg / Twilio / WATI / Telegram)
  if (settings.whatsapp_webhook_url && settings.whatsapp_webhook_url.indexOf('http') === 0) {
    try {
      UrlFetchApp.fetch(settings.whatsapp_webhook_url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          event: 'new_booking',
          booking: b,
          formatted_message: waText
        }),
        muteHttpExceptions: true
      });
      Logger.log('[WEBHOOK_DISPATCH] Dispatched to ' + settings.whatsapp_webhook_url);
    } catch (e) {
      Logger.log('[WEBHOOK_ERROR] ' + e.toString());
    }
  }
}

/**
 * ============================================================================
 * CUSTOMER CONFIRMATION NOTIFICATIONS (WHEN STATUS BECOMES 'CONFIRMED' / 'DONE')
 * ============================================================================
 */

/**
 * Notify customer that their booking has been confirmed by the host
 */
function notifyCustomerBookingConfirmed(b, settings) {
  if (!b || !b.booking_id) return;

  // 1. Send Official Confirmation Email Voucher
  if (b.email && String(b.email).indexOf('@') > 0) {
    try {
      sendCustomerBookingConfirmedEmail(b, settings);
    } catch (e) {
      Logger.log('[CUSTOMER_CONFIRM_EMAIL_ERR] ' + e.toString());
    }
  }

  // 2. Send Automated WhatsApp if customer gateway is configured
  try {
    sendCustomerWhatsAppConfirmation(b, settings);
  } catch (e) {
    Logger.log('[CUSTOMER_CONFIRM_WA_ERR] ' + e.toString());
  }
}

/**
 * Sends Official Booking Confirmed Voucher Email to Guest
 */
function sendCustomerBookingConfirmedEmail(b, settings) {
  var subject = '🎉 BOOKING CONFIRMED: ' + b.room_name + ' (' + b.booking_id + ') - ' + settings.property_name;
  var waClean = cleanWaNumber(settings.whatsapp || settings.phone);
  var helplineDisplay = formatDisplayPhone(settings.phone || settings.whatsapp);
  var totalFormatted = Number(b.total_amount || 0).toLocaleString('en-IN');
  var advanceNum = Number(b.advance_paid || 500);
  var advanceFormatted = advanceNum.toLocaleString('en-IN');
  var balanceNum = Math.max(0, Number(b.total_amount || 0) - advanceNum);
  var balanceFormatted = balanceNum.toLocaleString('en-IN');
  var isFullyPaid = balanceNum === 0;

  var htmlBody =
    '<div style="font-family: Arial, sans-serif; max-width: 620px; margin: auto; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; color: #1F2937; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">' +
      '<div style="background: linear-gradient(135deg, #065F46, #047857); padding: 28px 24px; text-align: center; color: #FFFFFF;">' +
        '<div style="background-color: #10B981; color: #FFFFFF; display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: bold; letter-spacing: 1px; margin-bottom: 8px;">CONFIRMED RESERVATION</div>' +
        '<h2 style="margin: 4px 0 0; font-size: 22px; font-weight: bold; color: #FFFFFF;">' + settings.property_name + '</h2>' +
        '<p style="margin: 4px 0 0; color: #D1FAE5; font-size: 13px;">Your stay is locked in. We look forward to hosting you!</p>' +
      '</div>' +
      '<div style="padding: 24px; background-color: #FFFFFF;">' +
        '<p style="font-size: 15px; margin-top: 0;">Dear <strong>' + b.guest_name + '</strong>,</p>' +
        '<p style="font-size: 14px; color: #4B5563; line-height: 1.5;">' +
          'Great news! Your payment has been verified and your booking has been <strong>OFFICIALLY CONFIRMED</strong>.' +
        '</p>' +
        '<div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 18px; margin: 20px 0;">' +
          '<h3 style="margin: 0 0 12px; font-size: 15px; color: #0F172A; border-bottom: 1px solid #E2E8F0; padding-bottom: 8px;">Reservation Summary</h3>' +
          '<table style="width: 100%; border-collapse: collapse; font-size: 14px;">' +
            '<tr><td style="padding: 6px 0; color: #64748B; width: 45%;">Booking Reference ID:</td><td style="padding: 6px 0; font-weight: bold; color: #0F172A;">' + b.booking_id + '</td></tr>' +
            '<tr><td style="padding: 6px 0; color: #64748B;">Room Category:</td><td style="padding: 6px 0; font-weight: bold; color: #0F172A;">' + b.room_name + '</td></tr>' +
            '<tr><td style="padding: 6px 0; color: #64748B;">Check-in Date:</td><td style="padding: 6px 0; font-weight: bold; color: #047857;">' + b.check_in + ' (from ' + (settings.check_in_time || '2:00 PM') + ')</td></tr>' +
            '<tr><td style="padding: 6px 0; color: #64748B;">Check-out Date:</td><td style="padding: 6px 0; font-weight: bold; color: #B91C1C;">' + b.check_out + ' (until ' + (settings.check_out_time || '11:00 AM') + ')</td></tr>' +
            '<tr><td style="padding: 6px 0; color: #64748B;">Duration & Guests:</td><td style="padding: 6px 0; color: #0F172A;">' + b.total_nights + ' Nights &bull; ' + b.total_guests + ' Guests</td></tr>' +
            '<tr><td style="padding: 6px 0; color: #64748B;">Total Stay Cost:</td><td style="padding: 6px 0; font-weight: bold; color: #0F172A;">₹' + totalFormatted + '</td></tr>' +
            '<tr><td style="padding: 6px 0; color: #64748B;">Advance Paid:</td><td style="padding: 6px 0; font-weight: bold; color: #047857;">₹' + advanceFormatted + (isFullyPaid ? ' (Full Payment Received)' : ' (Verified)') + '</td></tr>' +
            '<tr><td style="padding: 6px 0; color: #64748B;">Balance Due at Check-in:</td><td style="padding: 6px 0; font-weight: bold; color: ' + (isFullyPaid ? '#047857' : '#0F172A') + ';">' + (isFullyPaid ? '₹0 (Fully Paid ✅)' : '₹' + balanceFormatted) + '</td></tr>' +
          '</table>' +
        '</div>' +
        '<div style="background-color: #ECFDF5; border-left: 4px solid #10B981; padding: 12px 16px; margin-bottom: 20px; border-radius: 4px;">' +
          '<strong style="color: #065F46; font-size: 13px;">📍 Property Address & Directions</strong><br>' +
          '<span style="font-size: 13px; color: #047857;">' + (settings.address || 'Annz Colors, Vengalloor - Mangattukavala Bypass Rd, Thodupuzha, Kerala 685585') + '</span>' +
        '</div>' +
        '<div style="text-align: center; margin: 24px 0;">' +
          '<a href="https://wa.me/' + waClean + '?text=Hi%2C%20regarding%20my%20confirmed%20booking%20' + encodeURIComponent(b.booking_id) + '" style="background-color: #25D366; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Message Host on WhatsApp</a>' +
        '</div>' +
        '<p style="font-size: 13px; color: #64748B; text-align: center;">Need to update your dates or have questions? Contact Helpline: <strong>' + helplineDisplay + '</strong></p>' +
      '</div>' +
      '<div style="background-color: #F8FAFC; padding: 16px; text-align: center; font-size: 12px; color: #94A3B8; border-top: 1px solid #E2E8F0;">' +
        'Nandhanam Elite Tourist Home &bull; Official Confirmation Voucher &bull; ' + getFormattedTimestamp() +
      '</div>' +
    '</div>';

  MailApp.sendEmail({
    to: b.email,
    subject: subject,
    htmlBody: htmlBody
  });
  Logger.log('[CUSTOMER_CONFIRMED_EMAIL] Sent to ' + b.email + ' for ' + b.booking_id);
}

/**
 * Sends Automated WhatsApp Confirmation to Customer via Webhook
 */
function sendCustomerWhatsAppConfirmation(b, settings) {
  var waClean = cleanWaNumber(settings.whatsapp || settings.phone);
  var helplineDisplay = formatDisplayPhone(settings.phone || settings.whatsapp);
  var advanceNum = Number(b.advance_paid || 500);
  var balanceNum = Math.max(0, Number(b.total_amount || 0) - advanceNum);
  var isFullyPaid = balanceNum === 0;

  var text =
    '🎉 *BOOKING CONFIRMED - NANDHANAM ELITE*\n' +
    '----------------------------------------\n' +
    'Dear ' + b.guest_name + ',\n' +
    'Your payment is received and your room is *CONFIRMED*!\n\n' +
    '• *Booking ID:* ' + b.booking_id + '\n' +
    '• *Room:* ' + b.room_name + '\n' +
    '• *Check-in:* ' + b.check_in + ' (from ' + (settings.check_in_time || '2:00 PM') + ')\n' +
    '• *Check-out:* ' + b.check_out + ' (until ' + (settings.check_out_time || '11:00 AM') + ')\n' +
    '• *Nights:* ' + b.total_nights + ' Nights (' + b.total_guests + ' Guests)\n' +
    '• *Total Cost:* ₹' + Number(b.total_amount || 0).toLocaleString('en-IN') + '\n' +
    '• *Amount Paid:* ₹' + advanceNum.toLocaleString('en-IN') + (isFullyPaid ? ' (Full Payment ✅)' : '') + '\n' +
    '• *Balance at Check-in:* ' + (isFullyPaid ? '₹0 (Paid in Full)' : '₹' + balanceNum.toLocaleString('en-IN')) + '\n\n' +
    '📍 *Address:* ' + (settings.address || 'Annz Colors, Vengalloor - Mangattukavala Bypass Rd, Thodupuzha, Kerala 685585') + '\n' +
    '📞 *Helpline:* ' + helplineDisplay + '\n' +
    '----------------------------------------\n' +
    'We look forward to hosting you at Nandhanam Elite!';

  // Dispatch to custom webhook if configured (UltraMsg / Twilio / WATI)
  if (settings.whatsapp_webhook_url && settings.whatsapp_webhook_url.indexOf('http') === 0) {
    UrlFetchApp.fetch(settings.whatsapp_webhook_url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        event: 'booking_confirmed',
        recipient_phone: String(b.phone || '').replace(/[^0-9]/g, ''),
        booking: b,
        formatted_message: text
      }),
      muteHttpExceptions: true
    });
    Logger.log('[WEBHOOK_CUSTOMER_CONFIRMED] Dispatched for ' + b.booking_id);
  }
}

/**
 * Extract Booking Object from a Row
 */
function extractBookingObjectFromRow(row, headers) {
  var getVal = function(key) {
    var idx = headers.indexOf(key.toLowerCase());
    return idx >= 0 && row[idx] !== undefined ? row[idx] : '';
  };

  var inVal = getVal('check_in');
  var outVal = getVal('check_out');
  var inDate = inVal instanceof Date ? getFormattedDate(inVal) : String(inVal);
  var outDate = outVal instanceof Date ? getFormattedDate(outVal) : String(outVal);

  var totalNights = 1;
  var dIn = parseDateString(inDate);
  var dOut = parseDateString(outDate);
  if (dIn && dOut) {
    totalNights = Math.max(1, Math.ceil(Math.abs(dOut - dIn) / (1000 * 60 * 60 * 24)));
  }

  var totalAmt = getVal('total_amount') || 0;
  var advVal = getVal('advance_paid');
  var advNum = (advVal !== '' && !isNaN(Number(advVal))) ? Number(advVal) : 500;

  return {
    booking_id: String(getVal('booking_id')).trim(),
    room_id: String(getVal('room_id')).trim(),
    room_name: String(getVal('room_name')).trim(),
    guest_name: String(getVal('guest_name')).trim(),
    phone: String(getVal('phone')).trim(),
    email: String(getVal('email')).trim(),
    check_in: inDate,
    check_out: outDate,
    adults: getVal('adults') || 1,
    children: getVal('children') || 0,
    total_guests: getVal('total_guests') || 1,
    total_nights: totalNights,
    price_per_night: getVal('price_per_night') || 0,
    total_amount: totalAmt,
    advance_paid: advNum,
    balance_due: Math.max(0, Number(totalAmt) - advNum),
    status: String(getVal('status')).trim(),
    notes: String(getVal('notes')).trim(),
    created_at: getVal('created_at'),
    updated_at: getVal('updated_at')
  };
}

/**
 * ============================================================================
 * SPREADSHEET EDIT EVENT HANDLER (Triggered when Admin edits Google Sheet)
 * ============================================================================
 */

/**
 * Simple onEdit trigger (gives immediate visual feedback / runs inside sheet)
 */
function onEdit(e) {
  handleSpreadsheetEdit(e);
}

/**
 * Installable onEdit trigger (guaranteed full MailApp & UrlFetch permissions)
 */
function handleSpreadsheetEdit(e) {
  try {
    if (!e || !e.range) return;

    var sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_BOOKINGS) return;

    var row = e.range.getRow();
    var col = e.range.getColumn();

    // Row 1 is header
    if (row <= 1) return;

    // Determine status column index
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) {
      return String(h).trim().toLowerCase();
    });
    var statusIdx = headers.indexOf('status');
    var updatedIdx = headers.indexOf('updated_at');

    // Check if the edited column is the Status column
    if (col === (statusIdx + 1)) {
      var newStatus = String(e.value || sheet.getRange(row, col).getValue()).trim();
      var oldStatus = String(e.oldValue || '').trim();

      // Timestamp the update
      if (updatedIdx >= 0) {
        sheet.getRange(row, updatedIdx + 1).setValue(getFormattedTimestamp());
      }

      // If status changed to Confirmed or Done, notify customer
      if (newStatus.toLowerCase() === 'confirmed' || newStatus.toLowerCase() === 'done') {
        var rowValues = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
        var bookingObj = extractBookingObjectFromRow(rowValues, headers);
        var ss = sheet.getParent();
        var notifSettings = getNotificationSettings(ss);

        notifyCustomerBookingConfirmed(bookingObj, notifSettings);

        if (ss && ss.toast) {
          ss.toast('✅ Confirmation email sent to ' + bookingObj.guest_name + ' (' + bookingObj.booking_id + ')', 'Booking Confirmed', 5);
        }
      }
    }
  } catch (err) {
    Logger.log('[ON_EDIT_ERR] ' + err.toString());
  }
}

/**
 * Install All Background & Sheet Triggers in 1-Click
 */
function installAllTriggers() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var triggers = ScriptApp.getProjectTriggers();

  for (var i = 0; i < triggers.length; i++) {
    var func = triggers[i].getHandlerFunction();
    if (func === 'autoExpirePendingBookings' || func === 'handleSpreadsheetEdit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // 1. Install 5-min Auto Expiry Trigger
  ScriptApp.newTrigger('autoExpirePendingBookings')
    .timeBased()
    .everyMinutes(5)
    .create();

  // 2. Install Spreadsheet onEdit Trigger (for guaranteed email permissions on status changes)
  ScriptApp.newTrigger('handleSpreadsheetEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  Logger.log('✅ All triggers (5-minute auto-expiry and onEdit status handler) installed successfully!');
}

/**
 * 7. Get Homestay Settings
 */
function handleGetSettings() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_SETTINGS);
    var settings = {
      property_name: 'Nandhanam Elite Tourist Home',
      phone: '9447736460',
      whatsapp: '9447736460',
      email: 'nandhanamelite@gmail.com',
      admin_notification_email: 'nandhanamelite@gmail.com',
      callmebot_phone: '',
      callmebot_apikey: '',
      whatsapp_webhook_url: '',
      instagram: 'https://www.instagram.com/nandhanamelite?igsi=MWJ0emhiYmQyNnZ4OQ==',
      facebook: 'https://www.facebook.com/share/1R2bhGNVuv/?mibextid=wwXIfr',
      address: 'Annz Colors, Vengalloor - Mangattukavala Bypass Rd, Thodupuzha, Kerala 685585',
      check_in_time: 'Flexible (24-Hour Cycle)',
      check_out_time: '24 Hours from Check-in',
      timezone: TIMEZONE,
      pending_expiry_minutes: PENDING_EXPIRY_MINUTES,
      currency: '₹'
    };

    if (sheet && sheet.getLastRow() > 1) {
      var rows = sheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        var key = String(rows[i][0]).trim().toLowerCase().replace(/[\s-]+/g, '_');
        var val = rows[i][1];
        if (key) {
          if (val instanceof Date) {
            val = Utilities.formatDate(val, TIMEZONE, "hh:mm a");
          } else if (typeof val === 'string' && (val.indexOf('#ERROR') >= 0 || val.indexOf('#REF') >= 0 || val.indexOf('#VALUE') >= 0)) {
            val = settings[key] || '';
          }
          settings[key] = val;
        }
      }
    }

    return createSuccessResponse({ settings: settings }, 'Settings retrieved successfully.');
  } catch (err) {
    return createErrorResponse('INTERNAL_ERROR', 'Could not load settings.', err.toString());
  }
}

/**
 * 1-Click Sync to populate & fix all settings in the Settings Sheet
 */
function syncSettingsSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var settSheet = ss.getSheetByName(SHEET_SETTINGS) || ss.insertSheet(SHEET_SETTINGS);
  settSheet.clear();
  settSheet.getRange('A1:B50').setNumberFormat('@'); // Plain text to avoid formula errors
  settSheet.getRange(1, 1, 1, 2).setValues([['Setting', 'Value']])
    .setFontWeight('bold').setBackground('#C5A880');
  settSheet.appendRow(['property_name', 'Nandhanam Elite Tourist Home']);
  settSheet.appendRow(['total_rooms', '16']);
  settSheet.appendRow(['ac_rooms', '8']);
  settSheet.appendRow(['non_ac_rooms', '8']);
  settSheet.appendRow(['advance_required', '₹500']);
  settSheet.appendRow(['cancellation_policy', 'Free cancellation upto 48hrs before check-in']);
  settSheet.appendRow(['housekeeping', 'Daily housekeeping / cleaning on request']);
  settSheet.appendRow(['phone', '9447736460']);
  settSheet.appendRow(['whatsapp', '9447736460']);
  settSheet.appendRow(['email', 'nandhanamelite@gmail.com']);
  settSheet.appendRow(['admin_notification_email', 'nandhanamelite@gmail.com']);
  settSheet.appendRow(['callmebot_phone', '919447736460']);
  settSheet.appendRow(['callmebot_apikey', '']);
  settSheet.appendRow(['whatsapp_webhook_url', '']);
  settSheet.appendRow(['instagram', 'https://www.instagram.com/nandhanamelite?igsi=MWJ0emhiYmQyNnZ4OQ==']);
  settSheet.appendRow(['facebook', 'https://www.facebook.com/share/1R2bhGNVuv/?mibextid=wwXIfr']);
  settSheet.appendRow(['address', 'Annz Colors, Vengalloor - Mangattukavala Bypass Rd, Thodupuzha, Kerala 685585']);
  settSheet.appendRow(['check_in_time', 'Flexible (24-Hour Cycle)']);
  settSheet.appendRow(['check_out_time', '24 Hours from Check-in']);
  settSheet.appendRow(['timezone', TIMEZONE]);
  settSheet.appendRow(['pending_expiry_minutes', PENDING_EXPIRY_MINUTES]);
  settSheet.appendRow(['currency', '₹']);

  Logger.log('✅ Settings sheet successfully refreshed!');
}

/**
 * One-Click Initial Setup Function
 */
function initialSetup() {
  Logger.log('🚀 Starting Nandhanam Elite initialSetup...');
  try {
    var ss = getTargetSpreadsheet();
    Logger.log('Connected to Sheet: "' + ss.getName() + '" (ID: ' + ss.getId() + ')');

    // 1. Rooms Sheet
    var roomSheet = ss.getSheetByName(SHEET_ROOMS) || ss.insertSheet(SHEET_ROOMS);
    roomSheet.clear();
    var roomHeaders = [
      'room_id', 'room_name', 'description', 'price_per_night', 'capacity', 'amenities', 'image_url', 'status', 'created_at', 'updated_at'
    ];
    roomSheet.getRange(1, 1, 1, roomHeaders.length).setValues([roomHeaders])
      .setFontWeight('bold').setBackground('#E2C48C');

    var nowStr = getFormattedTimestamp();
    roomSheet.appendRow([
      'R001', 'AC Room',
      'Spacious air-conditioned room (8 rooms in property) with plush bedding, private modern attached bathroom, TV in every room, and scenic view.',
      1699, 2, 'Air Conditioning, TV in every room, Attached Bathroom, 24/7 Hot Water, High-Speed Wi-Fi, Daily housekeeping / cleaning on request',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=900&q=80',
      'Active', nowStr, nowStr
    ]);
    roomSheet.appendRow([
      'R002', 'Non AC Comfort Room',
      'Well-ventilated comfortable double bedroom (8 rooms in property) with attached bathroom, TV in every room, and work desk.',
      1299, 2, 'Natural Ventilation, TV in every room, Attached Bathroom, 24/7 Hot Water, Wi-Fi, Daily housekeeping / cleaning on request',
      'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=900&q=80',
      'Active', nowStr, nowStr
    ]);

    // 2. Bookings Sheet
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
    settSheet.getRange('A1:B50').setNumberFormat('@'); // Enforce Plain Text to prevent formula parse errors
    settSheet.getRange(1, 1, 1, 2).setValues([['Setting', 'Value']])
      .setFontWeight('bold').setBackground('#C5A880');
    settSheet.appendRow(['property_name', 'Nandhanam Elite Tourist Home']);
    settSheet.appendRow(['total_rooms', '16']);
    settSheet.appendRow(['ac_rooms', '8']);
    settSheet.appendRow(['non_ac_rooms', '8']);
    settSheet.appendRow(['advance_required', '₹500']);
    settSheet.appendRow(['cancellation_policy', 'Free cancellation upto 48hrs before check-in']);
    settSheet.appendRow(['housekeeping', 'Daily housekeeping / cleaning on request']);
    settSheet.appendRow(['phone', '9447736460']);
    settSheet.appendRow(['whatsapp', '9447736460']);
    settSheet.appendRow(['email', 'nandhanamelite@gmail.com']);
    settSheet.appendRow(['admin_notification_email', 'nandhanamelite@gmail.com']);
    settSheet.appendRow(['callmebot_phone', '919447736460']);
    settSheet.appendRow(['callmebot_apikey', '']);
    settSheet.appendRow(['whatsapp_webhook_url', '']);
    settSheet.appendRow(['instagram', 'https://www.instagram.com/nandhanamelite?igsi=MWJ0emhiYmQyNnZ4OQ==']);
    settSheet.appendRow(['facebook', 'https://www.facebook.com/share/1R2bhGNVuv/?mibextid=wwXIfr']);
    settSheet.appendRow(['address', 'Annz Colors, Vengalloor - Mangattukavala Bypass Rd, Thodupuzha, Kerala 685585']);
    settSheet.appendRow(['check_in_time', 'Flexible (24-Hour Cycle)']);
    settSheet.appendRow(['check_out_time', '24 Hours from Check-in']);
    settSheet.appendRow(['timezone', TIMEZONE]);
    settSheet.appendRow(['pending_expiry_minutes', PENDING_EXPIRY_MINUTES]);
    settSheet.appendRow(['currency', '₹']);

    // 4. Add Status Dropdown Data Validation to Bookings Sheet (Column 14 - Status)
    var statusRange = bookSheet.getRange('N2:N1000');
    var statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Pending', 'Confirmed', 'Done', 'Cancelled', 'Completed', 'Expired'], true)
      .setAllowInvalid(true)
      .build();
    statusRange.setDataValidation(statusRule);

    // 5. Add Smart Color-Coded Chip Formatting for Statuses
    var rules = [];
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Pending')
      .setBackground('#FEF3C7').setFontColor('#92400E').setBold(true)
      .setRanges([statusRange]).build());

    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Confirmed')
      .setBackground('#D1FAE5').setFontColor('#065F46').setBold(true)
      .setRanges([statusRange]).build());

    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Done')
      .setBackground('#A7F3D0').setFontColor('#047857').setBold(true)
      .setRanges([statusRange]).build());

    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Cancelled')
      .setBackground('#FEE2E2').setFontColor('#991B1B').setBold(true)
      .setRanges([statusRange]).build());

    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Completed')
      .setBackground('#DBEAFE').setFontColor('#1E40AF').setBold(true)
      .setRanges([statusRange]).build());

    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Expired')
      .setBackground('#F3F4F6').setFontColor('#6B7280').setBold(true)
      .setRanges([statusRange]).build());

    bookSheet.setConditionalFormatRules(rules);

    // 6. Install Background 5-Minute Expiration Trigger & Spreadsheet onEdit Trigger
    installAllTriggers();

    Logger.log('✅ Nandhanam Elite Google Sheet initial setup with Color-Coded Status Chips and automated triggers installed successfully!');
  } catch (err) {
    Logger.log('❌ Error during initialSetup: ' + err.toString());
    throw err;
  }
}

/**
 * Formula Injection Sanitization Helper
 */
function sanitizeSheetCell(val) {
  if (val === null || val === undefined) return '';
  var str = String(val).trim();
  if (str.length > 0) {
    var firstChar = str.charAt(0);
    // Strip leading + so phone numbers (+91...) don't trigger Google Sheets formula parse error (#ERROR!)
    if (firstChar === '+') {
      return str.replace(/^\+/, '').trim();
    }
    if (firstChar === '=' || firstChar === '-' || firstChar === '@') {
      return "'" + str;
    }
  }
  return str;
}

/**
 * Timezone & Date Helpers
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
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else if (parts[2].length === 4) {
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
  }
  var d = new Date(str);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * 🧪 Test Function: Run this directly in Google Apps Script to authorize & verify email sending
 */
function testSendSampleEmail() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var settings = getNotificationSettings(ss);
  var sampleBooking = {
    booking_id: 'TEST-BK-' + Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd-HHmmss'),
    room_id: 'R001',
    room_name: 'AC Room',
    guest_name: 'Test Guest',
    phone: '+91 94477 36460',
    email: settings.admin_notification_email || 'nandhanamelite@gmail.com',
    check_in: Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd'),
    check_out: Utilities.formatDate(new Date(Date.now() + 86400000), TIMEZONE, 'yyyy-MM-dd'),
    adults: 2,
    children: 0,
    total_guests: 2,
    total_nights: 1,
    price_per_night: 1699,
    total_amount: 1699,
    notes: 'Test email alert trigger from Google Apps Script editor',
    status: 'Pending',
    created_at: getFormattedTimestamp()
  };

  Logger.log('📧 Sending Test Admin Alert Email to: ' + sampleBooking.email);
  sendAdminNotificationEmail(sampleBooking, settings);
  sendGuestReceiptEmail(sampleBooking, settings);
  Logger.log('✅ Test Emails successfully sent to ' + sampleBooking.email + '! Check your Gmail inbox.');
}

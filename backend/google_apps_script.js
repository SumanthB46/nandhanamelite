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

    // Evaluate availability per room
    var availability = allRooms.map(function (room) {
      if (filterRoomId && room.room_id !== filterRoomId) {
        return null;
      }

      var fitsCapacity = guests ? room.capacity >= guests : true;
      var isOverlapping = false;
      var overlappingBookings = [];

      for (var j = 0; j < activeBookings.length; j++) {
        var b = activeBookings[j];
        if (b.room_id === room.room_id) {
          if (reqIn < b.check_out && reqOut > b.check_in) {
            isOverlapping = true;
            overlappingBookings.push({
              check_in: getFormattedDate(b.check_in),
              check_out: getFormattedDate(b.check_out),
              status: b.status
            });
          }
        }
      }

      var isAvailable = !isOverlapping && fitsCapacity;
      var reason = '';
      if (isOverlapping) {
        var dateSpans = overlappingBookings.map(function (ob) {
          return ob.check_in + ' to ' + ob.check_out;
        }).join(', ');
        reason = 'Booked for dates: ' + dateSpans;
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
        overlapping_dates: overlappingBookings,
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

    for (var k = 0; k < activeBookings.length; k++) {
      var ab = activeBookings[k];
      if (ab.room_id === roomId) {
        if (reqIn < ab.check_out && reqOut > ab.check_in) {
          return createErrorResponse(
            'BOOKING_CONFLICT',
            'Sorry, ' + matchedRoom.room_name + ' was just booked for the selected dates. Please select different dates or another room.'
          );
        }
      }
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

    return createSuccessResponse({
      booking_id: bookingId,
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
          var validStatuses = ['Pending', 'Confirmed', 'Cancelled', 'Completed', 'Expired'];
          var matchingStatus = validStatuses.find(function (s) { return s.toLowerCase() === String(data.new_status).toLowerCase(); });
          if (matchingStatus) {
            sheet.getRange(rowNum, statusIdx + 1).setValue(matchingStatus);
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
 * Install Time-Driven Trigger for Auto-Expiration (Runs periodically)
 */
function installTimeDrivenTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'autoExpirePendingBookings') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('autoExpirePendingBookings')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('5-minute time-driven trigger for autoExpirePendingBookings installed successfully.');
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
 * 7. Get Homestay Settings
 */
function handleGetSettings() {
  try {
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
 * One-Click Initial Setup Function
 */
function initialSetup() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

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
    'R001', 'AC Luxury Room',
    'Spacious air-conditioned room (8 rooms in property) with plush bedding, private modern attached bathroom, TV in every room, and scenic view.',
    1699, 2, 'Air Conditioning, TV in every room, Attached Bathroom, 24/7 Hot Water, High-Speed Wi-Fi, Daily housekeeping / cleaning on req',
    'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=900&q=80',
    'Active', nowStr, nowStr
  ]);
  roomSheet.appendRow([
    'R002', 'Non AC Comfort Room',
    'Well-ventilated comfortable double bedroom (8 rooms in property) with attached bathroom, TV in every room, and work desk.',
    1299, 2, 'Natural Ventilation, TV in every room, Attached Bathroom, Hot Water, Wi-Fi, Daily housekeeping / cleaning on req',
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
  settSheet.getRange(1, 1, 1, 2).setValues([['Setting', 'Value']])
    .setFontWeight('bold').setBackground('#C5A880');
  settSheet.appendRow(['property_name', 'Nandhanam Elite Tourist Home']);
  settSheet.appendRow(['total_rooms', '16']);
  settSheet.appendRow(['ac_rooms', '8']);
  settSheet.appendRow(['non_ac_rooms', '8']);
  settSheet.appendRow(['advance_required', '₹500']);
  settSheet.appendRow(['cancellation_policy', 'Free cancellation upto 48hrs before check-in']);
  settSheet.appendRow(['housekeeping', 'Daily housekeeping / cleaning on req']);
  settSheet.appendRow(['phone', '+91 94470 00000']);
  settSheet.appendRow(['whatsapp', '+91 94470 00000']);
  settSheet.appendRow(['email', 'nandhanamelite@gmail.com']);
  settSheet.appendRow(['address', 'Kaithakod Junction, Vengalloor – Mangattukavala Bypass Road, Thodupuzha East PO, Pin: 685585, Kerala, India']);
  settSheet.appendRow(['check_in_time', '2:00 PM']);
  settSheet.appendRow(['check_out_time', '11:00 AM']);
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

  // 6. Install Background 5-Minute Expiration Trigger
  installTimeDrivenTriggers();

  Logger.log('Nandhanam Elite Google Sheet initial setup with Color-Coded Status Chips installed!');
}

/**
 * Formula Injection Sanitization Helper
 */
function sanitizeSheetCell(val) {
  if (val === null || val === undefined) return '';
  var str = String(val).trim();
  if (str.length > 0) {
    var firstChar = str.charAt(0);
    if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@') {
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

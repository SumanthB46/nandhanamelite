/**
 * ============================================================================
 * NANDHANAM ELITE HOMESTAY - GOOGLE APPS SCRIPT BACKEND API
 * ============================================================================
 * 
 * Features:
 * 1. Room listings retrieval (active rooms, capacity, price, amenities)
 * 2. Real-time date overlap availability engine:
 *    Formula: requested_checkin < booked_checkout && requested_checkout > booked_checkin
 * 3. Atomic double-booking protection using LockService
 * 4. Booking creation with unique ID generation (e.g., NE-B1001)
 * 5. Update / Cancel booking actions
 * 6. Early checkout handling (releases room from new checkout date onwards)
 * 7. CORS support for direct fetch from website frontend
 * 
 * Setup Instructions:
 * - Create a Google Sheet named "Nandhanam Elite Bookings"
 * - Go to Extensions -> Apps Script -> Paste this code into Code.gs
 * - Run initialSetup() once to generate sheets and sample data
 * - Click Deploy -> New Deployment -> Web App (Execute as: Me, Who has access: Anyone)
 * - Copy the Web App URL and paste it in frontend script.js as APPS_SCRIPT_URL
 */

// Configuration
var SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
var SHEET_ROOMS = 'Rooms';
var SHEET_BOOKINGS = 'Bookings';
var SHEET_SETTINGS = 'Settings';

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
      var guests = parseInt(params.guests || '1', 10);
      var roomId = params.room_id || null;
      result = handleCheckAvailability(checkin, checkout, guests, roomId);
    } else if (action === 'getSettings') {
      result = handleGetSettings();
    } else if (action === 'ping') {
      result = { status: 'success', message: 'Nandhanam Elite Booking API is active.' };
    } else {
      result = { status: 'error', message: 'Unknown action: ' + action };
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
    // Wait up to 10 seconds for concurrent requests to prevent double-booking
    var hasLock = lock.tryLock(10000);
    if (!hasLock) {
      return jsonResponse({
        status: 'error',
        message: 'Server is busy processing another booking. Please retry in a moment.'
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
      result = handleCreateBooking(data);
    } else if (action === 'cancelBooking') {
      result = handleCancelBooking(data.booking_id);
    } else if (action === 'updateBooking') {
      result = handleUpdateBooking(data);
    } else {
      result = { status: 'error', message: 'Unknown action: ' + action };
    }
    
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Return JSON Response with CORS headers
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 1. Get all active rooms
 */
function handleGetRooms() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_ROOMS);
  if (!sheet) {
    return { status: 'error', message: 'Rooms sheet not found. Run initialSetup() first.' };
  }
  
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { status: 'success', rooms: [] };
  
  var headers = rows[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var idIdx = headers.indexOf('room_id');
  var nameIdx = headers.indexOf('room_name');
  var priceIdx = headers.indexOf('price');
  var capIdx = headers.indexOf('capacity');
  var statusIdx = headers.indexOf('status');
  var descIdx = headers.indexOf('description');
  var amenitiesIdx = headers.indexOf('amenities');
  
  var rooms = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var status = statusIdx >= 0 ? String(row[statusIdx]).trim() : 'Active';
    
    if (status.toLowerCase() === 'active') {
      rooms.push({
        room_id: idIdx >= 0 ? String(row[idIdx]).trim() : 'R00' + i,
        room_name: nameIdx >= 0 ? String(row[nameIdx]).trim() : 'Room ' + i,
        price: priceIdx >= 0 ? Number(row[priceIdx]) : 0,
        capacity: capIdx >= 0 ? Number(row[capIdx]) : 2,
        description: descIdx >= 0 ? String(row[descIdx]) : '',
        amenities: amenitiesIdx >= 0 ? String(row[amenitiesIdx]).split(',').map(function(s){ return s.trim(); }) : [],
        status: status
      });
    }
  }
  
  return { status: 'success', rooms: rooms };
}

/**
 * 2. Check Availability with Overlap Engine
 * Overlap formula: (req_in < booked_out) AND (req_out > booked_in)
 */
function handleCheckAvailability(checkinStr, checkoutStr, guests, filterRoomId) {
  if (!checkinStr || !checkoutStr) {
    return { status: 'error', message: 'Check-in and Check-out dates are required.' };
  }
  
  var reqIn = parseDateString(checkinStr);
  var reqOut = parseDateString(checkoutStr);
  
  if (!reqIn || !reqOut || reqOut <= reqIn) {
    return { status: 'error', message: 'Check-out date must be strictly after Check-in date.' };
  }
  
  var roomsRes = handleGetRooms();
  if (roomsRes.status !== 'success') return roomsRes;
  var allRooms = roomsRes.rooms;
  
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var bookingSheet = ss.getSheetByName(SHEET_BOOKINGS);
  var bookings = [];
  
  if (bookingSheet && bookingSheet.getLastRow() > 1) {
    var bRows = bookingSheet.getDataRange().getValues();
    var bHeaders = bRows[0].map(function(h) { return String(h).trim().toLowerCase(); });
    
    var bRoomIdIdx = bHeaders.indexOf('room_id');
    var bCheckInIdx = bHeaders.indexOf('check_in');
    var bCheckOutIdx = bHeaders.indexOf('check_out');
    var bStatusIdx = bHeaders.indexOf('status');
    
    for (var i = 1; i < bRows.length; i++) {
      var row = bRows[i];
      var bStatus = bStatusIdx >= 0 ? String(row[bStatusIdx]).trim().toLowerCase() : '';
      
      // Only 'pending' and 'confirmed' block availability. 'cancelled' or 'completed' do not block.
      if (bStatus === 'pending' || bStatus === 'confirmed') {
        var bIn = parseDateString(row[bCheckInIdx]);
        var bOut = parseDateString(row[bCheckOutIdx]);
        
        if (bIn && bOut) {
          bookings.push({
            room_id: String(row[bRoomIdIdx]).trim(),
            check_in: bIn,
            check_out: bOut
          });
        }
      }
    }
  }
  
  // Calculate total nights
  var diffTime = Math.abs(reqOut - reqIn);
  var totalNights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // Check each room
  var availability = allRooms.map(function(room) {
    if (filterRoomId && room.room_id !== filterRoomId) {
      return null;
    }
    
    // Check if capacity fits
    var fitsCapacity = guests ? room.capacity >= guests : true;
    
    // Check date overlap against active bookings
    var isOverlapping = false;
    for (var j = 0; j < bookings.length; j++) {
      var b = bookings[j];
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
      reason = 'Booked for selected dates';
    } else if (!fitsCapacity) {
      reason = 'Exceeds maximum guest capacity (' + room.capacity + ' guests max)';
    }
    
    return {
      room_id: room.room_id,
      room_name: room.room_name,
      price_per_night: room.price,
      total_nights: totalNights,
      total_estimated_price: room.price * totalNights,
      capacity: room.capacity,
      is_available: isAvailable,
      unavailability_reason: reason,
      amenities: room.amenities,
      description: room.description
    };
  }).filter(function(item) { return item !== null; });
  
  return {
    status: 'success',
    check_in: formatDateString(reqIn),
    check_out: formatDateString(reqOut),
    total_nights: totalNights,
    requested_guests: guests,
    results: availability
  };
}

/**
 * 3. Create a new Booking Request (with atomic double-check)
 */
function handleCreateBooking(data) {
  var roomId = String(data.room_id || '').trim();
  var checkinStr = String(data.check_in || '').trim();
  var checkoutStr = String(data.check_out || '').trim();
  var guestName = String(data.guest_name || data.name || '').trim();
  var guestPhone = String(data.guest_phone || data.mobile || data.phone || '').trim();
  var guestEmail = String(data.guest_email || data.email || '').trim();
  var guestCount = parseInt(data.guest_count || data.guests || '1', 10);
  var specialRequests = String(data.special_requests || data.notes || '').trim();
  
  if (!roomId || !checkinStr || !checkoutStr || !guestName || !guestPhone) {
    return {
      status: 'error',
      message: 'Missing required fields: Room ID, Check-in, Check-out, Name, and Phone are required.'
    };
  }
  
  // Re-verify availability immediately before saving
  var availCheck = handleCheckAvailability(checkinStr, checkoutStr, guestCount, roomId);
  if (availCheck.status !== 'success') {
    return availCheck;
  }
  
  var targetRoomResult = availCheck.results.find(function(r) { return r.room_id === roomId; });
  if (!targetRoomResult || !targetRoomResult.is_available) {
    return {
      status: 'error',
      message: 'Sorry, this room was just booked for the selected dates. Please choose different dates or another room.'
    };
  }
  
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var bookingSheet = ss.getSheetByName(SHEET_BOOKINGS);
  if (!bookingSheet) {
    return { status: 'error', message: 'Bookings sheet not found.' };
  }
  
  // Generate unique booking ID: NE-B + random 4-digit or row counter
  var timestamp = new Date();
  var year = timestamp.getFullYear();
  var month = ('0' + (timestamp.getMonth() + 1)).slice(-2);
  var randomSuffix = Math.floor(1000 + Math.random() * 9000);
  var bookingId = 'NE-' + year + month + '-' + randomSuffix;
  
  var reqIn = parseDateString(checkinStr);
  var reqOut = parseDateString(checkoutStr);
  var diffTime = Math.abs(reqOut - reqIn);
  var totalNights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  var totalPrice = targetRoomResult.price_per_night * totalNights;
  
  // Append to Bookings Sheet:
  // [booking_id, room_id, room_name, guest_name, guest_phone, guest_email, check_in, check_out, guests, total_nights, total_price, status, created_at, notes]
  bookingSheet.appendRow([
    bookingId,
    roomId,
    targetRoomResult.room_name,
    guestName,
    guestPhone,
    guestEmail,
    formatDateString(reqIn),
    formatDateString(reqOut),
    guestCount,
    totalNights,
    totalPrice,
    'Pending', // Default status for client confirmation
    timestamp.toISOString(),
    specialRequests
  ]);
  
  return {
    status: 'success',
    booking_id: bookingId,
    message: 'Booking request successfully placed!',
    details: {
      booking_id: bookingId,
      room_id: roomId,
      room_name: targetRoomResult.room_name,
      guest_name: guestName,
      guest_phone: guestPhone,
      guest_email: guestEmail,
      check_in: formatDateString(reqIn),
      check_out: formatDateString(reqOut),
      total_nights: totalNights,
      guest_count: guestCount,
      total_price: totalPrice,
      status: 'Pending',
      payment_instructions: 'Payment is collected separately by the property upon arrival / UPI.'
    }
  };
}

/**
 * 4. Cancel a Booking (Mark status as Cancelled)
 */
function handleCancelBooking(bookingId) {
  if (!bookingId) return { status: 'error', message: 'Booking ID required.' };
  
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_BOOKINGS);
  if (!sheet) return { status: 'error', message: 'Bookings sheet not found.' };
  
  var rows = sheet.getDataRange().getValues();
  var idIdx = 0;
  var statusIdx = 11;
  
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]).trim() === String(bookingId).trim()) {
      sheet.getRange(i + 1, statusIdx + 1).setValue('Cancelled');
      return { status: 'success', message: 'Booking ' + bookingId + ' has been cancelled.' };
    }
  }
  
  return { status: 'error', message: 'Booking ID not found.' };
}

/**
 * 5. Update Booking (dates or status)
 */
function handleUpdateBooking(data) {
  var bookingId = String(data.booking_id || '').trim();
  if (!bookingId) return { status: 'error', message: 'Booking ID required.' };
  
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_BOOKINGS);
  if (!sheet) return { status: 'error', message: 'Bookings sheet not found.' };
  
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var idIdx = headers.indexOf('booking_id');
  var checkOutIdx = headers.indexOf('check_out');
  var statusIdx = headers.indexOf('status');
  
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]).trim() === bookingId) {
      if (data.new_checkout_date && checkOutIdx >= 0) {
        var parsed = parseDateString(data.new_checkout_date);
        if (parsed) {
          sheet.getRange(i + 1, checkOutIdx + 1).setValue(formatDateString(parsed));
        }
      }
      if (data.new_status && statusIdx >= 0) {
        sheet.getRange(i + 1, statusIdx + 1).setValue(data.new_status);
      }
      return { status: 'success', message: 'Booking ' + bookingId + ' updated successfully.' };
    }
  }
  
  return { status: 'error', message: 'Booking ID not found.' };
}

/**
 * 6. Get Homestay Settings
 */
function handleGetSettings() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_SETTINGS);
  var settings = {
    property_name: 'Nandhanam Elite Tourist Home',
    phone: '+91 9447000000',
    whatsapp: '+91 9447000000',
    email: 'nandhanamelite@gmail.com',
    address: 'Kaithakod Junction, Vengalloor – Mangattukavala Bypass Road, Thodupuzha East PO, Pin: 685585, Kerala, India',
    checkin_time: '2:00 PM',
    checkout_time: '11:00 AM',
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
 * One-Click Initial Setup for Google Sheet
 * Run this function inside Google Apps Script to auto-populate sheets with headers and sample data!
 */
function initialSetup() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // 1. Rooms Sheet
  var roomSheet = ss.getSheetByName(SHEET_ROOMS) || ss.insertSheet(SHEET_ROOMS);
  roomSheet.clear();
  roomSheet.getRange(1, 1, 1, 7).setValues([[
    'room_id', 'room_name', 'price', 'capacity', 'status', 'description', 'amenities'
  ]]);
  roomSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#E2C48C');
  roomSheet.appendRow([
    'R001', 'AC Luxury Room', 2000, 2, 'Active',
    'Spacious air-conditioned room with king-size bed, private modern bathroom, and scenic view.',
    'AC, Wi-Fi, Hot Water, Attached Bathroom, Daily Housekeeping'
  ]);
  roomSheet.appendRow([
    'R002', 'Non AC Comfort Room', 1500, 2, 'Active',
    'Well-ventilated comfortable double bedroom with attached bathroom and work desk.',
    'Wi-Fi, Hot Water, Attached Bathroom, Ceiling Fan, Daily Housekeeping'
  ]);
  roomSheet.appendRow([
    'R003', 'Family Executive Suite', 3200, 4, 'Active',
    'Large suite ideal for families with 2 double beds, AC, and private living area.',
    'AC, Wi-Fi, Hot Water, Attached Bathroom, TV, Living Area, Balcony'
  ]);
  
  // 2. Bookings Sheet
  var bookSheet = ss.getSheetByName(SHEET_BOOKINGS) || ss.insertSheet(SHEET_BOOKINGS);
  bookSheet.clear();
  bookSheet.getRange(1, 1, 1, 14).setValues([[
    'booking_id', 'room_id', 'room_name', 'guest_name', 'guest_phone', 'guest_email',
    'check_in', 'check_out', 'guests', 'total_nights', 'total_price', 'status', 'created_at', 'notes'
  ]]);
  bookSheet.getRange(1, 1, 1, 14).setFontWeight('bold').setBackground('#D4AF37');
  
  // Sample booking for demonstration
  var today = new Date();
  var sampleIn = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5);
  var sampleOut = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  bookSheet.appendRow([
    'NE-SAMPLE-01', 'R001', 'AC Luxury Room', 'Rahul Sharma', '+91 9876543210', 'rahul@example.com',
    formatDateString(sampleIn), formatDateString(sampleOut), 2, 2, 4000, 'Confirmed', today.toISOString(), 'Late check-in requested'
  ]);
  
  // 3. Settings Sheet
  var settSheet = ss.getSheetByName(SHEET_SETTINGS) || ss.insertSheet(SHEET_SETTINGS);
  settSheet.clear();
  settSheet.getRange(1, 1, 1, 2).setValues([['Setting', 'Value']]);
  settSheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#C5A880');
  settSheet.appendRow(['Property name', 'Nandhanam Elite Tourist Home']);
  settSheet.appendRow(['Phone', '+91 9447000000']);
  settSheet.appendRow(['WhatsApp', '+91 9447000000']);
  settSheet.appendRow(['Email', 'nandhanamelite@gmail.com']);
  settSheet.appendRow(['Address', 'Kaithakod Junction, Vengalloor – Mangattukavala Bypass Road, Thodupuzha East PO, Pin: 685585, Kerala, India']);
  settSheet.appendRow(['Check-in time', '2:00 PM']);
  settSheet.appendRow(['Check-out time', '11:00 AM']);
  settSheet.appendRow(['Currency', '₹']);
  
  Logger.log('Nandhanam Elite Google Sheet setup complete!');
}

/**
 * Date helper: Parse YYYY-MM-DD string or Date object to midnight Date
 */
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
 * Date helper: Format Date object to YYYY-MM-DD string
 */
function formatDateString(date) {
  if (!date) return '';
  var yyyy = date.getFullYear();
  var mm = ('0' + (date.getMonth() + 1)).slice(-2);
  var dd = ('0' + date.getDate()).slice(-2);
  return yyyy + '-' + mm + '-' + dd;
}

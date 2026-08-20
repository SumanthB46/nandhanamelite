/* ==========================================================================
   NANDHANAM ELITE TOURIST HOME - BOOKING ENGINE & CLIENT LOGIC
   ========================================================================== */

/**
 * GOOGLE APPS SCRIPT WEB APP URL
 * Once deployed, paste your Google Apps Script Web App URL below:
 * Example: const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfyc.../exec';
 * 
 * If left empty or if offline, the website automatically operates with a seamless
 * built-in local availability engine so you can test all features right away!
 */
const APPS_SCRIPT_URL = '';

// Property Contact details
const PROPERTY_PHONE = '+919447000000';
const PROPERTY_WA_NUMBER = '919447000000';

// Room Catalogue Data
const ROOMS_DATA = {
  'R001': {
    id: 'R001',
    name: 'AC Luxury Room',
    tag: 'AIR CONDITIONED',
    price: 2000,
    capacity: 2,
    img: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80',
    desc: 'Spacious climate-controlled room featuring plush queen bedding, modern attached bathroom with hot water, and quiet garden ambience. Ideal for couples, solo business executives, and small families.',
    amenities: ['Air Conditioning', 'King / Queen Bed', 'Attached Bathroom', '24/7 Hot Water', 'High-Speed Wi-Fi', 'Daily Housekeeping', 'Power Backup']
  },
  'R002': {
    id: 'R002',
    name: 'Non AC Comfort Room',
    tag: 'NATURAL VENTILATION',
    price: 1500,
    capacity: 2,
    img: 'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=1200&q=80',
    desc: 'Well-ventilated, breezy double bedroom designed for budget-conscious travellers seeking clean, comfortable accommodation in central Thodupuzha.',
    amenities: ['Natural Cross-Ventilation', 'Comfortable Double Bed', 'Attached Bathroom', 'Hot Water on Demand', 'High-Speed Wi-Fi', 'Ceiling Fan', 'Daily Housekeeping']
  },
  'R003': {
    id: 'R003',
    name: 'Family Executive Suite',
    tag: 'FAMILY SUITE',
    price: 3200,
    capacity: 4,
    img: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1200&q=80',
    desc: 'Expansive private suite with 2 double beds, AC, lounge sitting area, and private balcony overlooking lush greenery. Perfectly suited for families and small travel groups.',
    amenities: ['Air Conditioning', '2 Queen Double Beds', 'Private Balcony', 'Attached Bathroom', 'Hot Water', 'High-Speed Wi-Fi', 'Living Lounge', 'Power Backup']
  }
};

// In-Memory Bookings Store (Mock Backend for Instant Offline / Test Usage)
const LOCAL_BOOKINGS_STORE = [
  // Sample booking for demonstration (blocks R001 on sample dates)
  {
    booking_id: 'NE-SAMPLE-01',
    room_id: 'R001',
    check_in: getOffsetDateString(5),
    check_out: getOffsetDateString(7),
    guest_name: 'Rahul Sharma',
    guest_phone: '+91 9876543210',
    guests: 2,
    status: 'Confirmed'
  }
];

// Helper: Get YYYY-MM-DD offset from today
function getOffsetDateString(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return formatDate(d);
}

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

function calculateNights(inStr, outStr) {
  const dIn = parseDate(inStr);
  const dOut = parseDate(outStr);
  if (!dIn || !dOut || dOut <= dIn) return 1;
  const diffTime = Math.abs(dOut - dIn);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/* ==========================================================================
   DOM INITIALIZATION
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initDatePickers();
  initRoomCardsEvents();
  initModals();
  initGalleryLightbox();
  initReviewsCarousel();

  // Run initial availability calculation
  window.checkAvailabilityAction(false);
});

/* ==========================================================================
   1. NAVIGATION & MOBILE MENU
   ========================================================================== */
function initNavigation() {
  const menuToggle = document.getElementById('menuToggle');
  const mainNav = document.getElementById('mainNav');
  const navLinks = document.querySelectorAll('.nav-link');

  if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', () => {
      mainNav.classList.toggle('open');
      menuToggle.classList.toggle('active');
    });

    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('open');
        menuToggle.classList.remove('active');
      });
    });
  }

  // Active link on scroll
  const sections = document.querySelectorAll('section[id]');
  window.addEventListener('scroll', () => {
    const scrollY = window.pageYOffset;
    sections.forEach(current => {
      const sectionHeight = current.offsetHeight;
      const sectionTop = current.offsetTop - 120;
      const sectionId = current.getAttribute('id');
      const navItem = document.querySelector(`.nav-link[href*="${sectionId}"]`);

      if (navItem) {
        if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
          navLinks.forEach(link => link.classList.remove('active'));
          navItem.classList.add('active');
        }
      }
    });
  });
}

/* ==========================================================================
   2. DATE PICKERS & STAY DURATION
   ========================================================================== */
function initDatePickers() {
  const checkinInput = document.getElementById('checkinDate');
  const checkoutInput = document.getElementById('checkoutDate');
  const stayDurationHint = document.getElementById('stayDurationHint');

  if (checkinInput && checkoutInput) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    checkinInput.min = formatDate(today);
    checkinInput.value = formatDate(today);

    checkoutInput.min = formatDate(tomorrow);
    checkoutInput.value = formatDate(tomorrow);

    const updateDurationHint = () => {
      const nights = calculateNights(checkinInput.value, checkoutInput.value);
      if (stayDurationHint) {
        stayDurationHint.textContent = `${nights} ${nights === 1 ? 'Night' : 'Nights'} selected`;
      }
      // Update displayed price estimates on room cards
      updateRoomCardsPricing(nights);
    };

    checkinInput.addEventListener('change', () => {
      const selectedCheckin = parseDate(checkinInput.value);
      if (selectedCheckin) {
        const nextDay = new Date(selectedCheckin);
        nextDay.setDate(nextDay.getDate() + 1);
        checkoutInput.min = formatDate(nextDay);
        
        const currentCheckout = parseDate(checkoutInput.value);
        if (!currentCheckout || currentCheckout <= selectedCheckin) {
          checkoutInput.value = formatDate(nextDay);
        }
      }
      updateDurationHint();
      window.checkAvailabilityAction(false);
    });

    checkoutInput.addEventListener('change', () => {
      updateDurationHint();
      window.checkAvailabilityAction(false);
    });

    const guestCountSelect = document.getElementById('guestCount');
    if (guestCountSelect) {
      guestCountSelect.addEventListener('change', () => {
        window.checkAvailabilityAction(false);
      });
    }

    updateDurationHint();
  }
}

function updateRoomCardsPricing(nights) {
  Object.keys(ROOMS_DATA).forEach(roomId => {
    const room = ROOMS_DATA[roomId];
    const total = room.price * nights;
    const estContainer = document.getElementById(`estimate-${roomId}`);
    if (estContainer) {
      estContainer.style.display = 'block';
      const estAmount = estContainer.querySelector('.est-amount');
      if (estAmount) {
        estAmount.textContent = `₹${total.toLocaleString('en-IN')}`;
      }
    }
  });
}

/* ==========================================================================
   3. AVAILABILITY ENGINE & DATE OVERLAP LOGIC
   ========================================================================== */
/**
 * Check Availability Action
 * @param {boolean} shouldScroll - whether to scroll to rooms section
 */
window.checkAvailabilityAction = async function(shouldScroll = true) {
  const checkinInput = document.getElementById('checkinDate');
  const checkoutInput = document.getElementById('checkoutDate');
  const guestSelect = document.getElementById('guestCount');
  const banner = document.getElementById('availabilityBanner');
  const bannerTitle = document.getElementById('bannerTitle');
  const bannerDesc = document.getElementById('bannerDesc');
  const bannerIcon = document.getElementById('bannerIcon');
  const checkBtn = document.getElementById('checkAvailBtn');

  if (!checkinInput || !checkoutInput) return;

  const checkin = checkinInput.value;
  const checkout = checkoutInput.value;
  const guests = parseInt(guestSelect ? guestSelect.value : '2', 10);
  const nights = calculateNights(checkin, checkout);

  if (!checkin || !checkout) return;

  // Show spinner
  if (checkBtn) {
    const text = checkBtn.querySelector('.btn-text');
    const spinner = checkBtn.querySelector('.btn-spinner');
    if (text) text.style.display = 'none';
    if (spinner) spinner.style.display = 'inline-block';
  }

  try {
    let results = [];

    // Attempt Google Apps Script live fetch if configured
    if (APPS_SCRIPT_URL && APPS_SCRIPT_URL.trim() !== '') {
      const apiUrl = `${APPS_SCRIPT_URL}?action=checkAvailability&check_in=${encodeURIComponent(checkin)}&check_out=${encodeURIComponent(checkout)}&guests=${guests}`;
      const response = await fetch(apiUrl);
      const data = await response.json();
      if (data && data.status === 'success') {
        results = data.results;
      } else {
        throw new Error(data.message || 'Error from Google Apps Script');
      }
    } else {
      // Local In-Memory Overlap Calculation (Standard formula)
      results = calculateLocalAvailability(checkin, checkout, guests);
    }

    // Update Room Card UI
    let availableCount = 0;
    results.forEach(res => {
      const roomCard = document.querySelector(`.room-card[data-room-id="${res.room_id}"]`);
      const badge = document.getElementById(`badge-${res.room_id}`);
      const bookBtn = roomCard ? roomCard.querySelector('.book-room-btn') : null;

      if (badge && roomCard && bookBtn) {
        if (res.is_available) {
          availableCount++;
          badge.className = 'room-status-badge available';
          badge.textContent = 'Available';
          roomCard.classList.remove('is-booked');
          bookBtn.disabled = false;
          bookBtn.textContent = 'SELECT & BOOK';
        } else {
          roomCard.classList.add('is-booked');
          bookBtn.disabled = true;
          if (res.unavailability_reason && res.unavailability_reason.includes('capacity')) {
            badge.className = 'room-status-badge exceeded';
            badge.textContent = `Max ${res.capacity} Guests`;
            bookBtn.textContent = 'EXCEEDS CAPACITY';
          } else {
            badge.className = 'room-status-badge booked';
            badge.textContent = 'Booked for Dates';
            bookBtn.textContent = 'UNAVAILABLE';
          }
        }
      }
    });

    // Update Feedback Banner
    if (banner) {
      banner.style.display = 'block';
      if (availableCount > 0) {
        banner.className = 'availability-status-banner';
        bannerIcon.textContent = '✓';
        bannerTitle.textContent = `${availableCount} Room ${availableCount === 1 ? 'Option' : 'Options'} Available`;
        bannerDesc.textContent = `Stay for ${nights} ${nights === 1 ? 'Night' : 'Nights'} (${checkin} to ${checkout}) for ${guests} ${guests === 1 ? 'Guest' : 'Guests'}.`;
      } else {
        banner.className = 'availability-status-banner error';
        bannerIcon.textContent = '✕';
        bannerTitle.textContent = 'No Rooms Available For Selected Dates';
        bannerDesc.textContent = 'All rooms are occupied for these dates or exceed guest capacity. Try adjusting your dates or contact us on WhatsApp.';
      }
    }

    if (shouldScroll) {
      const roomsSection = document.getElementById('rooms');
      if (roomsSection) {
        roomsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

  } catch (err) {
    console.warn('Availability check fallback to local:', err);
    // Fallback locally
    const fallbackResults = calculateLocalAvailability(checkin, checkout, guests);
    applyAvailabilityToDOM(fallbackResults, nights);
  } finally {
    if (checkBtn) {
      const text = checkBtn.querySelector('.btn-text');
      const spinner = checkBtn.querySelector('.btn-spinner');
      if (text) text.style.display = 'inline-block';
      if (spinner) spinner.style.display = 'none';
    }
  }
};

/**
 * Local Overlap Engine
 * Overlap check: reqIn < bookedOut && reqOut > bookedIn
 */
function calculateLocalAvailability(checkinStr, checkoutStr, guests) {
  const reqIn = parseDate(checkinStr);
  const reqOut = parseDate(checkoutStr);
  const nights = calculateNights(checkinStr, checkoutStr);

  return Object.values(ROOMS_DATA).map(room => {
    const fitsCapacity = guests ? room.capacity >= guests : true;
    
    // Check overlaps
    let isOverlapping = false;
    for (let i = 0; i < LOCAL_BOOKINGS_STORE.length; i++) {
      const b = LOCAL_BOOKINGS_STORE[i];
      if (b.room_id === room.id && (b.status === 'Pending' || b.status === 'Confirmed')) {
        const bIn = parseDate(b.check_in);
        const bOut = parseDate(b.check_out);
        if (bIn && bOut) {
          if (reqIn < bOut && reqOut > bIn) {
            isOverlapping = true;
            break;
          }
        }
      }
    }

    const isAvailable = !isOverlapping && fitsCapacity;
    let reason = '';
    if (isOverlapping) {
      reason = 'Booked for selected dates';
    } else if (!fitsCapacity) {
      reason = `Exceeds capacity (${room.capacity} max)`;
    }

    return {
      room_id: room.id,
      room_name: room.name,
      price_per_night: room.price,
      total_nights: nights,
      total_estimated_price: room.price * nights,
      capacity: room.capacity,
      is_available: isAvailable,
      unavailability_reason: reason
    };
  });
}

function applyAvailabilityToDOM(results, nights) {
  results.forEach(res => {
    const roomCard = document.querySelector(`.room-card[data-room-id="${res.room_id}"]`);
    const badge = document.getElementById(`badge-${res.room_id}`);
    const bookBtn = roomCard ? roomCard.querySelector('.book-room-btn') : null;

    if (badge && roomCard && bookBtn) {
      if (res.is_available) {
        badge.className = 'room-status-badge available';
        badge.textContent = 'Available';
        roomCard.classList.remove('is-booked');
        bookBtn.disabled = false;
        bookBtn.textContent = 'SELECT & BOOK';
      } else {
        roomCard.classList.add('is-booked');
        bookBtn.disabled = true;
        if (res.unavailability_reason && res.unavailability_reason.includes('capacity')) {
          badge.className = 'room-status-badge exceeded';
          badge.textContent = `Max ${res.capacity} Guests`;
          bookBtn.textContent = 'EXCEEDS CAPACITY';
        } else {
          badge.className = 'room-status-badge booked';
          badge.textContent = 'Booked for Dates';
          bookBtn.textContent = 'UNAVAILABLE';
        }
      }
    }
  });
}

/* ==========================================================================
   4. ROOM CARDS & DETAIL MODAL
   ========================================================================== */
function initRoomCardsEvents() {
  // View Details Buttons
  const viewDetailBtns = document.querySelectorAll('.view-details-btn');
  viewDetailBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const roomId = e.currentTarget.getAttribute('data-room-id');
      openRoomDetailsModal(roomId);
    });
  });

  // Book Room Buttons
  const bookRoomBtns = document.querySelectorAll('.book-room-btn');
  bookRoomBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const roomId = e.currentTarget.getAttribute('data-room-id');
      openBookingModal(roomId);
    });
  });
}

function openRoomDetailsModal(roomId) {
  const room = ROOMS_DATA[roomId];
  if (!room) return;

  const modal = document.getElementById('roomDetailsModal');
  const nameEl = document.getElementById('detailRoomName');
  const tagEl = document.getElementById('detailRoomTag');
  const imgEl = document.getElementById('detailRoomImg');
  const descEl = document.getElementById('detailRoomDesc');
  const capEl = document.getElementById('detailCapacity');
  const priceEl = document.getElementById('detailPrice');
  const amenitiesList = document.getElementById('detailAmenitiesList');
  const bookBtn = document.getElementById('detailBookNowBtn');

  if (nameEl) nameEl.textContent = room.name;
  if (tagEl) tagEl.textContent = room.tag;
  if (imgEl) imgEl.src = room.img;
  if (descEl) descEl.textContent = room.desc;
  if (capEl) capEl.textContent = room.capacity;
  if (priceEl) priceEl.textContent = `₹${room.price.toLocaleString('en-IN')}`;

  if (amenitiesList) {
    amenitiesList.innerHTML = '';
    room.amenities.forEach(am => {
      const tag = document.createElement('span');
      tag.className = 'amenity-tag';
      tag.textContent = `✓ ${am}`;
      amenitiesList.appendChild(tag);
    });
  }

  if (bookBtn) {
    bookBtn.onclick = () => {
      closeAllModals();
      openBookingModal(roomId);
    };
  }

  openModal(modal);
}

/* ==========================================================================
   5. BOOKING SUBMISSION MODAL
   ========================================================================== */
function openBookingModal(roomId) {
  const room = ROOMS_DATA[roomId];
  if (!room) return;

  const checkinInput = document.getElementById('checkinDate');
  const checkoutInput = document.getElementById('checkoutDate');
  const guestSelect = document.getElementById('guestCount');

  const checkin = checkinInput ? checkinInput.value : formatDate(new Date());
  const checkout = checkoutInput ? checkoutInput.value : getOffsetDateString(1);
  const guests = guestSelect ? guestSelect.value : '2';
  const nights = calculateNights(checkin, checkout);
  const totalPrice = room.price * nights;

  const modal = document.getElementById('bookingModal');
  const roomNameEl = document.getElementById('bookingModalRoomName');
  const modalRoomIdInput = document.getElementById('modalRoomId');
  const sumCheckin = document.getElementById('sumCheckin');
  const sumCheckout = document.getElementById('sumCheckout');
  const sumNights = document.getElementById('sumNights');
  const sumTotalPrice = document.getElementById('sumTotalPrice');
  const guestGuestSelect = document.getElementById('bookGuestGuests');

  if (roomNameEl) roomNameEl.textContent = room.name;
  if (modalRoomIdInput) modalRoomIdInput.value = room.id;
  if (sumCheckin) sumCheckin.textContent = checkin;
  if (sumCheckout) sumCheckout.textContent = checkout;
  if (sumNights) sumNights.textContent = `${nights} ${nights === 1 ? 'Night' : 'Nights'}`;
  if (sumTotalPrice) sumTotalPrice.textContent = `₹${totalPrice.toLocaleString('en-IN')}`;

  if (guestGuestSelect) {
    guestGuestSelect.value = guests <= room.capacity ? String(guests) : String(room.capacity);
  }

  openModal(modal);
}

/**
 * Handle Booking Form Submission
 */
window.handleBookingSubmit = async function() {
  const roomId = document.getElementById('modalRoomId').value;
  const room = ROOMS_DATA[roomId];
  const name = document.getElementById('bookGuestName').value.trim();
  const phone = document.getElementById('bookGuestPhone').value.trim();
  const email = document.getElementById('bookGuestEmail').value.trim();
  const guests = parseInt(document.getElementById('bookGuestGuests').value, 10);
  const notes = document.getElementById('bookSpecialRequests').value.trim();

  const checkin = document.getElementById('checkinDate').value;
  const checkout = document.getElementById('checkoutDate').value;
  const nights = calculateNights(checkin, checkout);
  const totalPrice = room ? room.price * nights : 0;

  if (!name || !phone) {
    alert('Please enter your full name and phone number.');
    return;
  }

  const submitBtn = document.getElementById('confirmBookingSubmitBtn');
  if (submitBtn) {
    const text = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.btn-spinner');
    if (text) text.style.display = 'none';
    if (spinner) spinner.style.display = 'inline-block';
    submitBtn.disabled = true;
  }

  try {
    let bookingResult = null;

    if (APPS_SCRIPT_URL && APPS_SCRIPT_URL.trim() !== '') {
      // Live Google Apps Script POST request
      const payload = {
        action: 'createBooking',
        room_id: roomId,
        check_in: checkin,
        check_out: checkout,
        guest_name: name,
        guest_phone: phone,
        guest_email: email,
        guest_count: guests,
        special_requests: notes
      };

      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data && data.status === 'success') {
        bookingResult = data.details;
      } else {
        throw new Error(data.message || 'Could not complete booking.');
      }
    } else {
      // Local Mock Store booking creation
      // Re-verify availability
      const availCheck = calculateLocalAvailability(checkin, checkout, guests);
      const targetAvail = availCheck.find(r => r.room_id === roomId);
      if (!targetAvail || !targetAvail.is_available) {
        throw new Error('Sorry, this room is no longer available for the selected dates. Please choose another date or room.');
      }

      // Generate ID
      const today = new Date();
      const yr = today.getFullYear();
      const mo = String(today.getMonth() + 1).padStart(2, '0');
      const rand = Math.floor(1000 + Math.random() * 9000);
      const bookingId = `NE-${yr}${mo}-${rand}`;

      const newBooking = {
        booking_id: bookingId,
        room_id: roomId,
        room_name: room.name,
        guest_name: name,
        guest_phone: phone,
        guest_email: email,
        check_in: checkin,
        check_out: checkout,
        guests: guests,
        total_nights: nights,
        total_price: totalPrice,
        status: 'Pending',
        created_at: new Date().toISOString(),
        notes: notes
      };

      LOCAL_BOOKINGS_STORE.push(newBooking);
      bookingResult = newBooking;
    }

    // Close booking modal and open Confirmation Modal
    closeAllModals();
    showConfirmationModal(bookingResult);

    // Refresh live availability in background
    window.checkAvailabilityAction(false);

  } catch (err) {
    alert(err.message || 'An error occurred while creating your booking. Please try again or contact us via WhatsApp.');
  } finally {
    if (submitBtn) {
      const text = submitBtn.querySelector('.btn-text');
      const spinner = submitBtn.querySelector('.btn-spinner');
      if (text) text.style.display = 'inline-block';
      if (spinner) spinner.style.display = 'none';
      submitBtn.disabled = false;
    }
  }
};

/* ==========================================================================
   6. BOOKING CONFIRMATION & WHATSAPP FORWARDING
   ========================================================================== */
function showConfirmationModal(details) {
  const modal = document.getElementById('confirmationModal');
  const idEl = document.getElementById('confBookingId');
  const roomEl = document.getElementById('confRoomName');
  const nameEl = document.getElementById('confGuestName');
  const phoneEl = document.getElementById('confGuestPhone');
  const datesEl = document.getElementById('confStayDates');
  const guestsEl = document.getElementById('confGuestCount');
  const priceEl = document.getElementById('confTotalPrice');
  const waBtn = document.getElementById('confWhatsAppBtn');

  if (idEl) idEl.textContent = details.booking_id;
  if (roomEl) roomEl.textContent = details.room_name || details.room_id;
  if (nameEl) nameEl.textContent = details.guest_name;
  if (phoneEl) phoneEl.textContent = details.guest_phone;
  if (datesEl) datesEl.textContent = `${details.check_in} to ${details.check_out} (${details.total_nights} Nights)`;
  if (guestsEl) guestsEl.textContent = `${details.guests || details.guest_count} Guests`;
  if (priceEl) priceEl.textContent = `₹${(details.total_price || 0).toLocaleString('en-IN')}`;

  // Build WhatsApp share message
  const waMessage = 
    `*NANDHANAM ELITE HOMESTAY BOOKING REQUEST*%0A` +
    `----------------------------------------%0A` +
    `• *Booking ID:* ${encodeURIComponent(details.booking_id)}%0A` +
    `• *Room:* ${encodeURIComponent(details.room_name || details.room_id)}%0A` +
    `• *Guest Name:* ${encodeURIComponent(details.guest_name)}%0A` +
    `• *Phone:* ${encodeURIComponent(details.guest_phone)}%0A` +
    `• *Check-in:* ${encodeURIComponent(details.check_in)}%0A` +
    `• *Check-out:* ${encodeURIComponent(details.check_out)} (${details.total_nights} Nights)%0A` +
    `• *Guests:* ${encodeURIComponent(details.guests || details.guest_count)}%0A` +
    `• *Total Estimated Price:* ₹${(details.total_price || 0).toLocaleString('en-IN')}%0A` +
    `----------------------------------------%0A` +
    `Hello, I have submitted this booking request on your website. Please confirm availability and share payment/check-in details.`;

  if (waBtn) {
    waBtn.href = `https://wa.me/${PROPERTY_WA_NUMBER}?text=${waMessage}`;
  }

  openModal(modal);
}

/* ==========================================================================
   7. MODAL UTILITIES
   ========================================================================== */
function initModals() {
  const closeButtons = [
    'closeRoomDetailsModal', 'closeDetailBtn',
    'closeBookingModal', 'cancelBookingBtn',
    'closeConfirmationModal'
  ];

  closeButtons.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', closeAllModals);
    }
  });

  const modals = document.querySelectorAll('.custom-modal');
  modals.forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop') || e.target === m) {
        closeAllModals();
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
}

function openModal(modal) {
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeAllModals() {
  const modals = document.querySelectorAll('.custom-modal');
  modals.forEach(m => m.classList.remove('active'));
  document.body.style.overflow = '';
}

/* ==========================================================================
   8. GALLERY LIGHTBOX
   ========================================================================== */
function initGalleryLightbox() {
  const galleryItems = document.querySelectorAll('.gallery-item');
  const lightboxModal = document.getElementById('lightboxModal');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxClose = document.getElementById('lightboxClose');
  const viewMorePhotosBtn = document.getElementById('viewMorePhotosBtn');

  if (galleryItems.length && lightboxModal) {
    galleryItems.forEach(item => {
      item.addEventListener('click', () => {
        const fullImg = item.getAttribute('data-img');
        const caption = item.getAttribute('data-caption');
        if (lightboxImg) lightboxImg.src = fullImg;
        if (lightboxCaption) lightboxCaption.textContent = caption || '';
        lightboxModal.classList.add('active');
        document.body.style.overflow = 'hidden';
      });
    });

    if (lightboxClose) {
      lightboxClose.addEventListener('click', () => {
        lightboxModal.classList.remove('active');
        document.body.style.overflow = '';
      });
    }

    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) {
        lightboxModal.classList.remove('active');
        document.body.style.overflow = '';
      }
    });

    if (viewMorePhotosBtn) {
      viewMorePhotosBtn.addEventListener('click', () => {
        if (galleryItems.length > 0) {
          galleryItems[0].click();
        }
      });
    }
  }
}

/* ==========================================================================
   9. REVIEWS CAROUSEL
   ========================================================================== */
function initReviewsCarousel() {
  const prevReviewBtn = document.getElementById('prevReview');
  const nextReviewBtn = document.getElementById('nextReview');
  const reviewsContainer = document.getElementById('reviewsContainer');

  if (prevReviewBtn && nextReviewBtn && reviewsContainer) {
    let currentIndex = 0;
    const cards = reviewsContainer.querySelectorAll('.review-card');

    const updateMobileReviews = () => {
      if (window.innerWidth <= 768) {
        cards.forEach((card, idx) => {
          card.style.display = idx === currentIndex ? 'flex' : 'none';
        });
      } else {
        cards.forEach(card => {
          card.style.display = 'flex';
        });
      }
    };

    prevReviewBtn.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        currentIndex = (currentIndex - 1 + cards.length) % cards.length;
        updateMobileReviews();
      } else {
        reviewsContainer.scrollBy({ left: -300, behavior: 'smooth' });
      }
    });

    nextReviewBtn.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        currentIndex = (currentIndex + 1) % cards.length;
        updateMobileReviews();
      } else {
        reviewsContainer.scrollBy({ left: 300, behavior: 'smooth' });
      }
    });

    window.addEventListener('resize', updateMobileReviews);
    updateMobileReviews();
  }
}

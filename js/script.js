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
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxtySADegky1Ts7GSobKm_f0WJtG0Tx_O3NzgEQvk0DufowJM8Pc-wTJWYMZVAHz89Z/exec';

// Property Contact details
const PROPERTY_PHONE = '+919447000000';
const PROPERTY_WA_NUMBER = '919447000000';
const PROPERTY_EMAIL = 'nandhanamelite@gmail.com';

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
    booking_id: 'BK-20260820-0001',
    room_id: 'R001',
    room_name: 'AC Luxury Room',
    guest_name: 'Rahul Sharma',
    phone: '+91 98765 43210',
    email: 'rahul@example.com',
    check_in: getOffsetDateString(5),
    check_out: getOffsetDateString(7),
    adults: 2,
    children: 0,
    total_guests: 2,
    price_per_night: 2000,
    total_amount: 4000,
    status: 'Confirmed',
    notes: 'Airport pickup enquiry',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
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

  // Dynamically sync rooms and settings from Google Sheets if configured
  fetchAndApplyRoomsAndSettings();

  // Run initial availability calculation
  window.checkAvailabilityAction(false);
});

/**
 * Dynamic Room & Settings Synchronizer (Google Sheets -> Website)
 */
async function fetchAndApplyRoomsAndSettings() {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.trim() === '') return;

  try {
    // 1. Fetch Room Catalog from Google Sheets
    const roomsRes = await fetch(`${APPS_SCRIPT_URL}?action=getRooms`, { method: 'GET', mode: 'cors' });
    if (roomsRes.ok) {
      const data = await roomsRes.json();
      if (data && data.status === 'success' && Array.isArray(data.rooms) && data.rooms.length > 0) {
        // Update ROOMS_DATA cache
        data.rooms.forEach(r => {
          ROOMS_DATA[r.room_id] = {
            id: r.room_id,
            name: r.room_name,
            tag: r.room_name.toUpperCase().includes('NON') ? 'NATURAL VENTILATION' : (r.room_name.toUpperCase().includes('AC') ? 'AIR CONDITIONED' : 'COMFORT ROOM'),
            price: Number(r.price_per_night) || 0,
            capacity: Number(r.capacity) || 2,
            img: r.image_url || (ROOMS_DATA[r.room_id] ? ROOMS_DATA[r.room_id].img : 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80'),
            desc: r.description || (ROOMS_DATA[r.room_id] ? ROOMS_DATA[r.room_id].desc : ''),
            amenities: (r.amenities && r.amenities.length > 0) ? r.amenities : (ROOMS_DATA[r.room_id] ? ROOMS_DATA[r.room_id].amenities : ['Wi-Fi', 'Attached Bathroom', 'Hot Water'])
          };
        });

        // Re-render rooms grid to reflect changes/new rooms/updated prices
        renderRoomsGrid(data.rooms);
        window.checkAvailabilityAction(false);
      }
    }
  } catch (err) {
    console.warn('[Dynamic Rooms Sync Notice]:', err.message);
  }

  try {
    // 2. Fetch Property Settings from Google Sheets
    const settingsRes = await fetch(`${APPS_SCRIPT_URL}?action=getSettings`, { method: 'GET', mode: 'cors' });
    if (settingsRes.ok) {
      const sData = await settingsRes.json();
      if (sData && sData.status === 'success' && sData.settings) {
        applySettingsToDOM(sData.settings);
      }
    }
  } catch (err) {
    console.warn('[Dynamic Settings Sync Notice]:', err.message);
  }
}

/**
 * Dynamically Render Room Cards from Google Sheets Data
 */
function renderRoomsGrid(rooms) {
  const grid = document.getElementById('roomsGrid');
  if (!grid || !Array.isArray(rooms) || rooms.length === 0) return;

  grid.innerHTML = '';
  rooms.forEach(room => {
    const card = document.createElement('div');
    card.className = 'room-card';
    card.setAttribute('data-room-id', room.room_id);
    card.setAttribute('data-capacity', String(room.capacity));
    card.setAttribute('data-price', String(room.price_per_night));

    const tag = room.room_name.toUpperCase().includes('NON') ? 'NATURAL VENTILATION' : (room.room_name.toUpperCase().includes('AC') ? 'AIR CONDITIONED' : 'COMFORT ROOM');
    const imgUrl = room.image_url || 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=900&q=80';
    const amenitiesArr = Array.isArray(room.amenities) ? room.amenities : [];

    let amenitiesHtml = '';
    amenitiesArr.slice(0, 4).forEach(am => {
      amenitiesHtml += `
        <li>
          <span class="check-icon">✓</span>
          <span>${escapeHtml(am)}</span>
        </li>`;
    });

    card.innerHTML = `
      <div class="room-img-wrap">
        <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(room.room_name)}" class="room-img" loading="lazy">
        <div class="room-tag">${escapeHtml(tag)}</div>
        <div class="room-status-badge available" id="badge-${escapeHtml(room.room_id)}">Available</div>
      </div>
      <div class="room-details">
        <div class="room-header-meta">
          <h3 class="room-type">${escapeHtml(room.room_name.toUpperCase())}</h3>
          <span class="room-capacity-chip">Max ${escapeHtml(String(room.capacity))} Guests</span>
        </div>
        <p class="room-short-desc">${escapeHtml(room.description || '')}</p>
        <ul class="room-features-list">
          ${amenitiesHtml}
        </ul>
        
        <div class="room-pricing-row">
          <div class="room-pricing">
            <span class="from-text">RATE </span>
            <span class="price-value" id="price-${escapeHtml(room.room_id)}">₹${Number(room.price_per_night).toLocaleString('en-IN')}</span>
            <span class="period"> / NIGHT</span>
          </div>
          <div class="total-estimate" id="estimate-${escapeHtml(room.room_id)}" style="display:none;">
            <span class="est-label">Total for stay:</span>
            <span class="est-amount">₹${Number(room.price_per_night).toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div class="room-card-actions">
          <button class="btn btn-outline-room view-details-btn" data-room-id="${escapeHtml(room.room_id)}">VIEW DETAILS</button>
          <button class="btn btn-dark-full book-room-btn" data-room-id="${escapeHtml(room.room_id)}" data-room-name="${escapeHtml(room.room_name)}" data-room-price="${escapeHtml(String(room.price_per_night))}" data-capacity="${escapeHtml(String(room.capacity))}">SELECT & BOOK</button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });

  // Re-bind click event listeners to new cards
  initRoomCardsEvents();
}

/**
 * Apply Property Settings dynamically to the DOM
 */
function applySettingsToDOM(settings) {
  if (!settings) return;

  const phone = settings.phone || settings.whatsapp;
  const whatsapp = settings.whatsapp || settings.phone;
  const cleanWa = whatsapp ? String(whatsapp).replace(/[^0-9]/g, '') : '919447000000';

  // Update WhatsApp links
  const waLinks = document.querySelectorAll('a[href*="wa.me"]');
  waLinks.forEach(link => {
    link.href = `https://wa.me/${cleanWa}?text=Hello%20Nandhanam%20Elite,%20I%20would%20like%20to%20enquire%20about%20room%20availability.`;
  });

  // Update check-in / check-out hints cleanly (preventing 1899 epoch strings)
  const checkinTime = formatTimeClean(settings.check_in_time, '2:00 PM');
  const checkoutTime = formatTimeClean(settings.check_out_time, '11:00 AM');

  const inHint = document.querySelector('label[for="checkinDate"] + .input-with-icon + .input-hint');
  if (inHint) inHint.textContent = `From ${checkinTime}`;
  const outHint = document.querySelector('label[for="checkoutDate"] + .input-with-icon + .input-hint');
  if (outHint) outHint.textContent = `Until ${checkoutTime}`;

  // Update property email
  const email = settings.email || PROPERTY_EMAIL;
  if (email) {
    const emailEls = document.querySelectorAll('.footer-info-list li:nth-child(2) span:last-child');
    emailEls.forEach(el => el.textContent = email);
  }
}

/**
 * Clean Time String Formatter (Prevents 1899-12-30 Epoch Bugs)
 */
function formatTimeClean(val, defaultTime) {
  if (!val) return defaultTime;
  const str = String(val).trim();
  if (str.includes('T') || str.includes('1899-')) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      let hours = d.getHours();
      const minutes = d.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const minStr = minutes < 10 ? '0' + minutes : minutes;
      return `${hours}:${minStr} ${ampm}`;
    }
  }
  return str;
}

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

  // Dynamic transparent-to-floating navbar on scroll
  const siteHeader = document.getElementById('navbar') || document.querySelector('.site-header');
  const handleNavScroll = () => {
    if (window.scrollY > 30) {
      if (siteHeader) siteHeader.classList.add('scrolled');
    } else {
      if (siteHeader) siteHeader.classList.remove('scrolled');
    }
  };
  window.addEventListener('scroll', handleNavScroll);
  handleNavScroll(); // Run on initial load

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
   GLOBAL NOTIFICATION & LUXURY TOAST SYSTEM
   ========================================================================== */
let toastContainer = null;

function getOrCreateToastContainer() {
  if (!toastContainer || !document.body.contains(toastContainer)) {
    toastContainer = document.querySelector('.luxury-toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'luxury-toast-container';
      toastContainer.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastContainer);
    }
  }
  return toastContainer;
}

/**
 * Show a luxury toast notification
 * @param {string} message - Message to display
 * @param {'error'|'success'|'warning'|'info'} type - Variant type
 * @param {string} [title] - Optional title
 * @param {number} [duration=5000] - Duration in ms
 */
function showToast(message, type = 'info', title = null, duration = 5000) {
  const container = getOrCreateToastContainer();
  const toast = document.createElement('div');
  toast.className = `luxury-toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const icons = {
    error: '✕',
    success: '✓',
    warning: '⚠',
    info: 'ℹ'
  };

  const defaultTitles = {
    error: 'Error',
    success: 'Success',
    warning: 'Attention',
    info: 'Notice'
  };

  const displayTitle = title || defaultTitles[type] || 'Notice';
  const displayIcon = icons[type] || 'ℹ';

  toast.innerHTML = `
    <span class="luxury-toast-icon">${displayIcon}</span>
    <div class="luxury-toast-body">
      <div class="luxury-toast-title">${escapeHtml(displayTitle)}</div>
      <div class="luxury-toast-message">${escapeHtml(message)}</div>
    </div>
    <button class="luxury-toast-close" aria-label="Close Notification">&times;</button>
  `;

  const closeBtn = toast.querySelector('.luxury-toast-close');
  const dismiss = () => {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 350);
  };

  if (closeBtn) {
    closeBtn.addEventListener('click', dismiss);
  }

  container.appendChild(toast);

  // Trigger animation frame
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }

  return toast;
}

function showErrorMessage(msg, title = 'Unable to Complete Request') {
  return showToast(msg, 'error', title, 6000);
}

function showSuccessMessage(msg, title = 'Completed Successfully') {
  return showToast(msg, 'success', title, 5000);
}

function showWarningMessage(msg, title = 'Please Note') {
  return showToast(msg, 'warning', title, 5000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* Global Unhandled Error Catchers */
window.addEventListener('error', (event) => {
  console.error('[Global Runtime Error]', event.error || event.message);
  // Avoid spamming users with internal script errors; log cleanly
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason);
});

/* ==========================================================================
   3. AVAILABILITY ENGINE & DATE OVERLAP LOGIC
   ========================================================================== */
/**
 * Check Availability Action
 * @param {boolean} shouldScroll - whether to scroll to rooms section
 */
window.checkAvailabilityAction = async function (shouldScroll = true) {
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

  if (!checkin || !checkout) {
    if (shouldScroll) showErrorMessage('Please select both Check-in and Check-out dates.');
    return;
  }

  const dIn = parseDate(checkin);
  const dOut = parseDate(checkout);
  const today = parseDate(formatDate(new Date()));

  if (dIn < today) {
    showErrorMessage('Check-in date cannot be in the past.', 'Invalid Date');
    return;
  }

  if (dOut <= dIn) {
    showErrorMessage('Check-out date must be strictly after Check-in date.', 'Invalid Date Range');
    return;
  }

  const nights = calculateNights(checkin, checkout);
  if (nights > 30) {
    showWarningMessage('For long stays greater than 30 nights, please contact host directly on WhatsApp.', 'Extended Stay');
    return;
  }

  // Show spinner on search button
  if (checkBtn) {
    const text = checkBtn.querySelector('.btn-text');
    const spinner = checkBtn.querySelector('.btn-spinner');
    if (text) text.style.display = 'none';
    if (spinner) spinner.style.display = 'inline-block';
    checkBtn.disabled = true;
  }

  try {
    let results = [];
    let isApiConnected = false;

    // Attempt Google Apps Script live fetch if configured
    if (APPS_SCRIPT_URL && APPS_SCRIPT_URL.trim() !== '') {
      const apiUrl = `${APPS_SCRIPT_URL}?action=checkAvailability&check_in=${encodeURIComponent(checkin)}&check_out=${encodeURIComponent(checkout)}&guests=${guests}`;
      const response = await fetch(apiUrl, { method: 'GET', mode: 'cors' });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const data = await response.json();
      if (data && data.status === 'success') {
        results = data.results || (data.data && data.data.results) || [];
        isApiConnected = true;
      } else {
        const errMsg = data.message || 'Unable to fetch availability from server.';
        throw new Error(errMsg);
      }
    } else {
      // Seamless Local In-Memory Overlap Calculation (Standard formula)
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
          if (res.unavailability_reason && res.unavailability_reason.toLowerCase().includes('capacity')) {
            badge.className = 'room-status-badge exceeded';
            badge.textContent = `Max ${res.capacity} Guests`;
            bookBtn.textContent = 'EXCEEDS CAPACITY';
          } else {
            badge.className = 'room-status-badge booked';
            if (res.overlapping_dates && res.overlapping_dates.length > 0) {
              const dateStr = res.overlapping_dates.map(d => {
                const sIn = formatShortDate(d.check_in);
                const sOut = formatShortDate(d.check_out);
                return `${sIn}–${sOut}`;
              }).join(', ');
              badge.textContent = `Booked (${dateStr})`;
              bookBtn.textContent = `OCCUPIED (${dateStr})`;
            } else {
              badge.textContent = 'Booked for Dates';
              bookBtn.textContent = 'UNAVAILABLE';
            }
          }
        }
      }
    });

    // Update Feedback Banner
    if (banner) {
      banner.style.display = 'block';
      if (availableCount > 0) {
        banner.className = 'availability-status-banner';
        if (bannerIcon) bannerIcon.textContent = '✓';
        if (bannerTitle) bannerTitle.textContent = `${availableCount} Room ${availableCount === 1 ? 'Option' : 'Options'} Available`;
        if (bannerDesc) bannerDesc.textContent = `Stay for ${nights} ${nights === 1 ? 'Night' : 'Nights'} (${checkin} to ${checkout}) for ${guests} ${guests === 1 ? 'Guest' : 'Guests'}.`;
      } else {
        banner.className = 'availability-status-banner error';
        if (bannerIcon) bannerIcon.textContent = '✕';
        if (bannerTitle) bannerTitle.textContent = 'No Rooms Available For Selected Dates';
        if (bannerDesc) bannerDesc.textContent = 'All rooms are reserved for these dates or exceed guest capacity. Try selecting different dates or chat with our host directly.';
      }
    }

    if (shouldScroll) {
      const roomsSection = document.getElementById('rooms');
      if (roomsSection) {
        roomsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

  } catch (err) {
    console.warn('[Availability Check Notice]', err.message);

    // Clear distinction: if API was configured but failed, show System Notice banner + local fallback
    if (APPS_SCRIPT_URL && APPS_SCRIPT_URL.trim() !== '') {
      if (banner) {
        banner.style.display = 'block';
        banner.className = 'availability-status-banner error';
        if (bannerIcon) bannerIcon.textContent = '⚠';
        if (bannerTitle) bannerTitle.textContent = 'Live Sync Temporarily Offline';
        if (bannerDesc) bannerDesc.textContent = 'Unable to reach the live booking server. Showing cached property availability. Please contact us on WhatsApp for real-time confirmation.';
      }
      showWarningMessage('Live booking server unavailable. Displaying local availability estimate.', 'Connection Notice');
    }

    // Apply local fallback
    const fallbackResults = calculateLocalAvailability(checkin, checkout, guests);
    applyAvailabilityToDOM(fallbackResults, nights);

  } finally {
    if (checkBtn) {
      const text = checkBtn.querySelector('.btn-text');
      const spinner = checkBtn.querySelector('.btn-spinner');
      if (text) text.style.display = 'inline-block';
      if (spinner) spinner.style.display = 'none';
      checkBtn.disabled = false;
    }
  }
};

/**
 * Format date string (YYYY-MM-DD) to Short Display (e.g. "25 Sep")
 */
function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length < 3) return dateStr;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return `${day} ${monthNames[monthIdx] || parts[1]}`;
}

/**
 * 3. Offline / Local In-Memory Availability Calculator
 */
function calculateLocalAvailability(checkinStr, checkoutStr, guests) {
  const reqIn = parseDate(checkinStr);
  const reqOut = parseDate(checkoutStr);
  const nights = calculateNights(checkinStr, checkoutStr);

  return Object.values(ROOMS_DATA).map(room => {
    const fitsCapacity = guests ? room.capacity >= guests : true;

    // Check overlaps
    let isOverlapping = false;
    const overlappingBookings = [];
    const nowTime = Date.now();
    const expiryLimitMs = 5 * 60 * 1000; // 5-minute temporary hold

    for (let i = 0; i < LOCAL_BOOKINGS_STORE.length; i++) {
      const b = LOCAL_BOOKINGS_STORE[i];
      if (b.room_id === room.id) {
        let isPendingExpired = false;
        if (b.status === 'Pending' && b.created_at) {
          const createdTime = new Date(b.created_at).getTime();
          if (!isNaN(createdTime) && (nowTime - createdTime) > expiryLimitMs) {
            isPendingExpired = true;
          }
        }

        const isConfirmedOrDone = (b.status === 'Confirmed' || b.status === 'Done' || b.status === 'Paid');
        if ((b.status === 'Pending' && !isPendingExpired) || isConfirmedOrDone) {
          const bIn = parseDate(b.check_in);
          const bOut = parseDate(b.check_out);
          if (bIn && bOut) {
            if (reqIn < bOut && reqOut > bIn) {
              isOverlapping = true;
              overlappingBookings.push({
                check_in: b.check_in,
                check_out: b.check_out,
                status: b.status
              });
            }
          }
        }
      }
    }

    const isAvailable = !isOverlapping && fitsCapacity;
    let reason = '';
    if (isOverlapping) {
      const dateSpans = overlappingBookings.map(ob => `${ob.check_in} to ${ob.check_out}`).join(', ');
      reason = 'Booked for dates: ' + dateSpans;
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
      overlapping_dates: overlappingBookings,
      unavailability_reason: reason,
      amenities: room.amenities,
      image_url: room.img
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
        if (res.unavailability_reason && res.unavailability_reason.toLowerCase().includes('capacity')) {
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

  // Initialize Mobile Rooms Horizontal Swipe & Pagination Dots
  initRoomsMobileSlider();
}

/**
 * Mobile Rooms Horizontal Swipe & Synchronized Pagination Dots
 */
function initRoomsMobileSlider() {
  const roomsGrid = document.getElementById('roomsGrid');
  const dotsContainer = document.getElementById('roomsSliderDots');
  if (!roomsGrid || !dotsContainer) return;

  const roomCards = roomsGrid.querySelectorAll('.room-card');
  if (!roomCards.length) return;

  dotsContainer.innerHTML = '';
  roomCards.forEach((card, idx) => {
    const dot = document.createElement('span');
    dot.className = `slider-dot ${idx === 0 ? 'active' : ''}`;
    dot.setAttribute('data-index', idx);
    dot.addEventListener('click', () => {
      card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    });
    dotsContainer.appendChild(dot);
  });

  // Track swipe scroll position to dynamically highlight active dot
  let scrollTimeout;
  roomsGrid.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const gridRect = roomsGrid.getBoundingClientRect();
      const gridCenter = gridRect.left + gridRect.width / 2;
      let closestIdx = 0;
      let minDistance = Infinity;

      roomCards.forEach((card, idx) => {
        const cardRect = card.getBoundingClientRect();
        const cardCenter = cardRect.left + cardRect.width / 2;
        const distance = Math.abs(gridCenter - cardCenter);
        if (distance < minDistance) {
          minDistance = distance;
          closestIdx = idx;
        }
      });

      const dots = dotsContainer.querySelectorAll('.slider-dot');
      dots.forEach((d, idx) => {
        if (idx === closestIdx) {
          d.classList.add('active');
        } else {
          d.classList.remove('active');
        }
      });
    }, 40);
  }, { passive: true });
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
   5. BOOKING SUBMISSION MODAL & ROBUST ERROR HANDLING
   ========================================================================== */
function openBookingModal(roomId) {
  const room = ROOMS_DATA[roomId];
  if (!room) return;

  const checkinInput = document.getElementById('checkinDate');
  const checkoutInput = document.getElementById('checkoutDate');
  const guestSelect = document.getElementById('guestCount');

  const checkin = checkinInput && checkinInput.value ? checkinInput.value : formatDate(new Date());
  const checkout = checkoutInput && checkoutInput.value ? checkoutInput.value : getOffsetDateString(1);
  const guests = guestSelect ? guestSelect.value : '2';

  const modal = document.getElementById('bookingModal');
  const roomNameEl = document.getElementById('bookingModalRoomName');
  const modalRoomIdInput = document.getElementById('modalRoomId');
  const modalCheckin = document.getElementById('modalCheckinDate');
  const modalCheckout = document.getElementById('modalCheckoutDate');
  const bookAdults = document.getElementById('bookAdults');
  const bookChildren = document.getElementById('bookChildren');

  if (roomNameEl) roomNameEl.textContent = room.name;
  if (modalRoomIdInput) modalRoomIdInput.value = room.id;

  const todayStr = formatDate(new Date());
  if (modalCheckin) {
    modalCheckin.min = todayStr;
    modalCheckin.value = checkin;
  }
  if (modalCheckout) {
    const nextDay = new Date(parseDate(checkin) || new Date());
    nextDay.setDate(nextDay.getDate() + 1);
    modalCheckout.min = formatDate(nextDay);
    modalCheckout.value = checkout;
  }

  if (bookAdults) {
    const numGuests = parseInt(guests, 10) || 2;
    bookAdults.value = numGuests <= room.capacity ? String(numGuests) : String(room.capacity);
  }
  if (bookChildren) {
    bookChildren.value = '0';
  }

  // Recalculate stay duration, rate snapshot, and live availability
  recalcModalStay();

  openModal(modal);
}

/**
 * Live Recalculator & Overlap Checker for Dates inside Booking Modal
 */
window.recalcModalStay = async function () {
  const roomId = document.getElementById('modalRoomId').value;
  const room = ROOMS_DATA[roomId];
  if (!room) return;

  const inInput = document.getElementById('modalCheckinDate');
  const outInput = document.getElementById('modalCheckoutDate');
  const durationEl = document.getElementById('sumNights');
  const rateEl = document.getElementById('modalRatePerNight');
  const totalEl = document.getElementById('sumTotalPrice');
  const availBadge = document.getElementById('modalAvailBadge');
  const conflictAlert = document.getElementById('modalDateConflictNotice');
  const submitBtn = document.getElementById('confirmBookingSubmitBtn');

  if (!inInput || !outInput) return;

  const dIn = parseDate(inInput.value);
  const dOut = parseDate(outInput.value);

  // Keep checkout strictly after checkin
  if (dIn) {
    const nextDay = new Date(dIn);
    nextDay.setDate(nextDay.getDate() + 1);
    outInput.min = formatDate(nextDay);
    if (dOut && dOut <= dIn) {
      outInput.value = formatDate(nextDay);
    }
  }

  const nights = calculateNights(inInput.value, outInput.value);
  const totalPrice = room.price * nights;

  if (rateEl) rateEl.textContent = `₹${room.price.toLocaleString('en-IN')}`;
  if (durationEl) durationEl.textContent = `${nights} ${nights === 1 ? 'Night' : 'Nights'}`;
  if (totalEl) totalEl.textContent = `₹${totalPrice.toLocaleString('en-IN')}`;

  // Check live availability for this room on these selected future dates
  let isAvailable = true;
  let occupiedDatesText = '';

  try {
    if (APPS_SCRIPT_URL && APPS_SCRIPT_URL.trim() !== '') {
      const apiUrl = `${APPS_SCRIPT_URL}?action=checkAvailability&check_in=${encodeURIComponent(inInput.value)}&check_out=${encodeURIComponent(outInput.value)}&room_id=${encodeURIComponent(roomId)}`;
      const res = await fetch(apiUrl, { method: 'GET', mode: 'cors' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.status === 'success' && Array.isArray(data.results)) {
          const match = data.results.find(r => r.room_id === roomId);
          if (match) {
            isAvailable = match.is_available;
            if (match.overlapping_dates && match.overlapping_dates.length > 0) {
              occupiedDatesText = match.overlapping_dates.map(d => `${formatShortDate(d.check_in)}–${formatShortDate(d.check_out)}`).join(', ');
            }
          }
        }
      }
    } else {
      const localResults = calculateLocalAvailability(inInput.value, outInput.value, 1);
      const match = localResults.find(r => r.room_id === roomId);
      if (match) {
        isAvailable = match.is_available;
        if (match.overlapping_dates && match.overlapping_dates.length > 0) {
          occupiedDatesText = match.overlapping_dates.map(d => `${formatShortDate(d.check_in)}–${formatShortDate(d.check_out)}`).join(', ');
        }
      }
    }
  } catch (e) {
    console.warn('[Modal Live Check Notice]', e.message);
  }

  if (availBadge) {
    if (isAvailable) {
      availBadge.className = 'modal-avail-badge available';
      availBadge.textContent = '✓ Available';
      if (conflictAlert) conflictAlert.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = false;
        const btnText = submitBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'SUBMIT BOOKING REQUEST';
      }
    } else {
      availBadge.className = 'modal-avail-badge unavailable';
      availBadge.textContent = '❌ Occupied';
      if (conflictAlert) {
        conflictAlert.style.display = 'flex';
        conflictAlert.innerHTML = `<span>⚠️ <strong>${escapeHtml(room.name)}</strong> is already booked for ${escapeHtml(occupiedDatesText || 'selected dates')}. Please choose different dates.</span>`;
      }
      if (submitBtn) {
        submitBtn.disabled = true;
        const btnText = submitBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'DATES OCCUPIED — SELECT OTHER DATES';
      }
    }
  }
};

/**
 * Handle Booking Form Submission with Full Error Boundaries & Data Preservation
 */
window.handleBookingSubmit = async function () {
  // 1. Check honeypot field (anti-spam bot detection)
  const honeypot = document.getElementById('bookHoneypot');
  if (honeypot && honeypot.value.trim() !== '') {
    console.warn('[Bot submission suppressed]');
    closeAllModals();
    showSuccessMessage('Booking request received.', 'Request Placed');
    return;
  }

  const roomId = document.getElementById('modalRoomId').value;
  const room = ROOMS_DATA[roomId];
  const name = document.getElementById('bookGuestName').value.trim();
  const phone = document.getElementById('bookGuestPhone').value.trim();
  const email = document.getElementById('bookGuestEmail').value.trim();
  const adults = parseInt(document.getElementById('bookAdults').value || '1', 10);
  const children = parseInt(document.getElementById('bookChildren').value || '0', 10);
  const totalGuests = adults + children;
  const notes = document.getElementById('bookSpecialRequests').value.trim();

  // Read selected dates directly from the modal date pickers
  const checkinInput = document.getElementById('modalCheckinDate') || document.getElementById('checkinDate');
  const checkoutInput = document.getElementById('modalCheckoutDate') || document.getElementById('checkoutDate');
  const checkin = checkinInput.value;
  const checkout = checkoutInput.value;
  const nights = calculateNights(checkin, checkout);
  const totalPrice = room ? room.price * nights : 0;

  // 2. Client-side field validation with luxury toasts
  if (!name || name.length < 2) {
    showErrorMessage('Please provide your full name (at least 2 characters).', 'Missing Full Name');
    document.getElementById('bookGuestName').focus();
    return;
  }

  const cleanPhone = phone.replace(/[\s\-()]/g, '');
  if (!phone || cleanPhone.length < 7 || cleanPhone.length > 18) {
    showErrorMessage('Please provide a valid contact number (e.g. +91 98765 43210).', 'Invalid Phone Number');
    document.getElementById('bookGuestPhone').focus();
    return;
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showErrorMessage('Please enter a valid email address or leave it blank.', 'Invalid Email');
    document.getElementById('bookGuestEmail').focus();
    return;
  }

  if (room && totalGuests > room.capacity) {
    showErrorMessage(`Total guests (${totalGuests}) exceeds the maximum capacity of ${room.name} (${room.capacity} guests max).`, 'Capacity Exceeded');
    return;
  }

  const consentCheck = document.getElementById('bookDpdpConsent');
  if (consentCheck && !consentCheck.checked) {
    showErrorMessage('Please confirm your consent for booking data processing (DPDP Act 2023).', 'Consent Required');
    consentCheck.focus();
    return;
  }

  // 3. Disable submit button to prevent double-submission
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
        phone: phone,
        email: email,
        adults: adults,
        children: children,
        total_guests: totalGuests,
        notes: notes,
        hp_check: '' // Honeypot verification
      };

      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP status ${response.status}`);
      }

      const data = await response.json();
      if (data && data.status === 'success') {
        bookingResult = data.details || (data.data && data.data.details) || data.data;
      } else {
        const errorMsg = (data && data.message) ? data.message : 'We could not complete your booking request.';
        const errCode = (data && data.code) ? data.code : 'BOOKING_ERROR';
        const customErr = new Error(errorMsg);
        customErr.code = errCode;
        throw customErr;
      }
    } else {
      // Local Mock Store booking creation
      // Re-verify availability
      const availCheck = calculateLocalAvailability(checkin, checkout, totalGuests);
      const targetAvail = availCheck.find(r => r.room_id === roomId);
      if (!targetAvail || !targetAvail.is_available) {
        const conflictErr = new Error('Sorry, this room was just booked for the selected dates. Please choose another date or room.');
        conflictErr.code = 'BOOKING_CONFLICT';
        throw conflictErr;
      }

      // Generate ID BK-YYYYMMDD-XXXX
      const today = new Date();
      const yr = today.getFullYear();
      const mo = String(today.getMonth() + 1).padStart(2, '0');
      const da = String(today.getDate()).padStart(2, '0');
      const rand = Math.floor(1000 + Math.random() * 9000);
      const bookingId = `BK-${yr}${mo}${da}-${rand}`;

      const newBooking = {
        booking_id: bookingId,
        room_id: roomId,
        room_name: room.name,
        guest_name: name,
        phone: phone,
        email: email,
        check_in: checkin,
        check_out: checkout,
        adults: adults,
        children: children,
        total_guests: totalGuests,
        total_nights: nights,
        price_per_night: room.price,
        total_amount: totalPrice,
        status: 'Pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        notes: notes
      };

      LOCAL_BOOKINGS_STORE.push(newBooking);
      bookingResult = newBooking;
    }

    if (!bookingResult || !bookingResult.booking_id) {
      throw new Error('Server did not return a valid booking confirmation ID.');
    }

    // Success: Close booking modal, show Confirmation Modal, and trigger toast
    closeAllModals();
    showConfirmationModal(bookingResult);
    showSuccessMessage(`Booking request ${bookingResult.booking_id} placed successfully!`, 'Request Received');

    // Refresh live availability in background
    window.checkAvailabilityAction(false);

  } catch (err) {
    console.error('[Booking Submission Error]', err);

    // Crucial: Form data is PRESERVED upon failure!
    const userMessage = err.message || 'We could not submit your booking request right now. Please check your connection or contact us on WhatsApp.';
    showErrorMessage(userMessage, err.code ? `Error (${err.code})` : 'Booking Request Error');

  } finally {
    // Restore button state safely in finally block
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

  var totalAmount = details.total_amount || details.total_price || 0;
  var totalGuests = details.total_guests || details.guest_count || details.guests || 1;
  var guestBreakdown = `${totalGuests} Guests`;
  if (details.adults) {
    guestBreakdown = `${details.adults} ${details.adults === 1 ? 'Adult' : 'Adults'}` +
      (details.children > 0 ? `, ${details.children} ${details.children === 1 ? 'Child' : 'Children'}` : '');
  }

  if (idEl) idEl.textContent = details.booking_id;
  if (roomEl) roomEl.textContent = details.room_name || details.room_id;
  if (nameEl) nameEl.textContent = details.guest_name;
  if (phoneEl) phoneEl.textContent = details.phone || details.guest_phone;
  if (datesEl) datesEl.textContent = `${details.check_in} to ${details.check_out} (${details.total_nights} Nights)`;
  if (guestsEl) guestsEl.textContent = guestBreakdown;
  if (priceEl) priceEl.textContent = `₹${totalAmount.toLocaleString('en-IN')}`;

  // Build WhatsApp share message
  const waMessage =
    `*NANDHANAM ELITE HOMESTAY BOOKING REQUEST*%0A` +
    `----------------------------------------%0A` +
    `• *Booking ID:* ${encodeURIComponent(details.booking_id)}%0A` +
    `• *Room:* ${encodeURIComponent(details.room_name || details.room_id)}%0A` +
    `• *Guest Name:* ${encodeURIComponent(details.guest_name)}%0A` +
    `• *Phone:* ${encodeURIComponent(details.phone || details.guest_phone)}%0A` +
    `• *Check-in:* ${encodeURIComponent(details.check_in)}%0A` +
    `• *Check-out:* ${encodeURIComponent(details.check_out)} (${details.total_nights} Nights)%0A` +
    `• *Guests:* ${encodeURIComponent(guestBreakdown)}%0A` +
    `• *Total Amount (Snapshot):* ₹${totalAmount.toLocaleString('en-IN')}%0A` +
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

  // Modal Date Inputs Dynamic Event Listeners
  const modalIn = document.getElementById('modalCheckinDate');
  const modalOut = document.getElementById('modalCheckoutDate');
  if (modalIn) {
    modalIn.addEventListener('change', () => {
      window.recalcModalStay();
    });
  }
  if (modalOut) {
    modalOut.addEventListener('change', () => {
      window.recalcModalStay();
    });
  }

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

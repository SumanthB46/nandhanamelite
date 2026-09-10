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
const PROPERTY_PHONE = '+919447736460';
const PROPERTY_WA_NUMBER = '919447736460';
const PROPERTY_EMAIL = 'nandhanamelite@gmail.com';
const PROPERTY_INSTAGRAM = 'https://www.instagram.com/nandhanamelite?igsi=MWJ0emhiYmQyNnZ4OQ==';
const PROPERTY_FACEBOOK = 'https://www.facebook.com/share/1R2bhGNVuv/?mibextid=wwXIfr';

/**
 * HTML Sanitizer Helper
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Room Catalogue Data
const ROOMS_DATA = {
  'R001': {
    id: 'R001',
    name: 'AC Room',
    tag: 'AIR CONDITIONED',
    price: 1699,
    capacity: 4,
    img: 'assets/images/ac-room.jpg',
    images: [
      { src: 'assets/images/ac-room.jpg', caption: 'Executive AC Bedroom with Double Bed & Desk' },
      { src: 'assets/images/ac-room-view.jpg', caption: 'Luxury Double Bedroom Overview & Wardrobe' },
      { src: 'assets/images/room-ceiling-tv.jpg', caption: 'Ambient Cove Ceiling Lighting & TV' },
      { src: 'assets/images/bathroom.jpg', caption: 'Sparkling Attached Bathroom with Shower' }
    ],
    desc: 'Spacious climate-controlled room featuring plush queen bedding, modern attached bathroom with 24/7 hot water, and quiet garden ambience. Ideal for couples, families, and solo business executives.',
    amenities: ['Air Conditioning', 'Complimentary Breakfast', 'TV in every room', 'Attached Bathroom', '24/7 Hot Water']
  },
  'R002': {
    id: 'R002',
    name: 'Non AC Comfort Room',
    tag: 'NATURAL VENTILATION',
    price: 1299,
    capacity: 4,
    img: 'assets/images/non-ac-room.jpg',
    images: [
      { src: 'assets/images/non-ac-room.jpg', caption: 'Non-AC Comfort Bedroom with Teak Wood Finish' },
      { src: 'assets/images/comfort-room-tv.jpg', caption: 'Comfort Bedroom with Wall-Mounted TV & Desk' },
      { src: 'assets/images/room-dressing.jpg', caption: 'Spacious Bedroom Interior with Dressing Mirror' },
      { src: 'assets/images/bathroom.jpg', caption: 'Sparkling Attached Bathroom with Shower' }
    ],
    desc: 'Well-ventilated, breezy double bedroom designed for budget-conscious travellers seeking clean, comfortable accommodation in central Thodupuzha.',
    amenities: ['Natural Ventilation', 'Complimentary Breakfast', 'TV in every room', 'Attached Bathroom', '24/7 Hot Water']
  }
};

// In-Memory Bookings Store (Mock Backend for Instant Offline / Test Usage)
const LOCAL_BOOKINGS_STORE = [
  // Sample booking for demonstration (blocks R001 on sample dates)
  {
    booking_id: 'BK-20260820-0001',
    room_id: 'R001',
    room_name: 'AC Room',
    guest_name: 'Rahul Sharma',
    phone: '+91 98765 43210',
    email: 'rahul@example.com',
    check_in: getOffsetDateString(5),
    check_out: getOffsetDateString(7),
    adults: 2,
    children: 0,
    total_guests: 2,
    price_per_night: 1699,
    total_amount: 3398,
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

/**
 * Format date string to Indian/Universal Clean Display (e.g. "26 Aug 2026")
 */
function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const d = parseDate(dateStr);
  if (!d || Number.isNaN(d.getTime())) return String(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function parseDate(dateStr) {
  if (!dateStr) return null;

  const str = String(dateStr).trim();
  if (!str) return null;

  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  }

  const slashMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  }

  const timeDate = new Date(str);
  return Number.isNaN(timeDate.getTime()) ? null : timeDate;
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

  // Initialize automatic real-time background refresh
  initAutoRefreshEngine();
});

/**
 * Real-Time Auto-Refresh Engine
 * - Polls Google Sheets every 30 seconds silently in the background
 * - Automatically refreshes when the user returns to the tab or focuses the window
 */
function initAutoRefreshEngine() {
  const AUTO_REFRESH_INTERVAL_MS = 30000; // 30 seconds

  // 1. Silent Periodic Background Poller
  setInterval(() => {
    // Only poll when the tab is active to save resources & quota
    if (!document.hidden) {
      window.triggerAutoRefresh();
    }
  }, AUTO_REFRESH_INTERVAL_MS);

  // 2. Instant Refresh on Tab Switch / Return to Page
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      window.triggerAutoRefresh();
    }
  });

  // 3. Instant Refresh on Window Focus
  window.addEventListener('focus', () => {
    window.triggerAutoRefresh();
  });
}

/**
 * Global Silent Auto-Refresh Trigger
 */
window.triggerAutoRefresh = async function () {
  try {
    await fetchAndApplyRoomsAndSettings();
    if (typeof window.checkAvailabilityAction === 'function') {
      window.checkAvailabilityAction(false);
    }
  } catch (e) {
    console.debug('[AutoRefresh Silent]', e);
  }
};

/**
 * Dynamic Room & Settings Synchronizer (Google Sheets -> Website)
 */
async function fetchAndApplyRoomsAndSettings() {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.trim() === '') return;

  try {
    // 1. Fetch Room Catalog from Google Sheets (Cache-busted to ensure immediate updates)
    const roomsRes = await fetch(`${APPS_SCRIPT_URL}?action=getRooms&_t=${Date.now()}`, { method: 'GET', mode: 'cors' });
    if (roomsRes.ok) {
      const data = await roomsRes.json();
      if (data && data.status === 'success' && Array.isArray(data.rooms) && data.rooms.length > 0) {
        // Update ROOMS_DATA cache with live prices from Google Sheets
        data.rooms.forEach(r => {
          const isNonAc = r.room_id === 'R002' || (r.room_name && r.room_name.toUpperCase().includes('NON'));
          const defaultRealImg = isNonAc ? 'assets/images/non-ac-room.jpg' : 'assets/images/ac-room.jpg';
          const validImg = (r.image_url && !r.image_url.includes('unsplash')) ? r.image_url : defaultRealImg;
          r.image_url = validImg; // Always ensure real property image is used

          // Live Price from Google Sheets
          const fetchedPrice = Number(r.price_per_night || r.price || r.rate || r.tariff || r.room_price) || (ROOMS_DATA[r.room_id] ? ROOMS_DATA[r.room_id].price : 0);
          r.price_per_night = fetchedPrice;

          const defaultAmenities = isNonAc 
            ? ['Natural Ventilation', 'Complimentary Breakfast', 'TV in every room', 'Attached Bathroom', '24/7 Hot Water']
            : ['Air Conditioning', 'Complimentary Breakfast', 'TV in every room', 'Attached Bathroom', '24/7 Hot Water'];
          let roomAmenities = (Array.isArray(r.amenities) && r.amenities.length > 0) ? r.amenities : defaultAmenities;
          if (!roomAmenities.some(a => a.toLowerCase().includes('breakfast'))) {
            roomAmenities.splice(1, 0, 'Complimentary Breakfast');
          }

          ROOMS_DATA[r.room_id] = {
            id: r.room_id,
            name: r.room_name,
            tag: isNonAc ? 'NATURAL VENTILATION' : (r.room_name.toUpperCase().includes('AC') ? 'AIR CONDITIONED' : 'COMFORT ROOM'),
            price: fetchedPrice,
            capacity: Math.max(Number(r.capacity) || 0, 4),
            img: validImg,
            images: (ROOMS_DATA[r.room_id] && ROOMS_DATA[r.room_id].images) ? ROOMS_DATA[r.room_id].images : [{ src: validImg, caption: r.room_name }],
            desc: r.description || (ROOMS_DATA[r.room_id] ? ROOMS_DATA[r.room_id].desc : ''),
            amenities: roomAmenities
          };
        });

        // Re-render rooms grid to reflect changes/new rooms/updated prices from Google Sheets
        renderRoomsGrid(data.rooms);
        window.checkAvailabilityAction(false);
      }
    }
  } catch (err) {
    console.warn('[Dynamic Rooms Sync Notice]:', err.message);
  }

  try {
    // 2. Fetch Property Settings from Google Sheets
    const settingsRes = await fetch(`${APPS_SCRIPT_URL}?action=getSettings&_t=${Date.now()}`, { method: 'GET', mode: 'cors' });
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
 * Dynamically Render Room Cards from Google Sheets Data (Safe In-Place Update)
 */
function renderRoomsGrid(rooms) {
  const grid = document.getElementById('roomsGrid');
  if (!grid || !Array.isArray(rooms) || rooms.length === 0) return;

  try {
    rooms.forEach(room => {
      let card = grid.querySelector(`.room-card[data-room-id="${room.room_id}"]`);
      const roomPrice = Number(room.price_per_night || room.price || room.rate || room.tariff) || (ROOMS_DATA[room.room_id] ? ROOMS_DATA[room.room_id].price : 0);

      if (card) {
        // Safe In-Place Update: NEVER wipe existing DOM cards
        card.setAttribute('data-capacity', String(room.capacity || 4));
        if (roomPrice > 0) {
          card.setAttribute('data-price', String(roomPrice));
          const priceEl = card.querySelector('.price-value');
          if (priceEl) priceEl.textContent = `₹${roomPrice.toLocaleString('en-IN')}`;
          const estEl = card.querySelector('.est-amount');
          if (estEl) estEl.textContent = `₹${roomPrice.toLocaleString('en-IN')}`;
        }
        const capChip = card.querySelector('.room-capacity-chip');
        if (capChip) {
          capChip.textContent = '2 Adults + 2 Children (<12 yrs)';
        }
        const bookBtn = card.querySelector('.book-room-btn');
        if (bookBtn) {
          if (roomPrice > 0) bookBtn.setAttribute('data-room-price', String(roomPrice));
          bookBtn.setAttribute('data-capacity', String(room.capacity || 4));
        }
      } else {
        // If a brand new room is added in Google Sheets, build and append it
        const newCard = document.createElement('div');
        newCard.className = 'room-card';
        newCard.setAttribute('data-room-id', room.room_id);
        newCard.setAttribute('data-capacity', String(room.capacity || 4));
        newCard.setAttribute('data-price', String(roomPrice));

        const isNonAc = room.room_id === 'R002' || (room.room_name && room.room_name.toUpperCase().includes('NON'));
        const defaultRealImg = isNonAc ? 'assets/images/non-ac-room.jpg' : 'assets/images/ac-room.jpg';
        const imgUrl = (room.image_url && !room.image_url.includes('unsplash')) ? room.image_url : defaultRealImg;
        const tag = isNonAc ? 'NATURAL VENTILATION' : (room.room_name && room.room_name.toUpperCase().includes('AC') ? 'AIR CONDITIONED' : 'COMFORT ROOM');
        const amenitiesArr = Array.isArray(room.amenities) ? room.amenities : [];

        let amenitiesHtml = '';
        amenitiesArr.slice(0, 4).forEach(am => {
          amenitiesHtml += `
            <li>
              <span class="check-icon">✓</span>
              <span>${escapeHtml(am)}</span>
            </li>`;
        });

        newCard.innerHTML = `
          <div class="room-img-wrap">
            <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(room.room_name)}" class="room-img" loading="lazy">
            <div class="room-tag">${escapeHtml(tag)}</div>
            <div class="room-status-badge available" id="badge-${escapeHtml(room.room_id)}">Available</div>
          </div>
          <div class="room-details">
            <div class="room-header-meta">
              <h3 class="room-type">${escapeHtml(room.room_name.toUpperCase())}</h3>
              <span class="room-capacity-chip">2 Adults + 2 Children (&lt;12 yrs)</span>
            </div>
            <p class="room-short-desc">${escapeHtml(room.description || '')}</p>
            <ul class="room-features-list">
              ${amenitiesHtml}
            </ul>
            
            <div class="room-pricing-row">
              <div class="room-pricing">
                <span class="from-text">RATE </span>
                <span class="price-value" id="price-${escapeHtml(room.room_id)}">₹${roomPrice.toLocaleString('en-IN')}</span>
                <span class="period"> / NIGHT</span>
              </div>
              <div class="total-estimate" id="estimate-${escapeHtml(room.room_id)}" style="display:none;">
                <span class="est-label">Total for stay:</span>
                <span class="est-amount">₹${roomPrice.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div class="room-card-actions">
              <button class="btn btn-outline-room view-details-btn" data-room-id="${escapeHtml(room.room_id)}">VIEW DETAILS</button>
              <button class="btn btn-dark-full book-room-btn" data-room-id="${escapeHtml(room.room_id)}" data-room-name="${escapeHtml(room.room_name)}" data-room-price="${escapeHtml(String(roomPrice))}" data-capacity="4">SELECT & BOOK</button>
            </div>
          </div>
        `;

        grid.appendChild(newCard);
      }
    });

    // Re-bind click event listeners safely
    initRoomCardsEvents();
  } catch (err) {
    console.warn('[renderRoomsGrid Notice]:', err);
  }
}

/**
 * Format raw phone number into display (+91 94477 36460), tel link (+919447736460), and WhatsApp (919447736460)
 */
function formatPhoneDetails(val) {
  if (!val) {
    return {
      display: '+91 94477 36460',
      tel: '+919447736460',
      wa: '919447736460'
    };
  }
  const digits = String(val).replace(/\D/g, '');
  const tenDigits = digits.length >= 10 ? digits.slice(-10) : (digits || '9447736460');
  return {
    display: `+91 ${tenDigits.slice(0, 5)} ${tenDigits.slice(5)}`,
    tel: `+91${tenDigits}`,
    wa: `91${tenDigits}`
  };
}

/**
 * Apply Property Settings dynamically to the DOM
 */
function applySettingsToDOM(settings) {
  if (!settings) return;

  const phoneInfo = formatPhoneDetails(settings.phone || settings.whatsapp);
  const waInfo = formatPhoneDetails(settings.whatsapp || settings.phone);

  // Update WhatsApp links
  const waLinks = document.querySelectorAll('a[href*="wa.me"]');
  waLinks.forEach(link => {
    link.href = `https://wa.me/${waInfo.wa}?text=Hello%20Nandhanam%20Elite,%20I%20would%20like%20to%20enquire%20about%20room%20availability.`;
  });

  // Update footer mobile contact
  const footerMobileLink = document.getElementById('footerMobileLink');
  if (footerMobileLink) footerMobileLink.href = `tel:${phoneInfo.tel}`;
  const footerMobileVal = document.getElementById('footerMobileVal');
  if (footerMobileVal) footerMobileVal.textContent = phoneInfo.display;

  // Update footer landline (if configured, otherwise keeps default)
  if (settings.landline) {
    const footerLandlineLink = document.getElementById('footerLandlineLink');
    if (footerLandlineLink) footerLandlineLink.href = `tel:${String(settings.landline).replace(/[^0-9+]/g, '')}`;
    const footerLandlineVal = document.getElementById('footerLandlineVal');
    if (footerLandlineVal) footerLandlineVal.textContent = settings.landline;
  }

  // Update property email
  const email = settings.email || PROPERTY_EMAIL;
  if (email) {
    const footerEmailLink = document.getElementById('footerEmailLink');
    if (footerEmailLink) footerEmailLink.href = `mailto:${email}`;
    const footerEmailVal = document.getElementById('footerEmailVal');
    if (footerEmailVal) footerEmailVal.textContent = email;
  }

  // Update property address
  const defaultAddr = 'Kaithakod Junction, Vengallor - Mangatukavala Bypass Road, Thodupuzha East PO, Pin: 685585';
  let address = settings.address;
  if (!address || address.includes('Annz Colors')) {
    address = defaultAddr;
  }
  const footerAddressVal = document.getElementById('footerAddressVal');
  if (footerAddressVal) footerAddressVal.textContent = address;
  const footerAddressLink = document.getElementById('footerAddressLink');
  if (footerAddressLink) footerAddressLink.href = `https://maps.google.com/?q=${encodeURIComponent(address)}`;

  // Update helpline call CTA button
  const helplineBtn = document.querySelector('.btn-helpline-call');
  if (helplineBtn) {
    helplineBtn.href = `tel:${phoneInfo.tel}`;
    const helplineCallEl = helplineBtn.querySelector('span');
    if (helplineCallEl) helplineCallEl.textContent = `📞 Call ${phoneInfo.display}`;
  }

  // Update check-in / check-out hints cleanly (preventing 1899 epoch strings)
  const checkinTime = formatTimeClean(settings.check_in_time, '24-Hour Flexible Check-in');
  const checkoutTime = formatTimeClean(settings.check_out_time, '24 hrs from Check-in');

  const inHint = document.querySelector('label[for="checkinDate"] + .input-with-icon + .input-hint');
  if (inHint) inHint.textContent = checkinTime.includes('24') ? checkinTime : `From ${checkinTime}`;
  const outHint = document.querySelector('label[for="checkoutDate"] + .input-with-icon + .input-hint');
  if (outHint) outHint.textContent = checkoutTime.includes('24') ? checkoutTime : `Until ${checkoutTime}`;

  // Update social links if configured
  const instagram = settings.instagram || PROPERTY_INSTAGRAM;
  if (instagram) {
    const igLinks = document.querySelectorAll('a[aria-label="Instagram"]');
    igLinks.forEach(el => el.href = instagram);
  }
  const facebook = settings.facebook || PROPERTY_FACEBOOK;
  if (facebook) {
    const fbLinks = document.querySelectorAll('a[aria-label="Facebook"]');
    fbLinks.forEach(el => el.href = facebook);
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
        stayDurationHint.textContent = `${nights} ${nights === 1 ? 'Night' : 'Nights'} (24-Hour Stay)`;
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

  // Show spinner on search button ONLY on explicit user click (shouldScroll === true)
  if (checkBtn && shouldScroll) {
    checkBtn.classList.add('is-loading');
    checkBtn.disabled = true;
  }

  try {
    let results = [];
    let isApiConnected = false;

    // Attempt Google Apps Script live fetch if configured
    if (APPS_SCRIPT_URL && APPS_SCRIPT_URL.trim() !== '') {
      const serverGuests = Math.min(guests, 2);
      const apiUrl = `${APPS_SCRIPT_URL}?action=checkAvailability&check_in=${encodeURIComponent(checkin)}&check_out=${encodeURIComponent(checkout)}&guests=${serverGuests}`;
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
      res.capacity = Math.max(Number(res.capacity) || 0, 4);
      // If server returned unavailable ONLY due to room capacity when up to 4 guests are permitted
      if (!res.is_available && res.unavailability_reason && res.unavailability_reason.toLowerCase().includes('capacity') && guests <= 4) {
        if (!res.overlapping_dates || res.overlapping_dates.length === 0) {
          res.is_available = true;
          res.unavailability_reason = '';
        }
      }
      const roomCard = document.querySelector(`.room-card[data-room-id="${res.room_id}"]`);
      const badge = document.getElementById(`badge-${res.room_id}`);
      const bookBtn = roomCard ? roomCard.querySelector('.book-room-btn') : null;

      if (badge && roomCard && bookBtn) {
        if (res.is_available) {
          availableCount++;
          badge.className = 'room-status-badge available';
          badge.textContent = res.remaining_units && res.remaining_units < 8 ? `Available (${res.remaining_units} Left)` : 'Available';
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

    // Calculate total individual rooms available across all 16 units
    let totalAvailableUnits = 0;
    results.forEach(res => {
      if (res.is_available) {
        totalAvailableUnits += (typeof res.remaining_units === 'number' ? res.remaining_units : 8);
      }
    });

    // Update Feedback Banner only when user explicitly searched
    if (banner && shouldScroll) {
      banner.style.display = 'block';
      if (availableCount > 0) {
        banner.className = 'availability-status-banner';
        if (bannerIcon) bannerIcon.textContent = '✓';
        if (bannerTitle) {
          if (availableCount === results.length) {
            bannerTitle.textContent = `Both AC & Non-AC Rooms Available (${totalAvailableUnits} of 16 Rooms Open)`;
          } else {
            bannerTitle.textContent = `${totalAvailableUnits} Rooms Available (${availableCount} Category Open)`;
          }
        }
        if (bannerDesc) {
          if (guests >= 3) {
            bannerDesc.textContent = `Stay for ${nights} ${nights === 1 ? 'Night' : 'Nights'} (${formatDisplayDate(checkin)} to ${formatDisplayDate(checkout)}) for ${guests} Guests. Accommodates 2 Adults + 2 Children per room (extra bed or second room available on request).`;
          } else {
            bannerDesc.textContent = `Stay for ${nights} ${nights === 1 ? 'Night' : 'Nights'} (${formatDisplayDate(checkin)} to ${formatDisplayDate(checkout)}) for ${guests} ${guests === 1 ? 'Guest' : 'Guests'}.`;
          }
        }
      } else {
        banner.className = 'availability-status-banner error';
        if (bannerIcon) bannerIcon.textContent = '✕';
        if (bannerTitle) bannerTitle.textContent = 'No Rooms Available For Selected Dates';
        if (bannerDesc) bannerDesc.textContent = 'All 16 rooms are reserved for these dates or exceed guest capacity. Try selecting different dates or chat with our host directly.';
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

    // If explicit user search failed, show notice
    if (shouldScroll && APPS_SCRIPT_URL && APPS_SCRIPT_URL.trim() !== '') {
      if (banner) {
        banner.style.display = 'block';
        banner.className = 'availability-status-banner error';
        if (bannerIcon) bannerIcon.textContent = '⚠';
        if (bannerTitle) bannerTitle.textContent = 'Live Sync Temporarily Offline';
        if (bannerDesc) bannerDesc.textContent = 'Unable to reach the live booking server. Showing cached property availability. Please contact us on WhatsApp for real-time confirmation.';
      }
    }

    // Apply local fallback
    const fallbackResults = calculateLocalAvailability(checkin, checkout, guests);
    applyAvailabilityToDOM(fallbackResults, nights);

  } finally {
    if (checkBtn && shouldScroll) {
      checkBtn.classList.remove('is-loading');
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
 * 3. Offline / Local In-Memory Availability Calculator (Multi-room inventory: 8 AC & 8 Non-AC)
 */
function calculateLocalAvailability(checkinStr, checkoutStr, guests) {
  const reqIn = parseDate(checkinStr);
  const reqOut = parseDate(checkoutStr);
  const nights = calculateNights(checkinStr, checkoutStr);
  const maxInventory = 8; // 8 AC rooms and 8 Non-AC rooms

  return Object.values(ROOMS_DATA).map(room => {
    const roomCap = Math.max(Number(room.capacity) || 0, 4);
    const fitsCapacity = guests ? roomCap >= guests : true;

    // Check overlaps
    let overlappingCount = 0;
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
              overlappingCount++;
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

    const isFullyBooked = overlappingCount >= maxInventory;
    const isAvailable = !isFullyBooked && fitsCapacity;
    const remainingUnits = Math.max(0, maxInventory - overlappingCount);
    let reason = '';
    if (isFullyBooked) {
      const dateSpans = overlappingBookings.map(ob => `${ob.check_in} to ${ob.check_out}`).join(', ');
      reason = 'All ' + maxInventory + ' rooms booked for dates: ' + dateSpans;
    } else if (!fitsCapacity) {
      reason = `Exceeds capacity (${roomCap} max)`;
    }

    return {
      room_id: room.id,
      room_name: room.name,
      price_per_night: room.price,
      total_nights: nights,
      total_estimated_price: room.price * nights,
      capacity: roomCap,
      total_inventory: maxInventory,
      remaining_units: remainingUnits,
      is_available: isAvailable,
      overlapping_dates: isFullyBooked ? overlappingBookings : [],
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
        badge.textContent = res.remaining_units && res.remaining_units < 8 ? `Available (${res.remaining_units} Left)` : 'Available';
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

  // Initialize Room Card Multi-Photo Sliders
  initRoomImageSliders();

  // Initialize Mobile Rooms Horizontal Swipe & Pagination Dots
  initRoomsMobileSlider();
}

/**
 * Interactive Room Card Multi-Photo Slider Engine
 */
function initRoomImageSliders() {
  const roomCards = document.querySelectorAll('.room-card');
  roomCards.forEach(card => {
    const wrap = card.querySelector('.room-img-wrap');
    if (!wrap) return;

    // Avoid double-binding
    if (wrap.dataset.sliderBound === 'true') return;
    wrap.dataset.sliderBound = 'true';

    const slides = wrap.querySelectorAll('.room-slide');
    const prevBtn = wrap.querySelector('.room-slider-nav.prev');
    const nextBtn = wrap.querySelector('.room-slider-nav.next');
    const dots = wrap.querySelectorAll('.room-dot');
    const counter = wrap.querySelector('.room-photo-counter');

    if (!slides.length) return;

    let currentIndex = 0;

    function goToSlide(newIdx) {
      if (newIdx < 0) newIdx = slides.length - 1;
      if (newIdx >= slides.length) newIdx = 0;
      currentIndex = newIdx;

      slides.forEach((s, idx) => {
        if (idx === currentIndex) {
          s.classList.add('active');
        } else {
          s.classList.remove('active');
        }
      });

      dots.forEach((d, idx) => {
        if (idx === currentIndex) {
          d.classList.add('active');
        } else {
          d.classList.remove('active');
        }
      });

      if (counter) {
        counter.textContent = `${currentIndex + 1} / ${slides.length}`;
      }
      wrap.setAttribute('data-current-slide', String(currentIndex));
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        goToSlide(currentIndex - 1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        goToSlide(currentIndex + 1);
      });
    }

    dots.forEach((dot, idx) => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        goToSlide(idx);
      });
    });

    // Clicking slide image opens full-screen lightbox preview
    slides.forEach(slide => {
      const img = slide.querySelector('img');
      if (img) {
        img.addEventListener('click', (e) => {
          e.stopPropagation();
          const lightboxModal = document.getElementById('lightboxModal');
          const lightboxImg = document.getElementById('lightboxImg');
          const lightboxCaption = document.getElementById('lightboxCaption');
          if (lightboxModal && lightboxImg) {
            lightboxImg.src = img.src;
            if (lightboxCaption) {
              lightboxCaption.textContent = slide.getAttribute('data-caption') || img.alt || '';
            }
            lightboxModal.classList.add('active');
            document.body.style.overflow = 'hidden';
          }
        });
      }
    });

    // Mobile touch swipe handling on the card's image area
    let touchStartX = 0;
    let touchStartY = 0;
    wrap.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    wrap.addEventListener('touchend', (e) => {
      if (e.changedTouches && e.changedTouches[0]) {
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY)) {
          if (deltaX < 0) {
            goToSlide(currentIndex + 1);
          } else {
            goToSlide(currentIndex - 1);
          }
        }
      }
    }, { passive: true });
  });
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
  if (capEl) capEl.textContent = '2 Adults + 2 Children (<12 yrs)';
  if (priceEl) priceEl.textContent = `₹${room.price.toLocaleString('en-IN')}`;

  // Room photo gallery thumbnails inside the modal
  let thumbsContainer = modal.querySelector('.modal-room-thumbs');
  if (!thumbsContainer && imgEl && imgEl.parentElement) {
    thumbsContainer = document.createElement('div');
    thumbsContainer.className = 'modal-room-thumbs';
    imgEl.parentElement.after(thumbsContainer);
  }

  if (thumbsContainer) {
    thumbsContainer.innerHTML = '';
    const images = Array.isArray(room.images) && room.images.length > 0
      ? room.images
      : [{ src: room.img, caption: room.name }];

    images.forEach((photoObj, idx) => {
      const src = typeof photoObj === 'string' ? photoObj : photoObj.src;
      const thumb = document.createElement('img');
      thumb.src = src;
      thumb.alt = `${room.name} Photo ${idx + 1}`;
      thumb.className = `modal-room-thumb ${idx === 0 ? 'active' : ''}`;
      thumb.addEventListener('click', () => {
        if (imgEl) imgEl.src = src;
        thumbsContainer.querySelectorAll('.modal-room-thumb').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      });
      thumbsContainer.appendChild(thumb);
    });
  }

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

  const roomCountSelect = document.getElementById('bookRoomCount');
  const roomCount = roomCountSelect ? parseInt(roomCountSelect.value, 10) || 1 : 1;
  const nights = calculateNights(inInput.value, outInput.value);
  const totalPrice = room.price * nights * roomCount;

  const sumRoomsEl = document.getElementById('sumRooms');
  if (sumRoomsEl) sumRoomsEl.textContent = `${roomCount} ${roomCount === 1 ? 'Room' : 'Rooms'}`;
  if (durationEl) durationEl.textContent = `${nights} ${nights === 1 ? 'Night' : 'Nights'} (24h Stay)`;
  if (totalEl) totalEl.textContent = `₹${totalPrice.toLocaleString('en-IN')}`;

  const hintEl = document.getElementById('roomAllocationHint');
  if (hintEl) {
    if (roomCount > 1) {
      hintEl.innerHTML = `<strong>${roomCount} Rooms Selected:</strong> Ideal for 3–4 adult guests with maximum space and privacy.`;
    } else {
      hintEl.innerHTML = `<strong>1 Room Selected:</strong> Fits 2 Adults + 2 Children. For 3–4 adults, an extra bed can be requested or select <strong>2 Rooms</strong> above.`;
    }
  }

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
        if (btnText) btnText.textContent = 'SEND TO ADMIN';
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

  const roomCountSelect = document.getElementById('bookRoomCount');
  const roomCount = roomCountSelect ? parseInt(roomCountSelect.value, 10) || 1 : 1;
  const maxRoomCapacity = Math.max(Number(room ? room.capacity : 0) || 0, 4) * roomCount;
  if (room && totalGuests > maxRoomCapacity) {
    showErrorMessage(`Total guests (${totalGuests}) exceeds the capacity for ${roomCount} room(s).`, 'Capacity Exceeded');
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
      const roomCountSelect = document.getElementById('bookRoomCount');
      const roomCount = roomCountSelect ? parseInt(roomCountSelect.value, 10) || 1 : 1;
      const bookingNotes = (roomCount > 1 ? `[Rooms: ${roomCount}] ` : '') + notes;

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
        rooms_count: roomCount,
        notes: bookingNotes,
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
    showSuccessMessage(`Booking request ${bookingResult.booking_id} sent to admin successfully!`, 'Sent to Admin');

    // Refresh live availability in background
    window.checkAvailabilityAction(false);

  } catch (err) {
    console.error('[Booking Submission Error]', err);

    // Crucial: Form data is PRESERVED upon failure!
    const userMessage = err.message || 'We could not submit your booking request right now. Please check your connection or contact us directly.';
    showErrorMessage(userMessage, err.code ? `Error (${err.code})` : 'Booking Request Error');

  } finally {
    // Restore button state safely in finally block
    if (submitBtn) {
      const text = submitBtn.querySelector('.btn-text');
      const spinner = submitBtn.querySelector('.btn-spinner');
      if (text) {
        text.textContent = 'SEND TO ADMIN';
        text.style.display = 'inline-block';
      }
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
  if (datesEl) datesEl.textContent = `${formatDisplayDate(details.check_in)} to ${formatDisplayDate(details.check_out)} (${details.total_nights} ${details.total_nights === 1 ? 'Night' : 'Nights'} • 24-Hr Cycle)`;
  if (guestsEl) guestsEl.textContent = guestBreakdown;
  if (priceEl) priceEl.textContent = `₹${totalAmount.toLocaleString('en-IN')}`;

  const formattedIn = formatDisplayDate(details.check_in);
  const formattedOut = formatDisplayDate(details.check_out);
  const advanceAmount = 500;
  const balanceAmount = Math.max(0, totalAmount - advanceAmount);

  // Build WhatsApp share message
  const waMessage =
    `*NANDHANAM ELITE HOMESTAY BOOKING REQUEST*%0A` +
    `----------------------------------------%0A` +
    `• *Booking ID:* ${encodeURIComponent(details.booking_id)}%0A` +
    `• *Room:* ${encodeURIComponent(details.room_name || details.room_id)}%0A` +
    `• *Guest Name:* ${encodeURIComponent(details.guest_name)}%0A` +
    `• *Phone:* ${encodeURIComponent(details.phone || details.guest_phone)}%0A` +
    `• *Check-in:* ${encodeURIComponent(formattedIn)}%0A` +
    `• *Check-out:* ${encodeURIComponent(formattedOut)} (${details.total_nights} Nights)%0A` +
    `• *Guests:* ${encodeURIComponent(guestBreakdown)}%0A` +
    `• *Total Stay Amount:* ₹${totalAmount.toLocaleString('en-IN')}%0A` +
    `• *Confirmation Advance Required:* ₹${advanceAmount.toLocaleString('en-IN')}%0A` +
    `• *Balance at Check-in:* ₹${balanceAmount.toLocaleString('en-IN')}%0A` +
    `----------------------------------------%0A` +
    `Hello, I have submitted this booking request on your website. Please share UPI payment details to complete the ₹500 advance and confirm my stay.`;

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
    'closeConfirmationModal', 'closeConfirmationBtn'
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
      const galleryGrid = document.querySelector('.gallery-grid');
      viewMorePhotosBtn.addEventListener('click', () => {
        const isExpanded = galleryGrid ? galleryGrid.classList.toggle('is-expanded') : false;
        const extraItems = document.querySelectorAll('.gallery-grid .gallery-item:nth-child(n+4)');

        extraItems.forEach(item => {
          if (isExpanded) {
            item.classList.remove('gallery-hidden');
            item.classList.add('gallery-revealed');
          } else {
            item.classList.remove('gallery-revealed');
            if (item.classList.contains('gallery-item-4')) {
              // Handled by CSS media query (visible on mobile, hidden on desktop when collapsed)
            } else {
              item.classList.add('gallery-hidden');
            }
          }
        });

        viewMorePhotosBtn.textContent = isExpanded ? 'SHOW LESS' : 'VIEW MORE PHOTOS';

        if (!isExpanded) {
          const gallerySection = document.getElementById('gallery');
          if (gallerySection) {
            gallerySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
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

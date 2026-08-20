/* ==========================================================================
   NANDHANAM ELITE TOURIST HOME - JAVASCRIPT LOGIC
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Mobile Menu Toggle
  const menuToggle = document.getElementById('menuToggle');
  const mainNav = document.getElementById('mainNav');
  const navLinks = document.querySelectorAll('.nav-link');

  if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', () => {
      mainNav.classList.toggle('open');
      menuToggle.classList.toggle('active');
    });

    // Close mobile menu on navigation item click
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('open');
        menuToggle.classList.remove('active');
      });
    });
  }

  // 2. Active Nav Link on Scroll
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

  // 3. Date Inputs default values & minimums
  const checkinInput = document.getElementById('checkinDate');
  const checkoutInput = document.getElementById('checkoutDate');

  if (checkinInput && checkoutInput) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const formatDate = (date) => {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    checkinInput.min = formatDate(today);
    checkinInput.value = formatDate(today);

    checkoutInput.min = formatDate(tomorrow);
    checkoutInput.value = formatDate(tomorrow);

    checkinInput.addEventListener('change', () => {
      const selectedCheckin = new Date(checkinInput.value);
      if (!isNaN(selectedCheckin.getTime())) {
        const nextDay = new Date(selectedCheckin);
        nextDay.setDate(nextDay.getDate() + 1);
        checkoutInput.min = formatDate(nextDay);
        if (new Date(checkoutInput.value) <= selectedCheckin) {
          checkoutInput.value = formatDate(nextDay);
        }
      }
    });
  }

  // 4. Room "BOOK THIS ROOM" buttons
  const bookRoomButtons = document.querySelectorAll('.book-room-btn');
  bookRoomButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const roomType = e.currentTarget.getAttribute('data-room');
      const bookingSection = document.getElementById('booking');
      if (bookingSection) {
        bookingSection.scrollIntoView({ behavior: 'smooth' });
        // Optional notification
        const guestCountSelect = document.getElementById('guestCount');
        if (guestCountSelect) {
          guestCountSelect.focus();
        }
      }
    });
  });

  // 5. Gallery Lightbox
  const galleryItems = document.querySelectorAll('.gallery-item');
  const lightboxModal = document.getElementById('lightboxModal');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxClose = document.getElementById('lightboxClose');

  if (galleryItems.length && lightboxModal) {
    galleryItems.forEach(item => {
      item.addEventListener('click', () => {
        const fullImg = item.getAttribute('data-img');
        const caption = item.getAttribute('data-caption');
        lightboxImg.src = fullImg;
        lightboxCaption.textContent = caption || '';
        lightboxModal.classList.add('active');
      });
    });

    lightboxClose.addEventListener('click', () => {
      lightboxModal.classList.remove('active');
    });

    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) {
        lightboxModal.classList.remove('active');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lightboxModal.classList.contains('active')) {
        lightboxModal.classList.remove('active');
      }
    });
  }

  // 6. View More Photos trigger
  const viewMorePhotosBtn = document.getElementById('viewMorePhotosBtn');
  if (viewMorePhotosBtn) {
    viewMorePhotosBtn.addEventListener('click', () => {
      if (galleryItems.length > 0) {
        galleryItems[0].click();
      }
    });
  }

  // 7. Reviews Carousel Navigation
  const prevReviewBtn = document.getElementById('prevReview');
  const nextReviewBtn = document.getElementById('nextReview');
  const reviewsContainer = document.getElementById('reviewsContainer');

  if (prevReviewBtn && nextReviewBtn && reviewsContainer) {
    let currentIndex = 0;
    const cards = reviewsContainer.querySelectorAll('.review-card');
    
    // Function to rotate reviews on small screens
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
});

// 8. Booking Form Submit via WhatsApp
function submitBooking() {
  const checkin = document.getElementById('checkinDate').value;
  const checkout = document.getElementById('checkoutDate').value;
  const guests = document.getElementById('guestCount').value;
  const name = document.getElementById('guestName').value;
  const mobile = document.getElementById('guestMobile').value;

  if (!checkin || !checkout || !guests || !name || !mobile) {
    alert('Please fill in all fields.');
    return;
  }

  const message = `Hello Nandhanam Elite,%0A%0AI would like to check availability / book a stay:%0A` +
    `• *Name:* ${encodeURIComponent(name)}%0A` +
    `• *Mobile:* ${encodeURIComponent(mobile)}%0A` +
    `• *Check-in:* ${checkin}%0A` +
    `• *Check-out:* ${checkout}%0A` +
    `• *Guests:* ${encodeURIComponent(guests)}`;

  const whatsappUrl = `https://wa.me/919447000000?text=${message}`;
  window.open(whatsappUrl, '_blank');
}

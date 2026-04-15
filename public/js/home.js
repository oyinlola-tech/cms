document.addEventListener('DOMContentLoaded', () => {
  fetchAnnouncements();
  fetchPrograms();
  fetchGalleryPreview();
});

// Base API URL (adjust if needed)
const API_BASE = 'http://localhost:3000/api';

// Fetch and render announcements
async function fetchAnnouncements() {
  try {
    const res = await fetch(`${API_BASE}/announcements?limit=3`);
    const data = await res.json();
    renderAnnouncements(data);
  } catch (error) {
    console.error('Failed to load announcements:', error);
  }
}

function renderAnnouncements(announcements) {
  const container = document.getElementById('announcements-container');
  if (!container) return;

  if (!announcements || announcements.length === 0) {
    container.innerHTML = '<p class="col-span-12 text-center">No announcements yet.</p>';
    return;
  }

  // Assume first announcement is featured
  const featured = announcements[0];
  const others = announcements.slice(1, 3);

  // Build HTML
  let html = `
    <div class="col-span-12 md:col-span-8 bg-surface-container-low rounded-xl overflow-hidden flex flex-col md:flex-row group">
      <div class="md:w-1/2 overflow-hidden">
        <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="${featured.image_url || '/images/placeholder.jpg'}" alt="${featured.title}">
      </div>
      <div class="md:w-1/2 p-8 flex flex-col justify-center space-y-4">
        <span class="text-secondary font-bold text-xs uppercase tracking-widest">${featured.category || 'Announcement'}</span>
        <h3 class="font-headline text-3xl font-bold text-primary">${featured.title}</h3>
        <p class="text-on-surface-variant">${featured.summary}</p>
        <a href="/announcements/${featured.id}" class="text-primary font-bold w-fit border-b-2 border-primary/20 pb-1 hover:border-primary transition">Read More</a>
      </div>
    </div>
    <div class="col-span-12 md:col-span-4 space-y-6">
  `;

  others.forEach(item => {
    html += `
      <div class="bg-surface-container-lowest p-6 rounded-xl space-y-3 shadow-sm">
        <div class="flex justify-between items-start">
          ${item.is_new ? '<span class="bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-xs font-bold">New</span>' : ''}
          <span class="text-on-surface-variant text-sm">${formatDate(item.created_at)}</span>
        </div>
        <h4 class="font-headline text-xl font-bold text-primary">${item.title}</h4>
        <p class="text-sm text-on-surface-variant">${item.summary}</p>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}

// Fetch and render programs
async function fetchPrograms() {
  try {
    const res = await fetch(`${API_BASE}/programs?limit=3`);
    const data = await res.json();
    renderPrograms(data);
  } catch (error) {
    console.error('Failed to load programs:', error);
  }
}

function renderPrograms(programs) {
  const container = document.getElementById('programs-container');
  if (!container) return;

  if (!programs || programs.length === 0) {
    container.innerHTML = '<p class="col-span-3 text-center">No programs scheduled.</p>';
    return;
  }

  let html = '';
  programs.forEach((prog, index) => {
    // Highlight the second program as main service (or based on a flag)
    const isMain = index === 1;
    const cardClass = isMain
      ? 'bg-primary text-on-primary rounded-xl p-8 space-y-6 shadow-2xl scale-105 z-10 relative'
      : 'bg-surface-container-lowest rounded-xl p-8 space-y-6 transform ' + (index === 0 ? 'md:-translate-y-4' : 'md:translate-y-8');

    const icon = getProgramIcon(prog.type);
    
    html += `
      <div class="${cardClass}">
        ${isMain ? '<div class="absolute -top-4 -right-4 bg-secondary-container text-on-secondary-fixed px-4 py-2 rounded-lg font-black text-xs uppercase">Main Service</div>' : ''}
        <div class="w-14 h-14 ${isMain ? 'bg-surface-container-highest' : 'bg-secondary-container'} flex items-center justify-center rounded-xl">
          <span class="material-symbols-outlined ${isMain ? 'text-primary' : 'text-on-secondary-container'} text-3xl">${icon}</span>
        </div>
        <h3 class="font-headline text-2xl font-bold ${isMain ? '' : 'text-primary'}">${prog.title}</h3>
        <p class="${isMain ? 'opacity-80' : 'text-on-surface-variant'}">${prog.description}</p>
        <div class="pt-4 border-t ${isMain ? 'border-on-primary/20' : 'border-outline-variant/30'} flex items-center gap-3">
          <span class="material-symbols-outlined ${isMain ? 'text-secondary-fixed' : 'text-secondary'}">schedule</span>
          <span class="text-sm font-semibold">${prog.schedule}</span>
        </div>
        ${isMain ? '<button class="w-full py-3 bg-secondary-container text-on-secondary-fixed rounded-xl font-bold mt-4 hover:bg-secondary-fixed transition">Plan Your Visit</button>' : ''}
      </div>
    `;
  });
  container.innerHTML = html;
}

// Fetch and render gallery preview
async function fetchGalleryPreview() {
  try {
    const res = await fetch(`${API_BASE}/gallery?limit=4`);
    const data = await res.json();
    renderGallery(data);
  } catch (error) {
    console.error('Failed to load gallery:', error);
  }
}

function renderGallery(images) {
  const container = document.getElementById('gallery-preview');
  if (!container) return;

  if (!images || images.length < 4) {
    container.innerHTML = '<p class="col-span-12 text-center">Gallery coming soon.</p>';
    return;
  }

  // Layout: first image col-span-4, next three in col-span-8 (2 cols with one spanning 2 rows)
  const [img1, img2, img3, img4] = images;

  container.innerHTML = `
    <div class="col-span-12 md:col-span-4 h-full">
      <img class="w-full h-full object-cover rounded-xl shadow-lg" src="${img1.url}" alt="${img1.caption}">
    </div>
    <div class="col-span-12 md:col-span-8 grid grid-cols-2 gap-4">
      <div class="h-full">
        <img class="w-full h-full object-cover rounded-xl shadow-lg" src="${img2.url}" alt="${img2.caption}">
      </div>
      <div class="h-full grid grid-rows-2 gap-4">
        <img class="w-full h-full object-cover rounded-xl shadow-lg" src="${img3.url}" alt="${img3.caption}">
        <img class="w-full h-full object-cover rounded-xl shadow-lg" src="${img4.url}" alt="${img4.caption}">
      </div>
    </div>
  `;
}

// Helper: format date
function formatDate(dateString) {
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
}

// Helper: get icon based on program type
function getProgramIcon(type) {
  const map = {
    'devotion': 'wb_twilight',
    'service': 'church',
    'fellowship': 'groups',
    'bible_study': 'menu_book'
  };
  return map[type] || 'event';
}
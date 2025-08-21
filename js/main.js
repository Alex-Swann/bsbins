const apiSearchAddresses = '/api/search-addresses';
const apiPropertyDetails = '/api/property-details';
const apiBinStatus = '/api/bin-status';

const cache = new Map(); // Cache key: postcode + house number

// --- Constants for bin labeling ---
const BIN_MATERIALS = {
  black: 'Mixed Recycling',
  blue: 'Paper/Cardboard',
  purple: 'Refuse/Non-Recycling',
  brown: 'Garden Waste',
  food: 'Compost',
  recycling: 'Mixed Recycling',
  refuse: 'Refuse/Non-Recycling',
  paper: 'Paper/Cardboard',
  garden: 'Garden Waste',
  gw: 'Garden Waste',
};

const BIN_LABELS = {
  black: 'Black',
  blue: 'Blue',
  purple: 'Purple',
  brown: 'Brown',
  food: 'Small Brown',
  recycling: 'Black',
  refuse: 'Purple',
  paper: 'Blue',
  garden: 'Brown',
  gw: 'Brown',
};

// --- Helper Functions ---
function normalizePostcode(pc) {
  let p = pc.toUpperCase().replace(/\s+/g, '');
  if (p.length > 3) {
    return p.slice(0, -3) + ' ' + p.slice(-3);
  }
  return p;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function formatDateLong(date) {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

const baselineDate = new Date('2025-08-04T00:00:00Z');

function getISOWeekNumber(date) {
  const tmpDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  tmpDate.setUTCDate(tmpDate.getUTCDate() + 4 - (tmpDate.getUTCDay() || 7)); // Set to Thursday
  const yearStart = new Date(Date.UTC(tmpDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmpDate - yearStart) / 86400000) + 1) / 7);
}

function renderCollections(startDate, collections) {
  const resultsDiv = document.getElementById('results');
  clearChildren(resultsDiv);

  const today = new Date();
  const groupedByWeek = {};
  const baseline = new Date(startDate);

  collections
    .filter(col => new Date(col.collectionDate) >= baseline)
    .forEach(col => {
      const colDate = new Date(col.collectionDate);
      const weekStart = new Date(colDate);
      const day = colDate.getDay();
      const diff = (day === 0 ? -6 : 1) - day; // Monday start
      weekStart.setDate(colDate.getDate() + diff);
      weekStart.setHours(0, 0, 0, 0);

      const key = weekStart.toISOString();
      if (!groupedByWeek[key]) {
        groupedByWeek[key] = { date: new Date(weekStart), collections: [] };
      }
      groupedByWeek[key].collections.push(col);
    });

  const sortedWeeks = Object.values(groupedByWeek).sort((a, b) => a.date - b.date);

  // Map bin types to CSS classes (background colors)
  const BIN_COLORS = {
    black: 'black',
    recycling: 'black',
    paper: 'blue',
    refuse: 'purple',
    food: 'food',
    garden: 'brown',
    gw: 'brown'
  };

  for (let i = 0; i < Math.min(6, sortedWeeks.length); i++) {
    const week = sortedWeeks[i];

    const weekDiv = document.createElement('div');
    weekDiv.classList.add('week');

    const weekNumberHeading = document.createElement('h3');
    weekNumberHeading.classList.add('week-number');

    const currentWeek = getISOWeekNumber(today);
    const targetWeek = getISOWeekNumber(week.date);

    if (targetWeek === currentWeek) {
        weekNumberHeading.textContent = 'Current Week';
    } else if (targetWeek === currentWeek + 1) {
        weekNumberHeading.textContent = 'Next Week';
    } else {
        weekNumberHeading.textContent = `Week ${i + 1}`;
    }

    weekDiv.appendChild(weekNumberHeading);

    const byDay = {};
    week.collections.forEach(col => {
      const colDate = new Date(col.collectionDate);
      const key = colDate.toDateString();
      if (!byDay[key]) {
        byDay[key] = { date: colDate, bins: [] };
      }
      byDay[key].bins.push(col);
    });

    const sortedDays = Object.values(byDay).sort((a, b) => a.date - b.date);

    sortedDays.forEach(dayGroup => {
      const dayBox = document.createElement('div');
      dayBox.classList.add('callout-box');

      const dayHeading = document.createElement('h3');
      const options = { weekday: 'long', day: 'numeric', month: 'long' };
      dayHeading.textContent = dayGroup.date.toLocaleDateString(undefined, options);
      dayBox.appendChild(dayHeading);

      dayGroup.bins.forEach(bin => {
        const type = bin.binType.toLowerCase();
        const colorClass = BIN_COLORS[type] || 'black';

        // Human-friendly material names
        let material = '';
        switch (type) {
          case 'black':
          case 'recycling':
            material = 'Mixed Recycling';
            break;
          case 'blue':
          case 'paper':
            material = 'Paper/Cardboard';
            break;
          case 'purple':
          case 'refuse':
            material = 'Refuse/Non-Recycling';
            break;
          case 'brown':
          case 'garden':
          case 'gw':
            material = 'Garden Waste';
            break;
          case 'food':
            material = 'Food/Compost';
            break;
          default:
            material = bin.serviceName || bin.binType;
            break;
        }

        const colorName = colorClass.charAt(0).toUpperCase() + colorClass.slice(1);

        const binLine = document.createElement('div');
        binLine.textContent = `${colorName} (${material})`;
        binLine.classList.add(colorClass, 'bin-label');
        dayBox.appendChild(binLine);
      });

      weekDiv.appendChild(dayBox);
    });

    resultsDiv.appendChild(weekDiv);
  }
}


async function fetchCollections(postcode, houseNumber) {
  try {
    const cacheKey = postcode + '|' + houseNumber;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const resp = await fetch('/api/get-bins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postcode, houseNumber }),
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch bin collections');
    }

    const data = await resp.json();

    if (!data.collections || data.collections.length === 0) {
      throw new Error('No bin collection data available for this address.');
    }

    // Cache full data object for potential future use (not just collections)
    cache.set(cacheKey, data);

    return data.collections;
  } catch (err) {
    console.error('Failed to fetch collections:', err);
    // show error to user or handle gracefully
    return { error: err.message };
  }
}

async function fetchAndRenderCollections(postcode, houseNumber) {
  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = '<span class="spinner"></span> Loading...';

  try {
    const data = cache.get(postcode + '|' + houseNumber) || {};
    const collections = data.collections || await fetchCollections(postcode, houseNumber);

    const today = new Date();
    const startDate = today < baselineDate ? baselineDate : today;

    renderCollections(startDate, collections);
  } catch (error) {
    resultsDiv.textContent = error.message || 'Error fetching data. Please try again later.';
  }
}

function renderBinStatus(bins, lastUpdated) {
  const list = document.getElementById('bin-status-list');
  const updated = document.getElementById('last-updated');

  if (!list || !Array.isArray(bins)) return;

  list.innerHTML = '';

  bins.forEach(({ name, status }) => {
    const li = document.createElement('li');
    li.textContent = `${name}: ${status}`;

    if (status && typeof status === 'string') {
      const className = status.toLowerCase().replace(/\s/g, '');
      if (className) {
        li.classList.add(className);
      }
    }

    list.appendChild(li);
  });

  if (updated && lastUpdated) {
    updated.textContent = `Last updated: ${lastUpdated}`;
  }
}

async function loadBinStatus() {
  try {
    const resp = await fetch('/api/bin-status');
    const data = await resp.json();

    const binStatus = data.binStatus;

    if (!binStatus || typeof binStatus !== 'object') {
      throw new Error('Invalid bin status data');
    }

    const excludedKeys = [
      'sys', 'entryTitle', 'entryDescription', 'siteName',
      'serviceDateTime', 'serviceStartTime', 'serviceDuration',
      'serviceMessage', 'siteClosed'
    ];

    const bins = Object.entries(binStatus)
      .filter(([key, value]) => typeof value === 'string' && !excludedKeys.includes(key))
      .map(([key, value]) => ({
        name: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
        status: value
      }));

    renderBinStatus(bins, binStatus.lastUpdated || 'Unknown');
  } catch (e) {
    console.error('Failed to load bin status', e);
  }
}

// --- DOM and Event Handling ---
document.addEventListener('DOMContentLoaded', () => {
  const postcodeInput = document.getElementById('postcode');
  const houseNumberInput = document.getElementById('housenumber');
  const getCollectionsBtn = document.getElementById('getCollections');
  const resultsDiv = document.getElementById('results');

  // Load saved address from localStorage
  const savedPostcode = localStorage.getItem('savedPostcode');
  const savedHouseNumber = localStorage.getItem('savedHouseNumber');

  if (savedPostcode && savedHouseNumber) {
    postcodeInput.value = savedPostcode;
    houseNumberInput.value = savedHouseNumber;
    fetchAndRenderCollections(savedPostcode, savedHouseNumber);
  }

 loadBinStatus();

  getCollectionsBtn.addEventListener('click', () => {
    const rawPostcode = postcodeInput.value.trim();
    const rawHouseNumber = houseNumberInput.value.trim();

    if (!rawPostcode || !rawHouseNumber) {
      resultsDiv.textContent = 'Please enter both postcode and house number.';
      return;
    }

    const postcode = normalizePostcode(rawPostcode);
    localStorage.setItem('savedPostcode', postcode);
    localStorage.setItem('savedHouseNumber', rawHouseNumber);

    fetchAndRenderCollections(postcode, rawHouseNumber);
  });

  // Support Enter key in inputs
  postcodeInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') getCollectionsBtn.click();
  });

  houseNumberInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') getCollectionsBtn.click();
  });
});

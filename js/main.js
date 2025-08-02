const apiSearch = '/api/search-addresses';
const apiDetails = '/api/property-details';

const cache = new Map(); // Cache key: postcode + house number

// --- Helper Functions ---
function normalizePostcode(pc) {
    let p = pc.toUpperCase().replace(/\s+/g, '');
    if (p.length > 3) {
        return p.slice(0, -3) + ' ' + p.slice(-3);
    }
    return p;
}

const baselineDate = new Date('2025-08-04T00:00:00Z');

function formatDate(date) {
    return date.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });
}

function clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function renderCollections(startDate, collections) {
    const resultsDiv = document.getElementById('results');
    clearChildren(resultsDiv);

    const today = new Date();

    // Group collections by ISO week starting Monday
    const groupedByWeek = {};
    const baseline = new Date(startDate);

    collections
        .filter(col => new Date(col.collectionDate) >= baseline)
        .forEach(col => {
            const colDate = new Date(col.collectionDate);
            const weekStart = new Date(colDate);
            const day = colDate.getDay();
            const diff = (day === 0 ? -6 : 1) - day; // shift so Monday is start
            weekStart.setDate(colDate.getDate() + diff);
            weekStart.setHours(0, 0, 0, 0);

            const key = weekStart.toISOString();
            if (!groupedByWeek[key]) {
                groupedByWeek[key] = {
                    date: new Date(weekStart),
                    collections: []
                };
            }

            groupedByWeek[key].collections.push(col);
        });

    const sortedWeeks = Object.values(groupedByWeek).sort((a, b) => a.date - b.date);

    for (let i = 0; i < Math.min(6, sortedWeeks.length); i++) {
        const week = sortedWeeks[i];

        const weekDiv = document.createElement('div');
        weekDiv.classList.add('week');

        const weekNumberHeading = document.createElement('h3');
        weekNumberHeading.classList.add('week-number');

        if (today < baselineDate) {
            weekNumberHeading.textContent = i === 0
                ? `Next Week`
                : `Week ${i + 1}`;
        } else {
            weekNumberHeading.textContent = i === 0
                ? `Current Week`
                : `Week ${i + 1}`;
        }

        weekDiv.appendChild(weekNumberHeading);

        // Group that week's collections by actual day
        const byDay = {};
        week.collections.forEach(col => {
            const colDate = new Date(col.collectionDate);
            const key = colDate.toDateString();
            if (!byDay[key]) {
                byDay[key] = {
                    date: colDate,
                    bins: []
                };
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
                let material = '';
                switch (bin.binType.toLowerCase()) {
                    case 'black': material = 'Mixed Recycling'; break;
                    case 'blue': material = 'Paper/Cardboard'; break;
                    case 'purple': material = 'Refuse/Non-Recycling'; break;
                    case 'brown': material = 'Garden Waste'; break;
                    case 'food': material = 'Food/Compost'; break;
                    default: material = bin.serviceName || bin.binType; break;
                }

                const binLine = document.createElement('div');
                let text = bin.binType.charAt(0).toUpperCase() + bin.binType.slice(1);
                if (text === 'Food') text = 'Small Brown';
                binLine.textContent = `${text} (${material})`;
                binLine.classList.add(bin.binType.toLowerCase(), 'bin-label');
                dayBox.appendChild(binLine);
            });

            weekDiv.appendChild(dayBox);
        });

        resultsDiv.appendChild(weekDiv);
    }
}

async function fetchCollections(postcode, houseNumber) {
    const cacheKey = postcode + '|' + houseNumber;
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    const searchResp = await fetch(apiSearch, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postcode })
    });

    const searchData = await searchResp.json();

    if (!searchData.addresses || searchData.addresses.length === 0) {
        throw new Error('No addresses found for that postcode.');
    }

    const address = searchData.addresses.find(a =>
        a.address.toLowerCase().includes(houseNumber.toLowerCase())
    );

    if (!address) {
        throw new Error('House number not found for that postcode.');
    }

    const detailsResp = await fetch(apiDetails, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            uprn: address.uprn,
            address: address.address
        })
    });

    const detailsData = await detailsResp.json();
    if (!detailsData.collections) {
        throw new Error('No collection data available for this address.');
    }

    cache.set(cacheKey, detailsData.collections);
    return detailsData.collections;
}

async function fetchAndRenderCollections(postcode, houseNumber) {
  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = '<span class="spinner"></span> Loading...';

  try {
    const collections = await fetchCollections(postcode, houseNumber);
    const today = new Date();
    const startDate = today < baselineDate ? baselineDate : today;
    renderCollections(startDate, collections);
  } catch (error) {
    resultsDiv.textContent = error.message || 'Error fetching data. Please try again later.';
  }
}

// --- DOM and Event Handling ---
document.addEventListener('DOMContentLoaded', () => {
  const postcodeInput = document.getElementById('postcode');
  const houseNumberInput = document.getElementById('housenumber');
  const getCollectionsBtn = document.getElementById('getCollections');
  const resultsDiv = document.getElementById('results');

  const savedPostcode = localStorage.getItem('savedPostcode');
  const savedHouseNumber = localStorage.getItem('savedHouseNumber');

  if (savedPostcode && savedHouseNumber) {
    postcodeInput.value = savedPostcode;
    houseNumberInput.value = savedHouseNumber;

    fetchAndRenderCollections(savedPostcode, savedHouseNumber);
  }

  // ✅ Event listener for button
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

  // ✅ Handle Enter key
  postcodeInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      getCollectionsBtn.click();
    }
  });

  houseNumberInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      getCollectionsBtn.click();
    }
  });
});

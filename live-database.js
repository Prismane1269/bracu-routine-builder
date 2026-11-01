/**
 * live-database.js - Live Synchronization Client for Course Database
 * Connects directly to the live course database endpoint
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LiveDatabaseSync = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const DATABASE_API_URL = 'https://api.preconnect.app/connect.json';
  const CACHE_STORAGE_KEY = 'routinecraft:database-cache-v1';
  const CACHE_TIME_KEY = 'routinecraft:database-cache-timestamp';

  function formatTime(tStr) {
    if (!tStr) return '';
    const parts = tStr.split(':');
    let h = parseInt(parts[0], 10);
    const m = parts[1] || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
  }

  function formatDay(d) {
    if (!d) return '';
    d = d.trim().toUpperCase();
    const map = {
      'SUNDAY': 'Sun', 'MONDAY': 'Mon', 'TUESDAY': 'Tue',
      'WEDNESDAY': 'Wed', 'THURSDAY': 'Thu', 'SATURDAY': 'Sat'
    };
    return map[d] || (d.charAt(0) + d.slice(1, 3).toLowerCase());
  }

  /**
   * Transforms raw database array into RoutineCraft course schema.
   */
  function transformDatabaseData(rawData) {
    if (!Array.isArray(rawData)) return {};

    const courseMap = {};

    for (const item of rawData) {
      if (!item || !item.courseCode) continue;
      const cCode = item.courseCode.trim().toUpperCase();

      if (!courseMap[cCode]) {
        courseMap[cCode] = [];
      }

      const secNum = parseInt(item.sectionName, 10) || 0;
      const fac = (item.faculties && typeof item.faculties === 'object' && item.faculties.shortName)
        ? item.faculties.shortName
        : (typeof item.faculties === 'string' ? item.faculties : 'TBA');

      const facName = (item.faculties && item.faculties.name) ? item.faculties.name : fac;
      const facEmail = (item.faculties && item.faculties.email) ? item.faculties.email : '';

      const capacity = parseInt(item.capacity, 10) || 0;
      const consumed = parseInt(item.consumedSeat, 10) || 0;
      const seatsRemaining = Math.max(0, capacity - consumed);

      const slots = [];
      const sched = item.sectionSchedule || {};
      const classScheds = sched.classSchedules || [];

      // Theory slots
      const daysByTime = {};
      for (const cs of classScheds) {
        const day = formatDay(cs.day);
        const st = formatTime(cs.startTime);
        const et = formatTime(cs.endTime);
        if (st && et) {
          const timeKey = `${st}-${et}`;
          if (!daysByTime[timeKey]) daysByTime[timeKey] = [];
          if (!daysByTime[timeKey].includes(day)) daysByTime[timeKey].push(day);
        }
      }

      for (const [tKey, days] of Object.entries(daysByTime)) {
        let daysStr = days.join('');
        const dSet = new Set(days);
        if (dSet.has('Sun') && dSet.has('Tue') && days.length === 2) daysStr = 'ST';
        else if (dSet.has('Mon') && dSet.has('Wed') && days.length === 2) daysStr = 'MW';
        else if (dSet.has('Thu') && dSet.has('Sat') && days.length === 2) daysStr = 'RA';

        slots.push({
          days: days,
          days_str: daysStr,
          time: tKey,
          room: item.roomName || 'TBA',
          isLab: false
        });
      }

      // Lab slots if hasLab
      if (item.hasLab && Array.isArray(item.labSchedules)) {
        const labDaysByTime = {};
        for (const ls of item.labSchedules) {
          const day = formatDay(ls.day);
          const st = formatTime(ls.startTime);
          const et = formatTime(ls.endTime);
          if (st && et) {
            const timeKey = `${st}-${et}`;
            if (!labDaysByTime[timeKey]) labDaysByTime[timeKey] = [];
            if (!labDaysByTime[timeKey].includes(day)) labDaysByTime[timeKey].push(day);
          }
        }

        for (const [tKey, days] of Object.entries(labDaysByTime)) {
          slots.push({
            days: days,
            days_str: days.join(''),
            time: tKey,
            room: item.labRoomName || 'Lab TBA',
            isLab: true
          });
        }
      }

      courseMap[cCode].push({
        section: secNum,
        faculty: fac,
        faculty_name: facName,
        faculty_email: facEmail,
        capacity: capacity,
        consumed_seat: consumed,
        seats_remaining: seatsRemaining,
        room: item.roomName || 'TBA',
        last_updated: item.lastUpdatedAt || null,
        slots: slots,
        mid_exam: sched.midExamDate ? { date: sched.midExamDate, time: `${sched.midExamStartTime || ''}-${sched.midExamEndTime || ''}` } : null,
        final_exam: sched.finalExamDate ? { date: sched.finalExamDate, time: `${sched.finalExamStartTime || ''}-${sched.finalExamEndTime || ''}` } : null
      });
    }

    // Sort sections numerically
    for (const c of Object.keys(courseMap)) {
      courseMap[c].sort((a, b) => a.section - b.section);
    }

    return courseMap;
  }

  /**
   * Fetches live data from Course Database API with caching.
   * @param {Object} options - { forceRefresh: boolean }
   */
  async function fetchLiveDatabaseData(options = {}) {
    const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

    // Check localStorage cache unless forceRefresh is true
    if (isBrowser && !options.forceRefresh) {
      try {
        const cachedStr = localStorage.getItem(CACHE_STORAGE_KEY);
        const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
        if (cachedStr && cachedTime) {
          const ageSeconds = (Date.now() - parseInt(cachedTime, 10)) / 1000;
          if (ageSeconds < 30) {
            const cachedParsed = JSON.parse(cachedStr);
            return {
              coursesData: cachedParsed,
              fromCache: true,
              cacheAgeSeconds: Math.round(ageSeconds),
              totalCourses: Object.keys(cachedParsed).length
            };
          }
        }
      } catch (e) {
        console.warn('Cache read error:', e);
      }
    }

    // Live fetch
    const response = await fetch(DATABASE_API_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch live database: HTTP ${response.status}`);
    }

    const rawData = await response.json();
    const coursesData = transformDatabaseData(rawData);

    // Save to cache
    if (isBrowser) {
      try {
        localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(coursesData));
        localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
      } catch (e) {
        console.warn('LocalStorage quota exceeded for cache:', e);
      }
    }

    return {
      coursesData: coursesData,
      fromCache: false,
      cacheAgeSeconds: 0,
      totalCourses: Object.keys(coursesData).length,
      totalSections: rawData.length
    };
  }

  return {
    fetchLiveDatabaseData: fetchLiveDatabaseData,
    transformDatabaseData: transformDatabaseData,
    DATABASE_API_URL: DATABASE_API_URL
  };
});

/**
 * parser.js - BRACU / PreConnect Schedule Parser
 * Parses raw text or JSON into structured course data.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RoutineParser = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  function normalizeTime(t) {
    if (!t) return '';
    t = t.trim().toUpperCase();
    const parts = t.split(/\s+/);
    if (parts.length < 2) return t;
    const [hm, ampm] = parts;
    const [h, m] = hm.split(':');
    return `${String(parseInt(h, 10)).padStart(2, '0')}:${m || '00'} ${ampm}`;
  }

  function parsePreconnectText(rawText) {
    if (!rawText || typeof rawText !== 'string') return {};

    // Split text into course blocks by line-level header pattern like "CSE110 - 01" or "MAT120 - 15"
    const blocks = rawText.split(/(?=(?:^|\n)\s*[A-Z]{2,5}\d{3}[A-Z]?\s*-\s*\d+)/i);
    const coursesData = {};

    for (const b of blocks) {
      if (!b.trim()) continue;

      const headerMatch = b.match(/([A-Z]{2,5}\d{3}[A-Z]?)\s*-\s*(\d+)/i);
      if (!headerMatch) continue;

      const course = headerMatch[1].toUpperCase();
      const secNum = parseInt(headerMatch[2], 10);

      // Extract faculty
      const lines = b.split('\n').map(l => l.trim()).filter(Boolean);
      let faculty = 'TBA';
      const nonFacultyCodes = new Set([
        'FULL', 'CLASS', 'LAB', 'ROOM', 'MID', 'FINAL', 'THEORY', 'SEATS',
        'REMAINING', 'BOOKED', 'CREDITS', 'TOTAL', 'MALE', 'FEMALE',
        'LECTURER', 'PROFESSOR', 'SUMMARY', 'EVALUATION', 'PRECONNECT'
      ]);

      for (let i = 1; i < Math.min(lines.length, 10); i++) {
        const line = lines[i];
        if (/^[A-Z]{2,6}$/.test(line) && !nonFacultyCodes.has(line)) {
          faculty = line;
          break;
        }
      }

      // Extract Seats remaining
      let seatsRemaining = null;
      if (/\bFULL\b/i.test(b)) {
        seatsRemaining = 0;
      } else {
        const remMatch = b.match(/(\d+)\s*\n?\s*(?:Remaining|seats remaining|left)/i);
        if (remMatch) {
          seatsRemaining = parseInt(remMatch[1], 10);
        } else {
          // Look for 0 Remaining or similar patterns
          const numFollowedByRemaining = b.match(/(\d+)\s*Remaining/i);
          if (numFollowedByRemaining) {
            seatsRemaining = parseInt(numFollowedByRemaining[1], 10);
          }
        }
      }

      // Extract room
      let theoryRoom = 'TBA';
      let labRoom = 'TBA';
      const roomMatch = b.match(/Theory:\s*([A-Za-z0-9\-]+)/i);
      if (roomMatch) theoryRoom = roomMatch[1];
      const labRoomMatch = b.match(/Lab:\s*([A-Za-z0-9\-]+)/i);
      if (labRoomMatch) labRoom = labRoomMatch[1];

      // Time regex: Sunday 11:00 AM - 12:20 PM
      const timeRegex = /(Sunday|Monday|Tuesday|Wednesday|Thursday|Saturday|Sun|Mon|Tue|Wed|Thu|Sat)\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/gi;
      let match;
      const daysByTime = {};

      while ((match = timeRegex.exec(b)) !== null) {
        const fullDay = match[1];
        const dayShort = fullDay.slice(0, 3).charAt(0).toUpperCase() + fullDay.slice(1, 3).toLowerCase();
        const startT = normalizeTime(match[2]);
        const endT = normalizeTime(match[3]);
        const timeKey = `${startT}-${endT}`;

        if (!daysByTime[timeKey]) {
          daysByTime[timeKey] = [];
        }
        if (!daysByTime[timeKey].includes(dayShort)) {
          daysByTime[timeKey].push(dayShort);
        }
      }

      const slots = [];
      for (const [timeRange, days] of Object.entries(daysByTime)) {
        let daysStr = days.join('');
        const daySet = new Set(days);
        if (daySet.has('Sun') && daySet.has('Tue') && days.length === 2) daysStr = 'ST';
        else if (daySet.has('Mon') && daySet.has('Wed') && days.length === 2) daysStr = 'MW';
        else if (daySet.has('Thu') && daySet.has('Sat') && days.length === 2) daysStr = 'RA';
        else if (days.length === 1) daysStr = days[0];

        // Is this slot lab? Look at duration or label
        const [stStr, etStr] = timeRange.split('-');
        const isLabSlot = timeRange.includes('01:50') && timeRange.includes('11:00') ||
                          timeRange.includes('04:50') && timeRange.includes('02:00') ||
                          timeRange.includes('10:50') && timeRange.includes('08:00');

        slots.push({
          days: days,
          days_str: daysStr,
          time: timeRange,
          room: isLabSlot && labRoom !== 'TBA' ? labRoom : theoryRoom
        });
      }

      if (!coursesData[course]) {
        coursesData[course] = [];
      }

      coursesData[course].push({
        section: secNum,
        faculty: faculty,
        seats_remaining: seatsRemaining !== null ? seatsRemaining : 30,
        slots: slots
      });
    }

    // Sort sections numerically
    for (const c of Object.keys(coursesData)) {
      coursesData[c].sort((a, b) => a.section - b.section);
    }

    return coursesData;
  }

  return {
    parsePreconnectText: parsePreconnectText,
    normalizeTime: normalizeTime
  };
});

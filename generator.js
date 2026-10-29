/**
 * generator.js - Combinatorial Search & Conflict Detection
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RoutineGenerator = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(/\s+/);
    if (parts.length !== 2) return 0;
    const [hm, ampm] = parts;
    const [hStr, mStr] = hm.split(':');
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12;
    else if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }

  function parseTimeRange(rangeStr) {
    if (!rangeStr) return [0, 0];
    const parts = rangeStr.split('-');
    if (parts.length !== 2) return [0, 0];
    return [timeToMinutes(parts[0]), timeToMinutes(parts[1])];
  }

  function slotsOverlap(s1, s2) {
    const d1 = new Set(s1.days || []);
    const d2 = new Set(s2.days || []);
    let sharesDay = false;
    for (const d of d1) {
      if (d2.has(d)) {
        sharesDay = true;
        break;
      }
    }
    if (!sharesDay) return false;

    const [start1, end1] = parseTimeRange(s1.time);
    const [start2, end2] = parseTimeRange(s2.time);
    return Math.max(start1, start2) < Math.min(end1, end2);
  }

  function sectionHasConflict(sec1, sec2) {
    for (const s1 of (sec1.slots || [])) {
      for (const s2 of (sec2.slots || [])) {
        if (slotsOverlap(s1, s2)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Generates all non-conflicting routine combinations.
   * @param {Object} sectionsByCourse - Map of courseName -> Array of section objects
   * @param {Object} options - { onlyAvailableSeats, excludedSections, lockedSections, maxLimit }
   */
  function generateRoutines(sectionsByCourse, options = {}) {
    const courseKeys = Object.keys(sectionsByCourse).filter(c => (sectionsByCourse[c] || []).length > 0);
    const validRoutines = [];
    const maxLimit = options.maxLimit || 15000;

    // Filter candidate sections per course
    const candidateSections = {};
    for (const course of courseKeys) {
      let list = sectionsByCourse[course] || [];

      // Check if locked
      if (options.lockedSections && options.lockedSections[course]) {
        const lockedSecNum = options.lockedSections[course];
        list = list.filter(s => s.section === lockedSecNum);
      }

      // Check if excluded
      if (options.excludedSections && options.excludedSections[course]) {
        const exSet = new Set(options.excludedSections[course]);
        list = list.filter(s => !exSet.has(s.section));
      }

      // Check seat availability
      if (options.onlyAvailableSeats) {
        list = list.filter(s => s.seats_remaining === undefined || s.seats_remaining > 0);
      }

      candidateSections[course] = list;
    }

    // Check if any required course has 0 available sections
    for (const c of courseKeys) {
      if (candidateSections[c].length === 0) {
        return {
          routines: [],
          totalAnalyzed: 0,
          limitReached: false,
          error: `Course ${c} has no eligible sections matching your filter criteria.`
        };
      }
    }

    let analyzedCount = 0;
    let limitReached = false;

    function backtrack(idx, currentRoutine) {
      if (limitReached) return;

      if (idx === courseKeys.length) {
        validRoutines.push(Object.assign({}, currentRoutine));
        if (validRoutines.length >= maxLimit) {
          limitReached = true;
        }
        return;
      }

      const course = courseKeys[idx];
      const sections = candidateSections[course];

      for (const sec of sections) {
        analyzedCount++;
        let conflict = false;

        for (const [selectedCourse, selectedSec] of Object.entries(currentRoutine)) {
          if (sectionHasConflict(sec, selectedSec)) {
            conflict = true;
            break;
          }
        }

        if (!conflict) {
          currentRoutine[course] = sec;
          backtrack(idx + 1, currentRoutine);
          delete currentRoutine[course];
        }

        if (limitReached) break;
      }
    }

    backtrack(0, {});

    return {
      routines: validRoutines,
      totalAnalyzed: analyzedCount,
      limitReached: limitReached
    };
  }

  return {
    timeToMinutes: timeToMinutes,
    parseTimeRange: parseTimeRange,
    slotsOverlap: slotsOverlap,
    sectionHasConflict: sectionHasConflict,
    generateRoutines: generateRoutines
  };
});

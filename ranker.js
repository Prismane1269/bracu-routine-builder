/**
 * ranker.js - Comprehensive Routine Evaluator with Marks out of 100
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const generator = require('./generator');
    module.exports = factory(generator);
  } else {
    root.RoutineRanker = factory(root.RoutineGenerator);
  }
})(typeof self !== 'undefined' ? self : this, function (Generator) {

  const parseTimeRange = (Generator && Generator.parseTimeRange) ? Generator.parseTimeRange : function(rangeStr) {
    if (!rangeStr) return [0, 0];
    const parts = rangeStr.split('-');
    if (parts.length !== 2) return [0, 0];
    function t2m(t) {
      const p = t.trim().split(/\s+/);
      if (p.length !== 2) return 0;
      const [hm, ampm] = p;
      const [h, m] = hm.split(':').map(Number);
      let res = (ampm.toUpperCase() === 'PM' && h !== 12) ? (h + 12) * 60 + m : (ampm.toUpperCase() === 'AM' && h === 12) ? m : h * 60 + m;
      return res;
    }
    return [t2m(parts[0]), t2m(parts[1])];
  };

  const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Sat'];
  const DAY_INDICES = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Sat': 5 };

  /**
   * Evaluates a single routine combination.
   * Returns:
   *  - totalScore: Evaluated mark strictly out of 100 (0-100)
   *  - grade: Letter grade (A+, A, B+, B, C, D)
   *  - breakdown: { dayScore, earlyScore, gapScore, morningScore, labScore, facultyBonus }
   *  - explanations: Array of human-readable criteria strings
   *  - activeDays: Array of day names present in this routine
   *  - offDays: Array of free days
   *  - latestDeparture: String representation of latest class end
   */
  function evaluateRoutine(routine, options = {}) {
    const facultyWeights = options.facultyWeights || {};
    const dayClasses = {};
    const labDays = new Set();
    const theoryDays = new Set();

    for (const [course, sec] of Object.entries(routine)) {
      const isLab = course.endsWith('L') || course.toUpperCase().includes('LAB') ||
                    (sec.slots || []).some(s => s.time && (s.time.includes('01:50') && s.time.includes('11:00') || s.time.includes('04:50') && s.time.includes('02:00')));

      for (const slot of (sec.slots || [])) {
        for (const d of (slot.days || [])) {
          if (!dayClasses[d]) dayClasses[d] = [];
          const [start, end] = parseTimeRange(slot.time);
          dayClasses[d].append ? dayClasses[d].append() : dayClasses[d].push({
            course: course,
            section: sec.section,
            faculty: sec.faculty,
            start: start,
            end: end,
            time: slot.time,
            room: slot.room || 'TBA',
            isLab: isLab
          });

          if (isLab) labDays.add(d);
          else theoryDays.add(d);
        }
      }
    }

    const activeDays = WEEK_DAYS.filter(d => !!dayClasses[d]);
    const totalDays = activeDays.length;
    const offDays = WEEK_DAYS.filter(d => !dayClasses[d]);

    const explanations = [];

    // --- 1. Day Count & Distribution (Max 35 points) ---
    let dayScore = 0;
    if (totalDays <= 3) {
      dayScore = 35;
      explanations.push(`3-Day Routine: Ultra compact with ${offDays.length} free days (+35/35)`);
    } else if (totalDays === 4) {
      const activeIdx = activeDays.map(d => DAY_INDICES[d]).sort((a, b) => a - b);
      let hasSpacing = false;
      for (let i = 0; i < activeIdx.length - 1; i++) {
        const gap = activeIdx[i + 1] - activeIdx[i] - 1;
        if (gap >= 1 && gap <= 2) {
          hasSpacing = true;
          break;
        }
      }
      if (hasSpacing) {
        dayScore = 30;
        explanations.push(`4-Day Routine with 1-2 off-days in between (+30/35)`);
      } else {
        dayScore = 26;
        explanations.push(`4-Day Routine (+26/35)`);
      }
    } else if (totalDays === 5) {
      dayScore = 15;
      explanations.push(`5-Day Routine: Spans 5 days (+15/35)`);
    } else {
      dayScore = 5;
      explanations.push(`6-Day Routine: No campus free days (+5/35)`);
    }

    // --- 2. Early Finish & Departure (Max 25 points) ---
    let latestEndAcrossWeek = 0;
    const dailyEnds = [];
    for (const [d, slots] of Object.entries(dayClasses)) {
      const maxEnd = Math.max(...slots.map(s => s.end));
      dailyEnds.push(maxEnd);
      if (maxEnd > latestEndAcrossWeek) {
        latestEndAcrossWeek = maxEnd;
      }
    }

    const avgEnd = dailyEnds.length ? (dailyEnds.reduce((a, b) => a + b, 0) / dailyEnds.length) : 900;
    let earlyScore = 0;

    // 1:50 PM = 830 mins, 3:20 PM = 920 mins, 4:50 PM = 1010 mins
    if (latestEndAcrossWeek <= 830) {
      earlyScore = 25;
      explanations.push(`Super Early Finish: Every single day done by 1:50 PM (+25/25)`);
    } else if (latestEndAcrossWeek <= 920) {
      earlyScore = 20;
      explanations.push(`Early Finish: All days done by 3:20 PM (+20/25)`);
    } else if (latestEndAcrossWeek <= 1010) {
      earlyScore = 13;
      explanations.push(`Moderate Finish: Done by 4:50 PM (+13/25)`);
    } else {
      // Past 5:00 PM
      const lateMins = latestEndAcrossWeek - 1010;
      earlyScore = Math.max(3, 10 - Math.floor(lateMins / 20));
      explanations.push(`Late Finish: Classes extend to 5:00 PM+ (+${earlyScore}/25)`);
    }

    // Bonus +2 if average day ends before 2:15 PM (855 mins)
    if (avgEnd <= 855 && earlyScore < 25) {
      earlyScore = Math.min(25, earlyScore + 2);
      explanations.push(`Bonus: Average dismissal time before 2:15 PM (+2)`);
    }

    // --- 3. Idle Campus Wait Time / Gaps (Max 15 points) ---
    let totalGapMins = 0;
    for (const [d, slots] of Object.entries(dayClasses)) {
      const sorted = [...slots].sort((a, b) => a.start - b.start);
      for (let i = 0; i < sorted.length - 1; i++) {
        const gap = sorted[i + 1].start - sorted[i].end;
        if (gap > 0) totalGapMins += gap;
      }
    }

    let gapScore = 0;
    if (totalGapMins === 0) {
      gapScore = 15;
      explanations.push(`Zero Campus Wait Time: Classes back-to-back (+15/15)`);
    } else if (totalGapMins <= 40) {
      gapScore = 13;
      explanations.push(`Minimal Wait Time: Only ${totalGapMins}m campus gap across week (+13/15)`);
    } else if (totalGapMins <= 90) {
      gapScore = 9;
      explanations.push(`Moderate Wait Time: ${totalGapMins}m campus gap (+9/15)`);
    } else {
      gapScore = Math.max(2, 6 - Math.floor((totalGapMins - 90) / 45));
      explanations.push(`Long Wait Time: ${totalGapMins}m idle campus gap (+${gapScore}/15)`);
    }

    // --- 4. Morning Comfort (No 8:00 AM rush) (Max 15 points) ---
    let eightAmSlots = 0;
    for (const [d, slots] of Object.entries(dayClasses)) {
      for (const s of slots) {
        if (s.start > 0 && s.start < 540) { // before 9:00 AM
          eightAmSlots++;
        }
      }
    }

    let morningScore = 0;
    if (eightAmSlots === 0) {
      morningScore = 15;
      explanations.push(`No 8:00 AM Classes: Zero early morning rush (+15/15)`);
    } else if (eightAmSlots === 1) {
      morningScore = 9;
      explanations.push(`Only 1 8:00 AM Class (+9/15)`);
    } else if (eightAmSlots === 2) {
      morningScore = 4;
      explanations.push(`2 8:00 AM Classes: Regular early morning commute (+4/15)`);
    } else {
      morningScore = 0;
      explanations.push(`${eightAmSlots} 8:00 AM Classes: Heavy morning stress (0/15)`);
    }

    // --- 5. Lab & Theory Balance (Max 10 points) ---
    let labScore = 10;
    if (labDays.size > 0) {
      let maxClassesOnLabDay = 0;
      for (const d of labDays) {
        const count = (dayClasses[d] || []).length;
        if (count > maxClassesOnLabDay) maxClassesOnLabDay = count;
      }
      if (maxClassesOnLabDay === 1) {
        labScore = 10;
        explanations.push(`Isolated Lab Day: Lab has dedicated day with no theory burden (+10/10)`);
      } else if (maxClassesOnLabDay === 2) {
        labScore = 8;
        explanations.push(`Balanced Lab Day: Lab paired with only 1 theory (+8/10)`);
      } else {
        labScore = 4;
        explanations.push(`Heavy Lab Day: Lab paired with 2+ theory classes (+4/10)`);
      }
    } else {
      labScore = 10;
    }

    // --- Faculty Bonus (Optional Custom Preferences) ---
    let facultyBonus = 0;
    for (const [course, sec] of Object.entries(routine)) {
      const fac = sec.faculty;
      if (facultyWeights[course] && facultyWeights[course][fac]) {
        const pts = facultyWeights[course][fac];
        facultyBonus += pts;
        explanations.push(`Faculty Match: ${course} [${fac}]`);
      }
    }

    // Base score is strictly 0 to 100
    let baseScore = dayScore + earlyScore + gapScore + morningScore + labScore;
    baseScore = Math.max(0, Math.min(100, Math.round(baseScore)));

    // Evaluated Mark: If faculty bonus applies, we can factor it into total marks, capping at 100
    // Or we keep raw base score out of 100 and add faculty tie-breaker
    const totalScore = baseScore;

    // Grade calculation
    let grade = 'D';
    if (totalScore >= 90) grade = 'A+';
    else if (totalScore >= 80) grade = 'A';
    else if (totalScore >= 75) grade = 'B+';
    else if (totalScore >= 70) grade = 'B';
    else if (totalScore >= 60) grade = 'C';
    else grade = 'D';

    function minsToTimeStr(mins) {
      let h = Math.floor(mins / 60);
      const m = mins % 60;
      const ampm = h >= 12 ? 'PM' : 'AM';
      if (h > 12) h -= 12;
      if (h === 0) h = 12;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
    }

    return {
      score: totalScore,
      grade: grade,
      facultyBonus: facultyBonus,
      breakdown: {
        dayEfficiency: { score: dayScore, max: 35 },
        earlyFinish: { score: earlyScore, max: 25 },
        minimizedGaps: { score: gapScore, max: 15 },
        morningComfort: { score: morningScore, max: 15 },
        labBalance: { score: labScore, max: 10 }
      },
      explanations: explanations,
      activeDays: activeDays,
      offDays: offDays,
      totalDays: totalDays,
      latestDepartureMins: latestEndAcrossWeek,
      latestDeparture: minsToTimeStr(latestEndAcrossWeek),
      totalGapMins: totalGapMins,
      eightAmCount: eightAmSlots,
      dayClasses: dayClasses
    };
  }

  /**
   * Ranks an array of routine combinations.
   */
  function rankRoutines(routines, options = {}) {
    const scoredList = routines.map((r, index) => {
      const evalData = evaluateRoutine(r, options);
      return {
        id: index + 1,
        routine: r,
        score: evalData.score,
        grade: evalData.grade,
        evalData: evalData
      };
    });

    // Sort by score descending, with facultyBonus as tiebreaker, then totalDays ascending
    scoredList.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.evalData.facultyBonus !== a.evalData.facultyBonus) return b.evalData.facultyBonus - a.evalData.facultyBonus;
      return a.evalData.totalDays - b.evalData.totalDays;
    });

    // Assign final rank
    scoredList.forEach((item, idx) => {
      item.rank = idx + 1;
    });

    return scoredList;
  }

  return {
    evaluateRoutine: evaluateRoutine,
    rankRoutines: rankRoutines,
    WEEK_DAYS: WEEK_DAYS
  };
});

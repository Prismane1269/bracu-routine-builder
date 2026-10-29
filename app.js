/**
 * app.js - Main Application Controller for RoutineCraft (Live Database Integrated)
 */

document.addEventListener('DOMContentLoaded', () => {

  // Global State
  let allLiveCoursesCatalog = {}; // All 796 courses from Database
  let selectedCoursesData = {};   // Active courses chosen by the student
  let lastRankedResults = [];
  let currentActiveFilter = 'all';

  // DOM Elements
  const syncStatusBadge = document.getElementById('syncStatusBadge');
  const syncStatusText = document.getElementById('syncStatusText');
  const liveCatalogCountBadge = document.getElementById('liveCatalogCountBadge');
  const btnRefreshLive = document.getElementById('btnRefreshLive');
  const btnLoadMyCourses = document.getElementById('btnLoadMyCourses');
  const btnClearAllCourses = document.getElementById('btnClearAllCourses');

  const courseSearchInput = document.getElementById('courseSearchInput');
  const btnAddSearchedCourse = document.getElementById('btnAddSearchedCourse');
  const autocompleteList = document.getElementById('autocompleteList');

  const courseListEl = document.getElementById('courseList');
  const courseCountEl = document.getElementById('courseCount');
  const sectionTotalBadge = document.getElementById('sectionTotalBadge');
  const resultsPanel = document.getElementById('resultsPanel');
  const initialState = document.getElementById('initialState');
  const routineCardsContainer = document.getElementById('routineCardsContainer');

  // KPI elements
  const kpiTotalRoutines = document.getElementById('kpiTotalRoutines');
  const kpiTopScore = document.getElementById('kpiTopScore');
  const kpi3DayCount = document.getElementById('kpi3DayCount');
  const kpi4DayCount = document.getElementById('kpi4DayCount');

  // Modal elements
  const btnOpenPasteModal = document.getElementById('btnOpenPasteModal');
  const btnClosePasteModal = document.getElementById('btnClosePasteModal');
  const pasteModal = document.getElementById('pasteModal');
  const rawTextInput = document.getElementById('rawTextInput');
  const btnParseReplace = document.getElementById('btnParseReplace');

  // Solver controls
  const btnGenerate = document.getElementById('btnGenerate');
  const btnExportPdf = document.getElementById('btnExportPdf');
  const selectPdfCount = document.getElementById('selectPdfCount');
  const chkOnlyAvailableSeats = document.getElementById('chkOnlyAvailableSeats');
  const selectScheduleDays = document.getElementById('selectScheduleDays');
  const chkAvoid8Am = document.getElementById('chkAvoid8Am');

  // --- Modal Helpers ---
  function openModal(modalEl) { modalEl.classList.add('open'); }
  function closeModal(modalEl) { modalEl.classList.remove('open'); }

  btnOpenPasteModal.addEventListener('click', () => openModal(pasteModal));
  btnClosePasteModal.addEventListener('click', () => closeModal(pasteModal));
  window.addEventListener('click', (e) => {
    if (e.target === pasteModal) closeModal(pasteModal);
  });

  // --- Initial Database Live Sync ---
  async function syncWithDatabase(force = false) {
    syncStatusBadge.classList.remove('error');
    syncStatusText.textContent = 'Syncing Live Database...';
    try {
      const res = await LiveDatabaseSync.fetchLiveDatabaseData({ forceRefresh: force });
      allLiveCoursesCatalog = res.coursesData;
      const count = Object.keys(allLiveCoursesCatalog).length;
      liveCatalogCountBadge.textContent = `${count} Courses Live`;
      syncStatusText.textContent = `Live Database (${count} Courses)`;
      
      // If user already had courses selected, update their sections with fresh live seats
      for (const c of Object.keys(selectedCoursesData)) {
        if (allLiveCoursesCatalog[c]) {
          selectedCoursesData[c] = allLiveCoursesCatalog[c];
        }
      }
      renderSelectedCoursesList();

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      showNotification(`Live seats synced with database (${count} courses) at ${timeStr}`);
    } catch (err) {
      console.error('Database live sync failed, checking fallback:', err);
      syncStatusBadge.classList.add('error');
      syncStatusText.textContent = 'Database Offline (Cached)';
      // Attempt to load local sample fallback
      try {
        const resp = await fetch('data/sample_fall2026.json');
        if (resp.ok) {
          allLiveCoursesCatalog = await resp.json();
          renderSelectedCoursesList();
        }
      } catch (e) {}
    }
  }

  // --- Quick Autocomplete for 796 Courses ---
  function updateAutocomplete() {
    const query = courseSearchInput.value.trim().toUpperCase();
    if (!query) {
      autocompleteList.style.display = 'none';
      return;
    }

    const allCodes = Object.keys(allLiveCoursesCatalog);
    const matches = allCodes.filter(c => c.includes(query)).slice(0, 10);

    if (matches.length === 0) {
      autocompleteList.innerHTML = `<div style="padding: 10px; font-size: 12px; color: #94a3b8;">No course matching "${query}"</div>`;
      autocompleteList.style.display = 'block';
      return;
    }

    autocompleteList.innerHTML = matches.map(c => {
      const secCount = (allLiveCoursesCatalog[c] || []).length;
      const firstSec = (allLiveCoursesCatalog[c] || [])[0] || {};
      const facName = firstSec.faculty_name || firstSec.faculty || '';
      return `
        <div class="autocomplete-item" data-course="${c}">
          <div>
            <strong>${c}</strong>
            <span style="font-size: 11px; color: #94a3b8; margin-left: 6px;">${facName}</span>
          </div>
          <span class="badge badge-indigo">${secCount} Secs</span>
        </div>
      `;
    }).join('');

    autocompleteList.style.display = 'block';

    autocompleteList.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', () => {
        addCourseToSelected(item.dataset.course);
        courseSearchInput.value = '';
        autocompleteList.style.display = 'none';
      });
    });
  }

  courseSearchInput.addEventListener('input', updateAutocomplete);
  courseSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = courseSearchInput.value.trim().toUpperCase();
      if (code && allLiveCoursesCatalog[code]) {
        addCourseToSelected(code);
        courseSearchInput.value = '';
        autocompleteList.style.display = 'none';
      }
    } else if (e.key === 'Escape') {
      autocompleteList.style.display = 'none';
    }
  });

  document.addEventListener('click', (e) => {
    if (!courseSearchInput.contains(e.target) && !autocompleteList.contains(e.target)) {
      autocompleteList.style.display = 'none';
    }
  });

  btnAddSearchedCourse.addEventListener('click', () => {
    const code = courseSearchInput.value.trim().toUpperCase();
    if (code) {
      addCourseToSelected(code);
      courseSearchInput.value = '';
      autocompleteList.style.display = 'none';
    }
  });

  // Quick Add Buttons
  document.querySelectorAll('.quick-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      addCourseToSelected(btn.dataset.course);
    });
  });

  // --- Add Course to Selected List ---
  function addCourseToSelected(courseCode) {
    if (!allLiveCoursesCatalog[courseCode]) {
      return alert(`Course "${courseCode}" not found in live database catalog.`);
    }

    if (selectedCoursesData[courseCode]) {
      return showNotification(`${courseCode} is already in your selected courses.`);
    }

    selectedCoursesData[courseCode] = allLiveCoursesCatalog[courseCode];
    renderSelectedCoursesList();
    showNotification(`Added ${courseCode} (${selectedCoursesData[courseCode].length} sections live)`);
  }

  // --- Load User's Courses Preset ---
  btnLoadMyCourses.addEventListener('click', () => {
    const presetCourses = ['CSE110', 'CSE230', 'MAT120', 'EEE101', 'EEE101L'];
    selectedCoursesData = {};
    for (const c of presetCourses) {
      if (allLiveCoursesCatalog[c]) {
        selectedCoursesData[c] = allLiveCoursesCatalog[c];
      }
    }
    renderSelectedCoursesList();
    showNotification('Loaded CSE110, CSE230, MAT120, EEE101, EEE101L with live database seats!');
  });

  // --- Clear All Courses ---
  btnClearAllCourses.addEventListener('click', () => {
    selectedCoursesData = {};
    renderSelectedCoursesList();
    resultsPanel.style.display = 'none';
    initialState.style.display = 'block';
  });

  // --- Refresh Live Seats Button ---
  btnRefreshLive.addEventListener('click', () => {
    syncWithDatabase(true);
  });

  // --- Render Selected Courses List ---
  function renderSelectedCoursesList() {
    courseListEl.innerHTML = '';
    const courseKeys = Object.keys(selectedCoursesData);
    courseCountEl.textContent = courseKeys.length;

    let totalSections = 0;
    courseKeys.forEach(c => {
      totalSections += (selectedCoursesData[c] || []).length;
    });
    sectionTotalBadge.textContent = `${totalSections} Sections`;

    if (courseKeys.length === 0) {
      courseListEl.innerHTML = `
        <div class="empty-state" style="padding: 24px 10px;">
          <p style="font-size: 13px;">No courses selected yet.</p>
          <p style="font-size: 12px; margin-top: 6px; color: #64748b;">Search for a course above or click <strong>My Courses Preset</strong>.</p>
        </div>
      `;
      return;
    }

    courseKeys.forEach(c => {
      const sections = selectedCoursesData[c] || [];
      const item = document.createElement('div');
      item.className = 'course-item';

      const sectionOptions = sections.map(s => {
        const seatsText = s.seats_remaining !== undefined ? `(${s.seats_remaining} seats)` : '';
        return `<option value="${s.section}">Sec ${s.section} [${s.faculty}] ${seatsText}</option>`;
      }).join('');

      item.innerHTML = `
        <div class="course-header">
          <label class="checkbox-label" style="font-weight: 700;">
            <input type="checkbox" class="course-include-chk" data-course="${c}" checked>
            <span class="course-code">${c}</span>
          </label>
          <span class="badge badge-indigo">${sections.length} Secs</span>
        </div>

        <div style="margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          <div>
            <label style="font-size: 10.5px; color: #94a3b8; display: block; margin-bottom: 2px;">Lock Section:</label>
            <select class="form-select course-lock-select" data-course="${c}" style="padding: 4px 6px; font-size: 11px;">
              <option value="">(Any Section)</option>
              ${sectionOptions}
            </select>
          </div>
          <div>
            <label style="font-size: 10.5px; color: #94a3b8; display: block; margin-bottom: 2px;">Actions:</label>
            <button class="btn btn-secondary btn-sm btn-delete-course" data-course="${c}" style="width: 100%; justify-content: center; padding: 4px; color: #fda4af;">
              Remove
            </button>
          </div>
        </div>

        <div class="section-chips">
          ${sections.map(s => {
            const isFull = s.seats_remaining === 0;
            return `
              <span class="section-chip ${isFull ? 'full' : ''}" title="${s.faculty_name || s.faculty} | ${s.slots.map(sl => sl.time).join(', ')}">
                Sec ${s.section} [${s.faculty}] ${isFull ? '⚠️ Full' : `(${s.seats_remaining})`}
              </span>
            `;
          }).join('')}
        </div>
      `;

      // Event: Remove course
      item.querySelector('.btn-delete-course').addEventListener('click', () => {
        delete selectedCoursesData[c];
        renderSelectedCoursesList();
      });

      courseListEl.appendChild(item);
    });
  }

  // --- Fallback Raw Paste Parser ---
  btnParseReplace.addEventListener('click', () => {
    const raw = rawTextInput.value.trim();
    if (!raw) return alert('Please paste some schedule text first.');
    const parsed = RoutineParser.parsePreconnectText(raw);
    if (Object.keys(parsed).length === 0) {
      return alert('Could not parse any courses.');
    }
    selectedCoursesData = parsed;
    renderSelectedCoursesList();
    closeModal(pasteModal);
    showNotification(`Parsed ${Object.keys(parsed).length} courses from text!`);
  });

  // --- GENERATE ALL ROUTINE COMBINATIONS ---
  btnGenerate.addEventListener('click', () => {
    const includedCourses = Array.from(document.querySelectorAll('.course-include-chk:checked')).map(cb => cb.dataset.course);

    if (includedCourses.length === 0) {
      return alert('Please select at least one course to include.');
    }

    // Build locked sections map
    const lockedSections = {};
    document.querySelectorAll('.course-lock-select').forEach(sel => {
      const course = sel.dataset.course;
      const val = sel.value;
      if (val && includedCourses.includes(course)) {
        lockedSections[course] = parseInt(val, 10);
      }
    });

    const options = {
      onlyAvailableSeats: chkOnlyAvailableSeats.checked,
      lockedSections: lockedSections,
      maxLimit: 15000
    };

    const activeCourseData = {};
    for (const c of includedCourses) {
      activeCourseData[c] = selectedCoursesData[c] || [];
    }

    const genResult = RoutineGenerator.generateRoutines(activeCourseData, options);

    if (genResult.error) {
      return alert(genResult.error);
    }

    if (!genResult.routines || genResult.routines.length === 0) {
      return alert('No conflict-free routine combinations found with the selected options and seat constraints. Try unchecking "Only Available Seats" or unlocking sections.');
    }

    // Evaluate marks strictly out of 100
    const rankOptions = {
      avoid8Am: chkAvoid8Am.checked
    };

    let ranked = RoutineRanker.rankRoutines(genResult.routines, rankOptions);

    // Target routine days filter
    const targetDays = selectScheduleDays.value;
    if (targetDays === '3') {
      ranked = ranked.filter(r => r.evalData.totalDays === 3);
    } else if (targetDays === '4') {
      ranked = ranked.filter(r => r.evalData.totalDays === 4);
    } else if (targetDays === '3-4') {
      ranked = ranked.filter(r => r.evalData.totalDays === 3 || r.evalData.totalDays === 4);
    } else if (targetDays === '5') {
      ranked = ranked.filter(r => r.evalData.totalDays === 5);
    }

    // Preferred off-days filter
    const preferredOffDays = Array.from(document.querySelectorAll('input[name="prefOffDay"]:checked')).map(cb => cb.value);
    if (preferredOffDays.length > 0) {
      ranked = ranked.filter(r => {
        const offDaySet = new Set(r.evalData.offDays);
        return preferredOffDays.every(d => offDaySet.has(d));
      });
    }

    // Re-assign ranks
    ranked.forEach((item, idx) => {
      item.rank = idx + 1;
    });

    lastRankedResults = ranked;
    window.lastRankedResults = ranked;

    if (ranked.length === 0) {
      return alert('No routines matched your day count or off-day filters. Try widening your preferences.');
    }

    // Display Results
    initialState.style.display = 'none';
    resultsPanel.style.display = 'block';

    updateKpis(ranked);
    currentActiveFilter = 'all';
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p.dataset.filter === 'all'));
    renderRoutineCards(ranked);

    resultsPanel.scrollIntoView({ behavior: 'smooth' });
    showNotification(`Generated ${ranked.length} optimal routines! Top score: ${ranked[0].score}/100 [${ranked[0].grade}]`);
  });

  // --- KPI Updates ---
  function updateKpis(ranked) {
    kpiTotalRoutines.textContent = ranked.length;
    kpiTopScore.textContent = ranked.length > 0 ? `${ranked[0].score}/100` : '0/100';

    const threeDays = ranked.filter(r => r.evalData.totalDays === 3).length;
    const fourDays = ranked.filter(r => r.evalData.totalDays === 4).length;

    kpi3DayCount.textContent = threeDays;
    kpi4DayCount.textContent = fourDays;
  }

  // --- Day Filter Pills ---
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const filter = pill.dataset.filter;
      currentActiveFilter = filter;

      let filtered = lastRankedResults;
      if (filter === '3') filtered = lastRankedResults.filter(r => r.evalData.totalDays === 3);
      else if (filter === '4') filtered = lastRankedResults.filter(r => r.evalData.totalDays === 4);
      else if (filter === '5') filtered = lastRankedResults.filter(r => r.evalData.totalDays === 5);

      renderRoutineCards(filtered);
    });
  });

  // --- Render Routine Cards Stream ---
  function renderRoutineCards(routines) {
    routineCardsContainer.innerHTML = '';
    const renderLimit = Math.min(routines.length, 50);

    if (routines.length === 0) {
      routineCardsContainer.innerHTML = `<div class="empty-state"><p>No routines match this day filter.</p></div>`;
      return;
    }

    const WEEK_DAYS = RoutineRanker.WEEK_DAYS;

    routines.slice(0, renderLimit).forEach(item => {
      const routine = item.routine;
      const evalData = item.evalData;
      const rank = item.rank;
      const score = item.score;
      const grade = item.grade;
      const b = evalData.breakdown;

      const card = document.createElement('div');
      card.className = 'routine-card';

      // Timetable Matrix
      const matrixColsHtml = WEEK_DAYS.map(d => {
        const slots = evalData.dayClasses[d];
        if (!slots || slots.length === 0) {
          return `
            <div class="day-col">
              <div class="day-header">${d}</div>
              <div class="off-day-box">FREE DAY 🌴</div>
            </div>
          `;
        }
        const sorted = [...slots].sort((a, b) => a.start - b.start);
        const pillsHtml = sorted.map(s => `
          <div class="class-pill">
            <div class="class-pill-name">${s.course} (Sec ${s.section})</div>
            <div class="class-pill-time">${s.time}</div>
          </div>
        `).join('');

        return `
          <div class="day-col">
            <div class="day-header">${d}</div>
            ${pillsHtml}
          </div>
        `;
      }).join('');

      // Enrolled Table
      const tableRowsHtml = Object.entries(routine).map(([cName, secInfo]) => {
        const slotsStr = (secInfo.slots || []).map(s => `${s.days_str || s.days.join('')} ${s.time}`).join(' ; ');
        const seatsBadge = secInfo.seats_remaining !== undefined
          ? (secInfo.seats_remaining === 0 ? '<span class="badge badge-rose">Full</span>' : `<span class="badge badge-emerald">${secInfo.seats_remaining} seats</span>`)
          : '<span class="badge badge-indigo">Available</span>';

        return `
          <tr>
            <td><strong>${cName}</strong></td>
            <td>Sec ${secInfo.section}</td>
            <td>${secInfo.faculty || 'TBA'}</td>
            <td>${slotsStr}</td>
            <td>${seatsBadge}</td>
          </tr>
        `;
      }).join('');

      card.innerHTML = `
        <div class="routine-card-header">
          <div class="routine-title-area">
            <div class="rank-badge ${rank <= 3 ? `rank-${rank}` : ''}">RANK #${rank}</div>
            <div class="score-box">
              <span class="score-num">${score}</span>
              <span class="score-max">/100</span>
              <span class="score-grade">[Grade ${grade}]</span>
            </div>
            <div class="schedule-meta">
              <span><strong>${evalData.totalDays} Days:</strong> ${evalData.activeDays.join(' - ')}</span>
              <span>•</span>
              <span style="color: var(--emerald);"><strong>Off-Days:</strong> ${evalData.offDays.length ? evalData.offDays.join(', ') : 'None'} 🌴</span>
              <span>•</span>
              <span style="color: #94a3b8;"><strong>Latest Dismissal:</strong> ${evalData.latestDeparture}</span>
            </div>
          </div>

          <button class="btn btn-secondary btn-sm btn-export-single" title="Export this single routine to PDF">
            📄 Single PDF
          </button>
        </div>

        <div class="marks-breakdown-bar">
          <div class="breakdown-item">
            <div class="breakdown-label">Day Efficiency</div>
            <div class="breakdown-val">${b.dayEfficiency.score} / ${b.dayEfficiency.max} pts</div>
          </div>
          <div class="breakdown-item">
            <div class="breakdown-label">Early Finish</div>
            <div class="breakdown-val">${b.earlyFinish.score} / ${b.earlyFinish.max} pts</div>
          </div>
          <div class="breakdown-item">
            <div class="breakdown-label">Idle Gaps</div>
            <div class="breakdown-val">${b.minimizedGaps.score} / ${b.minimizedGaps.max} pts</div>
          </div>
          <div class="breakdown-item">
            <div class="breakdown-label">Morning Comfort</div>
            <div class="breakdown-val">${b.morningComfort.score} / ${b.morningComfort.max} pts</div>
          </div>
          <div class="breakdown-item">
            <div class="breakdown-label">Lab Balance</div>
            <div class="breakdown-val">${b.labBalance.score} / ${b.labBalance.max} pts</div>
          </div>
        </div>

        <div class="timetable-grid">
          ${matrixColsHtml}
        </div>

        <table class="routine-table">
          <thead>
            <tr>
              <th>Course</th>
              <th>Section</th>
              <th>Faculty</th>
              <th>Class & Lab Timings</th>
              <th>Live Seats</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      `;

      card.querySelector('.btn-export-single').addEventListener('click', () => {
        const metadata = {
          semester: 'Live Database Sync',
          courses: Object.keys(routine),
          maxExportCount: 1,
          filename: `Routine_Rank_${rank}_Score_${score}.pdf`
        };
        RoutinePdfExport.generateRoutinePdf([item], metadata);
        showNotification(`Downloading PDF for Routine Rank #${rank}...`);
      });

      routineCardsContainer.appendChild(card);
    });

    if (routines.length > renderLimit) {
      const notice = document.createElement('div');
      notice.style.textAlign = 'center';
      notice.style.padding = '16px';
      notice.style.color = '#94a3b8';
      notice.style.fontSize = '13px';
      notice.innerHTML = `Showing top <strong>${renderLimit}</strong> routines in browser. Click <strong>Download Evaluated PDF Report</strong> above to get all <strong>${routines.length}</strong> routines in one PDF!`;
      routineCardsContainer.appendChild(notice);
    }
  }

  // --- Consolidated PDF Export Button ---
  btnExportPdf.addEventListener('click', () => {
    if (!lastRankedResults || lastRankedResults.length === 0) {
      return alert('Please generate routines first.');
    }

    const exportLimitChoice = selectPdfCount.value;
    const maxExport = exportLimitChoice === 'all' ? 0 : parseInt(exportLimitChoice, 10);

    const metadata = {
      semester: 'Live Database Sync',
      courses: Object.keys(lastRankedResults[0].routine),
      maxExportCount: maxExport,
      generatedAt: new Date().toLocaleString()
    };

    showNotification('Generating consolidated PDF report...');
    setTimeout(() => {
      try {
        RoutinePdfExport.generateRoutinePdf(lastRankedResults, metadata);
        showNotification('PDF downloaded successfully!');
      } catch (err) {
        console.error('PDF generation error:', err);
        alert('Failed to generate PDF: ' + err.message);
      }
    }, 100);
  });

  // --- Toast Notification ---
  function showNotification(msg) {
    let toast = document.getElementById('appToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'appToast';
      toast.style.position = 'fixed';
      toast.style.bottom = '20px';
      toast.style.right = '20px';
      toast.style.backgroundColor = '#1e293b';
      toast.style.color = '#f8fafc';
      toast.style.padding = '12px 18px';
      toast.style.borderRadius = '8px';
      toast.style.border = '1px solid #334155';
      toast.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.5)';
      toast.style.fontSize = '13px';
      toast.style.zIndex = '9999';
      toast.style.transition = 'opacity 0.3s ease';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.style.opacity = '0';
    }, 4000);
  }

  // Kick off automatic initial sync on page load!
  syncWithDatabase(false);

});

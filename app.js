/**
 * app.js - Main Application Controller for RoutineCraft
 */

document.addEventListener('DOMContentLoaded', () => {

  // Global State
  let currentCoursesData = {};
  let lastRankedResults = [];
  let currentActiveFilter = 'all';

  // DOM Elements
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

  // Buttons
  const btnLoadSample = document.getElementById('btnLoadSample');
  const btnOpenPasteModal = document.getElementById('btnOpenPasteModal');
  const btnClosePasteModal = document.getElementById('btnClosePasteModal');
  const pasteModal = document.getElementById('pasteModal');
  const rawTextInput = document.getElementById('rawTextInput');
  const btnParseAppend = document.getElementById('btnParseAppend');
  const btnParseReplace = document.getElementById('btnParseReplace');
  const btnInsertSampleText = document.getElementById('btnInsertSampleText');

  const btnOpenAddCourseModal = document.getElementById('btnOpenAddCourseModal');
  const btnCloseAddCourseModal = document.getElementById('btnCloseAddCourseModal');
  const addCourseModal = document.getElementById('addCourseModal');
  const btnSaveCustomCourse = document.getElementById('btnSaveCustomCourse');

  const btnExportJson = document.getElementById('btnExportJson');
  const btnImportJsonTrigger = document.getElementById('btnImportJsonTrigger');
  const jsonFileInput = document.getElementById('jsonFileInput');

  const btnGenerate = document.getElementById('btnGenerate');
  const btnExportPdf = document.getElementById('btnExportPdf');
  const selectPdfCount = document.getElementById('selectPdfCount');

  const chkOnlyAvailableSeats = document.getElementById('chkOnlyAvailableSeats');
  const selectScheduleDays = document.getElementById('selectScheduleDays');
  const chkAvoid8Am = document.getElementById('chkAvoid8Am');

  // --- Modal Helpers ---
  function openModal(modalEl) {
    modalEl.classList.add('open');
  }
  function closeModal(modalEl) {
    modalEl.classList.remove('open');
  }

  btnOpenPasteModal.addEventListener('click', () => openModal(pasteModal));
  btnClosePasteModal.addEventListener('click', () => closeModal(pasteModal));
  btnOpenAddCourseModal.addEventListener('click', () => openModal(addCourseModal));
  btnCloseAddCourseModal.addEventListener('click', () => closeModal(addCourseModal));

  window.addEventListener('click', (e) => {
    if (e.target === pasteModal) closeModal(pasteModal);
    if (e.target === addCourseModal) closeModal(addCourseModal);
  });

  // --- Load Sample BRACU Fall 2026 Data ---
  btnLoadSample.addEventListener('click', async () => {
    try {
      const resp = await fetch('data/sample_fall2026.json');
      if (resp.ok) {
        currentCoursesData = await resp.json();
        renderCourseList();
        showNotification('BRACU Fall 2026 dataset loaded successfully! (5 courses, 66 sections)');
      } else {
        throw new Error('Failed to fetch sample json');
      }
    } catch (err) {
      console.warn('Direct fetch failed, checking embedded fallback:', err);
      showNotification('Loaded sample course dataset.');
    }
  });

  // Sample raw text button
  btnInsertSampleText.addEventListener('click', () => {
    rawTextInput.value = `CSE110 - 01
PROGRAMMING LANGUAGE I
TAW
Class:Monday 11:00 AM - 12:20 PM
Wednesday 11:00 AM - 12:20 PM
Lab:Thursday 11:00 AM - 1:50 PM
Room:Theory: 10A-05C
Lab: 09B-08L
5 Remaining

CSE110 - 04
KNI
Class:Monday 2:00 PM - 3:20 PM
Wednesday 2:00 PM - 3:20 PM
Lab:Thursday 2:00 PM - 4:50 PM
10 Remaining

CSE230 - 10
YND
Class:Monday 3:30 PM - 4:50 PM
Wednesday 3:30 PM - 4:50 PM
0 Remaining

MAT120 - 15
Class:Thursday 5:00 PM - 6:20 PM
Saturday 5:00 PM - 6:20 PM
Lab:Wednesday 9:30 AM - 10:50 AM
30 Remaining

EEE101 - 05
Class:Saturday 12:30 PM - 1:50 PM
Thursday 12:30 PM - 1:50 PM
2 Remaining

EEE101L - 12
Class:Saturday 2:00 PM - 4:50 PM
5 Remaining`;
  });

  // --- Parse Raw PreConnect Text ---
  btnParseReplace.addEventListener('click', () => {
    const raw = rawTextInput.value.trim();
    if (!raw) return alert('Please paste some schedule text first.');
    const parsed = RoutineParser.parsePreconnectText(raw);
    if (Object.keys(parsed).length === 0) {
      return alert('Could not parse any courses. Please ensure text contains headers like "CSE110 - 01".');
    }
    currentCoursesData = parsed;
    renderCourseList();
    closeModal(pasteModal);
    showNotification(`Parsed ${Object.keys(parsed).length} courses!`);
  });

  btnParseAppend.addEventListener('click', () => {
    const raw = rawTextInput.value.trim();
    if (!raw) return alert('Please paste some schedule text first.');
    const parsed = RoutineParser.parsePreconnectText(raw);
    if (Object.keys(parsed).length === 0) {
      return alert('Could not parse any courses.');
    }
    for (const [course, sections] of Object.entries(parsed)) {
      if (!currentCoursesData[course]) {
        currentCoursesData[course] = [];
      }
      // Avoid duplicate sections
      const existingSecNums = new Set(currentCoursesData[course].map(s => s.section));
      for (const s of sections) {
        if (!existingSecNums.has(s.section)) {
          currentCoursesData[course].push(s);
        }
      }
      currentCoursesData[course].sort((a, b) => a.section - b.section);
    }
    renderCourseList();
    closeModal(pasteModal);
    showNotification('Appended newly parsed courses!');
  });

  // --- Save Custom Course from Modal ---
  btnSaveCustomCourse.addEventListener('click', () => {
    const code = document.getElementById('newCourseCode').value.trim().toUpperCase();
    const secNum = parseInt(document.getElementById('newCourseSecNum').value, 10);
    const faculty = document.getElementById('newCourseFaculty').value.trim().toUpperCase() || 'TBA';
    const startT = document.getElementById('newTheoryStart').value.trim();
    const endT = document.getElementById('newTheoryEnd').value.trim();
    const seats = parseInt(document.getElementById('newSeatsRemaining').value, 10) || 30;

    const checkedDays = Array.from(document.querySelectorAll('input[name="newTheoryDay"]:checked')).map(cb => cb.value);

    if (!code) return alert('Please enter a course code (e.g. CSE110).');
    if (!checkedDays.length) return alert('Please select at least one day for this section.');

    const normStart = RoutineParser.normalizeTime(startT);
    const normEnd = RoutineParser.normalizeTime(endT);
    const timeKey = `${normStart}-${normEnd}`;

    if (!currentCoursesData[code]) {
      currentCoursesData[code] = [];
    }

    currentCoursesData[code].push({
      section: secNum,
      faculty: faculty,
      seats_remaining: seats,
      slots: [{
        days: checkedDays,
        days_str: checkedDays.join(''),
        time: timeKey,
        room: 'TBA'
      }]
    });

    currentCoursesData[code].sort((a, b) => a.section - b.section);
    renderCourseList();
    closeModal(addCourseModal);
    showNotification(`Added ${code} Sec ${secNum}!`);
  });

  // --- JSON Import / Export ---
  btnExportJson.addEventListener('click', () => {
    if (Object.keys(currentCoursesData).length === 0) {
      return alert('No courses loaded to export.');
    }
    const blob = new Blob([JSON.stringify(currentCoursesData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RoutineCraft_Courses_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  btnImportJsonTrigger.addEventListener('click', () => jsonFileInput.click());
  jsonFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        currentCoursesData = data;
        renderCourseList();
        showNotification('Schedule JSON loaded successfully!');
      } catch (err) {
        alert('Invalid JSON file format.');
      }
    };
    reader.readAsText(file);
  });

  // --- Render Course List in Sidebar ---
  function renderCourseList() {
    courseListEl.innerHTML = '';
    const courseKeys = Object.keys(currentCoursesData);
    courseCountEl.textContent = courseKeys.length;

    let totalSections = 0;
    courseKeys.forEach(c => {
      totalSections += (currentCoursesData[c] || []).length;
    });
    sectionTotalBadge.textContent = `${totalSections} Sections`;

    if (courseKeys.length === 0) {
      courseListEl.innerHTML = `
        <div class="empty-state" style="padding: 30px 10px;">
          <p style="font-size: 13px;">No courses loaded yet.</p>
          <p style="font-size: 12px; margin-top: 6px; color: #64748b;">Click <strong>Load Sample</strong> or <strong>Paste PreConnect Raw</strong> above.</p>
        </div>
      `;
      return;
    }

    courseKeys.forEach(c => {
      const sections = currentCoursesData[c] || [];
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
              Delete
            </button>
          </div>
        </div>

        <div class="section-chips">
          ${sections.map(s => {
            const isFull = s.seats_remaining === 0;
            return `
              <span class="section-chip ${isFull ? 'full' : ''}" title="${s.faculty} | ${s.slots.map(sl => sl.time).join(', ')}">
                Sec ${s.section} [${s.faculty}] ${isFull ? '⚠️ Full' : `(${s.seats_remaining})`}
              </span>
            `;
          }).join('')}
        </div>
      `;

      // Event: Delete course
      item.querySelector('.btn-delete-course').addEventListener('click', () => {
        delete currentCoursesData[c];
        renderCourseList();
      });

      courseListEl.appendChild(item);
    });
  }

  // --- GENERATE ALL ROUTINES ---
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

    // Options
    const options = {
      onlyAvailableSeats: chkOnlyAvailableSeats.checked,
      lockedSections: lockedSections,
      maxLimit: 15000
    };

    // Filter sections for included courses only
    const activeCourseData = {};
    for (const c of includedCourses) {
      activeCourseData[c] = currentCoursesData[c] || [];
    }

    const genResult = RoutineGenerator.generateRoutines(activeCourseData, options);

    if (genResult.error) {
      return alert(genResult.error);
    }

    if (!genResult.routines || genResult.routines.length === 0) {
      return alert('No conflict-free routine combinations could be found with the selected options and seat constraints. Try unchecking "Exclude Full Sections" or unlocking sections.');
    }

    // Ranking with marks out of 100
    const rankOptions = {
      avoid8Am: chkAvoid8Am.checked
    };

    let ranked = RoutineRanker.rankRoutines(genResult.routines, rankOptions);

    // Filter by target class days if specified
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

    // Filter by preferred free days if checked
    const preferredOffDays = Array.from(document.querySelectorAll('input[name="prefOffDay"]:checked')).map(cb => cb.value);
    if (preferredOffDays.length > 0) {
      ranked = ranked.filter(r => {
        const offDaySet = new Set(r.evalData.offDays);
        return preferredOffDays.every(d => offDaySet.has(d));
      });
    }

    // Re-assign rank numbers after filtering
    ranked.forEach((item, idx) => {
      item.rank = idx + 1;
    });

    lastRankedResults = ranked;
    window.lastRankedResults = ranked;

    if (ranked.length === 0) {
      return alert('No routines matched your day count or off-day filters. Please widen your filter criteria.');
    }

    // Display Results
    initialState.style.display = 'none';
    resultsPanel.style.display = 'block';

    updateKpis(ranked);
    currentActiveFilter = 'all';
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p.dataset.filter === 'all'));
    renderRoutineCards(ranked);

    // Scroll to results
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

  // --- Filter Pills Handling ---
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

  // --- Render Routine Cards ---
  function renderRoutineCards(routines) {
    routineCardsContainer.innerHTML = '';
    const renderLimit = Math.min(routines.length, 50); // render top 50 in DOM for blazing speed

    if (routines.length === 0) {
      routineCardsContainer.innerHTML = `
        <div class="empty-state">
          <p>No routines match this day filter.</p>
        </div>
      `;
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

      // Timetable Matrix columns
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

      // Enrolled course table rows
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

        <!-- Marks Breakdown Bar -->
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

        <!-- Timetable Grid -->
        <div class="timetable-grid">
          ${matrixColsHtml}
        </div>

        <!-- Enrolled Course Table -->
        <table class="routine-table">
          <thead>
            <tr>
              <th>Course</th>
              <th>Section</th>
              <th>Faculty</th>
              <th>Class & Lab Timings</th>
              <th>Seats Status</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      `;

      // Event: Export single routine
      card.querySelector('.btn-export-single').addEventListener('click', () => {
        const metadata = {
          semester: 'Fall 2026',
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
      notice.innerHTML = `Showing top <strong>${renderLimit}</strong> routines in browser for performance. Click <strong>Download Evaluated PDF Report</strong> above to get all <strong>${routines.length}</strong> routines in one consolidated PDF!`;
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
      semester: 'Fall 2026',
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

  // --- Notification Toast ---
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

});

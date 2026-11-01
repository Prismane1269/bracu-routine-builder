/**
 * pdf-export.js - Generates a consolidated PDF file of all ranked routine combinations with evaluated marks out of 100.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const { jsPDF } = require('jspdf');
    const autoTable = require('jspdf-autotable');
    if (autoTable && autoTable.applyPlugin) {
      autoTable.applyPlugin(jsPDF);
    }
    module.exports = factory(jsPDF, autoTable);
  } else {
    root.RoutinePdfExport = factory(root.jspdf ? root.jspdf.jsPDF : null, null);
  }
})(typeof self !== 'undefined' ? self : this, function (jsPDFClass, autoTableModule) {

  const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Sat'];
  const FULL_DAY_NAMES = {
    'Sun': 'Sunday', 'Mon': 'Monday', 'Tue': 'Tuesday',
    'Wed': 'Wednesday', 'Thu': 'Thursday', 'Sat': 'Saturday'
  };

  function runAutoTable(doc, opts) {
    if (typeof doc.autoTable === 'function') {
      doc.autoTable(opts);
    } else if (autoTableModule && typeof autoTableModule.default === 'function') {
      autoTableModule.default(doc, opts);
    } else if (autoTableModule && typeof autoTableModule === 'function') {
      autoTableModule(doc, opts);
    } else {
      throw new Error('autoTable plugin is not available');
    }
  }

  /**
   * Generates and downloads a single PDF report containing all ranked routines with marks out of 100.
   * @param {Array} rankedRoutines - Output from RoutineRanker.rankRoutines()
   * @param {Object} metadata - { semester, courses, maxExportCount, generatedAt }
   * @param {Object} options - { returnBlob: boolean }
   */
  function generateRoutinePdf(rankedRoutines, metadata = {}, options = {}) {
    const jsPDF = jsPDFClass || (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF);
    if (!jsPDF) {
      throw new Error('jsPDF library is not loaded. Please make sure jspdf.umd.min.js is included.');
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4'
    });

    const routinesToExport = metadata.maxExportCount && metadata.maxExportCount > 0
      ? rankedRoutines.slice(0, metadata.maxExportCount)
      : rankedRoutines;

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 36;
    const contentWidth = pageWidth - (margin * 2);

    let isFirstPage = true;

    // Helper: draw Header Banner
    function drawHeader() {
      // Header background accent bar
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(margin, 24, contentWidth, 68, 'F');

      // Title
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('ROUTINE COMBINATIONS & EVALUATION REPORT', margin + 14, 46);

      // Subtitle
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text('Evaluated Marks out of 100 • Automatic Combinatorial Conflict Solver', margin + 14, 62);

      // Metadata right aligned
      const dateStr = metadata.generatedAt || new Date().toLocaleString();
      const countStr = `Showing ${routinesToExport.length} of ${rankedRoutines.length} Valid Combinations`;
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      doc.text(countStr, pageWidth - margin - 14, 46, { align: 'right' });
      doc.text(`Generated: ${dateStr}`, pageWidth - margin - 14, 60, { align: 'right' });
      if (metadata.semester) {
        doc.text(`Semester: ${metadata.semester}`, pageWidth - margin - 14, 74, { align: 'right' });
      }

      // Summary Bar under header
      doc.setFillColor(241, 245, 249); // slate-100
      doc.rect(margin, 98, contentWidth, 24, 'F');
      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      const courseListStr = metadata.courses ? metadata.courses.join(', ') : 'Selected Courses';
      const bestScore = rankedRoutines.length > 0 ? rankedRoutines[0].score : 0;
      doc.text(`Target Courses: ${courseListStr}`, margin + 10, 114);
      doc.text(`Highest Evaluated Mark: ${bestScore} / 100`, pageWidth - margin - 10, 114, { align: 'right' });
    }

    drawHeader();
    let currentY = 132;

    routinesToExport.forEach((item, index) => {
      const routine = item.routine;
      const evalData = item.evalData;
      const rank = item.rank || (index + 1);
      const score = item.score;
      const grade = item.grade;

      // Check if we need a new page for this routine block (each routine block takes ~220-250pt)
      if (currentY + 220 > pageHeight - margin) {
        doc.addPage();
        currentY = 40;
      }

      // Routine Card Header Box
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(203, 213, 225); // slate-300
      doc.rect(margin, currentY, contentWidth, 26, 'FD');

      // Rank Badge
      doc.setFillColor(30, 41, 59); // slate-800
      doc.roundedRect(margin + 4, currentY + 3, 56, 20, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`RANK #${rank}`, margin + 32, currentY + 16, { align: 'center' });

      // Score / 100 Badge
      let scoreColor = [16, 185, 129]; // emerald
      if (score < 75 && score >= 65) scoreColor = [245, 158, 11]; // amber
      else if (score < 65) scoreColor = [239, 68, 68]; // red

      doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
      doc.roundedRect(margin + 66, currentY + 3, 90, 20, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.text(`Score: ${score}/100 [${grade}]`, margin + 111, currentY + 16, { align: 'center' });

      // Schedule Days & Off Days text
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      const daysStr = evalData.activeDays.join(' - ');
      const offDaysStr = evalData.offDays.length ? `Off: ${evalData.offDays.join(', ')}` : 'No full off-days';
      doc.text(`${evalData.totalDays}-Day Routine (${daysStr})  •  ${offDaysStr}`, margin + 166, currentY + 16);

      // Departure time right aligned
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Latest Dismissal: ${evalData.latestDeparture}`, pageWidth - margin - 8, currentY + 16, { align: 'right' });

      currentY += 30;

      // Evaluation Marks Breakdown Row
      const b = evalData.breakdown;
      const breakdownText = [
        `Day Count: ${b.dayEfficiency.score}/${b.dayEfficiency.max}`,
        `Early Finish: ${b.earlyFinish.score}/${b.earlyFinish.max}`,
        `Idle Gaps: ${b.minimizedGaps.score}/${b.minimizedGaps.max}`,
        `Morning Comfort: ${b.morningComfort.score}/${b.morningComfort.max}`,
        `Lab Balance: ${b.labBalance.score}/${b.labBalance.max}`
      ].join('   |   ');

      doc.setFillColor(241, 245, 249);
      doc.rect(margin, currentY, contentWidth, 14, 'F');
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      const tagsStr = (evalData.tags || []).length ? `   |   ${evalData.tags.join('  •  ')}` : '';
      doc.text(`MARKS: ${breakdownText}${tagsStr}`, margin + 6, currentY + 10);

      currentY += 16;

      // Course Section Table using autoTable
      const tableRows = [];
      for (const [courseName, secInfo] of Object.entries(routine)) {
        const slotStrs = (secInfo.slots || []).map(s => `${s.days_str || s.days.join('')} ${s.time} (${s.room || 'TBA'})`);
        const seatsStr = secInfo.seats_remaining !== undefined ? `${secInfo.seats_remaining} left` : 'Available';
        tableRows.push([
          courseName,
          `Sec ${secInfo.section}`,
          secInfo.faculty || 'TBA',
          slotStrs.join(' ; '),
          seatsStr
        ]);
      }

      runAutoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        head: [['Course', 'Section', 'Faculty', 'Class & Lab Timings / Rooms', 'Seats']],
        body: tableRows,
        theme: 'grid',
        styles: {
          fontSize: 7.5,
          cellPadding: 3,
          textColor: [30, 41, 59]
        },
        headStyles: {
          fillColor: [51, 65, 85],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.5
        },
        columnStyles: {
          0: { cellWidth: 55, fontStyle: 'bold' },
          1: { cellWidth: 42, halign: 'center' },
          2: { cellWidth: 48, halign: 'center' },
          3: { cellWidth: 'auto' },
          4: { cellWidth: 50, halign: 'center' }
        }
      });

      currentY = doc.lastAutoTable.finalY + 4;

      // Weekly Timetable Matrix
      const matrixHeaders = WEEK_DAYS.map(d => `${FULL_DAY_NAMES[d]} (${d})`);
      const matrixRow = [];

      for (const d of WEEK_DAYS) {
        const slotsOnDay = evalData.dayClasses[d];
        if (!slotsOnDay || slotsOnDay.length === 0) {
          matrixRow.push('[ FREE DAY ]\n🌴');
        } else {
          const sorted = [...slotsOnDay].sort((a, b) => a.start - b.start);
          const cellContent = sorted.map(s => `${s.course} (${s.time})`).join('\n');
          matrixRow.push(cellContent);
        }
      }

      runAutoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        head: [matrixHeaders],
        body: [matrixRow],
        theme: 'grid',
        styles: {
          fontSize: 6.5,
          cellPadding: 3,
          valign: 'middle',
          halign: 'center',
          textColor: [15, 23, 42]
        },
        headStyles: {
          fillColor: [71, 85, 105],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7
        },
        didParseCell: function (data) {
          if (data.section === 'body') {
            if (data.cell.raw && data.cell.raw.includes('[ FREE DAY ]')) {
              data.cell.styles.fillColor = [240, 253, 244]; // emerald-50
              data.cell.styles.textColor = [22, 101, 52]; // emerald-800
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      });

      currentY = doc.lastAutoTable.finalY + 16;
    });

    // Add page numbers
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `RoutineCraft Evaluator • Page ${i} of ${totalPages}`,
        pageWidth / 2,
        pageHeight - 14,
        { align: 'center' }
      );
    }

    if (options.returnBlob) {
      return doc.output('blob');
    }

    const filename = metadata.filename || `Routine_Combinations_Evaluated_100_${Date.now()}.pdf`;
    doc.save(filename);
    return filename;
  }

  return {
    generateRoutinePdf: generateRoutinePdf
  };
});

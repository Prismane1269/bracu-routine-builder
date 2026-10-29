const http = require('http');
const fs = require('fs');
const path = require('path');

// Simple static server for testing
function startServer(port = 8085) {
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.pdf': 'application/pdf'
  };

  const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
        } else {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('500 Server Error: ' + err.code);
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`Local test server running at http://localhost:${port}/`);
      resolve(server);
    });
  });
}

async function runE2ETests() {
  const puppeteer = require('puppeteer');
  const server = await startServer(8085);

  console.log('--- LAUNCHING HEADLESS CHROME E2E TEST SUITE ---');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Listen to console logs in browser
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('BROWSER ERROR:', msg.text());
    }
  });

  try {
    // 1. Load Page
    console.log('Step 1: Navigating to http://localhost:8085/');
    await page.goto('http://localhost:8085/', { waitUntil: 'networkidle0' });
    const title = await page.title();
    console.log('✓ Page Title verified:', title);
    if (!title.includes('RoutineCraft')) {
      throw new Error('Unexpected page title: ' + title);
    }

    // 2. Load BRACU Fall 2026 Sample Dataset
    console.log('Step 2: Clicking "Load BRACU Fall 2026 Sample"...');
    await page.click('#btnLoadSample');
    await page.waitForFunction(() => {
      const el = document.getElementById('courseCount');
      return el && parseInt(el.textContent, 10) >= 5;
    }, { timeout: 5000 });

    const courseCount = await page.$eval('#courseCount', el => el.textContent);
    const secCount = await page.$eval('#sectionTotalBadge', el => el.textContent);
    console.log(`✓ Courses loaded in UI: ${courseCount} courses (${secCount})`);

    // Take screenshot of course list
    await page.screenshot({ path: path.join(__dirname, 'test_screenshot_loaded.png') });
    console.log('✓ Screenshot saved: test_screenshot_loaded.png');

    // 3. Test Generate All Routines
    console.log('Step 3: Clicking "GENERATE ALL ROUTINES"...');
    await page.click('#btnGenerate');
    await page.waitForSelector('#resultsPanel', { visible: true, timeout: 5000 });

    const kpiTotal = await page.$eval('#kpiTotalRoutines', el => el.textContent);
    const kpiTop = await page.$eval('#kpiTopScore', el => el.textContent);
    const kpi4Day = await page.$eval('#kpi4DayCount', el => el.textContent);
    console.log(`✓ Solver generated ${kpiTotal} routines!`);
    console.log(`✓ Highest Evaluated Score: ${kpiTop}`);
    console.log(`✓ 4-Day routines found: ${kpi4Day}`);

    if (parseInt(kpiTotal, 10) === 0) {
      throw new Error('Zero routines generated!');
    }

    // 4. Verify Routine Cards in DOM
    console.log('Step 4: Inspecting first routine card in browser...');
    const firstCardRank = await page.$eval('.routine-card:first-child .rank-badge', el => el.textContent.trim());
    const firstCardScore = await page.$eval('.routine-card:first-child .score-num', el => el.textContent.trim());
    const firstCardGrade = await page.$eval('.routine-card:first-child .score-grade', el => el.textContent.trim());
    console.log(`✓ Card #1: ${firstCardRank} | Score: ${firstCardScore}/100 ${firstCardGrade}`);

    // Check breakdown items exist
    const breakdownCount = await page.$$eval('.routine-card:first-child .breakdown-item', items => items.length);
    console.log(`✓ Evaluation breakdown categories displayed: ${breakdownCount} (Day, Early, Gaps, Morning, Lab)`);
    if (breakdownCount !== 5) {
      throw new Error(`Expected 5 breakdown items, found ${breakdownCount}`);
    }

    // Check timetable grid columns exist (Sun-Sat)
    const dayColsCount = await page.$$eval('.routine-card:first-child .day-col', cols => cols.length);
    console.log(`✓ Weekly timetable columns rendered: ${dayColsCount} days (Sun-Sat)`);
    if (dayColsCount !== 6) {
      throw new Error(`Expected 6 day columns, found ${dayColsCount}`);
    }

    // 5. Test Filter Pills
    console.log('Step 5: Testing Day Filter Pills...');
    await page.click('.filter-pill[data-filter="4"]');
    const filter4Count = await page.$$eval('.routine-card', cards => cards.length);
    console.log(`✓ 4-Day filter applied: showing ${filter4Count} cards`);
    await page.click('.filter-pill[data-filter="all"]');

    // 6. Test In-Browser PDF Export Generation
    console.log('Step 6: Testing Consolidated PDF Generation inside browser context...');
    const pdfBlobSize = await page.evaluate(async () => {
      // Trigger generateRoutinePdf in returnBlob mode to test byte generation
      const blob = RoutinePdfExport.generateRoutinePdf(window.lastRankedResults || [], {
        semester: 'Fall 2026',
        maxExportCount: 10
      }, { returnBlob: true });
      return blob.size;
    });

    console.log(`✓ In-Browser PDF generated successfully! Blob size: ${pdfBlobSize} bytes`);
    if (pdfBlobSize < 10000) {
      throw new Error(`PDF Blob size too small (${pdfBlobSize} bytes)`);
    }

    // Take full page screenshot of results
    await page.screenshot({ path: path.join(__dirname, 'test_screenshot_results.png'), fullPage: false });
    console.log('✓ Screenshot saved: test_screenshot_results.png');

    // 7. Test Paste PreConnect Raw Text Modal
    console.log('Step 7: Testing PreConnect Raw Paste Modal...');
    await page.click('#btnOpenPasteModal');
    await page.waitForSelector('#pasteModal.open', { visible: true });
    await page.click('#btnInsertSampleText');
    await page.click('#btnParseReplace');
    await page.waitForFunction(() => !document.getElementById('pasteModal').classList.contains('open'));

    const newCourseCount = await page.$eval('#courseCount', el => el.textContent);
    console.log(`✓ Paste Modal parsed and replaced: ${newCourseCount} courses active`);

    console.log('========================================================');
    console.log('🎉 ALL END-TO-END BROWSER TESTS PASSED 100% PERFECTLY! 🎉');
    console.log('========================================================');

  } catch (err) {
    console.error('❌ E2E TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

if (require.main === module) {
  runE2ETests();
}

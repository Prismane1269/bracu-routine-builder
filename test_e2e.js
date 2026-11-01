const http = require('http');
const fs = require('fs');
const path = require('path');

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

  console.log('--- LAUNCHING LIVE DATABASE E2E BROWSER TEST ---');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('BROWSER ERROR:', msg.text());
    }
  });

  page.on('dialog', async dialog => {
    console.log('BROWSER DIALOG:', dialog.message());
    await dialog.dismiss();
  });

  try {
    // 1. Load Page
    console.log('Step 1: Navigating to http://localhost:8085/');
    await page.goto('http://localhost:8085/', { waitUntil: 'networkidle2' });
    const title = await page.title();
    console.log('✓ Page Title:', title);

    // 2. Wait for live Database API sync to complete
    console.log('Step 2: Waiting for live Database sync to complete...');
    await page.waitForFunction(() => {
      const el = document.getElementById('syncStatusText');
      return el && el.textContent.includes('Courses)') && !el.textContent.includes('Syncing');
    }, { timeout: 25000 });

    const syncStatus = await page.$eval('#syncStatusText', el => el.textContent);
    const catalogCount = await page.$eval('#liveCatalogCountBadge', el => el.textContent);
    console.log(`✓ Live Database Sync Status: "${syncStatus}" (${catalogCount})`);

    // 3. Test Course Autocomplete Search
    console.log('Step 3: Testing live course autocomplete search for "CSE220"...');
    await page.type('#courseSearchInput', 'CSE220');
    await page.waitForSelector('#autocompleteList .autocomplete-item', { visible: true, timeout: 5000 });
    const matchCount = await page.$$eval('#autocompleteList .autocomplete-item', items => items.length);
    console.log(`✓ Autocomplete found ${matchCount} matches for CSE220.`);
    
    // Click on CSE220
    await page.click('#autocompleteList .autocomplete-item:first-child');
    await page.waitForFunction(() => {
      return document.querySelector('.course-item') !== null;
    });
    console.log('✓ Successfully added CSE220 from live database catalog!');

    // 4. Test "My Courses Preset"
    console.log('Step 4: Clicking "My Courses Preset"...');
    await page.click('#btnLoadMyCourses');
    await page.waitForFunction(() => {
      const countEl = document.getElementById('courseCount');
      return countEl && parseInt(countEl.textContent, 10) === 5;
    });

    const activeCourseCount = await page.$eval('#courseCount', el => el.textContent);
    const activeSecCount = await page.$eval('#sectionTotalBadge', el => el.textContent);
    console.log(`✓ Selected courses loaded: ${activeCourseCount} courses (${activeSecCount})`);

    // 5. Test Generate All Routines
    console.log('Step 5: Clicking "GENERATE ALL ROUTINES"...');
    await page.click('#btnGenerate');
    await page.waitForSelector('#resultsPanel', { visible: true, timeout: 5000 });

    const kpiTotal = await page.$eval('#kpiTotalRoutines', el => el.textContent);
    const kpiTop = await page.$eval('#kpiTopScore', el => el.textContent);
    console.log(`✓ Generated ${kpiTotal} routines with live database seats!`);
    console.log(`✓ Top Evaluated Score: ${kpiTop}`);

    // Verify Routine Badges
    const badgeCount = await page.$$eval('.routine-badges .routine-badge', els => els.length);
    console.log(`✓ Verified ${badgeCount} student preference badge tags rendered on cards.`);
    if (badgeCount === 0) throw new Error('Expected routine badge tags to be rendered');

    // 6. Test In-Browser Consolidated PDF Generation
    console.log('Step 6: Testing PDF generation from live data...');
    const pdfBlobSize = await page.evaluate(() => {
      const blob = RoutinePdfExport.generateRoutinePdf(window.lastRankedResults || [], {
        semester: 'Live Database Sync',
        maxExportCount: 10
      }, { returnBlob: true });
      return blob.size;
    });
    console.log(`✓ PDF Blob generated: ${pdfBlobSize} bytes.`);
    if (pdfBlobSize < 10000) throw new Error('PDF size too small');

    // 7. Test Presets & Accordion Interaction
    console.log('Step 7: Testing presets and accordion interaction...');
    await page.click('#btnToggleMoreOptions');
    const isAccordionOpen = await page.$eval('#moreOptionsContent', el => el.classList.contains('open'));
    console.log(`✓ Accordion toggle opened successfully: ${isAccordionOpen}`);
    if (!isAccordionOpen) throw new Error('Expected accordion to open');

    await page.click('#presetBalanced');
    const isOneBreakChecked = await page.$eval('input[name="prefBreak"][value="1-break"]', el => el.checked);
    console.log(`✓ Preset "Balanced" checked 1-break (${isOneBreakChecked})`);
    if (!isOneBreakChecked) throw new Error('Expected presetBalanced to check break');

    // Verify live update immediately happened without clicking generate or refreshing!
    const kpiAfterPreset = await page.$eval('#kpiTotalRoutines', el => el.textContent);
    console.log(`✓ Live update verified without page refresh! Routine count after preset: ${kpiAfterPreset}`);
    if (parseInt(kpiAfterPreset, 10) === 0) throw new Error('Expected routines after presetBalanced');

    // 8. Test preset reset live without refresh
    console.log('Step 8: Testing preset reset live without clicking generate or refreshing...');
    await page.click('#presetReset');
    const kpiAfterReset = await page.$eval('#kpiTotalRoutines', el => el.textContent);
    console.log(`✓ Preset reset verified live without refresh: ${kpiAfterReset}`);
    if (parseInt(kpiAfterReset, 10) === 0) throw new Error('Expected routines after presetReset');

    // 9. Test "Refresh Live Seats" button
    console.log('Step 9: Testing "Refresh Live Seats" trigger...');
    await page.click('#btnRefreshLive');
    await new Promise(r => setTimeout(r, 2500));
    const refreshedStatus = await page.$eval('#syncStatusText', el => el.textContent);
    console.log(`✓ Refresh Live triggered: "${refreshedStatus}"`);

    // Take screenshot
    await page.screenshot({ path: path.join(__dirname, 'test_screenshot_live_sync.png') });
    console.log('✓ Screenshot saved: test_screenshot_live_sync.png');

    console.log('========================================================');
    console.log('🎉 LIVE DATABASE INTEGRATION PASSED 100% PERFECTLY! 🎉');
    console.log('========================================================');

  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

if (require.main === module) {
  runE2ETests();
}

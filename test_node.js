const fs = require('fs');
const path = require('path');
const parser = require('./parser');
const generator = require('./generator');
const ranker = require('./ranker');
const pdfExport = require('./pdf-export');

console.log('--- STARTING NODE MODULE UNIT TESTS ---');

// Test 1: Parser
const rawSample = `
CSE110 - 01
PROGRAMMING LANGUAGE I
TAW
Class:Monday 11:00 AM - 12:20 PM
Wednesday 11:00 AM - 12:20 PM
Lab:Thursday 11:00 AM - 1:50 PM
Room:Theory: 10A-05C
Lab: 09B-08L
5
Remaining
20
Booked

CSE110 - 02
ADU
Class:Sunday 11:00 AM - 12:20 PM
Tuesday 11:00 AM - 12:20 PM
Lab:Thursday 8:00 AM - 10:50 AM
0
Remaining
`;

const parsed = parser.parsePreconnectText(rawSample);
console.log('Test 1 (Parser):', Object.keys(parsed));
if (!parsed.CSE110 || parsed.CSE110.length !== 2) {
  console.error('FAIL: CSE110 sections not parsed properly');
  process.exit(1);
}
console.log('✓ Parser extracted', parsed.CSE110.length, 'sections for CSE110.');
console.log('  Sec 1:', parsed.CSE110[0].section, parsed.CSE110[0].faculty, parsed.CSE110[0].seats_remaining, 'seats');
console.log('  Sec 2:', parsed.CSE110[1].section, parsed.CSE110[1].faculty, parsed.CSE110[1].seats_remaining, 'seats');

// Test 2: Generator with real Fall 2026 dataset
const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/sample_fall2026.json'), 'utf8'));
console.log('Loaded Fall 2026 courses:', Object.keys(dataset));

// Filter a small subset to test fast combinatorial generation
const testSubset = {
  CSE110: dataset.CSE110.slice(0, 4),
  CSE230: dataset.CSE230.slice(0, 4),
  EEE101: dataset.EEE101.slice(0, 3),
  EEE101L: dataset.EEE101L.slice(0, 3),
  MAT120: dataset.MAT120.slice(0, 4)
};

const genResult = generator.generateRoutines(testSubset);
console.log('Test 2 (Generator): Generated', genResult.routines.length, 'valid routines from subset.');
if (genResult.routines.length === 0) {
  console.error('FAIL: No routines generated');
  process.exit(1);
}

// Test 3: Ranker & 100-mark evaluation
const ranked = ranker.rankRoutines(genResult.routines);
console.log('Test 3 (Ranker): Ranked', ranked.length, 'routines.');
const topRoutine = ranked[0];
console.log(`✓ Top Routine Rank #${topRoutine.rank}: Score ${topRoutine.score}/100 [${topRoutine.grade}]`);
console.log(`  Days (${topRoutine.evalData.totalDays}): ${topRoutine.evalData.activeDays.join(' - ')}`);
console.log('  Breakdown:', topRoutine.evalData.breakdown);

if (topRoutine.score < 0 || topRoutine.score > 100) {
  console.error('FAIL: Score out of bounds (must be 0-100)');
  process.exit(1);
}

// Test 4: PDF Export
const pdfMetadata = {
  semester: 'Fall 2026',
  courses: ['CSE110', 'CSE230', 'EEE101', 'EEE101L', 'MAT120'],
  maxExportCount: 5,
  filename: path.join(__dirname, 'test_output.pdf')
};

// In Node, we can generate the buffer/arraybuffer and save to disk
const { jsPDF } = require('jspdf');
require('jspdf-autotable');
const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
// Run pdf export logic directly
const outputPath = path.join(__dirname, 'test_output.pdf');
pdfExport.generateRoutinePdf(ranked, { ...pdfMetadata, filename: outputPath });
console.log('Test 4 (PDF): PDF generated successfully.');
if (fs.existsSync(outputPath)) {
  const stats = fs.statSync(outputPath);
  console.log('✓ PDF file created at:', outputPath, 'Size:', stats.size, 'bytes');
  if (stats.size < 1000) {
    console.error('FAIL: PDF file too small');
    process.exit(1);
  }
} else {
  console.error('FAIL: PDF file not created');
  process.exit(1);
}

console.log('--- ALL NODE UNIT TESTS PASSED SUCCESSFULLY! ---');

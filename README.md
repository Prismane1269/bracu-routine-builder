# RoutineCraft — Automated University Routine Builder & 100-Mark Evaluator 🎓

> **A fast, client-side combinatorial schedule solver and routine evaluator with live database sync, 100-mark scoring, and 1-click multi-routine PDF export.**

[![GitHub Pages](https://img.shields.io/badge/Hosted%20on-GitHub%20Pages-blue?style=flat&logo=github)](https://prismane1269.github.io/bracu-routine-builder/)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](https://opensource.org/licenses/MIT)

---

## 🌐 Live Website
👉 **[Open RoutineCraft on GitHub Pages](https://prismane1269.github.io/bracu-routine-builder/)**

---

## ✨ Key Features

- **🟢 Live Database Synchronization**:
  - Automatically fetches the full live course catalog (796 courses, 2,668+ sections) in real time.
  - Updates live seats, capacity, enrolled counts, faculties, theory timings, and lab rooms with a single click ("🔄 Refresh Live Seats").
  - Instant course search & autocomplete: simply type any course code (e.g. `CSE110`, `MAT120`, `CSE230`, `EEE101`) to immediately load all its sections with live seat status—no manual schedule typing required!

- **⚡ Combinatorial Conflict Solver**:
  - Uses minute-accurate interval overlap checking (`max(startA, startB) < min(endA, endB)`) across intersecting weekdays.
  - Backtracking combinatorial search finds every single valid combination across all selected courses.
  - Exclude full sections (`Seats = 0`), lock specific sections, or choose preferred days off with 1 click.

- **💯 Transparent 100-Mark Evaluation System**:
  - Each routine combination is scored out of **100 marks** with letter grades (`A+`, `A`, `B+`, `B`, `C`, `D`):
    - **Day Efficiency & Spacing (35 pts)**: High rewards for 3-day and well-spaced 4-day routines.
    - **Early Finish & Departure (25 pts)**: Bonus for finishing by 1:50 PM or 3:20 PM; avoids late evening dismissals.
    - **Schedule Compactness & Minimized Idle Gaps (15 pts)**: Penalizes long campus wait times between classes.
    - **Morning Comfort (15 pts)**: Avoids stressful 8:00 AM rush hour commutes.
    - **Lab & Theory Balance (10 pts)**: Rewards dedicated or balanced lab days.

- **📄 1-Click Consolidated PDF Report**:
  - Built-in `jspdf` and `jspdf-autotable` engine running **100% client-side** in your browser.
  - Generates a clean, professional PDF containing:
    - Cover page & generation metadata.
    - Routines ranked from highest evaluated marks to lowest.
    - 5-category marks breakdown table for each routine.
    - Course & section summary table with live seat numbers.
    - Weekly Timetable Matrix (Sunday to Saturday with off-days highlighted as `[ FREE DAY 🌴 ]`).
  - Option to export Top 10, Top 25, Top 50, or All valid combinations into a single PDF document.

- **🔒 100% Client-Side & Private**:
  - Zero backend servers, zero database tracking, and zero latency. All computations and PDF exports occur directly inside your browser.

---

## 🚀 Local Development & Testing

1. Clone the repository:
   ```bash
   git clone https://github.com/Prismane1269/bracu-routine-builder.git
   cd bracu-routine-builder
   ```

2. Run the unit and end-to-end tests:
   ```bash
   node test_node.js
   node test_e2e.js
   ```

3. Serve locally:
   ```bash
   npx serve .
   # or
   python3 -m http.server 8080
   ```
   Open `http://localhost:8080` in any browser.

---

## 📜 License
MIT License. Built for university students looking for the ultimate stress-free class routine!

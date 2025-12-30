📋 Project: LifeLogger Ultimate (Output Streak & Continuous Tasks)
1. Upgrade Overview (升级概览)
This update integrates two major features:

Output System: Track deliverables (Code, Article) with a "Daily Streak" to motivate productivity.

Continuous Tasks: Allow users to easily "Continue" an existing long-term task (e.g., "Learn C++") without re-typing the title, and view them as a series.

2. Database Schema (数据库扩展)
A. timelogs Collection: Update schema to support output type and project_ref.

JSON

{
  "_id": "...",
  "date": "YYYY-MM-DD",
  "record_type": "time" | "money" | "output", // 3种核心类型

  // 1. Time Log (Updated for Continuity)
  "time_data": {
    "title": "Learn C++",
    "duration_min": 60,
    "is_project": true,      // New: Marks this as a reusable project name
    "tags": ["Study", "Urgent"]
  },

  // 2. Output Log (New)
  "output_data": {
    "title": "Finished ThreadPool Demo",
    "type": "code",          // code, article, video
    "link": "github.com/...",
    "satisfaction": 5        // 1-5 stars
  },
  
  // 3. Money Log (Existing)
  "money_data": { ... }
}
3. Feature 1: Continuous Task Recording (连续任务优化)
UX Problem: User has to type "C++ Learning" every time. UX Solution: "Quick Pick" Chips in Editor.

UI Changes (Editor Page - Time Tab):

Input Area: "Task Title" (Input).

New Feature: "Ongoing Projects" (Chips/Tags) below the input.

Logic: On page load, query the database for distinct time_data.title where is_project == true (Limit to last 5-10 distinct tasks).

Interaction: Clicking a chip (e.g., "Learn C++") auto-fills the "Task Title" input.

Checkbox: "Save as Continuous Project?" (Defaults to checked if selected from chips).

4. Feature 2: Output & Gamification (产出与激励)
UI Changes (Editor Page - Output Tab):

Add a 3rd Tab: [ 🏆 产出 ].

Form: Title, Type Selector (Code/Article/Other), Satisfaction Slider.

UI Changes (Home Page):

Header: Add "🔥 Streak: X Days".

Logic: Count consecutive days (backwards from today) where record_type == 'output' exists.

Card Style:

Time Cards: Blue border (Standard).

Money Cards: Red/Green text (Standard).

Output Cards: Gold/Yellow Background or Border + 🏆 Icon (Premium look).

5. Implementation Steps for AI (AI 执行指令)
Please refactor the code in the following order:

Step 1 (Cloud Functions):

Update getRecords (or create getProjects) to return a list of distinct, recent task titles for the "Quick Pick" feature.

Create getStreak to calculate the current output streak.

Step 2 (Editor Page):

Tab Logic: Handle 3 Tabs (Time, Money, Output).

Time Tab: Implement the "Quick Pick" chips. Fetch recent projects on onLoad and fill title on tap.

Output Tab: Implement the new form.

Step 3 (Home Page):

Header: Display the Streak count.

List: Render output items with the special "Gold" styling.
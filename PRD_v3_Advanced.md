Project: LifeLogger Upgrade V3 (Task Priority & Finance Stats)
1. Upgrade Objectives (升级目标)
Task Management: Implement "Eisenhower Matrix" (Four Quadrants) and "Continuous Task Tracking" with completion status.

Finance Analysis: Implement "Grouped Display" (Foldable Lists by Week/Month) with auto-calculation of totals.

2. Database Schema Changes (数据库变更)
A. Update life_records Collection: Add the following fields to the existing schema:

JSON

{
  // ... existing fields ...
  
  // For Task/Study Logs (record_type == 'time')
  "task_info": {
    "is_continuous": true,          // Boolean: Is this a long-term project?
    "parent_task_name": "Learn C++",// String: Grouping key for long-term tasks
    "priority": 1,                  // Number: 1-4 (Eisenhower Matrix)
                                    // 1: Urgent & Important (红色)
                                    // 2: Not Urgent but Important (橙色 - 长期学习通常属此类)
                                    // 3: Urgent not Important (蓝色)
                                    // 4: Not Urgent not Important (灰色)
    "status": "done"                // String: 'doing' (default) | 'done' (crossed out)
  },

  // For Finance Logs (record_type == 'money')
  // No new schema needed, but frontend needs aggregation logic.
}
3. Feature 1: Task Management (任务管理逻辑)
UI Changes (Editor Page):

Add a "Priority Selector" (Radio Group or 4-Color Grid):

🔴 紧急重要 (Do First)

🟠 重要不紧急 (Schedule) -> Default for Learning

🔵 紧急不重要 (Delegate)

⚪️ 不重要不紧急 (Delete)

Add a "Mark as Finished" checkbox in the list view (or swipe action).

UI Changes (Home Page List):

Visual Cues: The left border of the task card should change color based on priority.

Strike-through: If status == 'done', the title should have a line-through style (e.g., text-decoration: line-through) and turn gray.

4. Feature 2: Finance Grouping & Stats (消费统计与折叠)
Logic Requirement (Critical): Instead of a flat list [item1, item2, item3], the Home Page data structure must be transformed into a Nested Grouping:

JavaScript

// Target Data Structure for Rendering
groupedList = [
  {
    header: "2025-12 Week 4",    // Group Title
    total_income: 5000,          // Calculated Sum
    total_expense: 200,          // Calculated Sum
    expanded: true,              // Toggle for folding/unfolding
    items: [ ...records... ]     // Original records in this group
  },
  {
    header: "2025-12 Week 3",
    total_income: 0,
    total_expense: 150,
    expanded: false,             // Folded by default
    items: [ ... ]
  }
]
UI Changes (Home Page):

Header Bar: A clickable bar for each group showing "Date Range" and "Weekly/Monthly Total".

Interaction: Clicking the header toggles the visibility of the items list below it.

Switcher: Add a toggle at the top of Home Page: [ 按周查看 | 按月查看 ].

5. Implementation Instructions for AI (AI 执行指令)
Step 1 (Schema & Editor): Modify editor page to include the Priority Selector (1-4). Save this to the DB.

Step 2 (Data Processing): Modify index.js. Create a helper function processRecords(records, groupByMode) that:

Sorts records by date.

Groups them by Week or Month.

Calculates totals for each group.

Step 3 (Home UI): Rewrite index.wxml to render the groupedList. Use a nested wx:for (Outer loop for groups, Inner loop for items). Implement the "Fold/Expand" click handler.
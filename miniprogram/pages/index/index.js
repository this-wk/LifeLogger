// index.js
const app = getApp()

Page({
  data: {
    currentTab: 'time', // 'time' | 'money' | 'output'
    
    // Independent View States
    timeViewMode: 'project', // 'timeline' | 'project'
    timeGroupMode: 'week',   // 'week' | 'month'
    
    moneyGroupMode: 'month', // Independent for Money
    outputGroupMode: 'month', // Independent for Output
    
    // Data Containers
    timeGroups: [],     
    projectGroups: [],  
    
    moneyGroups: [],
    outputGroups: [],
    
    loading: true,
    streak: 0, 
    
    totalExpense: 0,
    budget: 0,
    budgetPercent: 0
  },

  onShow: function() {
    this.loadBudget()
    this.loadLogs()
    this.calculateStreak()
  },

  switchTab: function(e) {
    this.setData({ currentTab: e.currentTarget.dataset.tab })
  },

  // Switch between Timeline and Project View (Deprecated direct call, handled in switchGroupMode)
  switchViewMode: function(e) {
    // Left for compatibility if needed, but logic moved to switchGroupMode
    this.setData({ timeViewMode: e.currentTarget.dataset.mode })
  },

  switchGroupMode: function(e) {
    const mode = e.currentTarget.dataset.mode
    const tab = this.data.currentTab
    
    if (tab === 'time') {
      if (mode === 'project') {
        this.setData({ timeViewMode: 'project' })
      } else {
        // Switch to Timeline (Week/Month)
        const needReload = (mode !== this.data.timeGroupMode)
        this.setData({ 
          timeViewMode: 'timeline',
          timeGroupMode: mode 
        }, () => {
          if (needReload) this.loadLogs()
        })
      }
    } 
    else if (tab === 'money') {
      if (mode === this.data.moneyGroupMode) return
      this.setData({ moneyGroupMode: mode }, () => this.loadLogs())
    }
    else if (tab === 'output') {
      if (mode === this.data.outputGroupMode) return
      this.setData({ outputGroupMode: mode }, () => this.loadLogs())
    }
  },

  loadBudget: function() {
    const budget = wx.getStorageSync('monthly_budget') || 2000
    this.setData({ budget })
  },

  onSetBudget: function() {
    wx.showModal({
      title: '设置本月预算', editable: true, content: String(this.data.budget),
      success: (res) => {
        if (res.confirm && res.content) {
          const newBudget = Number(res.content)
          if (!isNaN(newBudget) && newBudget > 0) {
            wx.setStorageSync('monthly_budget', newBudget)
            this.setData({ budget: newBudget })
            this.calculateBudgetStats() 
          }
        }
      }
    })
  },

  // Expand/Collapse Group
  toggleGroup: function(e) {
    const { index, type } = e.currentTarget.dataset 
    let key = 'timeGroups'
    if (type === 'money') key = 'moneyGroups'
    if (type === 'output') key = 'outputGroups'
    if (type === 'project') key = 'projectGroups' // Handle Project expansion
    
    const groups = this.data[key]
    this.setData({ [`${key}[${index}].expanded`]: !groups[index].expanded })
  },

  loadLogs: function() {
    this.setData({ loading: true })
    const db = wx.cloud.database()
    
    // 1. Query Logs
    const logsPromise = db.collection('timelogs')
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()

    // 2. Query Project Meta (Status)
    // In a real app, you might want to filter this, but for now fetching all is fine for small scale
    const projectsPromise = db.collection('projects').get().catch(() => ({ data: [] })) 

    Promise.all([logsPromise, projectsPromise])
      .then(([logsRes, projectsRes]) => {
        const rawLogs = logsRes.data
        const projectMetaList = projectsRes.data
        const processed = this.processLogs(rawLogs)
        
        // 1. Regular Grouping (Timeline) - Using Independent Modes
        const timeGroups = this.groupRecords(processed.timeLogs, this.data.timeGroupMode)
        const moneyGroups = this.groupRecords(processed.moneyLogs, this.data.moneyGroupMode)
        const outputGroups = this.groupRecords(processed.outputLogs, this.data.outputGroupMode)

        // 2. Project Aggregation (Merge with Meta)
        const projectGroups = this.aggregateProjects(processed.timeLogs, projectMetaList)

        this.setData({
          timeGroups,
          projectGroups,
          moneyGroups,
          outputGroups,
          loading: false,
          rawMoneyLogs: processed.moneyLogs
        })

        this.calculateBudgetStats()
      })
      .catch(err => {
        console.error(err)
        this.setData({ loading: false })
      })
  },

  // Aggregate time logs by Title & Merge Status
  aggregateProjects: function(timeLogs, projectMetaList = []) {
    const projectMap = {}
    
    // Create a map for quick status lookup: { "Learn C++": "done", ... }
    const metaMap = {}
    projectMetaList.forEach(p => { metaMap[p.title] = p })

    timeLogs.forEach(log => {
      const title = log.activity
      if (!projectMap[title]) {
        const meta = metaMap[title] || {}
        projectMap[title] = {
          title: title,
          totalDuration: 0,
          count: 0,
          lastUpdate: log.rawDate,
          items: [], // History
          expanded: false,
          status: meta.status || 'doing', // 'doing' | 'done'
          metaId: meta._id // Store ID for quicker updates if available
        }
      }
      
      const p = projectMap[title]
      p.totalDuration += (log.duration || 0)
      p.count += 1
      p.items.push(log)
      if (log.rawDate > p.lastUpdate) p.lastUpdate = log.rawDate
    })

    // Convert to array and Sort
    return Object.values(projectMap)
      .sort((a, b) => {
        // Sort 'doing' before 'done'
        if (a.status !== b.status) return a.status === 'done' ? 1 : -1
        return b.lastUpdate - a.lastUpdate
      })
      .map(p => {
        const d = p.lastUpdate
        p.lastUpdateStr = `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        return p
      })
  },

  // Toggle Project Status
  onToggleProjectStatus: function(e) {
    const { title, status, index } = e.currentTarget.dataset
    const newStatus = status === 'done' ? 'doing' : 'done'
    
    // 1. Optimistic UI Update
    this.setData({
      [`projectGroups[${index}].status`]: newStatus
    })

    const db = wx.cloud.database()
    const projectsCol = db.collection('projects')

    // 2. Find and Update/Insert
    // Since we don't always have _id in the UI (if it was just created from logs), we query by title first
    projectsCol.where({ title: title }).get()
      .then(res => {
        if (res.data.length > 0) {
          // Update existing
          projectsCol.doc(res.data[0]._id).update({ data: { status: newStatus } })
        } else {
          // Insert new
          projectsCol.add({ data: { title: title, status: newStatus } })
        }
      })
      .catch(err => {
         console.error("Project status sync failed", err)
         // Check if error is due to missing collection
         if (err.errMsg && err.errMsg.includes('Collection not found')) {
           wx.showModal({ title: '提示', content: '请先在云开发控制台创建 "projects" 集合以保存项目状态。', showCancel: false })
         }
      })
  },

  processLogs: function(rawLogs) {
    const timeLogs = [], moneyLogs = [], outputLogs = []
    rawLogs.forEach(log => {
      const date = new Date(log.createTime)
      const dateStr = `${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
      const formattedLog = Object.assign({}, log, { dateStr, rawDate: date })

      if (log.recordType === 'money') {
        moneyLogs.push(formattedLog)
      } else if (log.recordType === 'output') {
        outputLogs.push(formattedLog)
      } else {
        timeLogs.push(formattedLog)
      }
    })
    return { timeLogs, moneyLogs, outputLogs }
  },

  groupRecords: function(records, mode) {
    const groups = {} 
    records.forEach(item => {
      let groupKey = '', groupTitle = ''
      const d = item.rawDate
      
      if (mode === 'week') {
        // Find Monday of the current week (Assuming Mon-Sun week)
        const day = d.getDay() || 7; // Get current day number, converting Sun(0) to 7
        if (day !== 1) d.setHours(0,0,0,0); // Reset time to avoid drift when calculating
        
        const monday = new Date(d); 
        monday.setDate(d.getDate() - (day - 1));
        monday.setHours(0,0,0,0); // Ensure Monday is at 00:00:00

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        // Key: Use Monday timestamp for sorting
        groupKey = `WEEK-${monday.getTime()}`
        
        // Title: "2025.12.29 - 01.04"
        const mMon = monday.getMonth() + 1
        const mDay = monday.getDate()
        const sMon = sunday.getMonth() + 1
        const sDay = sunday.getDate()
        
        groupTitle = `${monday.getFullYear()}.${String(mMon).padStart(2,'0')}.${String(mDay).padStart(2,'0')} - ${String(sMon).padStart(2,'0')}.${String(sDay).padStart(2,'0')}`

      } else {
        const year = d.getFullYear()
        const month = d.getMonth() + 1
        groupKey = `${year}-${String(month).padStart(2, '0')}`
        groupTitle = `${year}年 ${month}月`
      }
      
      if (!groups[groupKey]) groups[groupKey] = { title: groupTitle, key: groupKey, items: [], totalAmount: 0, totalDuration: 0, expanded: true }
      groups[groupKey].items.push(item)
      if (item.amount) groups[groupKey].totalAmount += Number(item.amount)
      if (item.duration) groups[groupKey].totalDuration += Number(item.duration)
    })
    return Object.keys(groups).sort().reverse().map(key => {
      const g = groups[key]
      g.totalAmount = g.totalAmount.toFixed(2)
      return g
    })
  },

  calculateStreak: function() {
    const db = wx.cloud.database()
    // Count ALL record types for streak (Time/Money/Output)
    db.collection('timelogs')
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()
      .then(res => {
        const dates = res.data.map(d => new Date(d.createTime).toDateString())
        const uniqueDates = [...new Set(dates)] 
        let streak = 0
        const today = new Date().toDateString()
        const yesterday = new Date(Date.now() - 86400000).toDateString()
        
        if (uniqueDates.length > 0) {
          // Check if the latest record is today or yesterday
          if (uniqueDates[0] === today || uniqueDates[0] === yesterday) {
            streak = 1
            let currentDate = new Date(uniqueDates[0])
            for (let i = 1; i < uniqueDates.length; i++) {
              const prevDate = new Date(uniqueDates[i])
              // Calculate difference in days (normalize to midnight)
              const diffTime = Math.abs(currentDate - prevDate)
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) 
              
              if (diffDays === 1) { 
                streak++
                currentDate = prevDate 
              } else { 
                break 
              }
            }
          }
        }
        this.setData({ streak })
    })
  },

  calculateBudgetStats: function() {
    const moneyLogs = this.data.rawMoneyLogs || []
    const total = moneyLogs.reduce((acc, cur) => acc + (cur.amount || 0), 0)
    let percent = (this.data.budget > 0) ? (total / this.data.budget) * 100 : 0
    this.setData({ totalExpense: total.toFixed(2), budgetPercent: Math.min(percent, 100).toFixed(1) })
  },

  goToEdit: function(e) { wx.navigateTo({ url: `/pages/create/create?id=${e.currentTarget.dataset.id}` }) },
  goToCreate: function() { wx.navigateTo({ url: '/pages/create/create' }) },

  // New Action: Continue Project
  onContinueProject: function(e) {
    const title = e.currentTarget.dataset.title
    wx.navigateTo({
      url: `/pages/create/create?title=${title}`
    })
  },

  // Toggle Task Status (Done/Doing)
  onToggleTaskStatus: function(e) {
    const { id, status } = e.currentTarget.dataset
    const newStatus = status === 'done' ? 'doing' : 'done'
    
    // 1. Optimistic UI Update (Update local data first)
    this.updateLocalTaskStatus(id, newStatus)

    // 2. Cloud Update
    const db = wx.cloud.database()
    db.collection('timelogs').doc(id).update({
      data: {
        'task_info.status': newStatus
      }
    }).catch(err => {
      console.error("Status update failed:", err)
      // Revert on failure if needed (optional)
      this.updateLocalTaskStatus(id, status) 
      wx.showToast({ title: '更新失败', icon: 'none' })
    })
  },

  updateLocalTaskStatus: function(id, newStatus) {
    // Helper to update status in a list of groups
    const updateGroups = (groupsKey) => {
      const groups = this.data[groupsKey] || []
      let found = false
      
      for (let i = 0; i < groups.length; i++) {
        const items = groups[i].items
        for (let j = 0; j < items.length; j++) {
          if (items[j]._id === id) {
            // Found the item, update it
            const path = `${groupsKey}[${i}].items[${j}].task_info.status`
            this.setData({ [path]: newStatus })
            found = true
            break
          }
        }
        if (found) break
      }
    }

    // Update both Timeline and Project views
    updateGroups('timeGroups')
    updateGroups('projectGroups')
  }
})
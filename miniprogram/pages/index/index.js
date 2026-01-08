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
    
    // 1. Query Logs (Use Cloud Function to bypass 20-limit, up to 1000)
    const logsPromise = wx.cloud.callFunction({
      name: 'lifeDataHelper',
      data: {
        action: 'getRecords',
        collection: 'timelogs',
        limit: 1000 
      }
    }).then(res => res.result)

    // 2. Query Project Meta
    const projectsPromise = wx.cloud.callFunction({
      name: 'lifeDataHelper',
      data: { action: 'getProjects' }
    }).then(res => res.result).catch(() => ({ data: [] }))

    Promise.all([logsPromise, projectsPromise])
      .then(([logsRes, projectsRes]) => {
        const rawLogs = logsRes.data || []
        const projectMetaList = projectsRes.data || []
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
        // Calculate streak from the data we just loaded
        this.calculateStreak(processed.outputLogs)
      })
      .catch(err => {
        console.error("Load failed", err)
        this.setData({ loading: false })
      })
  },

  // ... (previous methods)

  calculateStreak: function(outputLogs) {
    if (!outputLogs || outputLogs.length === 0) {
      this.setData({ streak: 0 })
      return
    }

    // PRD: Streak is based on 'output' type records
    const dates = outputLogs.map(d => new Date(d.createTime).toDateString())
    const uniqueDates = [...new Set(dates)] 
    
    let streak = 0
    const today = new Date().toDateString()
    const yesterday = new Date(Date.now() - 86400000).toDateString()
    
    // Check if the latest output is today or yesterday to keep the streak alive
    if (uniqueDates[0] === today || uniqueDates[0] === yesterday) {
      streak = 1
      let currentDate = new Date(uniqueDates[0])
      
      for (let i = 1; i < uniqueDates.length; i++) {
        const prevDate = new Date(uniqueDates[i])
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
    this.setData({ streak })
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
        const day = d.getDay() || 7; 
        if (day !== 1) d.setHours(0,0,0,0); 
        
        const monday = new Date(d); 
        monday.setDate(d.getDate() - (day - 1));
        monday.setHours(0,0,0,0); 

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        groupKey = `WEEK-${monday.getTime()}`
        
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

  aggregateProjects: function(timeLogs, projectMetaList = []) {
    const projectMap = {}
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
          items: [], 
          expanded: false,
          status: meta.status || 'doing', 
          metaId: meta._id 
        }
      }
      
      const p = projectMap[title]
      p.totalDuration += (log.duration || 0)
      p.count += 1
      p.items.push(log)
      if (log.rawDate > p.lastUpdate) p.lastUpdate = log.rawDate
    })

    return Object.values(projectMap)
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'done' ? 1 : -1
        return b.lastUpdate - a.lastUpdate
      })
      .map(p => {
        const d = p.lastUpdate
        p.lastUpdateStr = `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        return p
      })
  },

  calculateBudgetStats: function() {
    const moneyLogs = this.data.rawMoneyLogs || []
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() // 0-based index

    const total = moneyLogs.reduce((acc, cur) => {
      // Ensure we compare against the same year and month
      if (cur.rawDate && cur.rawDate.getFullYear() === currentYear && cur.rawDate.getMonth() === currentMonth) {
        return acc + (cur.amount || 0)
      }
      return acc
    }, 0)

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
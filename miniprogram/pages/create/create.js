// pages/create/create.js
const app = getApp()

Page({
  data: {
    editId: null,
    recordType: 'time', 

    // Common Data
    date: '',
    activity: '', 
    note: '',
    
    // Time Mode Data
    duration: '',
    priority: '2',
    isContinuous: false, // User toggle for "Long-term Project"
    recentTasks: [],     

    // Money & Output Data
    amount: '',
    outputType: 'code', 
    satisfaction: 3,    
    link: '',
    
    imagePath: '', 
    hasImage: false
  },

  onLoad: function(options) {
    const now = new Date()
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    
    this.setData({ date: dateStr })
    this.loadRecentProjects()

    // 1. Check for 'id' (Edit Mode)
    if (options.id) {
      this.initEditMode(options.id)
    } 
    // 2. Check for 'title' (Continue Project Mode)
    else if (options.title) {
      this.setData({
        activity: options.title, // Auto-fill title
        recordType: 'time',      // Force Time mode
        isContinuous: true       // Auto-check continuous
      })
      wx.setNavigationBarTitle({ title: '追加记录' })
    }
  },

  // Optimized: Load only tasks marked as continuous/project previously
  loadRecentProjects: function() {
    wx.cloud.callFunction({
      name: 'lifeDataHelper',
      data: {
        action: 'getRecords',
        collection: 'timelogs',
        limit: 100 // Fetch more history to find unique project titles
      }
    }).then(res => {
      const logs = res.result.data || []
      // Filter logs that were marked as continuous
      const titles = logs
        .filter(log => log.recordType === 'time' && log.task_info && log.task_info.is_continuous)
        .map(log => log.activity)
        
      const uniqueTitles = [...new Set(titles)].slice(0, 8)
      this.setData({ recentTasks: uniqueTitles })
    })
  },

  onChipTap: function(e) {
    const title = e.currentTarget.dataset.title
    this.setData({
      activity: title,
      isContinuous: true // Auto-check for chip selection
    })
  },

  onContinuousChange: function(e) {
    this.setData({ isContinuous: !this.data.isContinuous })
  },

  onTypeChange: function(e) {
    this.setData({ recordType: e.currentTarget.dataset.type })
  },

  onPriorityChange: function(e) {
    this.setData({ priority: e.detail.value })
  },
  
  onOutputTypeChange: function(e) {
    this.setData({ outputType: e.detail.value })
  },

  onStarTap: function(e) {
    const score = e.currentTarget.dataset.score
    this.setData({ satisfaction: score })
  },

  initEditMode: function(id) {
    wx.setNavigationBarTitle({ title: '编辑记录' })
    wx.showLoading({ title: '加载中...' })
    
    const db = wx.cloud.database()
    db.collection('timelogs').doc(id).get().then(res => {
      const data = res.data
      const date = new Date(data.createTime)
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      
      this.setData({
        editId: id,
        recordType: data.recordType || 'time',
        activity: data.activity,
        date: dateStr,
        note: data.note,
        imagePath: data.fileID || '',
        hasImage: !!data.fileID
      })

      if (data.recordType === 'time' || !data.recordType) {
        this.setData({
          duration: data.duration,
          priority: data.task_info ? String(data.task_info.priority) : '2',
          isContinuous: data.task_info ? data.task_info.is_continuous : false
        })
      } else if (data.recordType === 'money') {
        this.setData({ amount: data.amount })
      } else if (data.recordType === 'output') {
        this.setData({
          outputType: data.output_data?.type || 'code',
          satisfaction: data.output_data?.satisfaction || 3,
          link: data.output_data?.link || ''
        })
      }

      wx.hideLoading()
    }).catch(err => {
      console.error(err)
      wx.hideLoading()
    })
  },

  onDateChange: function(e) {
    this.setData({ date: e.detail.value })
  },

  onChooseImage: function() {
    wx.chooseImage({
      count: 1, success: (res) => this.setData({ imagePath: res.tempFilePaths[0], hasImage: true })
    })
  },

  onRemoveImage: function() {
    this.setData({ imagePath: '', hasImage: false })
  },

  onSubmit: function(e) {
    const { activity, duration, amount, note, link } = e.detail.value
    const { recordType } = this.data
    
    if (!activity) {
      wx.showToast({ title: '标题不能为空', icon: 'none' }); return
    }

    if (recordType === 'time' && !duration) {
      wx.showToast({ title: '时长不能为空', icon: 'none' }); return
    }
    if (recordType === 'money' && !amount) {
      wx.showToast({ title: '金额不能为空', icon: 'none' }); return
    }

    wx.showLoading({ title: '保存中...' })

    const isNewImage = this.data.hasImage && !this.data.imagePath.startsWith('cloud://')
    if (isNewImage) {
      this.uploadImageAndSave(e.detail.value)
    } else {
      const fileID = this.data.hasImage ? this.data.imagePath : ''
      this.saveRecord(e.detail.value, fileID)
    }
  },

  uploadImageAndSave: function(formData) {
    const suffix = Math.random().toString(36).substring(2);
    const cloudPath = `activity-images/img-${Date.now()}-${suffix}.jpg`
    wx.cloud.uploadFile({
      cloudPath, filePath: this.data.imagePath,
      success: res => this.saveRecord(formData, res.fileID),
      fail: () => wx.hideLoading()
    })
  },

  saveRecord: function(formData, fileID) {
    const db = wx.cloud.database()
    const selectedDate = new Date(this.data.date)
    const now = new Date()
    selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds())

    const data = {
      recordType: this.data.recordType,
      activity: formData.activity,
      note: formData.note,
      createTime: selectedDate,
      fileID: fileID || ''
    }

    if (this.data.recordType === 'time') {
      data.duration = Number(formData.duration)
      data.task_info = {
        priority: Number(this.data.priority),
        status: 'doing',
        is_continuous: this.data.isContinuous // Save the checkbox state
      }
    } else if (this.data.recordType === 'money') {
      data.amount = Number(formData.amount)
    } else if (this.data.recordType === 'output') {
      data.output_data = {
        type: this.data.outputType,
        satisfaction: this.data.satisfaction,
        link: formData.link
      }
    }

    const promise = this.data.editId 
      ? db.collection('timelogs').doc(this.data.editId).update({ data })
      : db.collection('timelogs').add({ data })

    promise.then(() => {
      wx.hideLoading()
      wx.showToast({ title: '保存成功' })
      setTimeout(() => wx.navigateBack(), 1500)
    }).catch(console.error)
  }
})
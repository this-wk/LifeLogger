// cloudfunctions/lifeDataHelper/index.js
const cloud = require('wx-server-sdk')

// 初始化云环境 (Initialize Cloud Environment)
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * Main Entry Point
 * 类似于 C++ 的 main 函数，分发请求
 */
exports.main = async (event, context) => {
  // 获取上下文中的 OPENID (类似于获取当前线程的用户 ID)
  const wxContext = cloud.getWXContext()
  const OPENID = wxContext.OPENID

  // 简单的路由分发 (Router)
  switch (event.action) {
    case 'getRecords':
      return await getRecords(event, OPENID)
    case 'addRecord':
      return await addRecord(event, OPENID)
    case 'updateRecord':
      return await updateRecord(event, OPENID)
    case 'getProjects':
      return await getProjects(event, OPENID)
    default:
      return {
        error: true,
        msg: 'Unknown action'
      }
  }
}

/**
 * 获取记录 (Get Records)
 * 强制加上 _openid 过滤，实现数据隔离
 */
async function getRecords(event, openid) {
  const collectionName = event.collection || 'timelogs'
  const page = event.page || 0
  const limit = event.limit || 100

  try {
    return await db.collection(collectionName)
      .where({
        // CRITICAL: 强制只能查询属于当前用户的记录
        // Equivalent to SQL: WHERE _openid = '...'
        _openid: openid
      })
      .orderBy('createTime', 'desc')
      .skip(page * limit)
      .limit(limit)
      .get()
  } catch (e) {
    console.error(e)
    return { error: true, msg: e.message }
  }
}

/**
 * 添加记录 (Add Record)
 * 显式注入 _openid，确保归属权正确
 */
async function addRecord(event, openid) {
  const collectionName = event.collection || 'timelogs'
  const data = event.data || {}

  try {
    // 强制覆盖/注入 _openid
    // 类似于 C++ 类中的 private 成员赋值，用户无法在外部篡改
    data._openid = openid
    
    // 补充服务器时间 (Server Timestamp)
    if (!data.createTime) {
        data.createTime = db.serverDate()
    }

    return await db.collection(collectionName).add({
      data: data
    })
  } catch (e) {
    console.error(e)
    return { error: true, msg: e.message }
  }
}

/**
 * 更新记录 (Update Record)
 * 确保只能更新自己的数据
 */
async function updateRecord(event, openid) {
  const collectionName = event.collection || 'timelogs'
  const id = event.id
  const data = event.data || {}
  
  // 删除 _openid 防止被恶意修改 (虽然 where 限制了，但为了安全起见)
  delete data._openid

  try {
    return await db.collection(collectionName)
      .where({
        _id: id,
        _openid: openid // Double Check: ID 匹配且 Owner 匹配
      })
      .update({
        data: data
      })
  } catch (e) {
    console.error(e)
    return { error: true, msg: e.message }
  }
}

/**
 * 获取项目状态 (Get Projects)
 */
async function getProjects(event, openid) {
  try {
    return await db.collection('projects')
      .where({
        _openid: openid
      })
      .get()
  } catch (e) {
    return { error: true, msg: e.message }
  }
}

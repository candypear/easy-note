// 主进程入口：设置应用名与数据目录，保证单实例后进入 bootstrap/lifecycle 启动流程。
import { app } from 'electron'
import { start } from './bootstrap/lifecycle'

app.setName('EasyNote')
// 允许通过环境变量重定向 userData，供 E2E/冒烟测试使用隔离的数据目录
if (process.env.EASYNOTE_USER_DATA) {
  app.setPath('userData', process.env.EASYNOTE_USER_DATA)
}

// 单实例锁：避免多进程同时写同一 SQLite/配置文件；抢锁失败直接退出，由已运行实例响应 second-instance
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void start()
}

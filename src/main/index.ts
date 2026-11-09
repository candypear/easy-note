import { app } from 'electron'
import { start } from './bootstrap/lifecycle'

app.setName('EasyNote')
if (process.env.EASYNOTE_USER_DATA) {
  app.setPath('userData', process.env.EASYNOTE_USER_DATA)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void start()
}

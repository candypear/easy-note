// preload 入口：通过 contextBridge 把白名单 API 挂到渲染进程 window.easynote，
// 渲染端不直接接触 ipcRenderer，保持上下文隔离。
import { contextBridge } from 'electron'
import { api } from './api'

contextBridge.exposeInMainWorld('easynote', api)

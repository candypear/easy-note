<script setup lang="ts">
// 双链图谱视图：用 Canvas 2D 渲染力导向布局，支持全局/局部两种模式，
// 以及滚轮缩放、画布平移、节点拖拽、悬停高亮邻居、点击节点跳转笔记。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { GraphDataDTO, GraphNodeDTO } from '@shared/contracts/graph'
import { asNoteId } from '@shared/types/brand'
import { useContext } from '../../../app/providers'
import Icon from '../../../ui/icons/Icon.vue'

// 节点在图坐标系中的位置与速度（vx/vy 仅供力导向模拟迭代使用）
interface Position {
  x: number
  y: number
  vx: number
  vy: number
}

const ctx = useContext()
const { t } = ctx.i18n
const wrap = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const mode = ref<'global' | 'local'>('global')
const depth = ref(1)
const hideOrphans = ref(false)
const data = ref<GraphDataDTO>({ nodes: [], edges: [], truncated: false })
const hoverId = ref<string | null>(null)
// 刻意用普通 Map 而非响应式对象：模拟每轮高频写坐标，走 Vue 代理开销大；
// 画面更新由各处显式调用 draw() 驱动，不依赖响应式追踪。
const positions = new Map<string, Position>()
// 视口变换：scale 缩放，tx/ty 平移（屏幕坐标 = 图坐标 * scale + t）
const view = ref({ scale: 1, tx: 0, ty: 0 })
let resizeObserver: ResizeObserver | null = null
// 当前按压状态：id 为命中的节点（null 表示按在空白处→平移画布）；moved 区分点击与拖拽
let dragging: { id: string | null; startX: number; startY: number; moved: boolean } | null = null
let canvasWidth = 0
let canvasHeight = 0

// 隐藏孤立节点时，只保留至少出现在一条边端点上的节点
const nodes = computed(() => {
  if (!hideOrphans.value) return data.value.nodes
  const connected = new Set<string>()
  for (const edge of data.value.edges) {
    connected.add(edge.source)
    connected.add(edge.target)
  }
  return data.value.nodes.filter((node) => connected.has(node.id))
})

// 两端节点都可见的边才绘制，避免隐藏孤立节点后残留悬空连线
const visibleEdges = computed(() => {
  const allowed = new Set(nodes.value.map((node) => node.id))
  return data.value.edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target))
})

// 节点半径随连接数（degree）增大，封顶 18，避免枢纽节点过大遮挡画面
const radiusOf = (node: GraphNodeDTO): number => Math.min(18, 6 + node.degree * 1.5)

// 拉取图数据并重新布局：局部模式取当前笔记的 N 度邻居，无当前笔记时回退全局
async function load(): Promise<void> {
  if (mode.value === 'local' && !ctx.workspace.currentNoteId) {
    mode.value = 'global'
  }
  const result =
    mode.value === 'local' && ctx.workspace.currentNoteId
      ? await ctx.api.graph.local(asNoteId(ctx.workspace.currentNoteId), depth.value)
      : await ctx.api.graph.global()
  if (result.ok) {
    data.value = result.data
    initPositions()
    // 大图（>600 节点）只跑 40 轮减少同步阻塞，小图跑 240 轮让布局更收敛
    simulate(data.value.nodes.length > 600 ? 40 : 240)
    fit()
  }
}

// 初始位置按索引均匀撒在几圈同心圆上：避免全部叠在原点导致斥力爆炸、布局不稳定
function initPositions(): void {
  positions.clear()
  const total = data.value.nodes.length
  data.value.nodes.forEach((node, index) => {
    const angle = (index / Math.max(total, 1)) * Math.PI * 2
    const radius = total > 1 ? 140 + (index % 7) * 24 : 0
    positions.set(node.id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      vx: 0,
      vy: 0
    })
  })
}

// 简化版力导向布局（Fruchterman-Reingold 思路）：同步迭代若干轮一次性算完，
// 不做逐帧动画，算完直接绘制，避免持续占用主线程。
function simulate(iterations: number): void {
  const list = data.value.nodes
  // 理想边长，同时作为斥力强度系数
  const key = 90

  for (let step = 0; step < iterations; step += 1) {
    // 两两斥力是 O(n²)，超过 600 节点时跳过，只靠弹簧力+向心力近似布局
    if (list.length <= 600) {
      for (let i = 0; i < list.length; i += 1) {
        const a = positions.get(list[i]?.id ?? '')
        if (!a) continue
        for (let j = i + 1; j < list.length; j += 1) {
          const b = positions.get(list[j]?.id ?? '')
          if (!b) continue
          const dx = a.x - b.x
          const dy = a.y - b.y
          // 距离下限取 1，防止重合节点除零/斥力无穷大
          const distance = Math.max(1, Math.hypot(dx, dy))
          // 斥力 ~ k²/d，方向沿两节点连线相互推开
          const force = (key * key) / distance
          const fx = (dx / distance) * force * 0.0015
          const fy = (dy / distance) * force * 0.0015
          a.vx += fx
          a.vy += fy
          b.vx -= fx
          b.vy -= fy
        }
      }
    }

    // 边的弹簧引力：把相连节点拉向理想间距 90
    for (const edge of data.value.edges) {
      const a = positions.get(edge.source)
      const b = positions.get(edge.target)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distance = Math.max(1, Math.hypot(dx, dy))
      const force = (distance - 90) * 0.012
      const fx = (dx / distance) * force
      const fy = (dy / distance) * force
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }

    for (const [, position] of positions) {
      // 向心引力：把节点往原点轻拉，防止不连通的子图越漂越远
      position.vx -= position.x * 0.0015
      position.vy -= position.y * 0.0015
      // 速度阻尼 0.85 让系统逐渐收敛，再按速度积分更新位置
      position.vx *= 0.85
      position.vy *= 0.85
      position.x += position.vx
      position.y += position.vy
    }
  }
}

// 取景：按可见节点的包围盒计算缩放与平移，让整张图居中铺满画布（留 80 边距）
function fit(): void {
  if (nodes.value.length === 0) return
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes.value) {
    const position = positions.get(node.id)
    if (!position) continue
    minX = Math.min(minX, position.x)
    minY = Math.min(minY, position.y)
    maxX = Math.max(maxX, position.x)
    maxY = Math.max(maxY, position.y)
  }
  if (!Number.isFinite(minX)) return
  const padding = 80
  const width = Math.max(1, maxX - minX + padding * 2)
  const height = Math.max(1, maxY - minY + padding * 2)
  // 缩放上限 2.2：节点很少时不至于放大到失真
  const scale = Math.min(canvasWidth / width, canvasHeight / height, 2.2)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  view.value = {
    scale,
    tx: canvasWidth / 2 - centerX * scale,
    ty: canvasHeight / 2 - centerY * scale
  }
  draw()
}

// 屏幕（client）坐标 → 图坐标：减去画布偏移后做视口变换的逆变换
function toGraph(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.value?.getBoundingClientRect()
  const left = rect?.left ?? 0
  const top = rect?.top ?? 0
  return {
    x: (clientX - left - view.value.tx) / view.value.scale,
    y: (clientY - top - view.value.ty) / view.value.scale
  }
}

// 命中检测：返回指针下的节点；半径加 4px 容差，方便点中小节点
function hitTest(clientX: number, clientY: number): GraphNodeDTO | null {
  const point = toGraph(clientX, clientY)
  for (const node of nodes.value) {
    const position = positions.get(node.id)
    if (!position) continue
    const radius = radiusOf(node) + 4
    if (Math.hypot(point.x - position.x, point.y - position.y) <= radius) return node
  }
  return null
}

// 全量重绘：无渲染循环，仅在数据/视口/悬停变化时按需调用
function draw(): void {
  const element = canvas.value
  if (!element) return
  const dpr = window.devicePixelRatio || 1
  const context = element.getContext('2d')
  if (!context) return
  // 按设备像素比设置变换，高分屏下文字和线条不模糊（画布物理尺寸见 resize）
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, canvasWidth, canvasHeight)
  // 每次绘制都从 CSS 变量取色，主题切换后无需额外处理即可跟随新配色
  const styles = getComputedStyle(document.documentElement)
  const accent = styles.getPropertyValue('--accent').trim() || '#2f81f7'
  const border = styles.getPropertyValue('--border-strong').trim() || '#d0d0d0'
  const text = styles.getPropertyValue('--text-secondary').trim() || '#5d5d5d'
  const background = styles.getPropertyValue('--bg-app').trim() || '#ffffff'
  context.fillStyle = background
  context.fillRect(0, 0, canvasWidth, canvasHeight)

  context.save()
  // 进入图坐标系：之后所有绘制直接用节点坐标，线宽/字号除以 scale 保持屏幕像素恒定
  context.translate(view.value.tx, view.value.ty)
  context.scale(view.value.scale, view.value.scale)
  context.lineWidth = 1 / view.value.scale

  for (const edge of visibleEdges.value) {
    const source = positions.get(edge.source)
    const target = positions.get(edge.target)
    if (!source || !target) continue
    // 悬停时与悬停节点相连的边用强调色，其余边压暗以突出局部关系
    const highlighted =
      hoverId.value !== null && (edge.source === hoverId.value || edge.target === hoverId.value)
    context.strokeStyle = highlighted ? accent : border
    context.globalAlpha = hoverId.value && !highlighted ? 0.3 : 0.6
    context.beginPath()
    context.moveTo(source.x, source.y)
    context.lineTo(target.x, target.y)
    context.stroke()
  }

  context.globalAlpha = 1
  for (const node of nodes.value) {
    const position = positions.get(node.id)
    if (!position) continue
    // 悬停时压暗非邻居节点；当前打开的笔记用文字色区别于其他节点的强调色
    const dim = hoverId.value !== null && hoverId.value !== node.id && !isNeighbor(node.id)
    context.globalAlpha = dim ? 0.3 : 1
    context.fillStyle = node.id === ctx.workspace.currentNoteId ? text : accent
    context.beginPath()
    context.arc(position.x, position.y, radiusOf(node), 0, Math.PI * 2)
    context.fill()
    if (node.id === hoverId.value) {
      // 悬停节点外再描一圈光环
      context.strokeStyle = accent
      context.lineWidth = 2 / view.value.scale
      context.beginPath()
      context.arc(position.x, position.y, radiusOf(node) + 3, 0, Math.PI * 2)
      context.stroke()
      context.lineWidth = 1 / view.value.scale
    }
  }

  // 标签只在悬停（仅悬停点及邻居）或放大到 1.3 倍且节点不超过 300 时显示，防止文字糊成一片
  const showLabels = hoverId.value !== null || (view.value.scale > 1.3 && nodes.value.length <= 300)
  if (showLabels) {
    context.globalAlpha = 1
    context.fillStyle = text
    context.font = `${12 / view.value.scale}px var(--font-ui)`
    for (const node of nodes.value) {
      if (hoverId.value !== null && hoverId.value !== node.id && !isNeighbor(node.id)) continue
      const position = positions.get(node.id)
      if (!position) continue
      context.fillText(node.title, position.x + radiusOf(node) + 4, position.y + 4)
    }
  }
  context.restore()
}

// 判断某节点是否与当前悬停节点直接相连（用于高亮邻居）
function isNeighbor(id: string): boolean {
  if (!hoverId.value) return false
  return visibleEdges.value.some(
    (edge) =>
      (edge.source === hoverId.value && edge.target === id) ||
      (edge.target === hoverId.value && edge.source === id)
  )
}

function onPointerDown(event: PointerEvent): void {
  const hit = hitTest(event.clientX, event.clientY)
  dragging = { id: hit?.id ?? null, startX: event.clientX, startY: event.clientY, moved: false }
  // 捕获指针：拖出画布也能持续收到 move/up 事件，拖拽不中断
  canvas.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging) {
    // 未按下时做悬停检测，仅在命中目标变化时重绘，避免每次移动都全量绘制
    const hit = hitTest(event.clientX, event.clientY)
    if (hit?.id !== hoverId.value) {
      hoverId.value = hit?.id ?? null
      draw()
    }
    return
  }
  const dx = event.clientX - dragging.startX
  const dy = event.clientY - dragging.startY
  // 位移超过 2px 才算拖拽，否则松手时按"点击节点"处理
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragging.moved = true
  if (dragging.id) {
    // 拖节点：屏幕位移除以 scale 换算成图坐标位移
    const position = positions.get(dragging.id)
    if (position) {
      position.x += dx / view.value.scale
      position.y += dy / view.value.scale
    }
  } else {
    // 拖空白：平移整个视口
    view.value = { ...view.value, tx: view.value.tx + dx, ty: view.value.ty + dy }
  }
  dragging.startX = event.clientX
  dragging.startY = event.clientY
  draw()
}

function onPointerUp(event: PointerEvent): void {
  // 按在节点上且未拖动 → 视为点击：打开该笔记并切回编辑器视图
  if (dragging && !dragging.moved && dragging.id) {
    ctx.workspace.openNote(dragging.id)
    ctx.shell.setWorkspaceView('editor')
  }
  dragging = null
  canvas.value?.releasePointerCapture(event.pointerId)
}

// 滚轮缩放：以鼠标位置为锚点，缩放前后光标下的图坐标点保持不动；范围 0.2~4 倍
function onWheel(event: WheelEvent): void {
  event.preventDefault()
  const factor = event.deltaY < 0 ? 1.1 : 0.9
  const nextScale = Math.min(4, Math.max(0.2, view.value.scale * factor))
  const rect = canvas.value?.getBoundingClientRect()
  const left = rect?.left ?? 0
  const top = rect?.top ?? 0
  const x = event.clientX - left
  const y = event.clientY - top
  // 由 "x = 图坐标 * scale + tx" 反解新的 tx/ty，实现锚点缩放
  view.value = {
    scale: nextScale,
    tx: x - ((x - view.value.tx) / view.value.scale) * nextScale,
    ty: y - ((y - view.value.ty) / view.value.scale) * nextScale
  }
  draw()
}

function back(): void {
  ctx.workspace.backToNote()
  ctx.shell.setWorkspaceView('editor')
}

function setMode(next: 'global' | 'local'): void {
  mode.value = next
  void load()
}

function setDepth(next: number): void {
  depth.value = next
  void load()
}

function toggleOrphans(): void {
  hideOrphans.value = !hideOrphans.value
  // 可见节点集合变了，下一帧重新取景适配新的包围盒
  requestAnimationFrame(fit)
}

// 画布尺寸跟随容器：物理像素 = CSS 尺寸 × dpr，配合 draw 里的 setTransform 保证清晰度
function resize(): void {
  const element = wrap.value
  const target = canvas.value
  if (!element || !target) return
  const rect = element.getBoundingClientRect()
  canvasWidth = rect.width
  canvasHeight = rect.height
  const dpr = window.devicePixelRatio || 1
  target.width = Math.round(canvasWidth * dpr)
  target.height = Math.round(canvasHeight * dpr)
  target.style.width = `${canvasWidth}px`
  target.style.height = `${canvasHeight}px`
  draw()
}

onMounted(() => {
  resizeObserver = new ResizeObserver(resize)
  if (wrap.value) resizeObserver.observe(wrap.value)
  resize()
  void load()
  // 索引更新（笔记/链接变化）或切换 vault 后重新拉取图数据，保持图谱与库同步
  const off = ctx.events.on('index:updated', () => void load())
  const offVault = ctx.events.on('vault:changed', () => void load())
  stops.push(off, offVault)
})

// 局部图谱以当前笔记为中心，笔记切换时需要重载；全局图谱与当前笔记无关，不必刷新
watch(
  () => ctx.workspace.currentNoteId,
  () => {
    if (mode.value === 'local') void load()
  }
)

const stops: (() => void)[] = []
onBeforeUnmount(() => {
  // 释放事件订阅与尺寸观察，避免离开视图后仍触发加载
  for (const stop of stops) stop()
  resizeObserver?.disconnect()
})
</script>

<template>
  <div class="graph-view">
    <div class="toolbar">
      <div class="segmented">
        <button type="button" :class="{ active: mode === 'global' }" @click="setMode('global')">
          {{ t('graph.global') }}
        </button>
        <button type="button" :class="{ active: mode === 'local' }" @click="setMode('local')">
          {{ t('graph.local') }}
        </button>
      </div>
      <div v-if="mode === 'local'" class="segmented">
        <button
          v-for="value in [1, 2, 3]"
          :key="value"
          type="button"
          :class="{ active: depth === value }"
          @click="setDepth(value)"
        >
          {{ value }}
        </button>
      </div>
      <label class="checkbox">
        <input type="checkbox" :checked="hideOrphans" @change="toggleOrphans" />
        <span>{{ t('graph.hideOrphans') }}</span>
      </label>
      <button class="icon-button" type="button" :aria-label="t('graph.fit')" @click="fit">
        <Icon name="graph" :size="16" />
      </button>
      <div class="spacer" />
      <button class="text-button" type="button" @click="back">{{ t('shell.backToNote') }}</button>
    </div>
    <div v-if="data.truncated" class="warning">{{ t('graph.tooMany') }}</div>
    <div ref="wrap" class="canvas-wrap">
      <canvas
        ref="canvas"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="hoverId = null"
        @wheel="onWheel"
      />
      <div v-if="nodes.length === 0" class="empty">
        <p>{{ t('graph.empty') }}</p>
        <button class="text-button" type="button" @click="back">{{ t('shell.backToNote') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  flex: none;
}

.segmented {
  display: inline-flex;
  height: 28px;
  padding: 2px;
  gap: 2px;
  background: var(--bg-inset);
  border-radius: var(--radius-input);
}

.segmented button {
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: calc(var(--radius-input) - 2px);
  font-size: 12px;
  color: var(--text-secondary);
}

.segmented button.active {
  background: var(--bg-selected);
  font-weight: 500;
  color: var(--text-primary);
}

.checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-input);
  color: var(--text-secondary);
}

.icon-button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.spacer {
  flex: 1;
}

.text-button {
  font-size: 13px;
  color: var(--accent);
}

.text-button:hover {
  text-decoration: underline;
}

.warning {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 12px;
  font-size: 12px;
  color: var(--warning);
  border-bottom: 1px solid var(--border);
  flex: none;
}

.canvas-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

canvas {
  display: block;
  cursor: grab;
}

canvas:active {
  cursor: grabbing;
}

.empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 13px;
}

.empty p {
  margin: 0;
}
</style>

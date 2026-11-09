<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { GraphDataDTO, GraphNodeDTO } from '@shared/contracts/graph'
import { asNoteId } from '@shared/types/brand'
import { useContext } from '../../../app/providers'
import Icon from '../../../ui/icons/Icon.vue'

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
const positions = new Map<string, Position>()
const view = ref({ scale: 1, tx: 0, ty: 0 })
let resizeObserver: ResizeObserver | null = null
let dragging: { id: string | null; startX: number; startY: number; moved: boolean } | null = null
let canvasWidth = 0
let canvasHeight = 0

const nodes = computed(() => {
  if (!hideOrphans.value) return data.value.nodes
  const connected = new Set<string>()
  for (const edge of data.value.edges) {
    connected.add(edge.source)
    connected.add(edge.target)
  }
  return data.value.nodes.filter((node) => connected.has(node.id))
})

const visibleEdges = computed(() => {
  const allowed = new Set(nodes.value.map((node) => node.id))
  return data.value.edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target))
})

const radiusOf = (node: GraphNodeDTO): number => Math.min(18, 6 + node.degree * 1.5)

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
    simulate(data.value.nodes.length > 600 ? 40 : 240)
    fit()
  }
}

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

function simulate(iterations: number): void {
  const list = data.value.nodes
  const key = 90

  for (let step = 0; step < iterations; step += 1) {
    if (list.length <= 600) {
      for (let i = 0; i < list.length; i += 1) {
        const a = positions.get(list[i]?.id ?? '')
        if (!a) continue
        for (let j = i + 1; j < list.length; j += 1) {
          const b = positions.get(list[j]?.id ?? '')
          if (!b) continue
          const dx = a.x - b.x
          const dy = a.y - b.y
          const distance = Math.max(1, Math.hypot(dx, dy))
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
      position.vx -= position.x * 0.0015
      position.vy -= position.y * 0.0015
      position.vx *= 0.85
      position.vy *= 0.85
      position.x += position.vx
      position.y += position.vy
    }
  }
}

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

function toGraph(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.value?.getBoundingClientRect()
  const left = rect?.left ?? 0
  const top = rect?.top ?? 0
  return {
    x: (clientX - left - view.value.tx) / view.value.scale,
    y: (clientY - top - view.value.ty) / view.value.scale
  }
}

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

function draw(): void {
  const element = canvas.value
  if (!element) return
  const dpr = window.devicePixelRatio || 1
  const context = element.getContext('2d')
  if (!context) return
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, canvasWidth, canvasHeight)
  const styles = getComputedStyle(document.documentElement)
  const accent = styles.getPropertyValue('--accent').trim() || '#2383e2'
  const border = styles.getPropertyValue('--border-strong').trim() || '#d3d1cb'
  const text = styles.getPropertyValue('--text-secondary').trim() || '#787774'
  const background = styles.getPropertyValue('--bg-app').trim() || '#ffffff'
  context.fillStyle = background
  context.fillRect(0, 0, canvasWidth, canvasHeight)

  context.save()
  context.translate(view.value.tx, view.value.ty)
  context.scale(view.value.scale, view.value.scale)
  context.lineWidth = 1 / view.value.scale

  for (const edge of visibleEdges.value) {
    const source = positions.get(edge.source)
    const target = positions.get(edge.target)
    if (!source || !target) continue
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
    const dim = hoverId.value !== null && hoverId.value !== node.id && !isNeighbor(node.id)
    context.globalAlpha = dim ? 0.3 : 1
    context.fillStyle = node.id === ctx.workspace.currentNoteId ? text : accent
    context.beginPath()
    context.arc(position.x, position.y, radiusOf(node), 0, Math.PI * 2)
    context.fill()
    if (node.id === hoverId.value) {
      context.strokeStyle = accent
      context.lineWidth = 2 / view.value.scale
      context.beginPath()
      context.arc(position.x, position.y, radiusOf(node) + 3, 0, Math.PI * 2)
      context.stroke()
      context.lineWidth = 1 / view.value.scale
    }
  }

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
  canvas.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging) {
    const hit = hitTest(event.clientX, event.clientY)
    if (hit?.id !== hoverId.value) {
      hoverId.value = hit?.id ?? null
      draw()
    }
    return
  }
  const dx = event.clientX - dragging.startX
  const dy = event.clientY - dragging.startY
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragging.moved = true
  if (dragging.id) {
    const position = positions.get(dragging.id)
    if (position) {
      position.x += dx / view.value.scale
      position.y += dy / view.value.scale
    }
  } else {
    view.value = { ...view.value, tx: view.value.tx + dx, ty: view.value.ty + dy }
  }
  dragging.startX = event.clientX
  dragging.startY = event.clientY
  draw()
}

function onPointerUp(event: PointerEvent): void {
  if (dragging && !dragging.moved && dragging.id) {
    ctx.workspace.openNote(dragging.id)
    ctx.shell.setWorkspaceView('editor')
  }
  dragging = null
  canvas.value?.releasePointerCapture(event.pointerId)
}

function onWheel(event: WheelEvent): void {
  event.preventDefault()
  const factor = event.deltaY < 0 ? 1.1 : 0.9
  const nextScale = Math.min(4, Math.max(0.2, view.value.scale * factor))
  const rect = canvas.value?.getBoundingClientRect()
  const left = rect?.left ?? 0
  const top = rect?.top ?? 0
  const x = event.clientX - left
  const y = event.clientY - top
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
  requestAnimationFrame(fit)
}

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
  const off = ctx.events.on('index:updated', () => void load())
  const offVault = ctx.events.on('vault:changed', () => void load())
  stops.push(off, offVault)
})

watch(
  () => ctx.workspace.currentNoteId,
  () => {
    if (mode.value === 'local') void load()
  }
)

const stops: (() => void)[] = []
onBeforeUnmount(() => {
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
  background: var(--bg-sidebar);
  border-radius: var(--radius-input);
}

.segmented button {
  padding: 0 8px;
  border-radius: 3px;
  font-size: 12px;
  color: var(--text-secondary);
}

.segmented button.active {
  background: var(--bg-app);
  border: 1px solid var(--border);
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

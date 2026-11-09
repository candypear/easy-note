#!/usr/bin/env node
/* Boundary checker: process isolation, module encapsulation, no cycles. */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

const root = process.cwd()
const src = join(root, 'src')
const violations = []

const ALIASES = {
  '@shared/': 'src/shared/',
  '@main/': 'src/main/',
  '@preload/': 'src/preload/',
  '@renderer/': 'src/renderer/'
}

function walk(directory) {
  const result = []
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules') continue
    const full = join(directory, entry)
    if (statSync(full).isDirectory()) result.push(...walk(full))
    else if (['.ts', '.vue'].includes(extname(entry))) result.push(full)
  }
  return result
}

function posix(value) {
  return value.split(sep).join('/')
}

function readImports(file) {
  const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const imports = []
  const pattern = /(?:import|export)\s+(type\s+)?(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]/g
  let match
  while ((match = pattern.exec(text)) !== null) {
    imports.push({ spec: match[2], typeOnly: Boolean(match[1]) })
  }
  const dynamic = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((match = dynamic.exec(text)) !== null) imports.push({ spec: match[1], typeOnly: false })
  return imports
}

function resolveImport(file, spec) {
  let base = null
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (spec.startsWith(alias)) base = join(root, target, spec.slice(alias.length))
  }
  if (!base && spec.startsWith('.')) base = resolve(dirname(file), spec)
  if (!base) return null
  for (const candidate of [base, `${base}.ts`, `${base}.vue`, join(base, 'index.ts'), join(base, 'index.vue')]) {
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      // try next candidate
    }
  }
  return null
}

function layerOf(file) {
  const rel = posix(relative(src, file))
  if (rel.startsWith('shared/')) return 'shared'
  if (rel.startsWith('preload/')) return 'preload'
  if (rel.startsWith('renderer/')) return 'renderer'
  if (rel.startsWith('main/')) return 'main'
  return 'other'
}

function moduleOf(file) {
  const rel = posix(relative(src, file))
  const match = rel.match(/^renderer\/modules\/([^/]+)\//)
  if (match) return { layer: 'renderer', name: match[1] }
  const main = rel.match(/^main\/modules\/([^/]+)\//)
  if (main) return { layer: 'main', name: main[1] }
  if (rel.startsWith('main/platform/')) return { layer: 'platform', name: 'platform' }
  return null
}

const files = walk(src)
const graph = new Map()

for (const file of files) {
  const rel = posix(relative(root, file))
  const layer = layerOf(file)
  const imports = readImports(file)
  const edges = []
  for (const { spec, typeOnly } of imports) {
    const target = resolveImport(file, spec)
    if (target && !typeOnly) edges.push(target)
    const bare = spec.startsWith('node:') || ['electron', 'better-sqlite3', 'chokidar', 'vue', 'fs', 'path'].includes(spec)

    if (layer === 'shared') {
      if (spec.startsWith('@main') || spec.startsWith('@preload') || spec.startsWith('@renderer') || spec === 'electron' || spec.startsWith('node:') || spec.startsWith('vue')) {
        violations.push(`${rel}: shared 不得依赖 ${spec}`)
      }
    }
    if (layer === 'preload') {
      if (spec.startsWith('@main') || spec.startsWith('@renderer') || spec.startsWith('node:') || spec === 'better-sqlite3' || spec === 'chokidar') {
        violations.push(`${rel}: preload 不得依赖 ${spec}`)
      }
    }
    if (layer === 'renderer') {
      if (spec.startsWith('@main') || spec === 'electron' || spec.startsWith('node:') || spec === 'better-sqlite3' || spec === 'chokidar') {
        violations.push(`${rel}: renderer 不得依赖 ${spec}`)
      }
    }
    if (layer === 'main') {
      if (spec.startsWith('@renderer') || spec === 'vue' || spec.startsWith('@tiptap/') || spec.startsWith('vue-')) {
        violations.push(`${rel}: main 不得依赖 ${spec}`)
      }
    }

    const source = moduleOf(file)
    if (source?.layer === 'platform' && spec.startsWith('@main/modules')) {
      violations.push(`${rel}: platform 不得依赖 feature module ${spec}`)
    }
    if (source?.layer === 'main' && spec.startsWith('@main/modules/')) {
      const rest = spec.slice('@main/modules/'.length)
      const [targetModule, ...deep] = rest.split('/')
      if (targetModule !== source.name && deep.length > 0 && !deep.join('/').startsWith('index')) {
        violations.push(`${rel}: 跨模块深层导入 ${spec}`)
      }
    }
    if (source?.layer === 'renderer' && target) {
      const targetModule = moduleOf(target)
      if (targetModule?.layer === 'renderer' && targetModule.name !== source.name) {
        const targetRel = posix(relative(root, target))
        if (!targetRel.endsWith('/index.ts')) {
          violations.push(`${rel}: 跨渲染模块内部导入 ${targetRel}`)
        }
      }
    }
    if (bare && layer === 'other') {
      violations.push(`${rel}: 未知层依赖 ${spec}`)
    }
  }
  graph.set(file, edges)
}

const forbiddenDirs = ['utils', 'common', 'services', 'components']
for (const directory of forbiddenDirs) {
  try {
    statSync(join(src, directory))
    if (directory === 'components') continue
    violations.push(`src/${directory} 为禁止的大杂烩目录`)
  } catch {
    // absent
  }
}

const visiting = new Set()
const visited = new Set()
function visit(file, stack) {
  if (visiting.has(file)) {
    const cycle = [...stack, file].map((item) => posix(relative(root, item)))
    violations.push(`循环依赖: ${cycle.join(' -> ')}`)
    return
  }
  if (visited.has(file)) return
  visiting.add(file)
  stack.push(file)
  for (const next of graph.get(file) ?? []) visit(next, stack)
  stack.pop()
  visiting.delete(file)
  visited.add(file)
}
for (const file of files) visit(file, [])

if (violations.length > 0) {
  for (const violation of violations) console.error(`✗ ${violation}`)
  process.exit(1)
}
console.log(`✓ boundaries ok (${files.length} files)`)

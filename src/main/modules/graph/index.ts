// 图谱模块：把笔记间的链接关系聚合为图数据，提供全局图谱与以某笔记为中心的局部图谱。
// 只读模块：数据来自 note 列表与 link 索引，自身不建表。
import type { MainContext, MainModule } from '@main/bootstrap/types'
import type { GraphDataDTO, GraphEdgeDTO, GraphNodeDTO } from '@shared/contracts/graph'
import { GraphChannels } from '@shared/contracts/graph'
import type { NoteId } from '@shared/types/brand'
import type { NoteSummary } from '@shared/contracts/note'
import { asNoteId } from '@shared/types/brand'
import { AppError } from '@main/platform/errors'

const MAX_NODES = 2000

export class GraphService {
  constructor(private readonly ctx: MainContext) {}

  async global(): Promise<GraphDataDTO> {
    return this.buildGraph(await this.ctx.services.note.listAll())
  }

  // 局部图谱：把有向链接当作无向邻接做 BFS，按深度（限制 1~3 层）扩展，
  // 只保留两端都在访问集合内的边
  async local(noteId: NoteId, depth: number): Promise<GraphDataDTO> {
    const notes = await this.ctx.services.note.listAll()
    const edges = this.ctx.services.link.edges()
    const allowedDepth = Math.min(3, Math.max(1, Math.round(depth)))
    const adjacency = new Map<NoteId, Set<NoteId>>()
    for (const edge of edges) {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set())
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set())
      adjacency.get(edge.source)?.add(edge.target)
      adjacency.get(edge.target)?.add(edge.source)
    }
    const visited = new Set<NoteId>([noteId])
    let frontier: NoteId[] = [noteId]
    for (let level = 0; level < allowedDepth; level += 1) {
      const next: NoteId[] = []
      for (const id of frontier) {
        for (const neighbor of adjacency.get(id) ?? []) {
          if (visited.has(neighbor)) continue
          visited.add(neighbor)
          next.push(neighbor)
        }
      }
      frontier = next
    }
    return this.buildGraph(
      notes.filter((note) => visited.has(note.id)),
      edges.filter((edge) => visited.has(edge.source) && visited.has(edge.target))
    )
  }

  // 汇总边并统计节点度数；超过上限时按度数降序保留重要节点并标记 truncated，
  // 避免大图拖垮前端渲染
  private buildGraph(
    notes: NoteSummary[],
    sourceEdges?: { source: NoteId; target: NoteId }[]
  ): GraphDataDTO {
    const edgesSource = sourceEdges ?? this.ctx.services.link.edges()
    const byId = new Map(notes.map((note) => [note.id, note]))
    const degree = new Map<NoteId, number>()
    const edges: GraphEdgeDTO[] = []
    for (const edge of edgesSource) {
      if (!byId.has(edge.source) || !byId.has(edge.target)) continue
      edges.push({ source: edge.source, target: edge.target, weight: 1 })
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
    }
    let nodes: GraphNodeDTO[] = notes.map((note) => ({
      id: note.id,
      title: note.title,
      path: note.path,
      folderPath: note.folderPath,
      degree: degree.get(note.id) ?? 0
    }))
    let truncated = false
    if (nodes.length > MAX_NODES) {
      truncated = true
      nodes = [...nodes].sort((a, b) => b.degree - a.degree).slice(0, MAX_NODES)
      const allowed = new Set(nodes.map((node) => node.id))
      return {
        nodes,
        edges: edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target)),
        truncated
      }
    }
    return { nodes, edges, truncated }
  }
}

export interface GraphModule extends MainModule {
  service: GraphService
}

export function createGraphModule(ctx: MainContext): GraphModule {
  const service = new GraphService(ctx)
  return {
    id: 'graph',
    migrations: [],
    service,
    registerIpc(ipc) {
      ipc.handle(GraphChannels.global, () => service.global())
      ipc.handle(GraphChannels.local, (payload) => {
        if (!payload || typeof payload !== 'object' || !('noteId' in payload) || !('depth' in payload)) {
          throw new AppError('INVALID_REQUEST')
        }
        return service.local(asNoteId(String(payload.noteId)), Number(payload.depth))
      })
    }
  }
}

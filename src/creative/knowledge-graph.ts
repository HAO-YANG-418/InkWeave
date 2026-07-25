// ============================================================
// 知识图谱 — GWE v6.0 创意跳跃层
// 核心能力：构建作品中角色、地点、事件、概念之间的关联网络
// 从孤立的事实到互连的知识——让AI理解作品的内在结构
// ============================================================

import {
  type KnowledgeNode,
  type KnowledgeNodeType,
  type KnowledgeGraphConfig,
} from './types'

// ============================================================
// 默认配置
// ============================================================

const DEFAULT_KNOWLEDGE_GRAPH_CONFIG: KnowledgeGraphConfig = {
  maxNodes: 1000,
  autoPrune: true,
  minAccessCount: 2,
}

// ============================================================
// 知识图谱
// ============================================================

export class KnowledgeGraph {
  private nodes: Map<string, KnowledgeNode> = new Map()
  private config: KnowledgeGraphConfig

  constructor(config?: Partial<KnowledgeGraphConfig>) {
    this.config = { ...DEFAULT_KNOWLEDGE_GRAPH_CONFIG, ...config }
  }

  /**
   * 添加节点
   */
  addNode(
    name: string,
    type: KnowledgeNodeType,
    attributes: Record<string, string> = {},
    connections: string[] = [],
  ): KnowledgeNode {
    const id = this.generateId(name, type)
    const now = Date.now()

    const node: KnowledgeNode = {
      id,
      name,
      type,
      attributes,
      connections,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    }

    this.nodes.set(id, node)
    this.pruneIfNeeded()

    return node
  }

  /**
   * 获取节点
   */
  getNode(id: string): KnowledgeNode | undefined {
    const node = this.nodes.get(id)
    if (node) {
      node.lastAccessedAt = Date.now()
      node.accessCount++
    }
    return node
  }

  /**
   * 按名称和类型查找
   */
  findByName(name: string, type?: KnowledgeNodeType): KnowledgeNode[] {
    const results: KnowledgeNode[] = []
    for (const node of this.nodes.values()) {
      if (node.name === name && (!type || node.type === type)) {
        node.lastAccessedAt = Date.now()
        node.accessCount++
        results.push(node)
      }
    }
    return results
  }

  /**
   * 按类型查找所有节点
   */
  findByType(type: KnowledgeNodeType): KnowledgeNode[] {
    const results: KnowledgeNode[] = []
    for (const node of this.nodes.values()) {
      if (node.type === type) {
        results.push(node)
      }
    }
    return results
  }

  /**
   * 模糊搜索
   */
  search(query: string, limit = 10): KnowledgeNode[] {
    const lowerQuery = query.toLowerCase()
    const results: KnowledgeNode[] = []

    for (const node of this.nodes.values()) {
      if (node.name.toLowerCase().includes(lowerQuery)) {
        results.push(node)
      }
    }

    // 按访问频次排序
    results.sort((a, b) => b.accessCount - a.accessCount)
    return results.slice(0, limit)
  }

  /**
   * 添加连接
   */
  addConnection(sourceId: string, targetId: string): boolean {
    const source = this.nodes.get(sourceId)
    const target = this.nodes.get(targetId)

    if (!source || !target) return false

    if (!source.connections.includes(targetId)) {
      source.connections.push(targetId)
    }
    if (!target.connections.includes(sourceId)) {
      target.connections.push(sourceId)
    }

    return true
  }

  /**
   * 移除连接
   */
  removeConnection(sourceId: string, targetId: string): boolean {
    const source = this.nodes.get(sourceId)
    const target = this.nodes.get(targetId)

    if (!source || !target) return false

    source.connections = source.connections.filter(c => c !== targetId)
    target.connections = target.connections.filter(c => c !== sourceId)
    return true
  }

  /**
   * 获取节点的邻居（n度关系）
   */
  getNeighbors(nodeId: string, depth = 1): KnowledgeNode[] {
    const visited = new Set<string>()
    const result: KnowledgeNode[] = []
    let currentLevel = [nodeId]
    visited.add(nodeId)

    for (let d = 0; d < depth; d++) {
      const nextLevel: string[] = []

      for (const id of currentLevel) {
        const node = this.nodes.get(id)
        if (!node) continue

        for (const connId of node.connections) {
          if (!visited.has(connId)) {
            visited.add(connId)
            const connNode = this.nodes.get(connId)
            if (connNode) {
              result.push(connNode)
              nextLevel.push(connId)
            }
          }
        }
      }

      currentLevel = nextLevel
      if (currentLevel.length === 0) break
    }

    return result
  }

  /**
   * 查找两个节点之间的最短路径
   */
  findPath(fromId: string, toId: string, maxDepth = 5): string[] | null {
    if (fromId === toId) return [fromId]

    const queue: Array<{ id: string; path: string[] }> = [{ id: fromId, path: [fromId] }]
    const visited = new Set<string>([fromId])

    while (queue.length > 0) {
      const current = queue.shift()!
      const node = this.nodes.get(current.id)

      if (!node) continue

      for (const connId of node.connections) {
        if (connId === toId) {
          return [...current.path, connId]
        }

        if (!visited.has(connId) && current.path.length < maxDepth) {
          visited.add(connId)
          queue.push({ id: connId, path: [...current.path, connId] })
        }
      }
    }

    return null
  }

  /**
   * 获取知识点摘要
   */
  getSummary(nodeId: string): string | null {
    const node = this.nodes.get(nodeId)
    if (!node) return null

    const neighbors = this.getNeighbors(nodeId, 1)
    const typeLabel = this.getTypeLabel(node.type)

    let summary = `【${typeLabel}】${node.name}\n`
    if (Object.keys(node.attributes).length > 0) {
      summary += `  属性: ${Object.entries(node.attributes).map(([k, v]) => `${k}=${v}`).join(', ')}\n`
    }
    if (neighbors.length > 0) {
      summary += `  关联: ${neighbors.map(n => n.name).join(' → ')}\n`
    }

    return summary
  }

  /**
   * 生成上下文提示词
   */
  generateContextPrompt(nodeIds: string[]): string {
    const parts: string[] = []

    for (const id of nodeIds) {
      const summary = this.getSummary(id)
      if (summary) {
        parts.push(summary)
      }
    }

    if (parts.length === 0) return ''

    return `【作品知识图谱】\n${parts.join('\n')}`
  }

  /**
   * 移除节点
   */
  removeNode(id: string): boolean {
    const node = this.nodes.get(id)
    if (!node) return false

    // 移除所有连接
    for (const connId of node.connections) {
      const connNode = this.nodes.get(connId)
      if (connNode) {
        connNode.connections = connNode.connections.filter(c => c !== id)
      }
    }

    this.nodes.delete(id)
    return true
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalNodes: number
    totalConnections: number
    byType: Record<string, number>
    avgConnections: number
  } {
    const totalNodes = this.nodes.size
    let totalConnections = 0
    const byType: Record<string, number> = {}

    for (const node of this.nodes.values()) {
      totalConnections += node.connections.length
      byType[node.type] = (byType[node.type] || 0) + 1
    }

    // 每条连接被计数两次，除以2
    totalConnections = Math.floor(totalConnections / 2)

    return {
      totalNodes,
      totalConnections,
      byType,
      avgConnections: totalNodes > 0 ? totalConnections / totalNodes : 0,
    }
  }

  /**
   * 清空图谱
   */
  clear(): void {
    this.nodes.clear()
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private generateId(name: string, type: KnowledgeNodeType): string {
    const base = `${type}_${name}`.replace(/[^a-zA-Z\u4e00-\u9fa5_]/g, '_')
    const timestamp = Date.now().toString(36)
    return `${base}_${timestamp}`
  }

  private getTypeLabel(type: KnowledgeNodeType): string {
    const labels: Record<KnowledgeNodeType, string> = {
      character: '角色',
      location: '地点',
      event: '事件',
      item: '物品',
      concept: '概念',
      relationship: '关系',
      faction: '势力',
      rule: '规则',
    }
    return labels[type] || type
  }

  /**
   * 自动清理低访问频次节点
   */
  private pruneIfNeeded(): void {
    if (!this.config.autoPrune) return
    if (this.nodes.size <= this.config.maxNodes) return

    // 按访问频次排序，清理最低频的
    const sorted = Array.from(this.nodes.entries())
      .sort((a, b) => a[1].accessCount - b[1].accessCount)

    const toRemove = this.nodes.size - this.config.maxNodes
    for (let i = 0; i < toRemove && i < sorted.length; i++) {
      const [id, node] = sorted[i]
      if (node.accessCount < this.config.minAccessCount) {
        this.removeNode(id)
      }
    }
  }
}
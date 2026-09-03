// ============================================================
// GWE V2.0 - 冲突/依赖验证器
// 验证选项间的依赖(requires)和冲突(conflicts)关系
// ============================================================

import type {
  NodeId,
  OptionId,
  NodeOptionKB,
  ValidationResult,
  ConflictInfo,
  DependencyInfo,
} from './types';
import { getAllNodes, getNodeOption } from './node-registry';

/**
 * 验证当前选项选择是否合法
 * @param selections 用户选择的节点->选项映射
 * @param loadedOptions 已加载的选项KB数据（如果不传则从全局注册表取）
 * @returns ValidationResult 包含conflicts和missingDeps列表
 */
export function validate(
  selections: Record<NodeId, OptionId>,
  loadedOptions?: Map<OptionId, NodeOptionKB>
): ValidationResult {
  const conflicts: ConflictInfo[] = [];
  const missingDeps: DependencyInfo[] = [];

  // 收集所有被选中的optionId集合
  const selectedOptionIds = new Set<OptionId>(Object.values(selections));

  // 构建 optionId -> nodeId 反向映射（用于错误提示）
  const optionToNode = new Map<OptionId, NodeId>();
  for (const [nodeId, optionId] of Object.entries(selections)) {
    optionToNode.set(optionId, nodeId as NodeId);
  }

  // 遍历所有选中的选项，检查requires和conflicts
  for (const [nodeId, optionId] of Object.entries(selections)) {
    const nid = nodeId as NodeId;

    // 获取选项KB数据
    let kb = loadedOptions?.get(optionId);
    if (!kb) {
      kb = getNodeOption(optionId);
    }
    if (!kb) {
      // 选项KB未加载，跳过（可能是用户还没加载对应的.kb文件）
      continue;
    }

    // ---- 检查依赖(requires) ----
    if (kb.requires && kb.requires.length > 0) {
      for (const requiredOpt of kb.requires) {
        if (!selectedOptionIds.has(requiredOpt)) {
          const reqNodeId = findNodeForOption(requiredOpt) || nid;
          missingDeps.push({
            optionId,
            nodeId: nid,
            requiredOption: requiredOpt,
            message: `选项 "${optionId}" (节点 ${nid}) 依赖选项 "${requiredOpt}" (节点 ${reqNodeId})，但该选项未被选中`,
          });
        }
      }
    }

    // ---- 检查冲突(conflicts) ----
    if (kb.conflicts && kb.conflicts.length > 0) {
      for (const conflictOpt of kb.conflicts) {
        if (selectedOptionIds.has(conflictOpt)) {
          const conflictNodeId = optionToNode.get(conflictOpt) || findNodeForOption(conflictOpt) || nid;
          // 避免重复记录（A和B冲突只记录一次）
          const alreadyRecorded = conflicts.some(
            (c) =>
              (c.optionA === optionId && c.optionB === conflictOpt) ||
              (c.optionA === conflictOpt && c.optionB === optionId)
          );
          if (!alreadyRecorded) {
            conflicts.push({
              optionA: optionId,
              optionB: conflictOpt,
              nodeA: nid,
              nodeB: conflictNodeId,
              message: `选项 "${optionId}" (节点 ${nid}) 与选项 "${conflictOpt}" (节点 ${conflictNodeId}) 冲突，不能同时选中`,
            });
          }
        }
      }
    }
  }

  return {
    valid: conflicts.length === 0 && missingDeps.length === 0,
    conflicts,
    missingDeps,
  };
}

/**
 * 根据optionId查找它所属的nodeId
 * 遍历所有节点定义，查找options列表中包含该optionId的节点
 */
function findNodeForOption(optionId: OptionId): NodeId | null {
  const allNodes = getAllNodes();
  for (const node of allNodes) {
    if (node.options.includes(optionId)) {
      return node.id;
    }
  }
  return null;
}

/**
 * 格式化验证结果为人类可读字符串（用于UI提示）
 */
export function formatValidationResult(result: ValidationResult): string {
  if (result.valid) {
    return '配置验证通过，无冲突或缺失依赖。';
  }

  const lines: string[] = [];

  if (result.missingDeps.length > 0) {
    lines.push(`【缺失依赖】(${result.missingDeps.length}项)`);
    for (const dep of result.missingDeps) {
      lines.push(`  - ${dep.message}`);
    }
  }

  if (result.conflicts.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`【选项冲突】(${result.conflicts.length}项)`);
    for (const c of result.conflicts) {
      lines.push(`  - ${c.message}`);
    }
  }

  return lines.join('\n');
}

/**
 * 快速检查：某个optionId是否可以安全选中
 * 返回true表示无冲突且依赖满足
 */
export function canSelectOption(
  optionId: OptionId,
  selections: Record<NodeId, OptionId>,
  loadedOptions?: Map<OptionId, NodeOptionKB>
): { canSelect: boolean; reason?: string } {
  // 模拟将该选项加入selections
  const nodeId = findNodeForOption(optionId);
  if (!nodeId) {
    return { canSelect: false, reason: `选项 "${optionId}" 不属于任何已注册节点` };
  }

  const testSelections = { ...selections, [nodeId]: optionId };
  const result = validate(testSelections, loadedOptions);

  if (!result.valid) {
    const issues: string[] = [];
    result.conflicts.forEach((c) => {
      if (c.optionA === optionId || c.optionB === optionId) {
        issues.push(c.message);
      }
    });
    result.missingDeps.forEach((d) => {
      if (d.optionId === optionId) {
        issues.push(d.message);
      }
    });
    return {
      canSelect: false,
      reason: issues.join('; ') || '存在未知冲突或依赖问题',
    };
  }

  return { canSelect: true };
}

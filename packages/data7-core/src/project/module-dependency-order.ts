import { DependencyScanner } from "../analysis/dependency-scanner";
import {
  ASTWalker,
  type CompilationUnit,
  type ImportsDeclaration,
  type MemberAccess,
  type MethodInvocation,
  type Node,
  type TypeReference,
} from "./ast/ast";
import { parseBasic } from "./parser";

export interface ModuleCompileUnit {
  readonly name: string;
  readonly code: string;
}

interface ModuleDependencyBuckets {
  readonly imports: readonly string[];
  readonly usages: readonly string[];
}

/**
 * Collects workspace namespace dependencies from already-transpiled module code.
 * Considers explicit `Imports`, qualified type references (`mod_foo.TBar`),
 * and qualified member access (`mod_foo.Printe`).
 */
export function collectModuleNamespaceDependencies(code: string): readonly string[] {
  const buckets = collectModuleNamespaceDependencyBuckets(code);
  return [...new Set([...buckets.imports, ...buckets.usages])];
}

export function collectModuleNamespaceDependenciesFromUnit(
  unit: CompilationUnit,
): readonly string[] {
  const buckets = collectModuleNamespaceDependencyBucketsFromUnit(unit);
  return [...new Set([...buckets.imports, ...buckets.usages])];
}

/**
 * Orders build modules so every declared namespace appears before modules that
 * consume it. The Data7 native compiler processes `<Modulos>` linearly and
 * fails when a namespace is referenced before its declaration.
 */
export function topologicalSortModulesByNamespaceDependency<T extends ModuleCompileUnit>(
  modules: readonly T[],
  onWarning: (message: string) => void,
): T[] {
  if (modules.length <= 1) return [...modules];

  const namespaceDeclaredByIndex = new Map<string, number>();
  const dependencyBucketsByIndex: ModuleDependencyBuckets[] = Array.from(
    { length: modules.length },
    () => ({ imports: [], usages: [] }),
  );

  for (let i = 0; i < modules.length; i++) {
    const module = modules[i]!;
    for (const namespace of extractDeclaredNamespaces(module.code)) {
      namespaceDeclaredByIndex.set(namespace.toLowerCase(), i);
    }
    dependencyBucketsByIndex[i] = collectModuleNamespaceDependencyBuckets(module.code);
  }

  const declaredNamespaces = new Set(namespaceDeclaredByIndex.keys());
  const usageEdges = buildDependencyEdges(
    modules,
    dependencyBucketsByIndex,
    namespaceDeclaredByIndex,
    declaredNamespaces,
    "usages",
  );
  const importEdges = buildDependencyEdges(
    modules,
    dependencyBucketsByIndex,
    namespaceDeclaredByIndex,
    declaredNamespaces,
    "imports",
  );

  const mergedEdges = mergeEdgesPreferringUsageConstraints(usageEdges, importEdges);
  const { result, hasCycle } = runKahnTopologicalSort(modules, mergedEdges);

  if (hasCycle) {
    const remaining = modules.filter((module) => !result.includes(module));
    onWarning(
      `Ordenação de módulos: ciclo de dependência detectado entre [${remaining
        .map((module) => module.name)
        .join(", ")}]. A ordem de compilação pode estar incorreta para esses módulos.`,
    );
    result.push(...remaining);
  }

  return result;
}

function collectModuleNamespaceDependencyBuckets(code: string): ModuleDependencyBuckets {
  try {
    const { unit } = parseBasic(code);
    return collectModuleNamespaceDependencyBucketsFromUnit(unit);
  } catch {
    return { imports: [], usages: [] };
  }
}

function collectModuleNamespaceDependencyBucketsFromUnit(
  unit: CompilationUnit,
): ModuleDependencyBuckets {
  const collector = new ModuleNamespaceDependencyCollector();
  collector.collect(unit);
  return {
    imports: Array.from(collector.imports),
    usages: Array.from(collector.usages),
  };
}

function extractDeclaredNamespaces(code: string): readonly string[] {
  try {
    const { unit } = parseBasic(code);
    return unit.members
      .filter((member) => member.kind === "NamespaceDeclaration")
      .map((member) => member.name);
  } catch {
    return [];
  }
}

interface DependencyGraph {
  readonly edges: Set<number>[];
  readonly outDegree: number[];
}

function buildDependencyEdges<T extends ModuleCompileUnit>(
  modules: readonly T[],
  dependencyBucketsByIndex: readonly ModuleDependencyBuckets[],
  namespaceDeclaredByIndex: ReadonlyMap<string, number>,
  declaredNamespaces: ReadonlySet<string>,
  bucket: keyof ModuleDependencyBuckets,
): DependencyGraph {
  const edges: Set<number>[] = Array.from({ length: modules.length }, () => new Set<number>());
  const outDegree = new Array<number>(modules.length).fill(0);

  for (let i = 0; i < modules.length; i++) {
    const ownNamespaces = new Set(
      extractDeclaredNamespaces(modules[i]!.code).map((namespace) => namespace.toLowerCase()),
    );

    for (const dependency of dependencyBucketsByIndex[i]?.[bucket] ?? []) {
      const dependencyLower = dependency.toLowerCase();
      if (!isWorkspaceNamespaceDependency(dependencyLower, declaredNamespaces)) continue;
      if (ownNamespaces.has(dependencyLower)) continue;

      const root = dependencyLower.split(".")[0] ?? dependencyLower;
      const depIdx =
        namespaceDeclaredByIndex.get(dependencyLower) ?? namespaceDeclaredByIndex.get(root);
      if (depIdx === undefined || depIdx === i) continue;

      if (!edges[depIdx]!.has(i)) {
        edges[depIdx]!.add(i);
        const currentOutDegree = outDegree[depIdx];
        if (currentOutDegree !== undefined) outDegree[depIdx] = currentOutDegree + 1;
      }
    }
  }

  return { edges, outDegree };
}

function mergeEdgesPreferringUsageConstraints(
  usageEdges: DependencyGraph,
  importEdges: DependencyGraph,
): DependencyGraph {
  const edges: Set<number>[] = usageEdges.edges.map((usageSet) => new Set(usageSet));
  const outDegree = [...usageEdges.outDegree];

  for (let depIdx = 0; depIdx < importEdges.edges.length; depIdx++) {
    for (const consumerIdx of importEdges.edges[depIdx] ?? []) {
      if (edges[depIdx]!.has(consumerIdx)) continue;

      edges[depIdx]!.add(consumerIdx);
      const currentOutDegree = outDegree[depIdx];
      if (currentOutDegree !== undefined) outDegree[depIdx] = currentOutDegree + 1;

      if (hasDependencyCycle(edges)) {
        edges[depIdx]!.delete(consumerIdx);
        const rolledBackOutDegree = outDegree[depIdx];
        if (rolledBackOutDegree !== undefined) outDegree[depIdx] = rolledBackOutDegree - 1;
      }
    }
  }

  return { edges, outDegree };
}

function runKahnTopologicalSort<T extends ModuleCompileUnit>(
  modules: readonly T[],
  graph: DependencyGraph,
): { result: T[]; hasCycle: boolean } {
  const inDegree = new Array<number>(modules.length).fill(0);
  for (let depIdx = 0; depIdx < graph.edges.length; depIdx++) {
    for (const consumerIdx of graph.edges[depIdx] ?? []) {
      const currentInDegree = inDegree[consumerIdx];
      if (currentInDegree !== undefined) inDegree[consumerIdx] = currentInDegree + 1;
    }
  }

  const ready: number[] = [];
  for (let i = 0; i < modules.length; i++) {
    if ((inDegree[i] ?? 0) === 0) ready.push(i);
  }
  ready.sort((left, right) => compareReadyIndices(left, right, graph.outDegree));

  const result: T[] = [];
  while (ready.length > 0) {
    const idx = ready.shift()!;
    result.push(modules[idx]!);

    for (const neighbor of graph.edges[idx] ?? []) {
      const currentInDegree = inDegree[neighbor];
      const nextInDegree = currentInDegree !== undefined ? currentInDegree - 1 : 0;
      inDegree[neighbor] = nextInDegree;
      if (nextInDegree === 0) {
        insertReadyIndex(ready, neighbor, graph.outDegree);
      }
    }
  }

  return { result, hasCycle: result.length < modules.length };
}

function hasDependencyCycle(edges: readonly Set<number>[]): boolean {
  const inDegree = new Array<number>(edges.length).fill(0);
  for (let depIdx = 0; depIdx < edges.length; depIdx++) {
    for (const consumerIdx of edges[depIdx] ?? []) {
      const currentInDegree = inDegree[consumerIdx];
      if (currentInDegree !== undefined) inDegree[consumerIdx] = currentInDegree + 1;
    }
  }

  const queue: number[] = [];
  for (let i = 0; i < edges.length; i++) {
    if ((inDegree[i] ?? 0) === 0) queue.push(i);
  }

  let visited = 0;
  while (queue.length > 0) {
    const idx = queue.shift()!;
    visited++;
    for (const neighbor of edges[idx] ?? []) {
      const currentInDegree = inDegree[neighbor];
      const nextInDegree = currentInDegree !== undefined ? currentInDegree - 1 : 0;
      inDegree[neighbor] = nextInDegree;
      if (nextInDegree === 0) queue.push(neighbor);
    }
  }

  return visited < edges.length;
}

function isWorkspaceNamespaceDependency(
  dependencyLower: string,
  declaredNamespaces: ReadonlySet<string>,
): boolean {
  const root = dependencyLower.split(".")[0] ?? dependencyLower;
  if (DependencyScanner.isIgnoredNamespace(root)) return false;
  return declaredNamespaces.has(dependencyLower) || declaredNamespaces.has(root);
}

function compareReadyIndices(left: number, right: number, outDegree: readonly number[]): number {
  const outDiff = (outDegree[right] ?? 0) - (outDegree[left] ?? 0);
  if (outDiff !== 0) return outDiff;
  return left - right;
}

function insertReadyIndex(ready: number[], index: number, outDegree: readonly number[]): void {
  let insertAt = ready.length;
  for (let i = 0; i < ready.length; i++) {
    if (compareReadyIndices(index, ready[i]!, outDegree) < 0) {
      insertAt = i;
      break;
    }
  }
  ready.splice(insertAt, 0, index);
}

class ModuleNamespaceDependencyCollector extends ASTWalker {
  public readonly imports = new Set<string>();
  public readonly usages = new Set<string>();

  public collect(unit: CompilationUnit): void {
    for (const member of unit.members) {
      if (member.kind === "ImportsDeclaration") {
        this.visitImportsDeclaration(member);
      }
    }
    this.walk(unit);
  }

  protected override visitImportsDeclaration(node: ImportsDeclaration): void {
    if (node.target.trim().length > 0) {
      this.addNamespaceReference(node.target, this.imports);
    }
  }

  protected override visitTypeReference(node: TypeReference): void {
    this.addNamespaceReference(node.name, this.usages);
    super.visitTypeReference(node);
  }

  protected override visitMethodInvocation(node: MethodInvocation): void {
    if (node.callee?.kind === "Identifier" && node.callee.name.trim().length > 0) {
      this.addNamespaceReference(node.callee.name, this.usages);
    }
    super.visitMethodInvocation(node);
  }

  public override walk(node: Node): void {
    if (node.kind === "MemberAccess") {
      this.collectMemberAccess(node);
      return;
    }
    super.walk(node);
  }

  private collectMemberAccess(node: MemberAccess): void {
    if (node.target.kind === "Identifier" && node.target.name.trim().length > 0) {
      this.addNamespaceReference(node.target.name, this.usages);
      return;
    }
    super.walk(node.target);
  }

  private addNamespaceReference(rawName: string | undefined, bucket: Set<string>): void {
    const trimmed = rawName?.trim();
    if (!trimmed) return;

    const root = trimmed.split(".")[0];
    if (!root) return;
    bucket.add(root);

    if (trimmed.includes(".")) {
      bucket.add(trimmed);
    }
  }
}

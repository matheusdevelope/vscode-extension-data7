import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { TypeResolver } from "../../analysis/type-resolver";
import { detectEnumerable } from "../../analysis/enumerable-detector";
import { lookupSystemByName } from "../../system-library";
import { GenericsMonomorphizer } from "../../project/generics/monomorphizer";
import { parseBasic, serializeUnitWithMap } from "../../project/parser";
import type { TranspileContext } from "../../project/transpiler";
import type { ClassGenericMethodRequest } from "../../project/generics/monomorphizer";
import { loadFixture } from "./fixtures";
import { registerOpenDocument } from "./mock-doc";

export interface ArrayListWorkspaceOptions {
  readonly usageSources: readonly string[];
  readonly requestedInstantiations: readonly {
    readonly templateName: string;
    readonly typeArgs: readonly string[];
  }[];
}

export interface ArrayListWorkspace {
  readonly indexer: WorkspaceSymbolIndexer;
  readonly transpileCtx: TranspileContext;
  readonly monomorphizedTtListSource: string;
}

const TT_LIST_TEMPLATE = { templateName: "TTList", typeParams: ["T"] } as const;

function qualifyGenericMethodRequests(
  requests: readonly ClassGenericMethodRequest[],
  namespace: string,
  localTypes: readonly string[],
): ClassGenericMethodRequest[] {
  return requests.map((request) => ({
    ...request,
    ownerConcreteArgs: request.ownerConcreteArgs.map((typeRef) => ({
      ...typeRef,
      name: localTypes.includes(typeRef.name) ? `${namespace}.${typeRef.name}` : typeRef.name,
    })),
    methodConcreteArgs: request.methodConcreteArgs.map((typeRef) => ({
      ...typeRef,
      name: localTypes.includes(typeRef.name) ? `${namespace}.${typeRef.name}` : typeRef.name,
    })),
  }));
}

/**
 * Builds a detached workspace that mirrors builder-time TTList monomorphization:
 * generic template stub + flat instantiations + chained Map/Reduce method requests.
 */
export function createArrayListWorkspace(options: ArrayListWorkspaceOptions): ArrayListWorkspace {
  const stub = loadFixture("array-list/ttlist-stub.bas");
  const requestedClassGenericMethods =
    GenericsMonomorphizer.collectWorkspaceClassGenericMethodRequests({
      genericTemplateSources: [stub],
      usageSources: options.usageSources,
      requestedInstantiations: options.requestedInstantiations.map((entry) => ({
        templateName: entry.templateName,
        typeArgs: [...entry.typeArgs],
      })),
    });

  const monomorph = new GenericsMonomorphizer({
    requestedInstantiations: options.requestedInstantiations.map((entry) => ({
      templateName: entry.templateName,
      typeArgs: [...entry.typeArgs],
    })),
    requestedClassGenericMethods,
  }).monomorphize(parseBasic(stub).unit);

  const monomorphizedTtListSource = serializeUnitWithMap(monomorph.unit, { eol: "\n" }).code;
  const indexer = WorkspaceSymbolIndexer.createDetached();
  indexer.updateFileContent("file:///mod_tlist.bas", monomorphizedTtListSource);

  const transpileCtx: TranspileContext = {
    detectEnumerable(typeName, preferredElementType) {
      return detectEnumerable(
        typeName,
        (type) => TypeResolver.getAllMembersForType(type, indexer),
        preferredElementType,
      );
    },
    isTypeDescendantOf(typeName, baseTypeName) {
      return TypeResolver.isSubclassOf(typeName, baseTypeName, indexer);
    },
    resolveTypeImport(typeName) {
      if (typeName === "TTList" || typeName.startsWith("TTList_")) return "mod_tlist";
      return undefined;
    },
    resolveGlobalSymbolType(name, argumentCount) {
      return (
        indexer.findSymbolByName(name)?.type ??
        lookupSystemByName(name).find(
          (symbol) =>
            !symbol.containerName &&
            (!symbol.parameters || symbol.parameters.length === argumentCount),
        )?.type
      );
    },
    resolveMemberType(typeName, name, argumentCount) {
      return TypeResolver.findMember(typeName, name, indexer, argumentCount)?.type;
    },
    resolveListElementType(typeName) {
      return TypeResolver.resolveListElementType(typeName, indexer);
    },
    externalGenericTemplates: [
      { name: TT_LIST_TEMPLATE.templateName, typeParams: [...TT_LIST_TEMPLATE.typeParams] },
    ],
    requestedGenericInstantiations: options.requestedInstantiations.map((entry) => ({
      templateName: entry.templateName,
      typeArgs: [...entry.typeArgs],
    })),
    requestedClassGenericMethods,
  };

  return { indexer, transpileCtx, monomorphizedTtListSource };
}

export function createArrayListWorkspaceForExample(
  exampleSource: string,
  namespace: string,
  localTypes: readonly string[],
  requestedInstantiations: ArrayListWorkspaceOptions["requestedInstantiations"],
): ArrayListWorkspace {
  const workspace = createArrayListWorkspace({
    usageSources: [exampleSource],
    requestedInstantiations,
  });
  const qualifiedRequests = qualifyGenericMethodRequests(
    workspace.transpileCtx.requestedClassGenericMethods ?? [],
    namespace,
    localTypes,
  );
  return {
    ...workspace,
    transpileCtx: {
      ...workspace.transpileCtx,
      requestedClassGenericMethods: qualifiedRequests,
    },
  };
}

export function indexExampleInWorkspace(
  workspace: ArrayListWorkspace,
  uri: string,
  exampleSource: string,
): void {
  registerOpenDocument(uri);
  registerOpenDocument("file:///mod_tlist.bas", "mod_tlist.bas");
  workspace.indexer.updateFileContent(uri, exampleSource);
}

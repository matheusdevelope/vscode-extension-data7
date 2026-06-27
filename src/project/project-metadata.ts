/**
 * Shared TypeScript shapes for the `data7.json` project descriptor and the
 * `.7Proj` virtual folder/module metadata. Owned by this module so Builder and
 * Decompiler do not have a circular dependency through their typing.
 */

export interface VirtualFolder {
  nome: string;
  id: string;
  /** Parent folder ID. Empty string for the root folder. */
  pastaId: string;
  aberta: string;
}

export interface ModuleMetadata {
  nome: string;
  aberto: boolean;
  ordemAbertura: number;
  pastaId: string;
}

export interface ProjectOptions {
  autor: string;
  versao: string;
  informacoes: string;
  codEmpresa: number;
  codFilial: number;
  nomeUsuario: string;
  preScript: string;
  identificacaoBancoDados: string;
  minify?: boolean;
  stripComments?: boolean;
}

export interface ProjectBuildOptimizationMinify {
  enabled?: boolean;
  stripComments?: boolean;
  removeUnused?: boolean;
  mergeNamespaces?: boolean;
}

export interface ProjectBuildOptimizationUglify {
  enabled?: boolean;
}

export interface ProjectBuildOptimization {
  sourceMap?: boolean;
  minify?: ProjectBuildOptimizationMinify;
  uglify?: ProjectBuildOptimizationUglify;
}

export interface ProjectBuildOptions {
  optimization?: ProjectBuildOptimization;
}

export interface ProjectMetadata {
  nome: string;
  language: string;
  version: string;
  targetPlatform: string;
  opcoes: ProjectOptions;
  virtualFolders: VirtualFolder[];
  modulesMetadata: Record<string, ModuleMetadata>;
  dependencies?: Record<string, string>;
  build?: ProjectBuildOptions;
}

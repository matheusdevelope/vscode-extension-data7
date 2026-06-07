import type { GenericTemplateInfo } from "./generics-analyzer";

export const VIRTUAL_TEMPLATES: Record<string, GenericTemplateInfo> = {
  tlist: {
    kind: "class",
    name: "TList",
    typeParams: ["T"],
    line: 0,
  },
};

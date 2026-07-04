import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "System.Classes",
    kind: "namespace",
    type: "System.Classes",
    isShared: true,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description:
      "Namespace contendo as classes bases de persistência e strings do Delphi (TObject, TPersistent, TStrings, TStringList).",
  },
];

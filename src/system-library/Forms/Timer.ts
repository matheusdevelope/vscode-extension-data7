import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Timer",
    kind: "class",
    type: "Timer",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Forms",
    inheritsFrom: "TComponent",
    description:
      "Componente não-visual que dispara um evento (OnTimer) em intervalos regulares definidos por Interval (ms). Wrapper do TTimer nativo do Delphi.",
  },
  {
    name: "Enabled",
    kind: "property",
    type: "Boolean",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Timer",
    description: "Indica se o timer está habilitado, ela pausa ou ativa o evento OnTimer.",
  },
  {
    name: "Interval",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Timer",
    description:
      "Intervalo de tempo, em milissegundos, entre cada disparo do evento OnTimer. O valor padrão é 1000 (1 segundo).",
  },
  {
    name: "OnTimer",
    kind: "property",
    type: "TNotifyEvent",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Timer",
    description:
      "Evento disparado a cada intervalo definido por Interval, desde que Enabled seja true. O evento é do tipo TNotifyEvent, ou seja, um procedimento que recebe um parâmetro Sender do tipo TObject.",
  },
];

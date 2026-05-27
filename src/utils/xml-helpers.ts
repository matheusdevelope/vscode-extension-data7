import { XMLParser } from "fast-xml-parser";

/**
 * Centralized parser configuration for every `.7Proj` read in the codebase.
 * Hardened defaults: no entity expansion (avoids XML bombs), no attribute
 * value processing, raw text preserved. Owned by this module; do not
 * instantiate `XMLParser` anywhere else (see governance.mdc).
 */
const PROJECT_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: false,
  htmlEntities: false,
  allowBooleanAttributes: false,
} as const;

/**
 * Parses raw `.7Proj` XML content into a plain object tree.
 * Returns `unknown` on purpose so callers narrow the shape at the boundary
 * (see typescript.mdc).
 */
export function parseProjectXml(xmlContent: string): unknown {
  const parser = new XMLParser(PROJECT_PARSER_OPTIONS);
  return parser.parse(xmlContent);
}

/**
 * XML reserved-character escaping for text content (`&`, `<`, `>`, `"`, `'`).
 * `data7_domain.mdc` requires all five characters to be escaped.
 */
export function escapeXml(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Inverse of {@link escapeXml}. Used when reading code text extracted from
 * `.7Proj` files via `fast-xml-parser` configured with `processEntities: false`.
 */
export function decodeHtmlEntities(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/**
 * Type guard for plain JSON-like records parsed out of XML.
 */
export function isXmlRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Returns a record property if it is a record, otherwise an empty record.
 * Handy for traversing parsed XML without `any` casts.
 */
export function xmlRecord(value: unknown, key: string): Record<string, unknown> {
  if (!isXmlRecord(value)) return {};
  const child = value[key];
  return isXmlRecord(child) ? child : {};
}

/**
 * Returns the value of a property as a string, decoding HTML entities.
 * Returns the provided default when the value is absent or not a string.
 */
export function xmlText(value: unknown, key: string, defaultValue = ""): string {
  if (!isXmlRecord(value)) return defaultValue;
  const child = value[key];
  if (typeof child === "string") {
    return decodeHtmlEntities(child);
  }
  return defaultValue;
}

/**
 * Returns the raw (non-decoded) string value of a property, useful when the
 * XML serializer will re-escape the content downstream.
 */
export function xmlRawText(value: unknown, key: string, defaultValue = ""): string {
  if (!isXmlRecord(value)) return defaultValue;
  const child = value[key];
  return typeof child === "string" ? child : defaultValue;
}

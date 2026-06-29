import * as fs from "fs";
import {
  readProjectConfig,
  writeProjectConfig,
  type ProjectConfig,
} from "../project/project-config";
import type { ProjectMetadata } from "../project/project-metadata";

/**
 * Handles validation, parsing, reading, and writing the `data7.json` manifest files.
 */
export class ManifestRegistry {
  public static readonly FILENAME = "data7.json";

  /**
   * Reads and parses data7.json manifest from the given path.
   * Returns undefined if the file does not exist.
   * Throws if it is malformed.
   */
  public static read(filePath: string): ProjectConfig | undefined {
    return readProjectConfig(filePath);
  }

  /**
   * Writes the manifest configuration back to disk.
   */
  public static write(filePath: string, metadata: ProjectMetadata): void {
    writeProjectConfig(filePath, metadata);
  }

  /**
   * Validates the manifest schema.
   */
  public static validate(config: ProjectConfig): boolean {
    // Basic validation of fields.
    if (typeof config.nome !== "string" || config.nome.trim() === "") {
      return false;
    }
    if (typeof config.opcoes !== "object" || config.opcoes === null) {
      return false;
    }
    return true;
  }
}

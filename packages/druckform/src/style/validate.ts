import fs from "node:fs";
import { Ajv } from "ajv";
import yaml from "js-yaml";
import type { StyleConfig } from "../sdk/types.js";

const schemaPath = new URL("../../schemas/style-v1.json", import.meta.url);
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as object;
const ajv = new Ajv();
const validate = ajv.compile(schema);

export function loadStyle(stylePath: string): StyleConfig {
  const raw = fs.readFileSync(stylePath, "utf8");
  const data = yaml.load(raw);
  if (!validate(data)) {
    const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join("; ");
    throw new Error(`Invalid style.yaml: ${errors}`);
  }
  return data as StyleConfig;
}

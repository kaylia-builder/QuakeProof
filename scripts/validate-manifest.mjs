import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";

const schema = JSON.parse(await readFile(new URL("../schema/service.schema.json", import.meta.url), "utf8"));
const manifest = parse(await readFile(new URL("../service.yaml", import.meta.url), "utf8"));
// The upstream schema references root properties from conditional branches;
// Ajv's strictRequired check treats that valid pattern as an error.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validate = ajv.compile(schema);

if (!validate(manifest)) {
  console.error(ajv.errorsText(validate.errors, { separator: "\n" }));
  process.exit(1);
}
console.log("service.yaml is valid against the QuakeProof x402 schema");

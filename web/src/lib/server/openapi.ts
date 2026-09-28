import { parse } from 'yaml';
import contractYaml from '../../../openapi.yaml?raw';

export interface ContractOperation {
  operationId?: string;
  parameters?: unknown[];
  responses?: Record<string, unknown>;
  security?: unknown[];
}

export interface ContractDocument {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, ContractOperation>>;
  components: { schemas: Record<string, unknown> };
}

let cached: ContractDocument | null = null;
let cachedJson: string | null = null;

export function getContract(): ContractDocument {
  if (!cached) cached = parse(contractYaml) as ContractDocument;
  return cached;
}

export function getContractJson(): string {
  if (!cachedJson) cachedJson = JSON.stringify(getContract());
  return cachedJson;
}

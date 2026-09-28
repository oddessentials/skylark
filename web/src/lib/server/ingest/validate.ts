import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { getContract } from '../openapi';

function rewriteRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => rewriteRefs(entry));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'discriminator') continue;
      if (
        key === '$ref' &&
        typeof entry === 'string' &&
        entry.startsWith('#/components/schemas/')
      ) {
        out[key] = `#/$defs/${entry.slice('#/components/schemas/'.length)}`;
        continue;
      }
      out[key] = rewriteRefs(entry);
    }
    return out;
  }
  return value;
}

interface BatchSchema {
  properties: Record<string, Record<string, unknown>>;
}

function contractDefinitions(): Record<string, unknown> {
  const definitions = rewriteRefs(getContract().components.schemas) as Record<string, unknown>;
  const batch = definitions.IngestBatch as BatchSchema;
  definitions.IngestBatchEnvelope = {
    ...batch,
    properties: {
      ...batch.properties,
      events: { ...batch.properties.events, items: { $ref: '#/$defs/EventEnvelope' } }
    }
  };
  return definitions;
}

let ajv: Ajv2020 | null = null;
const validators = new Map<string, ValidateFunction>();

export function schemaValidator(schemaName: string): ValidateFunction {
  const cached = validators.get(schemaName);
  if (cached) return cached;
  if (!ajv) {
    ajv = new Ajv2020({ strict: false, allErrors: false });
    addFormats(ajv);
    ajv.addSchema({ $id: 'contract', $defs: contractDefinitions() });
  }
  const validator = ajv.compile({ $ref: `contract#/$defs/${schemaName}` });
  validators.set(schemaName, validator);
  return validator;
}

export function describeErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return 'the document does not match the contract';
  const first = errors[0]!;
  const path = first.instancePath || '/';
  const extra =
    first.params && typeof first.params === 'object' && 'additionalProperty' in first.params
      ? ` (${String((first.params as { additionalProperty: unknown }).additionalProperty)})`
      : '';
  return `${path} ${first.message ?? 'is invalid'}${extra}`;
}

export function validateAgainst(schemaName: string, document: unknown): string | null {
  const validator = schemaValidator(schemaName);
  return validator(document) ? null : describeErrors(validator.errors);
}

interface TypedEventSchema {
  allOf?: { properties?: { type?: { const?: unknown }; data?: { $ref?: unknown } } }[];
}

let knownTypes: Map<string, string> | null = null;

export function documentedEventTypes(): Map<string, string> {
  if (knownTypes) return knownTypes;
  const map = new Map<string, string>();
  for (const [name, schema] of Object.entries(getContract().components.schemas)) {
    if (!name.endsWith('Event') || name === 'OtherEvent') continue;
    for (const part of (schema as TypedEventSchema).allOf ?? []) {
      const type = part.properties?.type?.const;
      const ref = part.properties?.data?.$ref;
      if (typeof type === 'string' && typeof ref === 'string') {
        map.set(type, ref.slice('#/components/schemas/'.length));
      }
    }
  }
  knownTypes = map;
  return map;
}

export interface IncomingEvent {
  id: string;
  seq: number;
  run_id: string;
  ts: string;
  type: string;
  data: Record<string, unknown>;
}

export interface IncomingBatch {
  collector: { name: string; version: string; run_id: string; os?: string; arch?: string };
  server: { version: string; name: string; description?: string; world_guid: string } | null;
  events: IncomingEvent[];
}

export interface CheckedEvent {
  event: IncomingEvent;
  known: boolean;
  invalid: string | null;
}

export interface BatchValidation {
  ok: boolean;
  message: string | null;
  batch: IncomingBatch | null;
  events: CheckedEvent[];
}

export function validateBatch(document: unknown): BatchValidation {
  const envelope = schemaValidator('IngestBatchEnvelope');
  if (!envelope(document)) {
    return { ok: false, message: describeErrors(envelope.errors), batch: null, events: [] };
  }
  const batch = document as IncomingBatch;
  const seen = new Set<string>();
  const checked: CheckedEvent[] = [];
  const types = documentedEventTypes();
  for (const event of batch.events) {
    if (seen.has(event.id)) {
      return {
        ok: false,
        message: `event ${event.id} appears twice in the batch`,
        batch: null,
        events: []
      };
    }
    seen.add(event.id);
    const schema = types.get(event.type);
    checked.push({
      event,
      known: schema !== undefined,
      invalid: schema ? validateAgainst(schema, event.data) : null
    });
  }
  return { ok: true, message: null, batch, events: checked };
}

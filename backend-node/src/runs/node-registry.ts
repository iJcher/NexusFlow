import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Injectable, Optional } from '@nestjs/common';
import { ContainerJsExecutor } from './container-js.executor';
import { WorkflowCompiler, canonicalJson } from './compiler';
import { HttpEffectExecutor } from './http-effect.executor';
import { readPointer } from './bindings';
import {
  ExecutionContext,
  ExecutionError,
  Json,
  JsonObject,
  NodeSpec,
  jsonClone,
  jsonString,
} from './contracts';

@Injectable()
export class NodeRegistry {
  constructor(
    readonly compiler: WorkflowCompiler,
    readonly http: HttpEffectExecutor,
    @Optional() readonly js?: ContainerJsExecutor,
  ) {}
  async execute(
    spec: NodeSpec,
    inputs: JsonObject,
    context: ExecutionContext,
  ): Promise<Json> {
    this.compiler.validate(spec.inputSchema, inputs);
    if (context.signal.aborted) throw new ExecutionError('ABORTED');
    let output: Json;
    switch (spec.kind) {
      case 'start':
      case 'merge':
        output = jsonClone(inputs);
        break;
      case 'constant':
        output = jsonClone(spec.config!.value);
        break;
      case 'delay':
        try {
          await delay(Number(spec.config?.milliseconds ?? 0), undefined, {
            signal: context.signal,
          });
        } catch {
          throw new ExecutionError('ABORTED');
        }
        output = jsonClone(inputs);
        break;
      case 'condition': {
        const actual = readPointer(inputs, jsonString(spec.config!.path));
        const expected = spec.config!.value;
        let matched = false;
        switch (spec.config!.operator) {
          case 'eq':
            matched =
              actual !== undefined &&
              canonicalJson(actual) === canonicalJson(expected);
            break;
          case 'neq':
            matched =
              actual !== undefined &&
              canonicalJson(actual) !== canonicalJson(expected);
            break;
          case 'gte':
            if (typeof actual !== 'number' || typeof expected !== 'number')
              throw new ExecutionError('CONDITION_TYPE');
            matched = actual >= expected;
            break;
          case 'truthy':
            matched = !!actual;
            break;
          default:
            throw new ExecutionError('CONDITION_OPERATOR');
        }
        output = { matched };
        break;
      }
      case 'transform':
        switch (spec.config!.operation) {
          case 'identity':
            output = jsonClone(inputs);
            break;
          case 'sum':
            if (
              !Array.isArray(inputs.values) ||
              !inputs.values.every((value) => typeof value === 'number')
            )
              throw new ExecutionError('TRANSFORM_INPUT');
            output = {
              value: inputs.values.reduce<number>(
                (total, value) => total + value,
                0,
              ),
            };
            break;
          case 'concat':
            if (
              !Array.isArray(inputs.values) ||
              !inputs.values.every((value) => typeof value === 'string')
            )
              throw new ExecutionError('TRANSFORM_INPUT');
            output = { value: inputs.values.join('') };
            break;
          case 'sha256':
            output = {
              hash: createHash('sha256')
                .update(canonicalJson(inputs))
                .digest('hex'),
            };
            break;
          default:
            throw new ExecutionError('TRANSFORM_OPERATOR');
        }
        break;
      case 'http':
        output = await this.http.execute(spec, inputs, context);
        break;
      case 'js':
        if (!this.js) throw new ExecutionError('JS_ISOLATION_UNAVAILABLE');
        output = await this.js.execute(spec, inputs, context);
        break;
      default:
        throw new ExecutionError('NODE_KIND_DISABLED');
    }
    try {
      this.compiler.validate(spec.outputSchema, output);
    } catch {
      throw new ExecutionError(
        'OUTPUT_SCHEMA',
        false,
        spec.kind === 'http' && spec.config?.method === 'POST',
      );
    }
    return output;
  }
}

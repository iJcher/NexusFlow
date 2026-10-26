"""Structured native execution subset. Unsupported constructs fail publication explicitly."""
from pathlib import Path
import hashlib
import json
import re
from uuid import UUID
from functools import lru_cache

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = json.loads((ROOT/'contracts/execution-dsl/v2/execution.schema.json').read_text(encoding='utf-8'))
COMPILER_VERSION = 'native-auto-memory-9'


class ExecutionError(Exception):
    def __init__(self, code, path=''):
        self.code, self.path = code, path
        super().__init__(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


@lru_cache(maxsize=1)
def bundle_digest():
    files = [Path(__file__).parent/name for name in ['spec.py','graphs.py','composition.py','public_tools.py','mcp_tools.py','mcp_transport.py','context_engineering.py','long_term_memory.py']] + [ROOT/'runtime-python/requirements.lock.txt',ROOT/'contracts/execution-dsl/v2/execution.schema.json']
    return digest({str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in files})


def data_schema(schema, root=True):
    Draft202012Validator.check_schema(schema)
    # Deliberate data-schema subset: no network refs, executable regexes or combinatorial schemas.
    allowed = {'type','properties','required','additionalProperties','items','enum','const','minimum','maximum',
               'minLength','maxLength','minItems','maxItems','description','title'}
    count = 0
    def visit(value, depth=0):
        nonlocal count
        count += 1
        if depth > 8 or count > 256: raise ExecutionError('SCHEMA_COMPLEXITY_LIMIT')
        if set(value)-allowed: raise ExecutionError('SCHEMA_KEYWORD_UNSUPPORTED')
        properties = value.get('properties', {})
        if len(properties) > 32 or len(value.get('enum', [])) > 64: raise ExecutionError('SCHEMA_COMPLEXITY_LIMIT')
        for child in properties.values(): visit(child, depth+1)
        for key in ['items', 'additionalProperties']:
            if isinstance(value.get(key), dict): visit(value[key], depth+1)
    visit(schema)
    if root and schema.get('type') != 'object':
        raise ExecutionError('ROOT_SCHEMA_MUST_BE_OBJECT')


def validate_data(schema, value):
    problem = next(Draft202012Validator(schema).iter_errors(value), None)
    if problem:
        raise ExecutionError('SCHEMA_VALIDATION_FAILED', '/'+ '/'.join(map(str, problem.absolute_path)))


def walk_nodes(sequence):
    for node in sequence['steps']:
        yield node
        bodies = node.get('branches', [])+[item['body'] for item in node.get('cases', [])]
        if 'default' in node: bodies.append(node['default'])
        for body in bodies: yield from walk_nodes(body)


def validate_workflow(spec):
    ids, count = set(), 0
    channels = spec.get('state', {}).get('channels', {})
    def register(identity):
        nonlocal count
        if identity in ids: raise ExecutionError('DUPLICATE_BLOCK_ID',identity)
        ids.add(identity); count += 1
        if count>128: raise ExecutionError('PLAN_COMPLEXITY_LIMIT')
    def check_reference(value, seen, identity, allow_output=False):
        if value['source']=='node_output' and value.get('nodeId') not in seen:
            raise ExecutionError('INVALID_RESULT_SCOPE',identity)
        if value['source']=='output' and not allow_output: raise ExecutionError('INVALID_OUTPUT_SCOPE',identity)
        if value['source']=='state' and value.get('path','').strip('/').split('/')[0] not in channels:
            raise ExecutionError('UNKNOWN_STATE_CHANNEL',identity)
        if value.get('path') and not value['path'].startswith('/'): raise ExecutionError('JSON_POINTER_REQUIRED',identity)
    def sequence(body, visible, depth=0, root=False, parallel_depth=0):
        if depth>6 or parallel_depth>2: raise ExecutionError('PLAN_COMPLEXITY_LIMIT')
        register(body['id'])
        nodes=body['steps']; seen=set(visible); writes=set()
        if root and (len(nodes)<2 or nodes[0]['type']!='input' or nodes[-1]['type']!='output'):
            raise ExecutionError('SEQUENCE_REQUIRES_INPUT_AND_OUTPUT')
        for index,node in enumerate(nodes):
            identity,kind=node['id'],node['type']; register(identity)
            if kind in {'input','output'} and (not root or index not in {0,len(nodes)-1} or (kind=='input' and index!=0) or (kind=='output' and index!=len(nodes)-1)):
                raise ExecutionError('BOUNDARY_NODE_POSITION',identity)
            required={'agent_call':['versionRef'],'workflow_call':['versionRef'],'tool':['toolRef'],'output':['value'],'branch':['cases','default'],'parallel':['branches'],'human':['title']}.get(kind,[])
            if any(key not in node for key in required): raise ExecutionError('NODE_CONFIGURATION_REQUIRED',identity)
            controls={'cases','default','branches','title','prompt','retry','onError'}
            allowed={'branch':{'cases','default'},'parallel':{'branches'},'human':{'title','prompt'},'tool':{'retry','onError'}}.get(kind,set())
            if (set(node)&controls)-allowed: raise ExecutionError('NODE_FIELD_UNSUPPORTED',identity)
            for value in list(node.get('input',{}).values()): check_reference(value,seen,identity)
            for value in node.get('write',{}).values(): check_reference(value,seen,identity,True)
            if 'value' in node: check_reference(node['value'],seen,identity)
            own_writes=set(node.get('write',{}))
            if own_writes-set(channels): raise ExecutionError('UNKNOWN_STATE_WRITE',identity)
            if kind=='branch':
                for case in node['cases']:
                    check_reference(case['when']['left'],seen,identity)
                    if case['when']['operator']!='exists' and 'right' not in case['when']: raise ExecutionError('CONDITION_VALUE_REQUIRED',identity)
                    writes |= sequence(case['body'],seen,depth+1,parallel_depth=parallel_depth)
                writes |= sequence(node['default'],seen,depth+1,parallel_depth=parallel_depth)
            if kind=='parallel':
                writers={}
                for body in node['branches']:
                    branch_writes=sequence(body,seen,depth+1,parallel_depth=parallel_depth+1)
                    for key in branch_writes:
                        if key in writers and channels[key]['reducer']=='last_value':
                            raise ExecutionError('PARALLEL_STATE_WRITER_CONFLICT',identity+'/'+key)
                        writers[key]=body['id']
                    writes |= branch_writes
            writes |= own_writes; seen.add(identity)
        return writes
    sequence(spec['body'],set(),root=True)


def validate(spec):
    problem = next(Draft202012Validator(CONTRACT, format_checker=FormatChecker()).iter_errors(spec), None)
    if problem:
        raise ExecutionError('INVALID_EXECUTION_SPEC', '/'+ '/'.join(map(str, problem.absolute_path)))
    data_schema(spec['inputSchema'])
    data_schema(spec['outputSchema'])
    for key, channel in spec.get('state', {}).get('channels', {}).items():
        if not re.fullmatch('[a-z][a-zA-Z0-9_]{0,63}', key):
            raise ExecutionError('INVALID_STATE_CHANNEL')
        data_schema(channel['schema'], root=False)
        if channel['reducer'] == 'collect_by_id_v1' and channel['schema'].get('type') != 'object':
            raise ExecutionError('COLLECTION_SCHEMA_MUST_BE_OBJECT')
    if spec['kind'] == 'workflow':
        validate_workflow(spec)
    elif spec.get('state', {}).get('channels'):
        raise ExecutionError('CUSTOM_AGENT_CHANNELS_NOT_ENABLED')
    if spec['kind']=='agent':
        policy=spec['agent'].get('contextPolicy',{})
        if policy.get('triggerTokens',24000)>=policy.get('maxInputTokens',100000): raise ExecutionError('INVALID_CONTEXT_POLICY')
        from .public_tools import CATALOG
        tools=spec['agent'].get('executionTools',[])
        names=spec['agent']['tools']+[item['name'] for item in tools]
        if len(names)!=len(set(names)): raise ExecutionError('DUPLICATE_TOOL_NAME')
        if any(item['name'] in {'inspect_text','word_count'}|{tool['name'] for tool in CATALOG} for item in tools): raise ExecutionError('RESERVED_TOOL_NAME')
        if any(item['name'].startswith('mcp_') for item in tools): raise ExecutionError('RESERVED_TOOL_NAME')
    return {'hash': digest({'spec':spec,'bundleDigest':bundle_digest(),'compilerVersion':COMPILER_VERSION}), 'bundleDigest': bundle_digest(), 'compilerVersion': COMPILER_VERSION,
            'dslVersion': '2.0', 'nodeIds': [node['id'] for node in walk_nodes(spec['body'])] if spec['kind']=='workflow' else [],
            'nodeAdapterVersion': 'm4-public-1', 'reducerVersion': 'm1-1','toolCatalogVersion':'public-research-1','conversationRuntimeVersion':'1','memoryRuntimeVersion':'1','automaticMemoryVersion':'1'}


def collect_by_id(left, right):
    merged = dict(left or {})
    for key, value in (right or {}).items():
        if key in merged and canonical(merged[key]) != canonical(value):
            raise ExecutionError('STATE_CONFLICT', key)
        merged[key] = value
    return merged


def binding(value, state, output=None):
    source = value['source']
    if source == 'literal': return value.get('value')
    if source == 'input': result = state.get('__inputs', {})
    elif source == 'state': result = {key: item for key, item in state.items() if not key.startswith('__')}
    elif source == 'node_output': result = state.get('__results', {})[value['nodeId']]
    else: result = output
    try:
        for part in value.get('path', '').split('/')[1:]:
            key = part.replace('~1', '/').replace('~0', '~')
            result = result[int(key)] if isinstance(result, list) else result[key]
        return result
    except (KeyError, IndexError, TypeError, ValueError):
        raise ExecutionError('BINDING_NOT_FOUND') from None


def mapping(values, state, output=None):
    return {key: binding(value, state, output) for key, value in values.items()}

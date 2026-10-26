"""Discovery is separate from selection; MCP tools adapt to native BaseTool."""
import asyncio
import json
import os
import re
import uuid

import httpx
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport
from langchain.mcp import as_langchain_tool
from langchain_core.tools import StructuredTool
from mcp.types import Tool,ListToolsResult
from jsonschema import Draft202012Validator

# Live security and I/O infrastructure applies even to restored execution bundles.
from nexus.mcp_transport import client_factory,io,validate_url
from .spec import ExecutionError,canonical,digest


def remote_schema(schema):
    # Remote tool contracts are not NexusFlow State schemas. Accept ordinary unions
    # and metadata, but no reference resolution or unbounded regular expressions.
    Draft202012Validator.check_schema(schema)
    count=0
    def visit(value,depth=0):
        nonlocal count
        count+=1
        if depth>12 or count>1024: raise ExecutionError('MCP_SCHEMA_UNSUPPORTED')
        if isinstance(value,dict):
            if set(value)&{'$ref','$dynamicRef','pattern','patternProperties','x-mcp-header'}: raise ExecutionError('MCP_SCHEMA_UNSUPPORTED')
            for key,child in value.items():
                if key in {'anyOf','allOf','oneOf'} and len(child)>8: raise ExecutionError('MCP_SCHEMA_UNSUPPORTED')
                visit(child,depth+1)
        elif isinstance(value,list):
            for child in value: visit(child,depth+1)
    visit(schema)
    if schema.get('type')!='object': raise ExecutionError('MCP_SCHEMA_UNSUPPORTED')


def client(config):
    url=config['url']; validate_url(url,config.get('testWorkspace',False))
    headers={'Authorization':'Bearer '+config['token']} if config.get('authType')=='bearer' else {}
    transport=StreamableHttpTransport(url,headers=headers,httpx_client_factory=client_factory(url,config.get('testWorkspace',False)))
    # No automatic sampling, OAuth, local execution or remote elicitation in this slice.
    return Client(transport,timeout=15,init_timeout=8,cache=True)


async def discover(config):
    async with asyncio.timeout(22):
        async with client(config) as remote:
            tools=await remote.list_tools(max_pages=4)
            if len(tools)>64: raise ExecutionError('TOOL_CATALOG_TOO_LARGE')
            result=[]; names=set()
            for tool in tools:
                if not re.fullmatch(r'[a-zA-Z0-9_.-]{1,96}',tool.name) or tool.name in names: raise ExecutionError('INVALID_REMOTE_TOOL')
                names.add(tool.name)
                remote_schema(tool.input_schema)
                description=(tool.description or tool.name)[:1600]
                if config.get('token'): description=description.replace(config['token'],'[redacted]')
                schema=tool.input_schema
                if config.get('token'):
                    schema=json.loads(json.dumps(schema).replace(config['token'],'[redacted]'))
                result.append({'name':tool.name,'description':description,'inputSchema':schema,
                               'reportedReadOnly':bool(tool.annotations and tool.annotations.read_only_hint),
                               'reportedDestructive':bool(tool.annotations and tool.annotations.destructive_hint)})
            if len(canonical(result).encode())>131072: raise ExecutionError('TOOL_CATALOG_TOO_LARGE')
            return {'tools':result}


def discover_sync(config):
    try: return io().call(discover(config))
    except ExecutionError: raise
    except Exception: raise ExecutionError('MCP_DISCOVERY_FAILED') from None


def alias(item):
    return 'mcp_'+uuid.UUID(item['connectionId']).hex+'_'+digest(item['name'])[:16]


def connection_context(execution,item):
    descriptor={key:value for key,value in item.items() if key!='connectionId'}
    with httpx.Client(trust_env=False,timeout=5) as control:
        result=control.post(os.environ.get('NF_CONTROL_URL','http://127.0.0.1:19081')+'/internal/mcp/context',
            headers={'Authorization':'Bearer '+os.environ['NF_SERVICE_TOKEN']},
            json={'runId':execution.run_id,'workspaceId':str(execution.run['workspace_id']),'connectionId':item['connectionId'],
                  'toolName':item['name'],'descriptorHash':digest(descriptor)})
    if result.status_code!=200:
        code='TOOL_SCHEMA_CHANGED' if result.status_code==409 else 'CONNECTION_USE_DENIED'
        raise ExecutionError(code)
    return result.json()


def descriptors(execution):
    # Persisted in the accepted START command: stable names and schemas across replay.
    row=execution.store.one("SELECT payload FROM runtime_command WHERE payload->>'runId'=%s AND payload->>'kind'='START'",(execution.run_id,))
    return row['payload'].get('mcpTools',[]) if row else []


def tools_for(execution,spec,check):
    policy=spec['agent'].get('toolPolicy','restricted')
    result=[]
    def bind(item):
        def invoke(**arguments):
            if len(canonical(arguments).encode())>65536 or not Draft202012Validator(item['inputSchema']).is_valid(arguments):
                return json.dumps({'ok':False,'error':{'code':'INVALID_TOOL_INPUT'}})
            # Do not capture credentials in a tool, graph, checkpoint or closure.
            config=connection_context(execution,item)
            async def call():
                async with asyncio.timeout(22):
                    cached=Tool(name=item['name'],description=item['description'],input_schema=item['inputSchema'])
                    async with client(config) as remote:
                        # MCP 2.3 validates call results through its session catalog and
                        # otherwise does an implicit tools/list. Use the same cache
                        # absorption hook as FastMCP cache hits, with the saved contract.
                        # Deliberately isolated, version-pinned and wire-tested.
                        remote.session._absorb_tool_listing(ListToolsResult(tools=[cached]),complete=True)
                        adapted=await as_langchain_tool(cached,remote)
                        message=await adapted.ainvoke({'type':'tool_call','name':item['name'],'args':arguments,'id':'remote'})
                    blocks=message.content if isinstance(message.content,list) else [{'type':'text','text':str(message.content)}]
                    text='\n'.join(str(block.get('text','')) for block in blocks if isinstance(block,dict) and block.get('type')=='text')
                    if config.get('token'): text=text.replace(config['token'],'[redacted]')
                    return json.dumps({'ok':message.status!='error','content':text[:16000],'truncated':len(text)>16000,'untrustedContent':True},ensure_ascii=False)
            try: return io().call(call(),check)
            except ExecutionError: raise
            except Exception: return json.dumps({'ok':False,'error':{'code':'MCP_CALL_FAILED'}})
        return invoke
    for item in descriptors(execution):
        if policy!='auto' and alias(item) not in spec['agent'].get('remoteTools',[]): continue
        tool=StructuredTool(name=alias(item),description=item['description'],args_schema=item['inputSchema'],func=bind(item),
                            metadata={'mcpConnectionId':item['connectionId'],'remoteName':item['name']})
        result.append(tool)
    return result

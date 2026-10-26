import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import hmac
import json
import hashlib
import os
from pathlib import Path
import threading
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.types import Command
from psycopg.types.json import Jsonb
from jsonschema.exceptions import SchemaError

from .graphs import Execution
from .spec import ExecutionError, bundle_digest, canonical, digest, validate, validate_data
from .store import Store, fault
from .bundles import archive_current, resolve, verify

# Captured once at import, so diagnostics can distinguish a stale process from disk.
BOOT_SOURCE_DIGEST=hashlib.sha256(json.dumps({path.name:hashlib.sha256(path.read_bytes()).hexdigest()
    for path in Path(__file__).parent.glob('*.py')},sort_keys=True,separators=(',',':')).encode()).hexdigest()
from .answer_stream import observed_execution
from .token_policy import unlimited_token_reservations
from .public_tools import CATALOG

TERMINAL = {'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'NEEDS_ATTENTION', 'CANCELLED'}
store = None
boot_id = str(uuid.uuid4())
stop = threading.Event()
slots = threading.BoundedSemaphore(4)
streams = threading.BoundedSemaphore(32)
executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix='native-run')
inflight = set()
inflight_runs = set()
inflight_lock = threading.Lock()


def interaction_ref(snapshot):
    checkpoint=snapshot.config.get('configurable',{}).get('checkpoint_id') if snapshot.config else None
    return digest({'checkpoint':checkpoint,'interrupts':sorted(item.id for item in snapshot.interrupts)})


def reconcile(graph, config, run, attempt):
    snapshot = graph.get_state(config)
    checkpoint = snapshot.config.get('configurable', {}).get('checkpoint_id') if snapshot.config else None
    if not checkpoint: return snapshot
    # A committed observation is associated with a durable snapshot, never inferred from a progress event.
    pending=[{'id':item.id,'value':item.value} for item in snapshot.interrupts]
    revision=interaction_ref(snapshot)
    facts = {'state': {key:value for key,value in snapshot.values.items() if key!='__agent_state'}, 'next': list(snapshot.next), 'checkpointRef': checkpoint,'interrupts':pending,'interactionRef':revision,
             'completedNodeIds': list(snapshot.values.get('__results', {}))}
    store.execute('INSERT INTO run_projection(run_id,checkpoint_id,snapshot) VALUES(%s,%s,%s) ON CONFLICT(run_id) DO UPDATE SET checkpoint_id=excluded.checkpoint_id,snapshot=excluded.snapshot,updated_at=now()',
                  (run['id'], checkpoint, Jsonb(facts)))
    store.execute('UPDATE run_root SET checkpoint_id=%s,interrupts=%s,interaction_ref=%s WHERE id=%s', (checkpoint, Jsonb(pending),revision,run['id']))
    store.event(str(run['id']), 'checkpoint.committed', data=facts, committed=True, checkpoint=checkpoint,
                event_key=f"{run['id']}/checkpoint/{checkpoint}/{revision}", attempt=attempt)
    return snapshot


def execute(command):
    run_id = command['payload']['runId']
    attempt = str(uuid.uuid4())
    graph = None
    config = None
    try:
        run = store.one('SELECT * FROM run_root WHERE id=%s', (run_id,))
        if run['status'] in TERMINAL:
            store.event(run_id, 'run.completed' if run['status']=='SUCCEEDED' else 'run.failed',
                        data={'output':run['output']} if run['status']=='SUCCEEDED' else {'code':run['error_code'],'status':run['status']},
                        committed=True, checkpoint=run['checkpoint_id'], event_key=run_id+'/terminal', attempt=attempt)
            store.execute("UPDATE runtime_command SET state='APPLIED' WHERE id=%s", (command['id'],))
            return
        if command['payload']['kind']=='CANCEL' or run['cancel_requested']: raise ExecutionError('CANCEL_REQUESTED')
        compiler,engine=resolve(run['bundle_hash'])
        store.execute("UPDATE run_root SET status='RUNNING',started_at=coalesce(started_at,now()),deadline=coalesce(deadline,now()+(%s * interval '1 second')) WHERE id=%s",
                      (run['spec']['budget']['timeoutSeconds'], run_id))
        run = store.one('SELECT * FROM run_root WHERE id=%s', (run_id,))
        original=store.one("SELECT payload FROM runtime_command WHERE payload->>'runId'=%s AND payload->>'kind'='START' LIMIT 1",(run_id,))
        run['authorized_connections'] = original['payload'].get('authorizedConnections', [])
        conversation=original['payload'].get('conversationId')
        run['memory_context']=original['payload'].get('memoryContext',[])
        run['memory_scope']=original['payload'].get('memoryScope')
        if conversation: run['conversation_id']=conversation
        if run['deadline'] < datetime.now(timezone.utc): raise ExecutionError('DEADLINE_EXCEEDED')
        execution = observed_execution(engine.Execution)(store, run, attempt)
        graph = execution.build(PostgresSaver(store.pool))
        config = {'configurable': {'thread_id': conversation or run_id}, 'recursion_limit': 500, 'max_concurrency':4}
        snapshot = graph.get_state(config)
        has_checkpoint = bool(snapshot.config and snapshot.config.get('configurable', {}).get('checkpoint_id'))
        new_turn=bool(conversation and command['payload']['kind']=='START' and snapshot.values.get('__turn_id')!=run_id)
        if new_turn:
            previous=original['payload'].get('previousRunId')
            if (previous and (not has_checkpoint or snapshot.values.get('__turn_id')!=previous or snapshot.next or snapshot.interrupts)) or (not previous and has_checkpoint):
                raise ExecutionError('CONVERSATION_CHECKPOINT_CONFLICT')
        resume=None
        if command['payload']['kind']=='RESUME':
            application=store.one('SELECT * FROM resume_application WHERE command_id=%s',(command['id'],))
            current=snapshot.config['configurable']['checkpoint_id'] if has_checkpoint else None
            requested=set(application['decisions']); pending={item.id for item in snapshot.interrupts}
            if application['state']=='APPLIED':
                store.execute("UPDATE runtime_command SET state='APPLIED' WHERE id=%s",(command['id'],)); return
            if application['state']=='APPLYING':
                # No private checkpoint internals or blind Command(resume) retry.
                if interaction_ref(snapshot)==application['before_revision'] or requested & pending:
                    raise ExecutionError('RESUME_APPLICATION_UNCONFIRMED')
            else:
                if current!=application['before_checkpoint'] or interaction_ref(snapshot)!=application['before_revision'] or not requested or not requested<=pending:
                    raise ExecutionError('STALE_APPROVAL_CHECKPOINT')
                store.execute("UPDATE resume_application SET state='APPLYING',attempt_id=%s WHERE command_id=%s",(attempt,command['id']))
                fault('resume_before_invoke')
                resume=Command(resume=application['decisions'])
        store.execute("UPDATE invocation SET status='RUNNING' WHERE run_id=%s AND status='WAITING'",(run_id,))
        store.event(run_id, 'run.resumed' if command['payload']['kind']=='RESUME' else 'run.started', data={'recovering': has_checkpoint, 'bootId': boot_id, 'tokenReservationPolicy':'unlimited' if unlimited_token_reservations() else 'definition'}, attempt=attempt)
        if not new_turn and has_checkpoint and '__output' in snapshot.values and not snapshot.next:
            output = snapshot.values['__output']
        else:
            initial = ({'__inputs':run['input'],'__results':{},'__output':None,'__turn_id':run_id} if new_turn else
                       resume if resume is not None else (None if has_checkpoint else {'__inputs': run['input'], '__results': {}}))
            # A recovered already-applied resume may now be waiting on different interrupt IDs.
            if resume is not None or not snapshot.interrupts:
                for _ in graph.stream(initial, config, stream_mode=['updates','messages'], durability='sync', subgraphs=True):
                    control=store.one('SELECT cancel_requested FROM run_root WHERE id=%s',(run_id,))
                    if control['cancel_requested']: raise ExecutionError('CANCEL_REQUESTED')
            snapshot=graph.get_state(config)
            output = snapshot.values.get('__output')
        if run['deadline'] < datetime.now(timezone.utc): raise ExecutionError('DEADLINE_EXCEEDED')
        fault('checkpoint_before_event')
        snapshot=reconcile(graph, config, run, attempt)
        if command['payload']['kind']=='RESUME': fault('resume_checkpoint_before_ack')
        if snapshot.interrupts:
            store.execute("UPDATE run_root SET status='WAITING' WHERE id=%s",(run_id,))
            store.execute("UPDATE invocation SET status='WAITING' WHERE run_id=%s AND status='RUNNING'",(run_id,))
            store.event(run_id,'run.waiting',data={'interrupts':[{'id':item.id,'value':item.value} for item in snapshot.interrupts]},committed=True,
                        checkpoint=snapshot.config['configurable']['checkpoint_id'],event_key=run_id+'/waiting/'+interaction_ref(snapshot),attempt=attempt)
        else:
            compiler.validate_data(run['spec']['outputSchema'], output)
            store.complete_invocation(run_id+'/root', output)
            store.finish(run_id,'SUCCEEDED',output=output,attempt=attempt)
        if command['payload']['kind']=='RESUME':
            store.execute("UPDATE resume_application SET state='APPLIED',after_checkpoint=%s WHERE command_id=%s",(snapshot.config['configurable']['checkpoint_id'],command['id']))
        fault('checkpoint_before_ack')
        store.execute("UPDATE runtime_command SET state='APPLIED' WHERE id=%s", (command['id'],))
    except Exception as error:
        code = getattr(error,'code','EXECUTION_FAILED')
        status = 'NEEDS_ATTENTION' if code in {'CONVERSATION_CHECKPOINT_CONFLICT','MODEL_RESULT_UNCONFIRMED','MODEL_DECISION_CONFLICT','UNSUPPORTED_EXECUTION_VERSION','EXECUTION_BUNDLE_INVALID','UNSUPPORTED_EXECUTION_DEPENDENCIES','RESUME_APPLICATION_UNCONFIRMED','STALE_APPROVAL_CHECKPOINT'} else ('CANCELLED' if code=='CANCEL_REQUESTED' else 'TIMED_OUT' if code == 'DEADLINE_EXCEEDED' else 'FAILED')
        if graph is not None:
            reconcile(graph, config, run, attempt)
        active = store.all("SELECT id,node_id FROM invocation WHERE run_id=%s AND status IN ('RUNNING','WAITING')", (run_id,))
        for invocation in active:
            store.event(run_id, 'invocation.failed', invocation['node_id'], invocation['id'], {'code': code, 'status': status}, attempt=attempt)
        store.execute("UPDATE invocation SET status=%s WHERE run_id=%s AND status IN ('RUNNING','WAITING')", (status, run_id))
        store.finish(run_id,status,code=code,attempt=attempt)
        store.execute("UPDATE runtime_command SET state='APPLIED' WHERE id=%s", (command['id'],))
    finally:
        with inflight_lock:
            inflight.discard(command['id']); inflight_runs.discard(run_id)
        slots.release()


def poll():
    while not stop.wait(0.1):
        # Waiting roots hold no execution slot. Deadline/cancel closes only idle roots.
        try: waiting_roots=store.all("""
            SELECT r.id,r.cancel_requested FROM run_root r WHERE r.status='WAITING'
            AND (r.deadline<now() OR r.cancel_requested OR EXISTS (
                SELECT 1 FROM invocation i WHERE i.run_id=r.id AND i.status IN ('WAITING','RUNNING')
                AND i.version_id IS NOT NULL AND now() >= i.created_at + make_interval(secs =>
                    (r.dependencies->i.version_id->'spec'->'budget'->>'timeoutSeconds')::integer)))
            """)
        except Exception:
            stop.wait(1); continue
        for waiting in waiting_roots:
            try:
                with inflight_lock: active=str(waiting['id']) in inflight_runs
                if not active:
                    status='CANCELLED' if waiting['cancel_requested'] else 'TIMED_OUT'
                    store.finish(str(waiting['id']),status,code='CANCEL_REQUESTED' if waiting['cancel_requested'] else 'DEADLINE_EXCEEDED')
                    store.execute("UPDATE invocation SET status=%s WHERE run_id=%s AND status IN ('WAITING','RUNNING')",(status,waiting['id']))
            except Exception: stop.wait(.2)
        if not slots.acquire(blocking=False): continue
        command = None
        try:
            # One active process; serial root commands per thread, never node tasks.
            with store.acceptance_lock, store.pool.connection() as conn, conn.transaction():
                # Requeue orphaned root commands after a transient worker/DB error, never node tasks.
                with inflight_lock:
                    for orphan in conn.execute("SELECT id FROM runtime_command WHERE state='PROCESSING'").fetchall():
                        if orphan['id'] not in inflight:
                            conn.execute("UPDATE runtime_command SET state='ACCEPTED' WHERE id=%s", (orphan['id'],))
                candidates=conn.execute("SELECT * FROM runtime_command WHERE state='ACCEPTED' ORDER BY created_at LIMIT 128 FOR UPDATE SKIP LOCKED").fetchall()
                with inflight_lock:
                    command=next((item for item in candidates if item['payload']['runId'] not in inflight_runs),None)
                if command:
                    conn.execute("UPDATE runtime_command SET state='PROCESSING' WHERE id=%s", (command['id'],))
                    with inflight_lock:
                        inflight.add(command['id']); inflight_runs.add(command['payload']['runId'])
            if not command:
                slots.release()
                continue
            executor.submit(execute, command)
        except Exception:
            if command:
                with inflight_lock:
                    inflight.discard(command['id']); inflight_runs.discard(command['payload']['runId'])
            slots.release()
            stop.wait(1)


@asynccontextmanager
async def lifespan(app):
    global store
    # Deployment is deliberately single-active. OS lock also prevents accidental duplicate local starts.
    lock_path = Path(__file__).resolve().parents[1]/'.local/runtime.lock'
    lock_path.parent.mkdir(exist_ok=True)
    lock_handle = lock_path.open('a+b')
    lock_handle.seek(0)
    lock_handle.write(b'0')
    lock_handle.flush()
    lock_handle.seek(0)
    if os.name == 'nt':
        import msvcrt
        msvcrt.locking(lock_handle.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        import fcntl
        fcntl.flock(lock_handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    if len(os.environ.get('NF_SERVICE_TOKEN', '')) < 32: raise RuntimeError('Service credential required')
    store = Store()
    archive_current()
    store.execute("UPDATE runtime_command SET state='ACCEPTED' WHERE state='PROCESSING'")
    thread = threading.Thread(target=poll, name='root-command-dispatcher', daemon=True)
    thread.start()
    yield
    stop.set()
    thread.join(timeout=2)
    executor.shutdown(wait=True)
    store.pool.close()
    lock_handle.close()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.post('/memory')
def memory(body:dict,request:Request):
    scope=store.memories.namespace(request.headers.get('x-nf-workspace',''),body['userId'],body['definitionId'])
    action=body.get('action','list')
    if action=='list': return {'items':store.memories.list(scope)}
    if action=='save': return {'item':store.memories.save(scope,body)}
    if action=='delete':
        store.memories.delete(scope,body['id'])
        return {'deleted':True}
    raise ExecutionError('MEMORY_SOURCE_INVALID')


@app.post('/mcp/validate-url')
def mcp_validate_url(body:dict):
    from .mcp_transport import validate_url
    validate_url(body['url'],body.get('testWorkspace',False))
    return {'valid':True}


@app.post('/mcp/discover')
def mcp_discover(body:dict):
    from .mcp_tools import discover_sync
    return discover_sync(body)


@app.middleware('http')
async def service_auth(request: Request, call_next):
    if request.url.path == '/health': return await call_next(request)
    expected = 'Bearer '+os.environ.get('NF_SERVICE_TOKEN', '')
    if not hmac.compare_digest(request.headers.get('authorization', ''), expected):
        return JSONResponse({'code': 'SERVICE_AUTH_REQUIRED'}, status_code=401)
    if int(request.headers.get('content-length', '0')) > 262144:
        return JSONResponse({'code': 'BODY_TOO_LARGE'}, status_code=413)
    try: return await call_next(request)
    except ExecutionError as error:
        status = 429 if error.code == 'RUNTIME_CAPACITY' else 409 if error.code == 'COMMAND_CONFLICT' else 404 if error.code == 'RUN_NOT_FOUND' else 422
        return JSONResponse({'code': error.code, 'path': error.path}, status_code=status)
    except (SchemaError, ValueError, KeyError, TypeError):
        return JSONResponse({'code': 'INVALID_REQUEST'}, status_code=422)


@app.get('/health')
def health(): return {'status': 'UP', 'bootId': boot_id}


@app.get('/diagnostics')
def diagnostics():
    if os.getenv('NF_TEST_MODE') != 'true': return JSONResponse({'code':'NOT_FOUND'},status_code=404)
    with inflight_lock: active = len(inflight)
    return {'pid':os.getpid(),'bootId':boot_id,'sourceDigest':BOOT_SOURCE_DIGEST,'bundleDigest':bundle_digest(),
            'activeRuns':active,'threads':threading.active_count(),'pool':store.pool.get_stats()}


@app.post('/validate')
def compile_spec(body: dict):
    if 'spec' in body and 'bundleDigest' in body:
        compiler,_=resolve(body['bundleDigest'])
        try: return compiler.validate(body['spec'])
        except Exception as error:
            raise ExecutionError(getattr(error,'code','INVALID_EXECUTION_SPEC'),getattr(error,'path','')) from None
    manifest=validate(body); archive_current(); return manifest


@app.post('/versions/verify')
def verify_version(body:dict): return verify(body['spec'],body['manifest'])


@app.get('/capabilities')
def capabilities():
    return {'dslVersion': '2.0', 'bundleDigest': bundle_digest(), 'singleActiveRuntime': True,
            'nodes': [{'type': kind, 'enabled': True} for kind in ['input', 'transform', 'agent_call', 'workflow_call', 'tool', 'output','branch','parallel','human']],
            'disabledNodes': ['map', 'loop', 'model'],
            'models': [{'id': 'fixture', 'mode': 'fixture'}, {'id': 'validation-model', 'mode': 'live',
                        'available': all(os.getenv(key) for key in ['NF_MODEL_API_KEY', 'NF_MODEL_BASE_URL', 'NF_MODEL_NAME'])}],
            'tools': [{'name':'inspect_text','readOnly':True,'category':'text','inputSchema':{'type':'object','properties':{'text':{'type':'string','title':'文本'}},'required':['text']}},
                      {'name':'word_count','readOnly':True,'category':'text','inputSchema':{'type':'object','properties':{'text':{'type':'string','title':'文本'}},'required':['text']}}]+CATALOG,
            'tokenReservationPolicy':'unlimited' if unlimited_token_reservations() else 'definition',
            'pricingPolicy': 'VALIDATION_UNPRICED' if os.getenv('NF_VALIDATION_UNPRICED') == 'true' else 'PRICED_ONLY'}


@app.post('/commands', status_code=202)
def commands(body: dict):
    if body.get('kind') not in {'START','RESUME','CANCEL'}: raise ExecutionError('COMMAND_NOT_ENABLED')
    for key in ['runId','commandId','workspaceId']: uuid.UUID(body[key])
    if body['kind']!='START':
        if body['kind']=='RESUME':
            if not isinstance(body['resumes'],dict) or not 1<=len(body['resumes'])<=16 or not isinstance(body['checkpointRef'],str) or not isinstance(body.get('interactionRef'),str): raise ExecutionError('INVALID_RESUME_REQUEST')
            for identity,decision in body['resumes'].items():
                if not isinstance(identity,str) or not identity or not isinstance(decision,dict) or set(decision)!={'approved','comment','decisionId'} or type(decision['approved']) is not bool or not isinstance(decision['comment'],str) or len(decision['comment'])>2000:
                    raise ExecutionError('INVALID_APPROVAL_DECISION')
                uuid.UUID(decision['decisionId'])
        with store.acceptance_lock: store.accept(body)
        fault('inbox_committed')
        return {'commandId':body['commandId'],'runId':body['runId'],'status':'ACCEPTED'}
    uuid.UUID(body['versionId'])
    verify(body['spec'],body['manifest'])
    validate_data(body['spec']['inputSchema'], body['input'])
    for version, child in body.get('dependencies', {}).items():
        uuid.UUID(version)
        verify(child['spec'],child['manifest'])
        if child['manifest']['bundleDigest']!=body['manifest']['bundleDigest']: raise ExecutionError('DEPENDENCY_BUNDLE_MISMATCH')
    allowed = body.get('authorizedConnections', [])
    required = [body['spec']]+[child['spec'] for child in body.get('dependencies', {}).values()]
    # Workflows orchestrate their dependencies; only Agent definitions consume a
    # model connection. Never invent a fixture requirement for a Workflow root.
    if any(spec['agent']['modelConnectionRef'] not in allowed
           for spec in required if spec['kind'] == 'agent'):
        raise ExecutionError('CONNECTION_USE_DENIED')
    with store.acceptance_lock:
        store.accept(body)
    return {'commandId': body['commandId'], 'runId': body['runId'], 'status': 'ACCEPTED'}


@app.get('/runs/{run_id}')
def run_view(run_id: uuid.UUID, request: Request):
    return store.view(str(run_id), request.headers.get('x-nf-workspace', ''))


@app.get('/commands/{command_id}')
def command_status(command_id:uuid.UUID,request:Request):
    row=store.one("SELECT c.state,c.payload->>'runId' AS run_id FROM runtime_command c JOIN run_root r ON r.id=(c.payload->>'runId')::uuid WHERE c.id=%s AND r.workspace_id=%s",(str(command_id),request.headers.get('x-nf-workspace','')))
    if not row: raise ExecutionError('RUN_NOT_FOUND')
    return {'commandId':str(command_id),'status':row['state'],'runId':row['run_id']}


@app.get('/runs/{run_id}/events')
def events(run_id: uuid.UUID, request: Request, after: int = 0):
    store.view(str(run_id), request.headers.get('x-nf-workspace', ''))
    if after < 0: raise ExecutionError('INVALID_CURSOR')
    if not streams.acquire(blocking=False): return JSONResponse({'code': 'STREAM_CAPACITY'}, status_code=429)
    async def generate():
        cursor = after
        try:
            while not await request.is_disconnected():
                batch = await asyncio.to_thread(store.events, str(run_id), cursor)
                for event in batch:
                    cursor = event['seq']
                    yield f'id: {cursor}\nevent: execution\ndata: {canonical(event)}\n\n'
                row = await asyncio.to_thread(store.one, 'SELECT status,event_seq FROM run_root WHERE id=%s', (str(run_id),))
                if row['status'] in TERMINAL and cursor >= row['event_seq']: break
                yield ': keepalive\n\n'
                await asyncio.sleep(0.3)
        finally: streams.release()
    return StreamingResponse(generate(), media_type='text/event-stream', headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

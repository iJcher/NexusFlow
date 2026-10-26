"""Runtime-owned ledger; graph scheduling and graph State remain in LangGraph."""
from datetime import datetime, timezone
import json
import os
import time
import uuid
import threading

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from .spec import ExecutionError, digest


def fault(point):
    if os.getenv('NF_TEST_MODE') != 'true': return
    from pathlib import Path
    marker = Path(os.environ['NF_FAULT_FILE'])
    if marker.exists() and marker.read_text().strip() == point:
        marker.replace(marker.with_suffix('.triggered'))
        os._exit(86)


def read_tool_fault():
    """Private local fault injection; no definition field or HTTP switch enables this."""
    if os.getenv('NF_TEST_MODE')!='true': return
    from pathlib import Path
    marker=Path(os.environ['NF_FAULT_FILE'])
    if not marker.exists(): return
    value=marker.read_text().strip()
    if not value.startswith('read_tool_transient:'): return
    remaining=int(value.split(':')[1])
    if remaining<=0: return
    marker.write_text('read_tool_transient:'+str(remaining-1))
    raise ExecutionError('RETRYABLE_READ_TOOL')


class Store:
    def __init__(self):
        self.acceptance_lock = threading.Lock()
        self.pool = ConnectionPool(os.environ['NF_RUNTIME_DSN'], min_size=1, max_size=8,
                                  kwargs={'autocommit': True, 'row_factory': dict_row, 'prepare_threshold': 0}, timeout=10)
        self.pool.wait()
        from .long_term_memory import LongTermMemory
        self.memories=LongTermMemory(self)

    def one(self, query, params=()):
        with self.pool.connection() as conn:
            return conn.execute(query, params).fetchone()

    def all(self, query, params=()):
        with self.pool.connection() as conn:
            return conn.execute(query, params).fetchall()

    def execute(self, query, params=()):
        with self.pool.connection() as conn:
            conn.execute(query, params)

    def accept(self, payload):
        with self.pool.connection() as conn, conn.transaction():
            old = conn.execute('SELECT payload_hash FROM runtime_command WHERE id=%s', (payload['commandId'],)).fetchone()
            checksum = digest(payload)
            if old:
                if old['payload_hash'] != checksum: raise ExecutionError('COMMAND_CONFLICT')
                return
            if conn.execute("SELECT count(*) AS total FROM runtime_command WHERE state IN ('ACCEPTED','PROCESSING')").fetchone()['total'] >= 128:
                raise ExecutionError('RUNTIME_CAPACITY')
            if payload['kind']!='START':
                run=conn.execute('SELECT * FROM run_root WHERE id=%s AND workspace_id=%s FOR UPDATE',(payload['runId'],payload['workspaceId'])).fetchone()
                if not run: raise ExecutionError('RUN_NOT_FOUND')
                if payload['kind']=='RESUME' and (run['status']!='WAITING' or run['cancel_requested'] or payload['checkpointRef']!=run['checkpoint_id'] or payload['interactionRef']!=run['interaction_ref'] or not set(payload['resumes'])<={item['id'] for item in run['interrupts']}):
                    raise ExecutionError('STALE_APPROVAL_CHECKPOINT')
                conn.execute('INSERT INTO runtime_command(id,payload_hash,payload) VALUES(%s,%s,%s)',(payload['commandId'],checksum,Jsonb(payload)))
                if payload['kind']=='CANCEL' and run['status'] not in {'SUCCEEDED','FAILED','TIMED_OUT','CANCELLED','NEEDS_ATTENTION'}:
                    conn.execute('UPDATE run_root SET cancel_requested=true WHERE id=%s',(payload['runId'],))
                elif payload['kind']=='RESUME':
                    conn.execute('INSERT INTO resume_application(command_id,run_id,before_checkpoint,before_revision,decisions) VALUES(%s,%s,%s,%s,%s)',
                                 (payload['commandId'],payload['runId'],payload['checkpointRef'],payload['interactionRef'],Jsonb(payload['resumes'])))
                return
            conversation=payload.get('conversationId')
            if conversation:
                uuid.UUID(conversation)
                if payload['spec']['kind']!='agent' or payload['manifest'].get('conversationRuntimeVersion')!='1': raise ExecutionError('CONVERSATION_VERSION_UNSUPPORTED')
                previous=payload.get('previousRunId')
                if previous:
                    row=conn.execute("SELECT r.status,r.workspace_id,r.version_id,c.payload FROM run_root r JOIN runtime_command c ON c.payload->>'runId'=r.id::text AND c.payload->>'kind'='START' WHERE r.id=%s FOR UPDATE OF r",(previous,)).fetchone()
                    if not row or row['status']!='SUCCEEDED' or str(row['workspace_id'])!=payload['workspaceId'] or str(row['version_id'])!=payload['versionId'] or row['payload'].get('conversationId')!=conversation: raise ExecutionError('CONVERSATION_NOT_READY')
                elif conversation!=payload['runId']: raise ExecutionError('INVALID_CONVERSATION')
                if conn.execute("SELECT 1 FROM run_root r JOIN runtime_command c ON c.payload->>'runId'=r.id::text AND c.payload->>'kind'='START' WHERE c.payload->>'conversationId'=%s AND r.status IN ('QUEUED','RUNNING','WAITING')",(conversation,)).fetchone(): raise ExecutionError('CONVERSATION_NOT_READY')
            conn.execute('INSERT INTO run_root(id,workspace_id,version_id,bundle_hash,spec,dependencies,input) VALUES(%s,%s,%s,%s,%s,%s,%s)',
                         (payload['runId'], payload['workspaceId'], payload['versionId'], payload['manifest']['bundleDigest'],
                          Jsonb(payload['spec']), Jsonb(payload.get('dependencies', {})), Jsonb(payload['input'])))
            conn.execute('INSERT INTO runtime_command(id,payload_hash,payload) VALUES(%s,%s,%s)',
                         (payload['commandId'], checksum, Jsonb(payload)))
            live = payload['spec'].get('agent', {}).get('modelConnectionRef') == 'validation-model' or any(
                child['spec'].get('agent', {}).get('modelConnectionRef') == 'validation-model' for child in payload.get('dependencies', {}).values())
            conn.execute('UPDATE run_root SET cost_status=%s WHERE id=%s',
                         ('UNPRICED_VALIDATION' if live else 'FIXTURE_ZERO_COST', payload['runId']))
        fault('inbox_committed')

    def event(self, run_id, event_type, node_id=None, invocation_id=None, data=None,
              committed=False, checkpoint=None, event_key=None, attempt='reconcile'):
        identity = event_key or str(uuid.uuid4())
        with self.pool.connection() as conn, conn.transaction():
            row = conn.execute('SELECT event_seq FROM run_root WHERE id=%s FOR UPDATE', (run_id,)).fetchone()
            if conn.execute('SELECT 1 FROM execution_event WHERE event_id=%s', (identity,)).fetchone(): return
            seq = row['event_seq'] + 1
            conn.execute('UPDATE run_root SET event_seq=%s WHERE id=%s', (seq, run_id))
            conn.execute('INSERT INTO execution_event(run_id,seq,event_id,invocation_id,node_id,attempt_id,type,commit_status,checkpoint_ref,data) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                         (run_id, seq, identity, invocation_id, node_id, attempt, event_type,
                          'COMMITTED' if committed else 'PROGRESS', checkpoint, Jsonb(data or {})))

    def finish(self, run_id, status, output=None, code=None, attempt='reconcile'):
        # Runtime-owned outcome and its terminal event share a transaction; native checkpoints do not.
        with self.pool.connection() as conn, conn.transaction():
            row = conn.execute('SELECT event_seq,checkpoint_id FROM run_root WHERE id=%s FOR UPDATE', (run_id,)).fetchone()
            conn.execute('UPDATE run_root SET status=%s,output=%s,error_code=%s,finished_at=now() WHERE id=%s',
                         (status,Jsonb(output) if output is not None else None,code,run_id))
            key = run_id+'/terminal'
            if conn.execute('SELECT 1 FROM execution_event WHERE event_id=%s',(key,)).fetchone(): return
            seq = row['event_seq']+1
            conn.execute('UPDATE run_root SET event_seq=%s WHERE id=%s',(seq,run_id))
            data = {'output':output} if status=='SUCCEEDED' else {'code':code,'status':status}
            conn.execute('INSERT INTO execution_event(run_id,seq,event_id,attempt_id,type,commit_status,checkpoint_ref,data) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)',
                         (run_id,seq,key,attempt,'run.completed' if status=='SUCCEEDED' else 'run.failed','COMMITTED',row['checkpoint_id'],Jsonb(data)))

    def invocation(self, identity, run_id, parent, node, kind, inputs, version=None):
        with self.pool.connection() as conn, conn.transaction():
            conn.execute('INSERT INTO invocation(id,run_id,parent_id,node_id,kind,version_id,input_hash,input) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING',
                         (identity, run_id, parent, node, kind, version, digest(inputs), Jsonb(inputs)))
            row = conn.execute('SELECT * FROM invocation WHERE id=%s', (identity,)).fetchone()
            if row['input_hash'] != digest(inputs) or row['version_id'] != version:
                raise ExecutionError('INVOCATION_IDENTITY_CONFLICT')
            return row

    def complete_invocation(self, identity, output):
        self.execute("UPDATE invocation SET status='SUCCEEDED',output=%s WHERE id=%s", (Jsonb(output), identity))

    def reserve(self, run_id, field, limit, amount=1):
        if field not in {'model_calls', 'tool_calls', 'tokens'}: raise ValueError('Invalid budget field')
        from .token_policy import unlimited_token_reservations
        with self.pool.connection() as conn, conn.transaction():
            row = conn.execute('SELECT deadline FROM run_root WHERE id=%s FOR UPDATE', (run_id,)).fetchone()
            if row['deadline'] and row['deadline'] < datetime.now(timezone.utc): raise ExecutionError('DEADLINE_EXCEEDED')
            if field=='tokens' and unlimited_token_reservations():
                changed = conn.execute('UPDATE run_root SET tokens=tokens+%s WHERE id=%s RETURNING id',(amount,run_id)).fetchone()
            else:
                changed = conn.execute(f'UPDATE run_root SET {field}={field}+%s WHERE id=%s AND {field}+%s<=%s RETURNING id',
                                       (amount, run_id, amount, limit)).fetchone()
            if not changed: raise ExecutionError('BUDGET_EXHAUSTED_'+field.upper())

    def cached_operation(self, key, run_id, inputs, budget, action):
        row = self.one('SELECT input_hash,result FROM operation_receipt WHERE operation_key=%s', (key,))
        if row:
            if row['input_hash'] != digest(inputs): raise ExecutionError('OPERATION_CONFLICT')
            return row['result'], True
        self.reserve(run_id, 'tool_calls', budget['maxToolCalls'])
        result = action()
        # Only read-only registered tools are supported by M1; no external write retry contract is implied.
        self.execute('INSERT INTO operation_receipt(operation_key,run_id,input_hash,result) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING',
                     (key, run_id, digest(inputs), Jsonb(result)))
        return result, False

    def events(self, run_id, after):
        rows = self.all('SELECT e.*,i.parent_id FROM execution_event e LEFT JOIN invocation i ON i.id=e.invocation_id WHERE e.run_id=%s AND e.seq>%s ORDER BY e.seq LIMIT 200', (run_id, after))
        return [{'eventId': row['event_id'], 'runId': str(row['run_id']), 'seq': row['seq'],
                 'invocationId': row['invocation_id'], 'parentInvocationId': row['parent_id'],
                 'scope': 'INVOCATION' if row['invocation_id'] else 'ROOT',
                 'nodeId': row['node_id'], 'attemptId': row['attempt_id'],
                 'type': row['type'], 'commitStatus': row['commit_status'], 'checkpointRef': row['checkpoint_ref'],
                 'payloadVersion': '2.0', 'time': row['created_at'].isoformat(), 'data': row['data']} for row in rows]

    def view(self, run_id, workspace):
        row = self.one('SELECT * FROM run_root WHERE id=%s AND workspace_id=%s', (run_id, workspace))
        if not row: raise ExecutionError('RUN_NOT_FOUND')
        return {'runId': str(row['id']), 'versionId': str(row['version_id']), 'status': row['status'], 'input': row['input'],
                'cancelRequested':row['cancel_requested'],'interrupts':row['interrupts'],'interactionRef':row['interaction_ref'],
                'output': row['output'], 'errorCode': row['error_code'], 'highWaterSeq': row['event_seq'],
                'checkpointRef': row['checkpoint_id'], 'usage': {'modelCalls': row['model_calls'], 'toolCalls': row['tool_calls'],
                    'tokensReserved': row['tokens'], 'costStatus': row['cost_status']},
                'invocations': [{**item, 'run_id': str(item['run_id']), 'created_at': item['created_at'].isoformat()} for item in
                    self.all('SELECT * FROM invocation WHERE run_id=%s ORDER BY created_at,id', (run_id,))]}

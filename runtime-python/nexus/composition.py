"""Invocation governance around native subgraphs. No execution scheduler or Agent loop."""
from datetime import datetime, timezone, timedelta

from .spec import ExecutionError
from .token_policy import runtime_budget_spec, unlimited_token_reservations


def definition_identity(execution, version):
    descriptor = execution.run['dependencies'].get(str(version), {})
    # Pre-M3 roots have no root descriptor. Their archived engine never calls this.
    return descriptor.get('definitionId', str(version))


def ancestors(execution, identity):
    return [row for row in execution.store.all(
        'SELECT id,version_id,created_at FROM invocation WHERE run_id=%s AND version_id IS NOT NULL',
        (execution.run_id,)) if identity == row['id'] or identity.startswith(row['id']+'/')]


def enter(execution, version, identity):
    lineage = [row for row in ancestors(execution, identity) if row['id'] != identity]
    if len(lineage) >= 4:
        raise ExecutionError('CALL_DEPTH_EXCEEDED')
    target = definition_identity(execution, version)
    if any(definition_identity(execution, row['version_id']) == target for row in lineage):
        raise ExecutionError('RECURSIVE_CALL_BLOCKED')


def check_scope(execution,identity):
    execution.check_control()
    now=datetime.now(timezone.utc)
    deadline=execution.run.get('deadline') or now+timedelta(seconds=execution.run['spec']['budget']['timeoutSeconds'])
    for row in ancestors(execution,identity):
        descriptor=execution.run['dependencies'].get(row['version_id'])
        spec=descriptor['spec'] if descriptor else execution.run['spec']
        if (now-row['created_at']).total_seconds() >= spec['budget']['timeoutSeconds']:
            raise ExecutionError('DEADLINE_EXCEEDED')
        deadline=min(deadline,row['created_at']+timedelta(seconds=spec['budget']['timeoutSeconds']))
    return deadline


def charge(execution, key, field, amount=1):
    fields = {'model_calls':'maxModelCalls', 'tool_calls':'maxToolCalls', 'tokens':'maxTokens'}
    if field not in fields: raise ValueError('Invalid budget field')
    scopes = []
    for row in ancestors(execution,key):
        descriptor = execution.run['dependencies'].get(row['version_id'])
        spec = descriptor['spec'] if descriptor else execution.run['spec']
        budget = runtime_budget_spec(spec)['budget']
        scopes.append((row['id'], budget[fields[field]], row['created_at'], budget['timeoutSeconds']))
    with execution.store.pool.connection() as conn, conn.transaction():
        root = conn.execute('SELECT * FROM run_root WHERE id=%s FOR UPDATE',(execution.run_id,)).fetchone()
        now = datetime.now(timezone.utc)
        if root['cancel_requested']: raise ExecutionError('CANCEL_REQUESTED')
        if root['deadline'] and now >= root['deadline']: raise ExecutionError('DEADLINE_EXCEEDED')
        if conn.execute('SELECT 1 FROM budget_charge WHERE run_id=%s AND charge_key=%s AND field=%s',
                        (execution.run_id,key,field)).fetchone(): return
        for identity,limit,started,seconds in scopes:
            if (now-started).total_seconds() >= seconds: raise ExecutionError('DEADLINE_EXCEEDED')
            if field=='tokens' and unlimited_token_reservations(): continue
            total = conn.execute('SELECT coalesce(sum(amount),0) AS total FROM budget_charge WHERE run_id=%s AND field=%s AND left(charge_key,%s)=%s',
                                 (execution.run_id,field,len(identity)+1,identity+'/')).fetchone()['total']
            if total+amount > limit: raise ExecutionError('BUDGET_EXHAUSTED_'+field.upper())
        conn.execute('INSERT INTO budget_charge(run_id,charge_key,field,amount) VALUES(%s,%s,%s,%s)',
                     (execution.run_id,key,field,amount))
        conn.execute(f'UPDATE run_root SET {field}={field}+%s WHERE id=%s',(amount,execution.run_id))


def read_operation(execution,key,inputs,action):
    from .spec import digest
    from psycopg.types.json import Jsonb
    receipt = execution.store.one('SELECT input_hash,result FROM operation_receipt WHERE operation_key=%s',(key,))
    if receipt:
        if receipt['input_hash'] != digest(inputs): raise ExecutionError('OPERATION_CONFLICT')
        return receipt['result'],True
    from langgraph.runtime import get_runtime
    info=get_runtime().execution_info
    attempt=info.node_attempt if info else 1
    # A confirmed receipt is free to replay. Actual read retries consume separate
    # attempts; interrupted native child execution intents are charged elsewhere.
    charge(execution,key+'/read-attempt/'+execution.attempt+'/'+str(attempt),'tool_calls')
    result=action()
    from .store import fault
    fault('read_result_before_receipt')
    execution.store.execute('INSERT INTO operation_receipt(operation_key,run_id,input_hash,result) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING',
                            (key,execution.run_id,digest(inputs),Jsonb(result)))
    return result,False

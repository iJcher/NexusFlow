"""Public answer projection; native LangGraph still owns model/tool execution.

This observer wraps the pinned Execution class, including historical bundles. It
never changes the definition, Agent prompt, checkpoint State or model receipts.
"""
from functools import lru_cache
import hashlib
import time

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.runnables.config import ensure_config, merge_configs, set_config_context
from langchain_core.utils.json import parse_partial_json
from .token_policy import runtime_budget_spec
from .store import fault


class AnswerObserver(BaseCallbackHandler):
    run_inline = True
    raise_error = False

    def __init__(self, execution, identity, schema):
        self.execution, self.identity = execution, identity
        self.fields = {key for key, value in schema.get('properties', {}).items() if value.get('type') == 'string'}
        self.messages = {}
        self.foreign_models = set()

    def on_chat_model_start(self, serialized, messages, *, run_id, metadata=None, **kwargs):
        owner=(metadata or {}).get('nf_agent_invocation')
        if (metadata or {}).get('nf_internal_context') or (owner is not None and owner != self.identity):
            self.foreign_models.add(str(run_id))

    def emit(self, kind, message, **data):
        self.execution.event('answer.'+kind, 'agent', self.identity,
                             {'messageId':message['id'], 'ordinal':message['ordinal'], **data})

    def on_llm_new_token(self, token, *, run_id, chunk=None, **kwargs):
        if str(run_id) in self.foreign_models:
            return
        # Inspect only public content, never reasoning blocks or tool arguments.
        content = getattr(getattr(chunk, 'message', None), 'content', None)
        if not isinstance(content, str) or not content or not self.fields:
            return
        key = str(run_id)
        if key not in self.messages:
            if len(self.messages) >= 20:
                return
            self.messages[key] = {'id':hashlib.sha256((self.identity+self.execution.attempt+key).encode()).hexdigest(),
                                  'raw':'', 'sent':{}, 'last':0, 'ordinal':0, 'started':False}
        message = self.messages[key]
        if len(message['raw']) + len(content) > 262144:
            return
        message['raw'] += content
        if time.monotonic()-message['last'] >= .12:
            self.flush(message)

    def flush(self, message):
        raw = message['raw'].lstrip()
        if raw.startswith('```'):
            if '\n' not in raw:
                return
            raw = raw.split('\n',1)[1]
        try:
            parsed = parse_partial_json(raw)
        except (ValueError, TypeError):
            return
        if not isinstance(parsed, dict):
            return
        fields = {}
        for key,value in parsed.items():
            if key not in self.fields or not isinstance(value,str):
                continue
            # Partial JSON may end between an escaped UTF-16 surrogate pair.
            # Wait for a complete character rather than sending invalid UTF-8/JSONB.
            try:
                value.encode('utf-8')
            except UnicodeEncodeError:
                continue
            fields[key] = value.replace('\x00','\ufffd')
        changed = {key:value for key,value in fields.items() if message['sent'].get(key) != value}
        if not changed or message['ordinal'] >= 256:
            return
        if not message['started']:
            self.emit('begin',message)
            message['started'] = True
        # Bounded replace projections tolerate partial escape decoding corrections.
        message['ordinal'] += 1
        self.emit('delta',message, fields=changed)
        if any(changed.values()):
            fault('answer_delta_committed')
        message['sent'].update(changed)
        message['last'] = time.monotonic()

    def on_llm_end(self, response, *, run_id, **kwargs):
        message = self.messages.get(str(run_id))
        if message:
            self.flush(message)

    def finish(self, status):
        for message in self.messages.values():
            if message['started']:
                message['ordinal'] += 1
                self.emit('end', message, status=status)


@lru_cache(maxsize=16)
def observed_execution(base):
    class ObservedExecution(base):
        def __init__(self, store, run, attempt):
            super().__init__(store,{**run,'spec':runtime_budget_spec(run['spec'])},attempt)

        def agent(self, spec, identity, inputs):
            spec = runtime_budget_spec(spec)
            observer = AnswerObserver(self,identity,spec['outputSchema'])
            config = merge_configs(ensure_config(), {'callbacks':[observer], 'metadata':{'nf_agent_invocation':identity}})
            try:
                # The context is local to this invocation, including parallel calls.
                with set_config_context(config) as context:
                    output = context.run(super().agent,spec,identity,inputs)
                observer.finish('VALIDATED')
                return output
            except BaseException:
                observer.finish('INTERRUPTED')
                raise
    return ObservedExecution

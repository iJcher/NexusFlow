"""Trusted local execution bundles. No user-supplied source or dependency installation."""
import hashlib
import importlib.metadata
import importlib.util
import json
from pathlib import Path
import re
import shutil
import sys
import threading

from .spec import ROOT, ExecutionError, bundle_digest

BASE=ROOT/'runtime-python/.local/bundles'
LOCK=threading.RLock()
MODULES={}
PACKAGES=['langchain','langgraph','langgraph-checkpoint','langgraph-checkpoint-postgres','fastapi','psycopg','jsonschema','openai','fastmcp','mcp']


def archive_current():
    value=bundle_digest(); destination=BASE/value
    with LOCK:
        if (destination/'bundle.json').exists(): return value
        destination.mkdir(parents=True,exist_ok=True)
        paths=list((ROOT/'runtime-python/nexus').glob('*.py'))+[ROOT/'runtime-python/requirements.lock.txt',ROOT/'contracts/execution-dsl/v2/execution.schema.json']
        for path in paths:
            target=destination/path.relative_to(ROOT); target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(path,target)
        metadata={'digest':value,'format':2,'files':{str(path.relative_to(ROOT)):hashlib.sha256(path.read_bytes()).hexdigest() for path in paths},
                  'libraries':{name:importlib.metadata.version(name) for name in PACKAGES}}
        temporary=destination/'bundle.pending'
        temporary.write_text(json.dumps(metadata,sort_keys=True),encoding='utf-8')
        temporary.replace(destination/'bundle.json')
    return value


def resolve(value):
    if value==bundle_digest():
        from . import spec,graphs
        return spec,graphs
    if not re.fullmatch('[a-f0-9]{64}',value): raise ExecutionError('UNSUPPORTED_EXECUTION_VERSION')
    with LOCK:
        directory=BASE/value; metadata_path=directory/'bundle.json'
        if not metadata_path.is_file(): raise ExecutionError('UNSUPPORTED_EXECUTION_VERSION')
        metadata=json.loads(metadata_path.read_text())
        if metadata['digest']!=value: raise ExecutionError('EXECUTION_BUNDLE_INVALID')
        for relative,expected in metadata['files'].items():
            path=(directory/relative).resolve()
            if not path.is_relative_to(directory.resolve()) or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=expected:
                raise ExecutionError('EXECUTION_BUNDLE_INVALID')
        if any(importlib.metadata.version(name)!=expected for name,expected in metadata['libraries'].items()):
            raise ExecutionError('UNSUPPORTED_EXECUTION_DEPENDENCIES')
        if value not in MODULES:
            name='_nexus_bundle_'+value
            package=directory/'runtime-python/nexus'
            definition=importlib.util.spec_from_file_location(name,package/'__init__.py',submodule_search_locations=[str(package)])
            module=importlib.util.module_from_spec(definition); sys.modules[name]=module; definition.loader.exec_module(module)
            from importlib import import_module
            spec=import_module(name+'.spec'); graphs=import_module(name+'.graphs')
            if spec.bundle_digest()!=value: raise ExecutionError('EXECUTION_BUNDLE_INVALID')
            MODULES[value]=(spec,graphs)
        return MODULES[value]


def verify(specification,manifest):
    compiler,_=resolve(manifest['bundleDigest'])
    try: actual=compiler.validate(specification)
    except Exception as error: raise ExecutionError(getattr(error,'code','INVALID_EXECUTION_SPEC'),getattr(error,'path','')) from None
    if actual!=manifest: raise ExecutionError('UNSUPPORTED_EXECUTION_VERSION')
    return actual

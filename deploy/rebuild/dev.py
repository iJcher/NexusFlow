"""Isolated local environment. Never connects to a pre-existing application database."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import secrets
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
LOCAL = Path(__file__).parent / '.local'
PYTHON = ROOT / 'runtime-python/.venv/Scripts/python.exe'
PG = Path(os.environ.get('NF_POSTGRES_BIN', str(ROOT / 'experiments/java-langgraph-poc/.postgres/pgsql/bin')))
HIDDEN = getattr(subprocess, 'CREATE_NO_WINDOW', 0)


def load():
    return json.loads((LOCAL / 'config.json').read_text(encoding='utf-8'))


def environment():
    cfg = load()
    if 'toolEncryptionKey' not in cfg:
        import base64
        cfg['toolEncryptionKey']=base64.b64encode(secrets.token_bytes(32)).decode()
        (LOCAL/'config.json').write_text(json.dumps(cfg),encoding='utf-8')
    env = dict(os.environ)
    from psycopg.conninfo import make_conninfo
    env.update(NF_RUNTIME_DSN=make_conninfo(host='127.0.0.1', port=19432, dbname='nexus_rebuild',
                   user='nf_runtime_user', password=cfg['runtimePassword'], options='-c search_path=nf_runtime'),
               NF_SERVICE_TOKEN=cfg['serviceToken'], NF_BROWSER_ORIGIN='http://127.0.0.1:30061',
               NF_DB_URL='jdbc:postgresql://127.0.0.1:19432/nexus_rebuild?currentSchema=nf_control',
               NF_DB_USER='nf_control_user', NF_DB_PASSWORD=cfg['controlPassword'],
               NF_BOOTSTRAP_USER='developer', NF_BOOTSTRAP_PASSWORD=cfg['loginPassword'],
               NF_ACCEPTANCE_PASSWORD=cfg['acceptancePassword'],
               NF_EMAIL_PEPPER=cfg['emailPepper'], NF_OWNER_EMAIL=os.environ.get('NF_OWNER_EMAIL',cfg.get('ownerEmail','')),
               NF_TOOL_ENCRYPTION_KEY=cfg['toolEncryptionKey'], NF_CONTROL_URL='http://127.0.0.1:19081',
               NF_MCP_TEST_URL='http://127.0.0.1:19084/mcp',
               NF_VALIDATION_UNPRICED='true', NF_TOKEN_RESERVATION_POLICY='unlimited', NF_TEST_MODE='true', NF_FAULT_FILE=str(LOCAL/'fault'),
               NF_PAUSE_OUTBOX_FILE=str(LOCAL/'pause-outbox'), LANGSMITH_TRACING='false', LANGCHAIN_TRACING_V2='false')
    local_source=LOCAL.parent/'.env'
    # Fresh clones configure this project; retain the already-authorized local fallback.
    source = Path(os.environ.get('NF_MODEL_ENV_FILE', str(local_source if local_source.exists() else Path('D:/Code/hello-agent/.env'))))
    allowed = {'LLM_API_KEY': 'NF_MODEL_API_KEY', 'LLM_BASE_URL': 'NF_MODEL_BASE_URL', 'LLM_MODEL_ID': 'NF_MODEL_NAME','NEXUS_OWNER_EMAIL':'NF_OWNER_EMAIL'}
    if source.exists():
        for line in source.read_text(encoding='utf-8-sig').splitlines():
            key, separator, value = line.strip().partition('=')
            if separator and key in allowed and value.strip().strip('"').strip("'"):
                env[allowed[key]] = value.strip().strip('"').strip("'")
    smtp_allowed={'SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASSWORD','SMTP_FROM'}
    for smtp_source in [ROOT/'.env.live',local_source]:
        if smtp_source.exists():
            for line in smtp_source.read_text(encoding='utf-8-sig').splitlines():
                key,separator,value=line.strip().partition('=')
                if separator and key in smtp_allowed and value.strip().strip('"').strip("'"): env['NF_'+key]=value.strip().strip('"').strip("'")
    return env


def migrate(connection, file):
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    with connection.transaction():
        connection.execute('CREATE TABLE IF NOT EXISTS schema_migration(name text PRIMARY KEY, hash text NOT NULL)')
        found = connection.execute('SELECT hash FROM schema_migration WHERE name=%s', (file.name,)).fetchone()
        if found:
            if found[0] != digest:
                raise RuntimeError('Applied migration checksum changed: ' + file.name)
            return
        connection.execute(file.read_text(encoding='utf-8'))
        connection.execute('INSERT INTO schema_migration VALUES (%s,%s)', (file.name, digest))


def setup():
    import psycopg
    from psycopg import sql
    LOCAL.mkdir(exist_ok=True)
    config_file = LOCAL / 'config.json'
    if not config_file.exists():
        cfg = {key: secrets.token_urlsafe(32) for key in
               ['adminPassword', 'controlPassword', 'runtimePassword', 'serviceToken', 'loginPassword']}
        config_file.write_text(json.dumps(cfg), encoding='utf-8')
        (LOCAL / 'login.txt').write_text('Username: developer\nPassword: ' + cfg['loginPassword'] + '\n', encoding='utf-8')
    cfg = load()
    if 'acceptancePassword' not in cfg:
        cfg['acceptancePassword']=secrets.token_urlsafe(32)
        config_file.write_text(json.dumps(cfg),encoding='utf-8')
    if 'emailPepper' not in cfg:
        cfg['emailPepper']=secrets.token_urlsafe(32)
        config_file.write_text(json.dumps(cfg),encoding='utf-8')
    data = LOCAL / 'pgdata'
    if not (data / 'PG_VERSION').exists():
        password_file = LOCAL / 'pg-password'
        password_file.write_text(cfg['adminPassword'], encoding='utf-8')
        subprocess.run([str(PG / 'initdb.exe'), '-D', str(data), '-U', 'nf_dev_admin', '-A', 'scram-sha-256',
                        '--pwfile', str(password_file), '--encoding=UTF8', '--locale=C'], check=True)
    ready = subprocess.run([str(PG / 'pg_isready.exe'), '-h', '127.0.0.1', '-p', '19432'], capture_output=True)
    if ready.returncode:
        subprocess.run([str(PG / 'pg_ctl.exe'), '-D', str(data), '-l', str(LOCAL / 'postgres.log'),
                        '-o', '-h 127.0.0.1 -p 19432', '-w', 'start'], check=True)
    admin = dict(host='127.0.0.1', port=19432, user='nf_dev_admin', password=cfg['adminPassword'])
    with psycopg.connect(**admin, dbname='postgres', autocommit=True) as conn:
        for role, key in [('nf_control_user', 'controlPassword'), ('nf_runtime_user', 'runtimePassword')]:
            if not conn.execute('SELECT 1 FROM pg_roles WHERE rolname=%s', (role,)).fetchone():
                conn.execute(sql.SQL('CREATE ROLE {} LOGIN PASSWORD {}').format(sql.Identifier(role), sql.Literal(cfg[key])))
        if not conn.execute("SELECT 1 FROM pg_database WHERE datname='nexus_rebuild'").fetchone():
            conn.execute('CREATE DATABASE nexus_rebuild')
    with psycopg.connect(**admin, dbname='nexus_rebuild', autocommit=True) as conn:
        conn.execute('REVOKE ALL ON DATABASE nexus_rebuild FROM PUBLIC')
        conn.execute('GRANT CONNECT ON DATABASE nexus_rebuild TO nf_control_user,nf_runtime_user')
        conn.execute('REVOKE ALL ON SCHEMA public FROM PUBLIC')
        conn.execute('CREATE SCHEMA IF NOT EXISTS nf_control AUTHORIZATION nf_control_user')
        conn.execute('CREATE SCHEMA IF NOT EXISTS nf_runtime AUTHORIZATION nf_runtime_user')
    for role, key, schema, file in [
        ('nf_control_user', 'controlPassword', 'nf_control', ROOT/'backend-java/src/main/resources/db/V001__control.sql'),
        ('nf_runtime_user', 'runtimePassword', 'nf_runtime', ROOT/'runtime-python/migrations/V001__runtime.sql')]:
        with psycopg.connect(host='127.0.0.1', port=19432, dbname='nexus_rebuild', user=role,
                             password=cfg[key], options='-c search_path='+schema, autocommit=True) as conn:
            for migration in sorted(file.parent.glob('V*.sql')):
                migrate(conn, migration)
            if schema == 'nf_runtime':
                from langgraph.checkpoint.postgres import PostgresSaver
                PostgresSaver(conn).setup()
    print('Isolated PostgreSQL ready on 127.0.0.1:19432; local login: deploy/rebuild/.local/login.txt')


def start(service):
    import shutil
    if service=='python':
        existing=runtime_pid(require_current=True)
        if existing:
            (LOCAL/'python.pid').write_text(str(existing),encoding='ascii')
            print('python already ready, pid='+str(existing))
            return
    env = environment()
    commands = {
        'python': ([str(PYTHON), '-m', 'uvicorn', 'nexus.app:app', '--host', '127.0.0.1', '--port', '19082', '--no-access-log'], ROOT/'runtime-python'),
        'java': (['java', '-jar', str(ROOT/'backend-java/target/nexusflow-control-0.1.0.jar')], ROOT),
        'front': ([shutil.which('pnpm.cmd') or 'pnpm.cmd', 'dev', '--host', '127.0.0.1', '--port', '30061'], ROOT/'front'),
        'smtp': ([str(PYTHON), str(ROOT/'tests/rebuild/smtp_sink.py')], ROOT),
    }
    command, cwd = commands[service]
    pid_file = LOCAL / (service + '.pid')
    with (LOCAL/(service+'.log')).open('ab') as log:
        process = subprocess.Popen(command, cwd=cwd, env=env, stdout=log, stderr=log, creationflags=HIDDEN)
    pid_file.write_text(str(process.pid), encoding='ascii')
    if service=='smtp':
        import socket
        for _ in range(100):
            if process.poll() is not None: raise RuntimeError('SMTP sink exited')
            try:
                with socket.create_connection(('127.0.0.1',19083),timeout=1):
                    print('Local acceptance SMTP ready, pid='+str(process.pid)); return
            except OSError: time.sleep(.2)
        raise RuntimeError('SMTP sink readiness timed out')
    import httpx
    address={'python':'http://127.0.0.1:19082/health','java':'http://127.0.0.1:19081/api/v2/health','front':'http://127.0.0.1:30061/rebuild.html'}[service]
    for _ in range(100):
        if process.poll() is not None: raise RuntimeError(service+' exited; inspect its local log')
        try:
            if httpx.get(address,timeout=1,trust_env=False).status_code==200:
                if service=='python':
                    actual=runtime_pid(require_current=True)
                    if not actual: raise RuntimeError('Runtime health is not owned by this workspace')
                    pid_file.write_text(str(actual),encoding='ascii')
                    print(service+' ready, pid='+str(actual))
                    return
                print(service + ' ready, pid=' + str(process.pid))
                return
        except httpx.HTTPError: pass
        time.sleep(.2)
    raise RuntimeError(service+' readiness timed out')


def runtime_pid(require_current=False):
    """Authenticate the actual Windows server, not the venv redirector's PID."""
    import httpx
    try:
        response=httpx.get('http://127.0.0.1:19082/diagnostics',headers={'Authorization':'Bearer '+load()['serviceToken']},timeout=2,trust_env=False)
    except httpx.HTTPError: return None
    if response.status_code!=200: raise RuntimeError('Port 19082 is not this workspace runtime')
    data=response.json()
    if require_current:
        expected=hashlib.sha256(json.dumps({path.name:hashlib.sha256(path.read_bytes()).hexdigest()
            for path in (ROOT/'runtime-python/nexus').glob('*.py')},sort_keys=True,separators=(',',':')).encode()).hexdigest()
        if data.get('sourceDigest')!=expected: raise RuntimeError('Runtime has stale source; use restart-python')
    pid=data.get('pid')
    if not isinstance(pid,int) or pid<=0: raise RuntimeError('Runtime PID is unavailable')
    command=subprocess.check_output(['powershell','-NoProfile','-Command',
        f"(Get-CimInstance Win32_Process -Filter 'ProcessId = {pid}').CommandLine"],text=True).strip().replace('\\','/').lower()
    base=str(getattr(sys,'_base_executable',sys.executable)).replace('\\','/').lower()
    if base not in command or 'nexus.app:app' not in command or '--port 19082' not in command:
        raise RuntimeError('Authenticated runtime process identity mismatch')
    return pid


def shutdown(service):
    pid_file = LOCAL/(service+'.pid')
    if service=='python':
        actual=runtime_pid()
        if actual:
            subprocess.run(['taskkill','/PID',str(actual),'/T','/F'],check=True,capture_output=True)
            pid_file.unlink(missing_ok=True)
            print('python stopped (authenticated server PID)')
            return
    if not pid_file.exists(): return
    pid = int(pid_file.read_text())
    if os.name != 'nt':
        raise RuntimeError('Use the deployment supervisor on non-Windows hosts')
    line = subprocess.check_output(['powershell', '-NoProfile', '-Command',
        f"(Get-CimInstance Win32_Process -Filter 'ProcessId = {pid}').CommandLine"], text=True).strip().replace('\\', '/').lower()
    if not line: return
    expected = {'python': ['runtime-python/.venv/scripts/python.exe', 'nexus.app:app'],
                'java': ['backend-java/target/nexusflow-control-0.1.0.jar'], 'front': ['pnpm', '30061'],
                'smtp': ['tests/rebuild/smtp_sink.py']}[service]
    if not all(item in line for item in expected): raise RuntimeError('PID identity mismatch; refusing to stop service')
    subprocess.run(['taskkill', '/PID', str(pid), '/T', '/F'], check=True, capture_output=True)
    print(service+' stopped (verified PID tree)')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    services=['python','java','front','smtp']
    parser.add_argument('command', choices=['setup']+services+['stop-'+name for name in services]+['restart-'+name for name in services])
    args = parser.parse_args()
    if args.command == 'setup': setup()
    elif args.command.startswith('stop-'): shutdown(args.command[5:])
    elif args.command.startswith('restart-'):
        shutdown(args.command[8:])
        start(args.command[8:])
    else: start(args.command)

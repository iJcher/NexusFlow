"""Current process transport policy; never rely on archived security policy."""
import asyncio
import atexit
from concurrent.futures import TimeoutError as FutureTimeout
import ipaddress
import os
import socket
import threading
from urllib.parse import urlsplit, unquote

import httpx2

from .spec import ExecutionError


def validate_url(url, test_workspace=False):
    try:
        value=urlsplit(url)
        if any(ord(c)<33 for c in url) or '\\' in url or len(url)>2048 or value.username or value.password or value.fragment or value.query:
            raise ValueError()
        test_url=os.environ.get('NF_MCP_TEST_URL')
        if test_workspace and os.environ.get('NF_TEST_MODE')=='true' and test_url and url==test_url:
            if value.scheme=='http' and value.hostname=='127.0.0.1': return value
        if value.scheme!='https' or value.port not in {None,443} or not value.hostname or '%' in unquote(value.hostname): raise ValueError()
        # Literal addresses are deliberately unsupported in user connections.
        try: ipaddress.ip_address(value.hostname)
        except ValueError: pass
        else: raise ValueError()
        return value
    except (ValueError,TypeError): raise ExecutionError('MCP_URL_DENIED') from None


class BoundedStream(httpx2.AsyncByteStream):
    def __init__(self,stream): self.stream=stream
    async def __aiter__(self):
        size=0
        async for chunk in self.stream:
            size+=len(chunk)
            if size>1048576: raise ExecutionError('MCP_RESPONSE_TOO_LARGE')
            yield chunk
    async def aclose(self): await self.stream.aclose()


class PinnedTransport(httpx2.AsyncBaseTransport):
    def __init__(self,url,test_workspace=False):
        self.url=url; self.origin=validate_url(url,test_workspace)
        self.test=test_workspace and self.origin.scheme=='http'
        self.inner=httpx2.AsyncHTTPTransport(trust_env=False,retries=0,limits=httpx2.Limits(max_connections=4,max_keepalive_connections=0))

    async def handle_async_request(self,request):
        if (request.url.scheme,request.url.host,request.url.port or 443)!=(self.origin.scheme,self.origin.hostname,self.origin.port or 443):
            raise ExecutionError('MCP_URL_DENIED')
        if request.url.query or request.method not in {'POST','GET','DELETE'}: raise ExecutionError('MCP_URL_DENIED')
        try:
            records=await asyncio.wait_for(asyncio.get_running_loop().getaddrinfo(self.origin.hostname,self.origin.port or 443,type=socket.SOCK_STREAM),3)
            addresses=list(dict.fromkeys(item[4][0] for item in records))
            if not addresses or any(not ipaddress.ip_address(ip).is_global or ipaddress.ip_address(ip).is_multicast or ipaddress.ip_address(ip).is_reserved for ip in addresses) and not self.test:
                raise ExecutionError('MCP_ADDRESS_DENIED')
            pinned=request.url.copy_with(host=addresses[0])
            headers=request.headers.copy(); headers['host']=request.url.netloc.decode(); headers['accept-encoding']='identity'
            extensions={**request.extensions,'sni_hostname':self.origin.hostname}
            forwarded=httpx2.Request(request.method,pinned,headers=headers,stream=request.stream,extensions=extensions)
            response=await self.inner.handle_async_request(forwarded)
            if 300<=response.status_code<400:
                await response.aclose(); raise ExecutionError('MCP_REDIRECT_DENIED')
            if response.headers.get('content-encoding','identity')!='identity':
                await response.aclose(); raise ExecutionError('MCP_ENCODING_DENIED')
            response.stream=BoundedStream(response.stream)
            return response
        except (socket.gaierror,TimeoutError): raise ExecutionError('MCP_UNAVAILABLE') from None

    async def aclose(self): await self.inner.aclose()


def client_factory(url,test_workspace=False):
    def factory(**kwargs):
        return httpx2.AsyncClient(headers=kwargs.get('headers'),auth=kwargs.get('auth'),timeout=httpx2.Timeout(15,connect=4),
                                 follow_redirects=False,trust_env=False,transport=PinnedTransport(url,test_workspace))
    return factory


class AsyncPortal:
    """One shared I/O loop; native create_agent still owns every reasoning step."""
    def __init__(self):
        self.loop=asyncio.new_event_loop()
        self.thread=threading.Thread(target=self.loop.run_forever,name='mcp-io',daemon=True)
        self.thread.start()
    def call(self,coroutine,check=lambda:None,timeout=25):
        import time
        future=asyncio.run_coroutine_threadsafe(coroutine,self.loop); until=time.monotonic()+timeout
        try:
            while True:
                check()
                if time.monotonic()>=until: raise ExecutionError('MCP_TIMEOUT')
                try: return future.result(timeout=.15)
                except FutureTimeout: continue
        finally:
            if not future.done(): future.cancel()
    def close(self):
        async def drain():
            tasks=[task for task in asyncio.all_tasks() if task is not asyncio.current_task()]
            for task in tasks: task.cancel()
            await asyncio.gather(*tasks,return_exceptions=True)
        if self.loop.is_running():
            try: asyncio.run_coroutine_threadsafe(drain(),self.loop).result(timeout=3)
            except Exception: pass
            self.loop.call_soon_threadsafe(self.loop.stop); self.thread.join(timeout=3)


_portal=None
_lock=threading.Lock()
def io():
    global _portal
    with _lock:
        if _portal is None:
            _portal=AsyncPortal(); atexit.register(_portal.close)
        return _portal

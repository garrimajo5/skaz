"""Capture explicitly listed anonymous publisher resources, retaining every partial receipt."""
import argparse
from concurrent.futures import ThreadPoolExecutor,as_completed
from datetime import datetime,timezone
import hashlib
import http.client
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit,parse_qs

HOSTS={'www.dndbeyond.com','media.dndbeyond.com','media.wizards.com','wpn.wizards.com','marketplace.dndbeyond.com'}
REPO=Path(__file__).resolve().parents[1]

def validate_url(url):
    p=urlsplit(url)
    if p.scheme!='https' or p.hostname not in HOSTS or p.port not in [None,443] or p.username or p.password or p.fragment:
        raise ValueError('Only explicit anonymous public publisher HTTPS resources on443')
    if any(k not in {'comment','page'} or any(not v.isdigit() for v in values) for k,values in parse_qs(p.query,keep_blank_values=True).items()):
        raise ValueError('Only public numeric comment/page query parameters')
    return url

class PublicRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        validate_url(newurl)
        return super().redirect_request(req,fp,code,msg,headers,newurl)

def atomic_json(path,data):
    tmp=path.with_name(path.name+'.tmp');tmp.write_bytes((json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode('utf-8'));tmp.replace(path)

def capture_one(resource,folder,opener,timeout,max_bytes,clock=time.monotonic):
    url=resource['url'];file=resource['file'];sidecar=folder/(file+'.capture.json')
    record={'requestedUrl':url,'finalUrl':None,'status':None,'bytes':None,'sha256':None,'bodyFile':None,
            'capturedAt':datetime.now(timezone.utc).isoformat(),'outcome':'started','retried':False}
    atomic_json(sidecar,record);started=clock()
    try:
        request=urllib.request.Request(url,headers={'User-Agent':'SKAZ-publication-witness/1.0'})
        with opener.open(request,timeout=timeout) as response:
            final=validate_url(response.url);record.update(finalUrl=final,status=response.status,outcome='headers-received');atomic_json(sidecar,record)
            if response.status!=200:raise ValueError('Unexpected non200 success response')
            length_header=getattr(response,'headers',{}).get('Content-Length')
            expected=None
            if length_header is not None:
                if not re.fullmatch(r'[0-9]+',length_header.strip()):raise ValueError('Invalid Content-Length')
                expected=int(length_header);record['declaredBytes']=expected;atomic_json(sidecar,record)
                if expected>max_bytes:raise ValueError('Declared public body exceeds byte budget')
            chunks=[];size=0
            while True:
                if clock()-started>2*timeout:raise TimeoutError('Total read budget exceeded between chunks')
                chunk=response.read1(min(65536,max_bytes+1-size))
                if not chunk:break
                chunks.append(chunk);size+=len(chunk)
                if size>max_bytes:raise ValueError('Public body exceeds byte budget')
            if expected is not None and size!=expected:raise http.client.IncompleteRead(b'',max(0,expected-size))
            raw=b''.join(chunks);(folder/file).write_bytes(raw)
            record.update(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),bodyFile=file,outcome='complete')
    except urllib.error.HTTPError as exc:
        record.update(finalUrl=exc.url,status=exc.code,outcome='http-error',errorType=type(exc).__name__)
        if exc.fp is not None:exc.close()
    except (OSError,ValueError,urllib.error.URLError,http.client.HTTPException) as exc:
        record.update(outcome='capture-error',errorType=type(exc).__name__)
    finally:atomic_json(sidecar,record)
    return record

def capture_batch(resources,folder,opener=None,workers=2,timeout=15,max_bytes=20*1024*1024):
    folder=Path(folder).resolve()
    if folder.is_relative_to(REPO):raise ValueError('Raw publication captures must stay outside the repository')
    if not isinstance(resources,list) or not 1<=len(resources)<=16:raise ValueError('Explicit nonempty batch up to16 resources required')
    if not 1<=workers<=4 or not 1<=timeout<=30 or not 1<=max_bytes<=20*1024*1024:raise ValueError('Invalid capture budgets')
    names=[]
    for r in resources:
        if set(r)!={'file','url'} or not re.fullmatch(r'[a-z][a-z0-9_-]{0,50}\.(html|pdf|json|txt)',r['file']):raise ValueError('Unsafe or unexpected output name')
        if r['file']=='capture.json':raise ValueError('Reserved capture manifest name')
        validate_url(r['url']);names.append(r['file'])
    if len(set(names))!=len(names):raise ValueError('Duplicate output names would overwrite evidence')
    if folder.exists() and any(folder.iterdir()):raise FileExistsError('Use a new or empty capture directory')
    folder.mkdir(parents=True,exist_ok=True);opener=opener or urllib.request.build_opener(PublicRedirect());records={}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        tasks={pool.submit(capture_one,r,folder,opener,timeout,max_bytes):r['file'] for r in resources}
        for task in as_completed(tasks):
            name=tasks[task]
            try:records[name]=task.result()
            except Exception as exc:records[name]={'outcome':'storage-or-internal-error','errorType':type(exc).__name__,'retried':False,'receiptPersisted':(folder/(name+'.capture.json')).is_file()}
    result={name:records[name] for name in names}
    result['captureBatch']={'complete':all(r.get('outcome')=='complete' for r in records.values()),'resourceCount':len(resources),
                            'automaticRetries':False,'method':'per-resource atomic started/header/final receipts; deadline checked between read1 chunks',
                            'captureToolSha256':hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n',b'\n')).hexdigest()}
    atomic_json(folder/'capture.json',result);return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('plan',type=Path);p.add_argument('output',type=Path);args=p.parse_args()
    report=capture_batch(json.loads(args.plan.read_text(encoding='utf-8-sig')),args.output)
    print(json.dumps(report['captureBatch']));raise SystemExit(0 if report['captureBatch']['complete'] else 2)

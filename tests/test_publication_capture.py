import importlib.util
import json
import io
import http.client
from pathlib import Path
import tempfile
import unittest
import urllib.error
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('capture_witnesses',ROOT/'scripts/capture-publication-witnesses.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)

class Response:
    def __init__(self,url,body=b'public body',fail=False):self.url=url;self.status=200;self.body=body;self.fail=fail
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def read1(self,n):
        if self.fail:raise TimeoutError('fixture body interruption')
        result=self.body[:n];self.body=self.body[n:];return result
class Opener:
    def __init__(self):self.calls=[];self.denied_stream=None
    def open(self,req,timeout):
        self.calls.append(req.full_url)
        if req.full_url.endswith('/denied'):
            self.denied_stream=io.BytesIO(b'fixture denied body');raise urllib.error.HTTPError(req.full_url,403,'fixture',{},self.denied_stream)
        return Response(req.full_url,fail=req.full_url.endswith('/interrupted'))

class PublicationCaptureTest(unittest.TestCase):
    def test_failed_peer_does_not_lose_success_receipt_or_error_headers(self):
        with tempfile.TemporaryDirectory() as t:
            opener=Opener();plan=[{'file':'good.html','url':'https://www.dndbeyond.com/sources/good'},{'file':'bad.html','url':'https://www.dndbeyond.com/sources/interrupted'}]
            d=M.capture_batch(plan,t,opener=opener)
            self.assertFalse(d['captureBatch']['complete']);self.assertEqual(d['good.html']['outcome'],'complete')
            self.assertEqual(d['bad.html']['status'],200);self.assertEqual(d['bad.html']['outcome'],'capture-error')
            self.assertIsNone(d['bad.html']['sha256']);self.assertFalse((Path(t)/'bad.html').exists())
            self.assertEqual(json.loads((Path(t)/'good.html.capture.json').read_text(encoding='utf-8')),d['good.html'])
            self.assertEqual(len(opener.calls),2)

    def test_incomplete_chunk_does_not_cancel_successful_peer_or_manifest(self):
        class TruncatedResponse(Response):
            def read1(self,n):raise http.client.IncompleteRead(b'partial',100)
        class MixedOpener(Opener):
            def open(self,req,timeout):
                if req.full_url.endswith('/truncated'):return TruncatedResponse(req.full_url)
                return super().open(req,timeout)
        with tempfile.TemporaryDirectory() as t:
            d=M.capture_batch([{'file':'good.html','url':'https://www.dndbeyond.com/good'},{'file':'bad.html','url':'https://www.dndbeyond.com/truncated'}],t,opener=MixedOpener())
            self.assertEqual(d['good.html']['outcome'],'complete');self.assertFalse(d['captureBatch']['complete'])
            self.assertEqual(d['bad.html']['errorType'],'IncompleteRead');self.assertIsNone(d['bad.html']['sha256'])
            self.assertTrue((Path(t)/'capture.json').exists())

    def test_reserved_manifest_name_fails_before_network_and_files(self):
        with tempfile.TemporaryDirectory() as t:
            o=Opener()
            with self.assertRaises(ValueError):M.capture_batch([{'file':'capture.json','url':'https://www.dndbeyond.com/source'}],t,opener=o)
            self.assertFalse(o.calls);self.assertFalse(list(Path(t).iterdir()))

    def test_real_http_response_premature_eof_is_not_complete(self):
        class Socket:
            def makefile(self,*args):return io.BytesIO(b'HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nabc')
        class TruncatedOpener:
            def open(self,req,timeout):
                response=http.client.HTTPResponse(Socket());response.begin();response.url=req.full_url;return response
        with tempfile.TemporaryDirectory() as t:
            d=M.capture_batch([{'file':'bad.html','url':'https://www.dndbeyond.com/source'}],t,opener=TruncatedOpener())
            self.assertFalse(d['captureBatch']['complete']);self.assertEqual(d['bad.html']['errorType'],'IncompleteRead')
            self.assertIsNone(d['bad.html']['sha256']);self.assertFalse((Path(t)/'bad.html').exists())

    def test_http403_is_retained_once_without_retry_or_body(self):
        with tempfile.TemporaryDirectory() as t:
            o=Opener();d=M.capture_batch([{'file':'denied.html','url':'https://www.dndbeyond.com/denied'}],t,opener=o)
            self.assertEqual(d['denied.html']['status'],403);self.assertEqual(d['denied.html']['outcome'],'http-error')
            self.assertEqual(len(o.calls),1);self.assertFalse(d['denied.html']['retried']);self.assertTrue(o.denied_stream.closed)

    def test_read_deadline_keeps_header_receipt_without_claiming_body(self):
        with tempfile.TemporaryDirectory() as t:
            ticks=iter([0,100]);r=M.capture_one({'file':'a.html','url':'https://www.dndbeyond.com/source'},Path(t),Opener(),5,100,clock=lambda:next(ticks))
            self.assertEqual(r['status'],200);self.assertEqual(r['errorType'],'TimeoutError');self.assertIsNone(r['sha256'])
            self.assertFalse((Path(t)/'a.html').exists())

    def test_invalid_or_duplicate_names_fail_before_network_and_files(self):
        for files in [['../out.html'],['same.html','same.html']]:
            with tempfile.TemporaryDirectory() as t:
                o=Opener()
                with self.assertRaises(ValueError):M.capture_batch([{'file':f,'url':'https://www.dndbeyond.com/source'} for f in files],t,opener=o)
                self.assertFalse(o.calls);self.assertFalse(list(Path(t).iterdir()))

    def test_private_auth_or_new_port_targets_and_external_redirects_are_not_followed(self):
        for url in ['https://127.0.0.1:4337/','https://www.dndbeyond.com:8443/','https://user:password@www.dndbeyond.com/','https://www.dndbeyond.com/?token=fixture','https://other.test/']:
            with self.assertRaises(ValueError):M.validate_url(url)
        req=__import__('urllib.request',fromlist=['Request']).Request('https://www.dndbeyond.com/source')
        with self.assertRaises(ValueError):M.PublicRedirect().redirect_request(req,None,302,'',{},'https://other.test/source')

    def test_existing_capture_is_not_overwritten_and_repo_is_not_raw_target(self):
        with tempfile.TemporaryDirectory() as t:
            p=Path(t)/'keep.txt';p.write_text('prior evidence',encoding='utf-8')
            with self.assertRaises(FileExistsError):M.capture_batch([{'file':'a.html','url':'https://www.dndbeyond.com/source'}],t,opener=Opener())
            self.assertEqual(p.read_text(encoding='utf-8'),'prior evidence')
        with self.assertRaises(ValueError):M.capture_batch([{'file':'a.html','url':'https://www.dndbeyond.com/source'}],ROOT/'raw-capture-test',opener=Opener())

    def test_byte_budget_failure_preserves_headers_and_no_partial_body(self):
        with tempfile.TemporaryDirectory() as t:
            d=M.capture_batch([{'file':'a.html','url':'https://www.dndbeyond.com/source'}],t,opener=Opener(),max_bytes=2)
            self.assertFalse(d['captureBatch']['complete']);self.assertEqual(d['a.html']['status'],200)
            self.assertIsNone(d['a.html']['bodyFile']);self.assertFalse((Path(t)/'a.html').exists())

if __name__=='__main__':unittest.main()

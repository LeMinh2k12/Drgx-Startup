"""Run: python -m unittest discover -s products/drgx-cp/server/test_suite"""
import importlib.util
import concurrent.futures
import json
import os
import shutil
from unittest.mock import patch
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('exam_server', Path(__file__).resolve().parents[1] / 'exam-server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class ClassroomTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_tests = server.TESTS_DIR
        server.TESTS_DIR = Path(self.tmp.name) / 'tests'
        server.TESTS_DIR.mkdir()
        self.old_data = server.DATA_FILE
        server.DATA_FILE = Path(self.tmp.name) / 'exams.json'
        self.http = server.ExamServer(('127.0.0.1', 0), server.Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.base = 'http://127.0.0.1:' + str(self.http.server_port)

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        server.DATA_FILE = self.old_data
        server.TESTS_DIR = self.old_tests
        self.tmp.cleanup()

    def post(self, path, payload):
        req = Request(self.base + path, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
        with urlopen(req) as res:
            return json.load(res)

    def test_pages_and_join(self):
        for path in ('/dashboard', '/oj', '/oj?code=ABC123', '/join'):
            with urlopen(self.base + path) as res:
                self.assertEqual(res.status, 200)
                self.assertIn('text/html', res.headers['Content-Type'])
        room = self.post('/exam/create', {'title': 'Lớp 11'})['code']
        self.assertRegex(room, '^[A-Z0-9]{6}$')
        joined = self.post('/exam/join', {'code': room.lower(), 'name': 'HS 01'})
        self.assertEqual(joined['exam']['code'], room)
        self.assertNotIn('studentTokens', joined['exam'])
        self.assertTrue(joined['studentToken'])
        with self.assertRaises(HTTPError) as err:
            self.post('/submit', {'examCode': room, 'student': 'HS 01', 'language': 'ruby', 'code': 'x'})
        self.assertEqual(err.exception.code, 400)

    def test_invalid_inputs(self):
        for payload in ([], None, 'text'):
            with self.assertRaises(HTTPError) as err:
                self.post('/exam/join', payload)
            self.assertEqual(err.exception.code, 400)
        with self.assertRaises(HTTPError) as err:
            self.post('/exam/join', {'code': 'bad', 'name': 'HS'})
        self.assertEqual(err.exception.code, 400)

    def create_session(self, name='HS 01'):
        code = self.post('/exam/create', {'title': 'Test'})['code']
        token = self.post('/exam/join', {'code': code, 'name': name})['studentToken']
        return code, token

    def test_impersonation_and_rejoin(self):
        code, token = self.create_session()
        for attempted in ('', 'FORGED', 'sai-mã-phiên'):
            with self.assertRaises(HTTPError) as err:
                self.post('/exam/join', {'code': code, 'name': 'HS 01', 'studentToken': attempted})
            self.assertEqual(err.exception.code, 403)
            with self.assertRaises(HTTPError) as err:
                self.post('/submit', {'examCode': code, 'student': 'HS 01', 'studentToken': attempted, 'language': 'python', 'code': 'print(3)'})
            self.assertEqual(err.exception.code, 403)
        res = self.post('/exam/join', {'code': code, 'name': 'HS 01', 'studentToken': token})
        self.assertEqual(res['studentToken'], token)
        with self.assertRaises(HTTPError) as err:
            self.post('/submit', {'examCode': code, 'student': 'unregistered', 'language': 'python', 'code': 'print(3)'})
        self.assertEqual(err.exception.code, 403)

    def test_close_and_reopen(self):
        code, token = self.create_session()
        self.post('/exam/state', {'code': code, 'closed': True})
        for path, payload in (
            ('/exam/join', {'code': code, 'name': 'HS 02'}),
            ('/submit', {'examCode': code, 'student': 'HS 01', 'studentToken': token, 'language': 'python', 'code': 'print(3)'}),
        ):
            with self.assertRaises(HTTPError) as err:
                self.post(path, payload)
            self.assertEqual(err.exception.code, 403)
        self.post('/exam/state', {'code': code, 'closed': False})
        self.assertEqual(self.post('/exam/join', {'code': code, 'name': 'HS 02'})['status'], 'joined')

    def test_admin_and_origin_guards(self):
        with patch.dict(os.environ, {'DRGX_ADMIN_TOKEN': 'unit-test-only'}):
            for path in ('/exams', '/exam/ABC123', '/exam/ABC123/verify-chain', '/exam/ABC123/export.csv'):
                with self.assertRaises(HTTPError) as err:
                    urlopen(self.base + path)
                self.assertEqual(err.exception.code, 403)
            with self.assertRaises(HTTPError) as err:
                self.post('/exam/create', {})
            self.assertEqual(err.exception.code, 403)
            request = Request(self.base + '/exams', headers={'X-DrgX-Admin-Token': 'unit-test-only'})
            with urlopen(request) as response:
                self.assertIn('exams', json.load(response))
        request = Request(self.base + '/exam/create', data=b'{}', headers={'Origin': 'https://untrusted.example'})
        with self.assertRaises(HTTPError) as err:
            urlopen(request)
        self.assertEqual(err.exception.code, 403)

    def test_authenticated_submission_without_tests(self):
        code, token = self.create_session()
        result = self.post('/submit', {'examCode': code, 'student': 'HS 01', 'studentToken': token, 'language': 'python', 'code': 'print(3)'})
        self.assertEqual(result['verdict'], 'NO_TESTS')
        with urlopen(self.base + '/exam/' + code) as response:
            exam = json.load(response)
        self.assertEqual(len(exam['submissions']), 1)
        self.assertTrue(exam['audit_chain']['valid'])

    def test_real_python_judging(self):
        code, token = self.create_session()
        tests = server.TESTS_DIR / code
        tests.mkdir()
        (tests / '01.in').write_text('1 2\n')
        (tests / '01.out').write_text('3\n')
        payload = {'examCode': code, 'student': 'HS 01', 'studentToken': token, 'language': 'python'}
        for source, verdict in (('a,b=map(int,input().split());print(a+b)', 'AC'), ('print(0)', 'FAIL'), ('def !!!', 'CE')):
            result = self.post('/submit', dict(payload, code=source))
            self.assertEqual(result['verdict'], verdict, result)
        (tests / '01.out').unlink()
        result = self.post('/submit', dict(payload, code='pass'))
        self.assertEqual(result['tests'][0]['verdict'], 'NO_OUT')
        self.assertNotEqual(result['verdict'], 'AC')

    def test_concurrent_submissions_and_csv(self):
        name = '=FORMULA'
        code, token = self.create_session(name)
        payload = {'examCode': code, 'student': name, 'studentToken': token, 'language': 'python', 'code': 'print(3)'}
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.post('/submit', payload), range(4)))
        self.assertTrue(all(result['verdict'] == 'NO_TESTS' for result in results))
        with urlopen(self.base + '/exam/' + code) as response:
            exam = json.load(response)
        self.assertEqual(len(exam['submissions']), 4)
        self.assertTrue(exam['audit_chain']['valid'])
        with urlopen(self.base + '/exam/' + code + '/export.csv') as response:
            csv_text = response.read().decode('utf-8-sig')
        self.assertIn("'=FORMULA", csv_text)

    @unittest.skipUnless(shutil.which('g++'), 'g++ not installed')
    def test_real_cpp_judging(self):
        code, token = self.create_session()
        tests = server.TESTS_DIR / code
        tests.mkdir()
        (tests / '01.in').write_text('1 2\n')
        (tests / '01.out').write_text('3\n')
        result = self.post('/submit', {'examCode': code, 'student': 'HS 01', 'studentToken': token, 'language': 'cpp', 'code': '#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;}'})
        self.assertEqual(result['verdict'], 'AC', result)


if __name__ == '__main__':
    unittest.main()

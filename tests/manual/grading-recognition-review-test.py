import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import unittest
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('flag', str(Path(__file__).resolve().parents[2] / 'scripts/flag-grading-recognition.py'))
flag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flag)
class ReviewTest(unittest.TestCase):
 def test_scoped_atomic_idempotent_review_and_private_audit(self):
  c=sqlite3.connect(':memory:')
  c.executescript('CREATE TABLE grading_runs(id TEXT PRIMARY KEY,active INTEGER,status TEXT,result TEXT,updated_at TEXT);CREATE TABLE grading_mistakes(id TEXT PRIMARY KEY,status TEXT);CREATE TABLE grading_occurrences(mistake_id TEXT,run_id TEXT,question_id TEXT);CREATE TABLE grading_reviews(id TEXT PRIMARY KEY,run_id TEXT,question_id TEXT,previous_question TEXT,reason TEXT,created_at TEXT);')
  original={'id':'q','verdict':'wrong','studentAnswer':'synthetic','explanation':'old judgment'}
  other={'id':'other','verdict':'correct','studentAnswer':'unchanged'}
  data=json.dumps({'questions':[original,other]})
  c.execute('INSERT INTO grading_runs VALUES(?,?,?,?,?)',('r',1,'done',data,'before'))
  c.executemany('INSERT INTO grading_mistakes VALUES(?,?)',[('m','verified'),('unrelated','verified')])
  c.execute('INSERT INTO grading_occurrences VALUES(?,?,?)',('m','r','q'));c.commit()
  self.assertEqual(flag.review(c,'r','q')['mistakesFlagged'],1)
  self.assertEqual(c.execute('select result from grading_runs').fetchone()[0],data)
  self.assertEqual(c.execute('select count(*) from grading_reviews').fetchone()[0],0)
  self.assertTrue(flag.review(c,'r','q',True)['changed'])
  reviewed=json.loads(c.execute('select result from grading_runs').fetchone()[0])
  self.assertEqual(reviewed['questions'][0]['verdict'],'uncertain');self.assertEqual(reviewed['questions'][1],other)
  self.assertEqual(json.loads(c.execute('select previous_question from grading_reviews').fetchone()[0]),original)
  self.assertEqual(c.execute("select status from grading_mistakes where id='m'").fetchone()[0],'needs_review')
  self.assertEqual(c.execute("select status from grading_mistakes where id='unrelated'").fetchone()[0],'verified')
  self.assertFalse(flag.review(c,'r','q',True)['changed'])
  with self.assertRaises(ValueError):flag.review(c,'r','missing',True)
  self.assertEqual(c.execute('select count(*) from grading_reviews').fetchone()[0],1)
if __name__=='__main__':unittest.main()

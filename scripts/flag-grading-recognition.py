#!/usr/bin/env python3
"""Flag exactly one reported OCR misjudgment; retain the original judgment in a private audit."""
import argparse
import datetime
import hashlib
import json
import sqlite3

REASON = '用户提供的截图显示这处手写字识读存在争议，旧判错依据不可靠，暂不判错。'

def review(connection, run_id, question_id, apply=False):
    connection.execute('BEGIN IMMEDIATE')
    try:
        row = connection.execute("SELECT result FROM grading_runs WHERE id=? AND active=1 AND status='done'", (run_id,)).fetchone()
        if not row or not row[0]:
            raise ValueError('Target is not an active completed grading result')
        result = json.loads(row[0])
        questions = [q for q in result['questions'] if q['id'] == question_id]
        if len(questions) != 1:
            raise ValueError('Question not uniquely found')
        question = questions[0]
        if question['verdict'] == 'uncertain' and question.get('explanation') == REASON:
            connection.rollback()
            return {'applied': apply, 'changed': False, 'mistakesFlagged': 0}
        if question['verdict'] != 'wrong':
            raise ValueError('Only a reported wrong judgment can be flagged')
        previous = json.dumps(question, ensure_ascii=False)
        audit_id = hashlib.sha256((run_id + ':' + question_id + ':' + previous).encode()).hexdigest()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        connection.execute('INSERT INTO grading_reviews(id,run_id,question_id,previous_question,reason,created_at) VALUES(?,?,?,?,?,?)', (audit_id, run_id, question_id, previous, REASON, now))
        question.update(verdict='uncertain', confidence='low', verification='uncertain', studentAnswer='手写字暂未辨清', explanation=REASON, cause='原因待确认', causeExplanation='', nextStep='系统识读待进一步确认，暂不要求孩子订正。')
        connection.execute('UPDATE grading_runs SET result=?,updated_at=? WHERE id=?', (json.dumps(result, ensure_ascii=False), now, run_id))
        changed = connection.execute("UPDATE grading_mistakes SET status='needs_review' WHERE status='verified' AND id IN (SELECT mistake_id FROM grading_occurrences WHERE run_id=? AND question_id=?)", (run_id, question_id)).rowcount
        if apply:
            connection.commit()
        else:
            connection.rollback()
        return {'applied': apply, 'changed': True, 'mistakesFlagged': changed}
    except Exception:
        connection.rollback()
        raise

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', required=True)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--question-id', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    connection = sqlite3.connect('file:' + args.db + '?mode=rw', uri=True)
    try:
        print(json.dumps(review(connection, args.run_id, args.question_id, args.apply)))
    finally:
        connection.close()

if __name__ == '__main__':
    main()

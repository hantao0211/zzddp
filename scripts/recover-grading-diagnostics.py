#!/usr/bin/env python3
"""Recover missing legacy failure metadata from uniquely correlated server logs only."""
import argparse
import datetime
import json
import re
import sqlite3
import subprocess


def timestamp_micros(value):
    instant = datetime.datetime.strptime(value, '%Y-%m-%dT%H:%M:%S.%fZ')
    return int((instant - datetime.datetime(1970, 1, 1)).total_seconds() * 1000000)


def match_code(updated_at, entries):
    expected = timestamp_micros(updated_at)
    matches = []
    for entry in entries:
        match = re.fullmatch(r'Grading did not finish: ([A-Z][A-Z0-9_]{0,60})', entry.get('MESSAGE', ''))
        try:
            close = abs(int(entry['__REALTIME_TIMESTAMP']) - expected) <= 20000
        except (ValueError, KeyError, TypeError):
            close = False
        if match and close:
            matches.append(match.group(1))
    return matches[0] if len(matches) == 1 else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', required=True)
    parser.add_argument('--apply', action='store_true', help='Write metadata only; default is a dry run')
    args = parser.parse_args()
    connection = sqlite3.connect('file:' + args.db + '?mode=rw', uri=True)
    recovered = 0
    unmatched = 0
    rows = connection.execute("SELECT id,updated_at,attempts FROM grading_runs WHERE status='failed' AND active=1 AND id NOT IN (SELECT run_id FROM grading_diagnostics)").fetchall()
    for run_id, updated_at, attempts in rows:
        instant = datetime.datetime.strptime(updated_at, '%Y-%m-%dT%H:%M:%S.%fZ')
        start = (instant - datetime.timedelta(seconds=2)).strftime('%Y-%m-%d %H:%M:%S UTC')
        end = (instant + datetime.timedelta(seconds=2)).strftime('%Y-%m-%d %H:%M:%S UTC')
        result = subprocess.run(['journalctl', '-u', 'xiaobu-assistant', '--since', start, '--until', end, '-o', 'json', '--no-pager'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True, check=True)
        code = match_code(updated_at, [json.loads(line) for line in result.stdout.splitlines() if line.strip()])
        if code is None:
            unmatched += 1
            continue
        keys = [r[0] for r in connection.execute('SELECT key FROM analysis_cache WHERE key LIKE ?', ('%:' + run_id,))]
        stage = 'recheck' if any(k.startswith('grade-verify:') for k in keys) else 'verification' if any(k.startswith('grade-first:') for k in keys) else 'inspection'
        if code == 'LOCAL_ERROR':
            stage = 'unknown'
        connection.execute('BEGIN IMMEDIATE')
        current = connection.execute("SELECT updated_at FROM grading_runs WHERE id=? AND status='failed' AND active=1", (run_id,)).fetchone()
        if current and current[0] == updated_at:
            changed = connection.execute("INSERT OR IGNORE INTO grading_diagnostics(run_id,code,stage,attempts,failed_at,source) VALUES(?,?,?,?,?,'server-log')", (run_id, code, stage, attempts, updated_at)).rowcount
            recovered += changed
        if args.apply:
            connection.commit()
        else:
            connection.rollback()
    connection.close()
    print(json.dumps({'applied': args.apply, 'matched': recovered, 'unmatched': unmatched}))


if __name__ == '__main__':
    main()

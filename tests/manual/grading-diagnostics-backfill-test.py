import sys
sys.dont_write_bytecode = True
import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('recover', str(Path(__file__).resolve().parents[2] / 'scripts/recover-grading-diagnostics.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class LegacyDiagnosticMatch(unittest.TestCase):
    def test_only_one_close_sanitized_log_is_accepted(self):
        date = '2026-11-21T14:58:51.833Z'
        log = {'MESSAGE': 'Grading did not finish: INVALID_ENVELOPE', '__REALTIME_TIMESTAMP': str(module.timestamp_micros(date) + 212)}
        self.assertEqual(module.match_code(date, [log]), 'INVALID_ENVELOPE')
        self.assertIsNone(module.match_code(date, [log, log]))
        self.assertIsNone(module.match_code(date, [{**log, '__REALTIME_TIMESTAMP': str(module.timestamp_micros(date) + 21000)}]))
        self.assertIsNone(module.match_code(date, [{**log, 'MESSAGE': 'Grading did not finish: INVALID_ENVELOPE private raw content'}]))
        self.assertIsNone(module.match_code(date, []))


if __name__ == '__main__':
    unittest.main()

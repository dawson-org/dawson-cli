""" Dawson - Python tests """
from unittest import TestCase
import sys
import os
import json

# include parent folder
PYTHON_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(PYTHON_FOLDER)

# functions to unit-test
from require import extract_functions, generate_config, output, main

class TestFunctionAnalyzer(TestCase):
    """ Python Function Analyzer Tests """

    def setUp(self):
        """ Nothing for now """

    def _run_test(self, module, expected_functions=0, expected_configs=0):
        """ Test functions extraction and generation with expected values """
        functions = extract_functions(module)
        self.assertEqual(expected_functions, len(functions))
        configs = list(generate_config(functions))
        self.assertEqual(expected_configs, len(configs))
        for config in configs:
            json.dumps(config)  # should not raise!


    def test_nothing(self):
        """ Test module without functions """
        from modules import nothing_here as module
        self._run_test(module, 0, 0)

    def test_normal_function(self):
        """ Test module with only a normal function """
        from modules import one_normal_function as module
        self._run_test(module, 1, 0)

    def test_one_function(self):
        """ Test module with one valid function """
        from modules import one_dawson_function as module
        self._run_test(module, 1, 1)

    def test_two_functions(self):
        """ Test module with two valid functions """
        from modules import two_dawson_functions as module
        self._run_test(module, 2, 2)

    def test_not_serializable(self):
        """ Test module with one valid function but invalid config """
        from modules import not_serializable as module
        with self.assertRaises(TypeError):
            self._run_test(module, 2, 1)

    def test_normal_class(self):
        """ Test module with one normal class """
        from modules import one_normal_class as module
        self._run_test(module, 1, 0)

    def test_valid_class(self):
        """ Test module with one dawson class """
        from modules import one_dawson_class as module
        self._run_test(module, 1, 1)

    def test_output(self):
        """ Test exit codes """
        with self.assertRaises(SystemExit) as ex:
            output()
        self.assertEqual(ex.exception.code, 0)

        with self.assertRaises(SystemExit) as ex:
            output(results=[1, 2, 3])
        self.assertEqual(ex.exception.code, 0)

        with self.assertRaises(SystemExit) as ex:
            output(code=1)
        self.assertEqual(ex.exception.code, 1)

        with self.assertRaises(SystemExit) as ex:
            output(results=[1, 2, 3], code=2)
        self.assertEqual(ex.exception.code, 2)

    def test_main_fail(self):
        """ Test main execution (fail) """
        with self.assertRaises(SystemExit) as ex:
            main()
        self.assertEqual(ex.exception.code, 1)

    def test_main_success(self):
        """ Test main execution (fail) """
        filename = '%s/api.py' % PYTHON_FOLDER
        # create temp file in parent folder
        with open(filename, 'w+', 0) as filep:
            filep.write("def myf(): pass; myf.api = {}")
        with self.assertRaises(SystemExit) as ex:
            main()
        # clean .py and .pyc files
        os.remove(filename)
        os.remove(filename + 'c')
        self.assertEqual(ex.exception.code, 0)

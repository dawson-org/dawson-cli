""" Dawson - Python functions analyzer """
from __future__ import print_function
import json
import sys

# append current folder (parent process')
sys.path.append(".")

def main():
    """ Import api file and print configuration to stdin """

    try:
        import api  # 'api' is a convention
    except ImportError:
        output(code=1)

    functions = extract_functions(api)
    results = generate_config(functions)

    output(results)


def output(results=None, code=0):
    """ Utility to print out results and exit """
    print(json.dumps(list(results or [])))
    sys.exit(code)

def extract_functions(module):
    """ Build a name:func dictionary of non-private functions """
    return {
        fname: getattr(module, fname)
        for fname in dir(module)
        if not fname.startswith("__")
    }

def generate_config(functions):
    """ Functions config generator """
    for fname, func in functions.iteritems():
        try:
            config = func.api  # function.api is a convention
        except AttributeError:
            continue  # not every function is a Function
        else:
            yield {
                'name': fname,
                'api': config,
            }


if __name__ == "__main__":
    main()

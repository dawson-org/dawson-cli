""" A module with two dawson-valid Python functions """

def myfunction(event, context):
    """ This function is dawson-valid """
    print(event, context)
    return "Hello Function"

myfunction.api = {
    "path": "test"
}

def myfunction2(event, context):
    """ This function is dawson-valid """
    print(event, context)
    return "Hello world 2"

myfunction2.api = {
    "path": "test2"
}

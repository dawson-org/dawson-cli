""" A module with a dawson-valid Python function """

def myfunction(event, context):
    """ This function is dawson-valid """
    print(event, context)
    return "Hello world"

myfunction.api = {
    "path": "/test"
}

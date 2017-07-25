""" A module with a dawson-valid Python function, but with an invalid config """

def myfunction(event, context):
    """ This function is dawson-valid """
    print(event, context)
    return "Hello world"

def another_function():
    """ Just a normal function """
    pass

# this configuration is not JSON-serializable
myfunction.api = {
    "path": "test",
    "parameter": another_function,
}

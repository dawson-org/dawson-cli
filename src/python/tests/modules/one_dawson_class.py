""" A module with a dawson-valid Python class """

class MyClass(dict):
    """
        This class is dawson-valid: Lambda will use it as follows:

        obj = MyClass(event, context)
        return json.dumps(obj)

        Which will return the following JSON:

        {"text": "Hello World"}

    """

    api = {
        "path": "/test"
    }

    def __init__(self, event, context):
        """ Magic constructor """
        super(MyClass, self).__init__()
        self['text'] = self.get_text()
        print(event, context)

    @staticmethod
    def get_text():
        """ Just a sample method """
        return "Hello world"

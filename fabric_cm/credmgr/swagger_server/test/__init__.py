import logging
import unittest

from fastapi.testclient import TestClient

from fabric_cm.credmgr.swagger_server.app import create_app


class BaseTestCase(unittest.TestCase):

    def setUp(self):
        logging.getLogger('uvicorn').setLevel('ERROR')
        app = create_app()
        self.client = TestClient(app)

    def assert200(self, response, message=None):
        self.assertEqual(response.status_code, 200, message)

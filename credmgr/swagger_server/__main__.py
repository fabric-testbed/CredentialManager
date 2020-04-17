#!/usr/bin/env python3
# MIT License
#
# Copyright (c) 2020 FABRIC Testbed
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
#
# Author Komal Thareja (kthare10@renci.org)
import os
import signal

import connexion
from flask import jsonify

from credmgr import CONFIG
from credmgr.CredentialManagers.OAuthCredmgrSingleton import OAuthCredmgrSingleton
from credmgr.swagger_server import encoder
from credmgr.utils import setup_logging


def main():
    log = setup_logging()
    try:
        app = connexion.App(__name__, specification_dir='swagger/')
        app.app.json_encoder = encoder.JSONEncoder
        app.add_api('swagger.yaml', arguments={'title': 'Fabric Credential Manager API'}, pythonic_params=True)
        OAuthCredmgrSingleton.get()
        port = CONFIG.get('runtime','rest-port')
        app.run(port=port)
    except Exception as e:
        log.error("Exception occurred while starting Flask app")
        log.error(e)

    @app.route('/stopServer', methods=['GET'])
    def stopServer():
        os.kill(os.getpid(), signal.SIGINT)
        return jsonify({"success": True, "message": "Server is shutting down..."})


if __name__ == '__main__':
    main()

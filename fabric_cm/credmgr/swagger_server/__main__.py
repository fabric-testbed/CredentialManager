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
"""
Main Entry Point
"""
import os
import signal

import connexion
import prometheus_client
import waitress
from flask import jsonify

from fabric_cm.credmgr.swagger_server import encoder
from fabric_cm.credmgr.config import CONFIG_OBJ
from fabric_cm.credmgr.logging import LOG


def main():
    """
    Main Entry Point
    """
    log = LOG
    try:
        app = connexion.App(__name__, specification_dir='swagger/')
        app.app.json_encoder = encoder.JSONEncoder
        app.add_api('swagger.yaml',
                    arguments={'title': 'Fabric Credential Manager API'},
                    pythonic_params=True)
        port = CONFIG_OBJ.get_rest_port()

        # prometheus server
        prometheus_port = CONFIG_OBJ.get_prometheus_port()
        prometheus_client.start_http_server(prometheus_port)

        # Start up the server to expose the metrics.
        waitress.serve(app, port=port)

    except Exception as ex:
        log.error("Exception occurred while starting Flask app")
        log.error(ex)
        raise ex


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
import os
import signal

import connexion
import prometheus_client
import waitress
from flask import jsonify

from fabric.credmgr import CONFIG
from fabric.credmgr.credential_managers.oauth_credmgr_singleton import OAuthCredmgrSingleton
from fabric.credmgr.swagger_server import encoder
from fabric.credmgr.utils import LOG


def main():
    log = LOG
    try:
        app = connexion.App(__name__, specification_dir='swagger/')
        app.app.json_encoder = encoder.JSONEncoder
        app.add_api('swagger.yaml', arguments={'title': 'Fabric Credential Manager API'}, pythonic_params=True)
        OAuthCredmgrSingleton.get()
        port = CONFIG.get('runtime','rest-port')

        # prometheus server
        prometheus_port = int(CONFIG.get('runtime', 'prometheus-port'))
        prometheus_client.start_http_server(prometheus_port)

        # Start up the server to expose the metrics.
        waitress.serve(app, port=port)
    except Exception as e:
       log.error("Exception occurred while starting Flask app")
       log.error(e)
       raise (e)

    @app.route('/stopServer', methods=['GET'])
    def stopServer():
        os.kill(os.getpid(), signal.SIGINT)
        return jsonify({"success": True, "message": "Server is shutting down..."})


if __name__ == '__main__':
    main()
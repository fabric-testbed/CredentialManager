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
Credential Manager
"""
import os
import sys
import configparser

CONF_DIR = '/etc/credmgr'
CONF_FILE = 'config'

PORT = '7000'
REST_PORT = '8100'

LOG_DIR = '/var/log/credmgr'
LOG_FILE = 'credmgr.log'
LOG_LEVEL = 'DEBUG'
LOG_RETAIN = '5'
LOG_FILE_SIZE = '5000000'

DEFAULT_TOKEN_LIFE_TIME = 60

LOGGER = 'logger'

CONFIG = configparser.ConfigParser()
CONFIG.add_section('runtime')
CONFIG.add_section('oauth')
CONFIG.add_section('logging')

CONFIG.set('runtime', 'port', PORT)
CONFIG.set('runtime', 'rest-port', REST_PORT)

CONFIG.set('logging', 'logger', LOGGER)
CONFIG.set('logging', 'log-directory', LOG_DIR)
CONFIG.set('logging', 'log-file', LOG_FILE)
CONFIG.set('logging', 'log-level', LOG_LEVEL)
CONFIG.set('logging', 'log-retain', LOG_RETAIN)
CONFIG.set('logging', 'log-file-size', LOG_FILE_SIZE)

# Now, attempt to read in the configuration file.
if os.getenv('TEST_ENVIRONMENT', 'False') == 'True':
    CONF_DIR = '../../../../docker'

CONFIG_FILE = CONF_DIR + '/' + CONF_FILE
try:
    files_read = CONFIG.read(CONFIG_FILE)
    if len(files_read) == 0:
        sys.stderr.write('Configuration file could not be read; proceeding with default settings.')
except Exception:
    raise RuntimeError('Unable to parse configuration file')

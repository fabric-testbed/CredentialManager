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
Provides logging functions
"""
import logging
import os
from logging.handlers import RotatingFileHandler

from fabric.credmgr import CONFIG


def get_log_file(log_path: str = None):
    """
    Determine the configured log file
    @param log_path: path to log file
    """
    if (log_path is None) and (CONFIG is not None) and ('logging' in CONFIG) \
            and ('log-directory' in CONFIG['logging']) and ('log-file' in CONFIG['logging']):
        log_path = CONFIG.get('logging', "log-directory") + '/' + CONFIG.get('logging', "log-file")
    elif log_path is None:
        raise RuntimeError('The log file path must be specified in config or passed as an argument')
    return log_path


def get_log_level(log_level=None):
    """
        Determine the configured log level
        @param log_level: log level
    """
    if (log_level is None) and (CONFIG is not None) and ('logging' in CONFIG) and ('log-level' in CONFIG['logging']):
        log_level = CONFIG.get('logging', "log-level")
    if log_level is None:
        log_level = logging.INFO
    return log_level


def get_logger(log_path=None, log_level=None):
    """
    Detects the path and level for the log file from the credmgr config and sets
    up a logger. Instead of detecting the path and/or level from the
    credmgr config, a custom path and/or level for the log file can be passed as
    optional arguments.

    :param log_path: Path to custom log file
    :param log_level: Custom log level
    :return: logging.Logger object
    """

    # Get the log path
    if (log_path is None) and (CONFIG is not None) and ('logging' in CONFIG) \
            and ('log-directory' in CONFIG['logging']) and ('log-file' in CONFIG['logging']):
        log_path = CONFIG.get('logging', "log-directory") + '/' + CONFIG.get('logging', "log-file")
    elif log_path is None:
        raise RuntimeError('The log file path must be specified in config or passed as an argument')

    # Get the log level
    if (log_level is None) and (CONFIG is not None) and \
            ('logging' in CONFIG) and ('log-level' in CONFIG['logging']):
        log_level = CONFIG.get('logging', "log-level")
    if log_level is None:
        log_level = logging.INFO

    logger = CONFIG.get('logging', 'logger')

    # Set up the root logger
    log = logging.getLogger(logger)
    log.setLevel(log_level)
    log_format = '%(asctime)s - %(name)s - {%(filename)s:%(lineno)d} - %(levelname)s - %(message)s'
    os.makedirs(os.path.dirname(log_path), exist_ok=True)

    file_handler = RotatingFileHandler(log_path,
                                       backupCount=int(CONFIG.get('logging', 'log-retain')),
                                       maxBytes=int(CONFIG.get('logging', 'log-size')))

    logging.basicConfig(handlers=[file_handler], format=log_format)

    return log, file_handler

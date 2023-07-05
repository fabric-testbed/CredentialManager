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

from fabric_cm.credmgr.config import CONFIG_OBJ


def get_logger():
    """
    Detects the path and level for the log file from the credmgr CONFIG_OBJ and sets
    up a logger. Instead of detecting the path and/or level from the
    credmgr CONFIG_OBJ, a custom path and/or level for the log file can be passed as
    optional arguments.

    :param log_path: Path to custom log file
    :param log_level: Custom log level
    :return: logging.Logger object
    """

    # Get the log path
    log_path = f"{CONFIG_OBJ.get_logger_dir()}/{CONFIG_OBJ.get_logger_file()}"
    if log_path is None:
        raise RuntimeError('The log file path must be specified in CONFIG_OBJ or passed as an argument')

    # Get the log level
    log_level = CONFIG_OBJ.get_logger_level()
    if log_level is None:
        log_level = logging.INFO

    logger = CONFIG_OBJ.get_logger_name()

    # Set up the root logger
    log = logging.getLogger(logger)
    log.setLevel(log_level)
    log_format = '%(asctime)s - %(name)s - {%(filename)s:%(lineno)d} - %(levelname)s - %(message)s'
    os.makedirs(CONFIG_OBJ.get_logger_dir(), exist_ok=True)

    file_handler = RotatingFileHandler(log_path, backupCount=CONFIG_OBJ.get_logger_retain(),
                                       maxBytes=CONFIG_OBJ.get_logger_size())
    file_handler.setFormatter(logging.Formatter(log_format))
    log.addHandler(file_handler)

    log_format = '%(asctime)s - %(message)s'
    metrics_log_path = f"{CONFIG_OBJ.get_logger_dir()}/{CONFIG_OBJ.get_metrics_log_file()}"
    metrics_file_handler = RotatingFileHandler(metrics_log_path, backupCount=CONFIG_OBJ.get_logger_retain(),
                                               maxBytes=CONFIG_OBJ.get_logger_size())

    log.addHandler(metrics_file_handler)

    return log

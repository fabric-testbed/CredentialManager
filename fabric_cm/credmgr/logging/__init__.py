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
from fabric_cm.credmgr.config import CONFIG_OBJ

from fabric_cm.credmgr.logging.log_helper import LogHelper
LOG = LogHelper.make_logger(log_dir=CONFIG_OBJ.get_logger_dir(),
                            log_file=CONFIG_OBJ.get_logger_file(),
                            log_level=CONFIG_OBJ.get_logger_level(),
                            log_retain=CONFIG_OBJ.get_logger_retain(),
                            log_size=CONFIG_OBJ.get_logger_size(),
                            logger=CONFIG_OBJ.get_logger_name())

METRICS_LOG = LogHelper.make_logger(log_dir=CONFIG_OBJ.get_logger_dir(),
                                    log_file=CONFIG_OBJ.get_metrics_log_file(),
                                    log_level=CONFIG_OBJ.get_logger_level(),
                                    log_retain=CONFIG_OBJ.get_logger_retain(),
                                    log_size=CONFIG_OBJ.get_logger_size(),
                                    logger=f"{CONFIG_OBJ.get_logger_name()}-metrics",
                                    log_format='%(asctime)s - %(message)s')


def log_event(*, token_hash: str, action: str, project_id: str, user_email: str, user_id: str):
    """
    Log Event for metrics
    """
    try:
        log_message = f"CSEL Token event token:{token_hash} " \
                      f"{action} by prj:{project_id} " \
                      f"usr:{user_email}:{user_id}"

        METRICS_LOG.info(log_message)
    except Exception as e:
        METRICS_LOG.error(f"Error occurred: {e}", stack_info=True)
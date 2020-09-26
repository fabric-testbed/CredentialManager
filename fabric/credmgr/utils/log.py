import logging
import os
from logging.handlers import RotatingFileHandler

from fabric.credmgr import CONFIG


def get_log_file(log_path = None):
    if (log_path is None) and (CONFIG is not None) and ('logging' in CONFIG) \
            and ('log-directory' in CONFIG['logging']) and ('log-file' in CONFIG['logging']):
        log_path = CONFIG.get('logging', "log-directory") + '/' + CONFIG.get('logging', "log-file")
    elif (log_path is None):
        raise RuntimeError('The log file path must be specified in config or passed as an argument')
    return log_path


def get_log_level(log_level = None):
    # Get the log level
    if (log_level is None) and (CONFIG is not None) and ('logging' in CONFIG) and ('log-level' in CONFIG['logging']):
        log_level = CONFIG.get('logging', "log-level")
    if log_level is None:
        log_level = logging.INFO
    return log_level


def get_logger(log_path = None, log_level = None):
    '''
    Detects the path and level for the log file from the credmgr config and sets
    up a logger. Instead of detecting the path and/or level from the
    credmgr config, a custom path and/or level for the log file can be passed as
    optional arguments.

    :param log_path: Path to custom log file
    :param log_level: Custom log level
    :return: logging.Logger object
    '''

    # Get the log path
    if (log_path is None) and (CONFIG is not None) and ('logging' in CONFIG) \
            and ('log-directory' in CONFIG['logging']) and ('log-file' in CONFIG['logging']):
        log_path = CONFIG.get('logging', "log-directory") + '/' + CONFIG.get('logging', "log-file")
    elif (log_path is None):
        raise RuntimeError('The log file path must be specified in config or passed as an argument')

    # Get the log level
    if (log_level is None) and (CONFIG is not None) and ('logging' in CONFIG) and ('log-level' in CONFIG['logging']):
        log_level = CONFIG.get('logging', "log-level")
    if log_level is None:
        log_level = logging.INFO

    logger = CONFIG.get('logging', 'logger')

    # Set up the root logger
    log = logging.getLogger(logger)
    log.setLevel(log_level)
    log_format = '%(asctime)s - %(name)s - {%(filename)s:%(lineno)d} - %(levelname)s - %(message)s'
    os.makedirs(os.path.dirname(log_path), exist_ok=True)

    file_handler = RotatingFileHandler(log_path, backupCount=int(CONFIG.get('logging', 'log-retain')),
                                       maxBytes=int(CONFIG.get('logging', 'log-size')))

    logging.basicConfig(handlers=[file_handler], format=log_format)

    return log, file_handler
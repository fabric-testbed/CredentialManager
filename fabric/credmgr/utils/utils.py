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
import json
import logging
import logging.handlers
import stat
import tempfile
import errno
import uuid
from fabric.credmgr import CONFIG


def atomic_output(file_contents, output_fname, mode=stat.S_IRUSR):
    """
    Given file bytes and a destination filename, write to the
    destination in an atomic and durable manner.
    """
    dir_name, file_name = os.path.split(output_fname)

    tmp_fd, tmp_file_name = tempfile.mkstemp(dir = dir_name, prefix=file_name)
    try:
        with os.fdopen(tmp_fd, 'wb') as fp:
            fp.write(file_contents)

        # atomically move new tokens in place
        atomic_rename(tmp_file_name, output_fname, mode=mode)

    finally:
        try:
            os.unlink(tmp_file_name)
        except OSError:
            pass


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
    logging.basicConfig(format=log_format, filename=log_path)

    return log

def get_cred_dir(cred_dir = None):
    '''
    Detects the path for the credential directory from the credmgr config,
    makes sure the credential directory exists with the correct permissions,
    and returns the path to the credential directory. Instead of detecting the
    path from the credmgr config, a custom path for the credential directory can
    be passed as an optional argument.

    :param cred_dir: Path to custom credential directory
    :return: Path to the credential directory
    '''

    # Get the location of the credential directory
    if (cred_dir is None) and (CONFIG is not None) and ('runtime' in CONFIG) and ('credentials-directory' in CONFIG['runtime']):
        cred_dir = CONFIG.get("runtime", "credentials-directory")
    elif cred_dir is not None:
        pass
    else:
        raise RuntimeError('The credential directory must be specified in config or passed as an argument')

    # Create the credential directory if it doesn't exist
    if not os.path.exists(cred_dir):
        os.makedirs(cred_dir,
                        (stat.S_ISGID | stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR | stat.S_IRGRP | stat.S_IWGRP | stat.S_IXGRP))
    return cred_dir


def atomic_rename(tmp_file, target_file, mode=stat.S_IRUSR):
    """
    If successful Credmgr will only be dealing with fully prepared and
    usable credential cache files.

    :param tmp_file: The temp file path containing
        the TGT acquired from the ngbauth service.
    :type tmp_file: string
    :param target_file: The target file.
    :return: Whether the chmod/rename was successful.
    :rtype: bool
    """

    os.chmod(tmp_file, mode)
    os.rename(tmp_file, target_file)


def atomic_output_json(output_object, output_fname):
    """
    Take a Python object and attempt to serialize it to JSON and write
    the resulting bytes to an output file atomically.

    This function does not return a value and throws an exception on failure.

    :param output_object: A Python object to be serialized into JSON.
    :param output_fname: A filename to write the object into.
    :type output_fname: string
    """

    dir_name, file_name = os.path.split(output_fname)

    tmp_fd, tmp_file_name = tempfile.mkstemp(dir = dir_name, prefix=file_name)
    try:
        with os.fdopen(tmp_fd, 'w') as fp:
            json.dump(output_object, fp)

        # atomically move new tokens in place
        atomic_rename(tmp_file_name, output_fname)

    finally:
        try:
            os.unlink(tmp_file_name)
        except OSError:
            pass


def generate_secret_key():
    """
    Return a secret key that is common across all sessions
    """
    logger = get_logger()

    if not CONFIG:
        logger.warning("Credmgr module is missing will use a non-persistent WSGI session key")
        return os.urandom(16)

    keyfile = os.path.join(CONFIG.get("runtime", "credentials-directory"), "wsgi_session_key")

    # Create the secret key file, if possible, with read-only permissions, if it doesn't exist
    try:
        os.close(os.open(keyfile, os.O_CREAT | os.O_EXCL | os.O_RDWR, stat.S_IRUSR))
    except OSError as os_error:
        # An exception will be thrown if the file already exists, and that's fine and good.
        if not (os_error.errno == errno.EEXIST):
            logger.warning("Unable to access WSGI session key at %s (%s);  will use a non-persistent key.", keyfile, str(os_error))
            return os.urandom(16)

    # Open the secret key file.
    try:
        with open(keyfile, 'rb') as f:
            current_key = f.read(24)
    except IOError as e:
        logger.warning("Unable to access WSGI session key at %s (%s); will use a non-persistent key.", keyfile, str(e))
        return os.urandom(16)

    # Make sure the key string isn't empty or truncated.
    if len(current_key) >= 16:
        logger.debug("Using the persistent WSGI session key")
        return current_key

    # We are responsible for generating the keyfile for this webapp to use.
    new_key = os.urandom(24)
    try:
        # Use atomic output so the file is only ever read-only
        atomic_output(new_key, keyfile, stat.S_IRUSR)
        logger.info("Successfully created a new persistent WSGI session key for credmgr application at %s.", keyfile)
    except Exception as e:
        logger.exception("Failed to atomically create a new persistent WSGI session key at %s (%s); will use a transient one.", keyfile, str(e))
        return new_key
    return new_key


def get_providers():
    """
    Constructor providers dict based on the information provided in config file
    """
    if not CONFIG and ('oauth' not in CONFIG):
        raise RuntimeError('OAUTH configuration parameters must be specified in config')

    providers = {}
    provider = CONFIG.get('oauth', "oauth-provider")
    providers[provider] = {}
    providers[provider]['logged_in'] = False
    providers[provider]['client_id'] = CONFIG.get('oauth', "oauth-client-id")
    providers[provider]['redirect_uri'] = CONFIG.get('oauth', "oauth-return-url")
    providers[provider]['url'] = CONFIG.get('oauth', "oauth-authorization-url")
    providers[provider]['client_secret'] = CONFIG.get('oauth', "oauth-client-secret")
    providers[provider]['token_uri'] = CONFIG.get('oauth', "oauth-token-url")
    providers[provider]['revoke_uri'] = CONFIG.get('oauth', "oauth-revoke-url")
    providers[provider]['user_uri'] = CONFIG.get('oauth', "oauth-user-url")
    providers[provider]['scope'] = CONFIG.get('oauth', "oauth-scope")

    return providers


def generate_user_key(project, scope, create_file=True):
    """
    Return user key file to be returned when access token is requested
    """
    logger = get_logger()

    filename = uuid.uuid4().hex[:64].upper()

    if create_file:
        keyfile = os.path.join(CONFIG.get("runtime", "credentials-directory"), filename)

        try:
            with open(keyfile, 'w+') as fp:
                print("[user]", file=fp)
                print("user-name = " + filename, file=fp)
                print("project = " + project, file=fp)
                print("scope = " + scope, file=fp)

            os.chmod(keyfile, stat.S_IWUSR| stat.S_IREAD)
        except Exception as e:
            logger.exception("Failed to create a user key file at %s (%s);", keyfile, str(e))
            try:
                os.unlink(keyfile)
            except OSError:
                pass
            return None
    return filename
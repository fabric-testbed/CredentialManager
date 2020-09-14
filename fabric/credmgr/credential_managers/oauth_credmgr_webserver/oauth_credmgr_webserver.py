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
# !/usr/bin/env python3
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
import configparser
import sys
from flask import Flask, request, redirect, render_template, session, url_for, jsonify
from requests_oauthlib import OAuth2Session
import os
import re

from fabric.credmgr.utils.database import Database
from fabric.credmgr.utils.token import FabricToken
from fabric.credmgr.utils.utils import get_cred_dir, get_providers, get_logger

log = get_logger()

# initialize Flask
app = Flask(__name__)

# make sure the secret_key is randomized in case user fails to override before calling app.run()
app.secret_key = os.urandom(24)

@app.before_request
def before_request():
    """
    Prepends request URL with https if insecure http is used.
    """

    # todo: figure out why this loops
    # if not request.is_secure:
    # if request.url.startswith("http://"):
    #    print(request.url)
    #    url = request.url.replace('http://', 'https://', 1)
    #    print(url)
    #    code = 301
    #    return redirect(url, code=code)
    return


@app.route('/.well-known/openid-configuration')
def openid_configuration():
    return jsonify({"issuer": url_for("index", _external=True)})


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/key/<key>')
def key(key):
    # get the key from URL
    if not re.match("[0-9a-fA-F]+", key):
        raise Exception("Key id {0} is not a valid key".format(key))

    # check for the key file in the credmgr directory
    cred_dir = get_cred_dir()
    key_path = os.path.join(cred_dir, key)
    if not os.path.exists(key_path):
        raise Exception("Key file {0} doesn't exist".format(key_path))

    # read in the key file, which is a list of classads
    providers = {}
    providers = get_providers()
    session['logged_in'] = False
    log.debug('Creating new session from {0}'.format(key_path))

    keyInfo = configparser.ConfigParser()
    files_read = keyInfo.read(key_path)
    if len(files_read) == 0:
        raise Exception("Key file {0} is empty".format(key_path))

    # store the path to the key file since it will be accessed later in the session
    session['key_path'] = key_path

    # the local username is global to the session, just grab it from the last classad
    session['local_username'] = keyInfo.get("user", "user-name")
    session['local_project'] = keyInfo.get("user", "project")
    session['local_scope'] = keyInfo.get("user", "scope")

    session['providers'] = providers
    log.debug(session['providers'])
    log.debug('New session started for user {0}'.format(session['local_username']))
    return render_template('index.html')


@app.route('/login/<provider>')
def oauth_login(provider):
    """
    Go to OAuth provider
    """

    if not ('providers' in session):
        sys.stderr.write('"providers" key was not found in session object: {0}\n'.format(session))
        raise KeyError('Key "providers" was not found in session object. This session is invalid.')
    if not (provider in session['providers']):
        sys.stderr.write('key {0} was not found in session["providers"] dict: {1}\n'.format(provider, session))
        raise KeyError("Provider {0} was not found in list of providers. This session is invalid.".format(provider))
    provider_ad = session['providers'][provider]

    # gather information from the key file classad
    oauth_kwargs = {}
    oauth_kwargs['client_id'] = provider_ad['client_id']
    oauth_kwargs['redirect_uri'] = provider_ad['redirect_uri']
    oauth_kwargs['scope'] = provider_ad['scope']

    auth_url_kwargs = {}
    auth_url_kwargs['url'] = provider_ad['url']
    log.debug(provider_ad['url'])

    # make the auth request and get the authorization url
    oauth = OAuth2Session(**oauth_kwargs)
    authorization_url, state = oauth.authorization_url(**auth_url_kwargs)

    # state is used to prevent CSRF, keep this for later.
    # todo: cleanup this way of changing the session variable
    providers_dict = session['providers']
    providers_dict[provider]['state'] = state
    session['providers'] = providers_dict

    # store the provider name since it could be different than the provider
    # argument to oauth_return() (e.g. if getting multiple tokens from the
    # same OAuth endpoint)
    session['outgoing_provider'] = provider

    return redirect(authorization_url)


@app.route('/return/<provider>')
def oauth_return(provider):
    """
    Returning from OAuth provider
    """

    # get the provider name from the outgoing_provider set in oauth_login()
    provider = session.pop('outgoing_provider', provider)
    log.debug("/return/<provider> =" + provider)
    if not ('providers' in session):
        sys.stderr.write('"providers" key was not found in session object: {0}\n'.format(session))
        raise KeyError('Key "providers" was not found in session object. This session is invalid.')
    if not (provider in session['providers']):
        sys.stderr.write('key {0} was not found in session["providers"] dict: {1}\n'.format(provider, session))
        raise KeyError("Provider {0} was not found in list of providers. This session is invalid.".format(provider))
    provider_ad = session['providers'][provider]

    # gather information from the key file classad
    client_id = provider_ad['client_id']
    redirect_uri = provider_ad['redirect_uri']
    state = session['providers'][provider]['state']
    oauth = OAuth2Session(client_id, state=state, redirect_uri=redirect_uri)

    # convert http url to https if needed
    if request.url.startswith("http://"):
        updated_url = request.url.replace('http://', 'https://', 1)
    else:
        updated_url = request.url

    # fetch token
    client_secret = provider_ad['client_secret']
    token_url = provider_ad['token_uri']
    token = oauth.fetch_token(token_url,
        authorization_response=updated_url,
        client_secret=client_secret,
        method='POST')
    log.debug('Got {0} token for user {1}'.format(provider, session['local_username']))

    # get user info if available
    # todo: make this more generic
    try:
        get_user_info = oauth.get(provider_ad['user_uri'])
        user_info = get_user_info.json()
        if 'login' in user_info: # box
            session['providers'][provider]['username'] = user_info['login']
        elif 'sub' in user_info: # ci logon identity tokens/jwt
            session['providers'][provider]['username'] = user_info['sub']
        else:
            session['providers'][provider]['username'] = 'Unknown'
    except ValueError:
        session['providers'][provider]['username'] = 'Unknown'

    id_token_string = token.get('id_token')
    log.debug("Before: {}".format(id_token_string))
    # Construct Fabric token for specified project and scope
    # Sign with Fabric Certs
    fabric_token = FabricToken(id_token_string, session['local_project'], session['local_scope'])
    fabric_token.decode()
    fabric_token.set_claims()
    id_token_string = fabric_token.encode()
    log.debug("After: {}".format(id_token_string))
    token['id_token'] = id_token_string

    db = Database()
    db.create_tokens(session['local_username'], token, session['local_project'], session['local_scope'])

    # mark provider as logged in
    session['providers'][provider]['logged_in'] = True

    # check if other providers are logged in
    session['logged_in'] = True
    for provider in session['providers']:
        if session['providers'][provider]['logged_in'] == False:
            session['logged_in'] = False

    # cleanup key file if logged in
    if session['logged_in']:
        log.debug('Attempting to remove session file {0}'.format(session['key_path']))
        try:
            os.unlink(session['key_path'])
        except OSError as e:
            log.error('Could not remove session file {0}: {1}\n'.format(session['key_path'], str(e)))

    return redirect("/")

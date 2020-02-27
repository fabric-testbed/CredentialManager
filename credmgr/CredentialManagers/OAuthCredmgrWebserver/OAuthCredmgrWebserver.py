import configparser
import sys
from flask import Flask, request, redirect, render_template, session, url_for, jsonify
from requests_oauthlib import OAuth2Session
import os
import tempfile
from credmgr.utils import atomic_rename, get_cred_dir, get_providers
from credmgr import LOGGER

import json
import re
import logging

log = logging.getLogger(LOGGER)

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

    session['providers'] = providers
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
    #auth_url_kwargs['url'] = "https://cilogon.org/authorize"
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

    # split off the refresh token from the access token if it exists
    try:
        refresh_token_string = token.pop('refresh_token')
    except KeyError: # no refresh token
        use_refresh_token = False
        refresh_token_string = ''
    else:
        use_refresh_token = True

    refresh_token = {
        'refresh_token': refresh_token_string
        }

    # create a metadata file for refreshing the token
    metadata = {
        'client_id': client_id,
        'client_secret': client_secret,
        'token_url': token_url,
        'use_refresh_token': use_refresh_token
        }

    # atomically write the tokens to the cred dir
    cred_dir = get_cred_dir()
    user_cred_dir = os.path.join(cred_dir, session['local_username'])
    if not os.path.isdir(user_cred_dir):
        os.makedirs(user_cred_dir)
    refresh_token_path = os.path.join(user_cred_dir, provider.replace(' ', '_') + '.top')
    access_token_path = os.path.join(user_cred_dir, provider.replace(' ', '_') + '.use')
    metadata_path = os.path.join(user_cred_dir, provider.replace(' ', '_') + '.meta')

    # write tokens to tmp files
    try:
        (tmp_fd, tmp_access_token_path) = tempfile.mkstemp(dir = user_cred_dir)
    except OSError as oe:
        log.debug("Failed to create temporary file in the user credential directory: {0}".format(str(oe)))
        raise
    with os.fdopen(tmp_fd, 'w') as f:
        json.dump(token, f)

    (tmp_fd, tmp_refresh_token_path) = tempfile.mkstemp(dir = user_cred_dir)
    with os.fdopen(tmp_fd, 'w') as f:
        json.dump(refresh_token, f)

    (tmp_fd, tmp_metadata_path) = tempfile.mkstemp(dir = user_cred_dir)
    with os.fdopen(tmp_fd, 'w') as f:
        json.dump(metadata, f)

    # (over)write token files
    try:
        atomic_rename(tmp_access_token_path, access_token_path)
        atomic_rename(tmp_refresh_token_path, refresh_token_path)
        atomic_rename(tmp_metadata_path, metadata_path)
    except OSError as e:
        log.error('{0}\n'.format(str(e)))

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

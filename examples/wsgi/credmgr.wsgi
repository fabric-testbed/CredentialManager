#
# Configure Logging
#

from credmgr.utils import *
import os

logger = setup_logging()

#
# Load the session key
#
from credmgr.utils import generate_secret_key
mykey = generate_secret_key()

#
# Start Service
#
from credmgr.CredentialManagers.OAuthCredmgrWebserver import app
app.secret_key = mykey

application = app
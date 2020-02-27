import sys
import configparser

ConfDir = '/etc/credmgr'
ConfFile = 'config'

CredentialsDirectory = '/var/lib/credmgr/credentials'
OAuthCredMgrTokenLifeTime = '60'
Port = '443'

LogDir = '/var/log/credmgr'
LogFile = 'credmgr.log'
LogLevel = 'DEBUG'
LogRetain = '5'
LogFileSize = '5000000'

LOGGER = 'credmgr_logger'

CONFIG = configparser.ConfigParser()
CONFIG.add_section('runtime')
CONFIG.add_section('oauth')
CONFIG.add_section('logging')

CONFIG.set('runtime', 'credentials-directory', CredentialsDirectory)
CONFIG.set('runtime', 'port', Port)

CONFIG.set('oauth', 'oauth-credmgr-token-lifetime', OAuthCredMgrTokenLifeTime)

CONFIG.set('logging', 'log-directory', LogDir)
CONFIG.set('logging', 'log-file', LogFile)
CONFIG.set('logging', 'log-level', LogLevel)
CONFIG.set('logging', 'log-retain', LogRetain)
CONFIG.set('logging', 'log-file-size', LogFileSize)

# Now, attempt to read in the configuration file.
config_file = ConfDir + '/' + ConfFile 
try:
    files_read = CONFIG.read(config_file)
    if len(files_read) == 0:
        sys.stderr.write('Configuration file could not be read; ' +
                 'proceeding with default settings.')
except Exception as e:
    raise RuntimeError('Unable to parse configuration file')
